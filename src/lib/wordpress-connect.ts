import { db } from "./db";
import { isCloudMode } from "./cloud";
import { tryEncryptSecret, decryptSecret } from "./crypto";
import { connectWordPress, type WordPressCredentials } from "./wordpress";
import { enqueue } from "./jobs";
import type { Project } from "./projects";

// The seam between "an owner pasted a WordPress password into a form" and the
// wordpress.ts client that speaks to their site.
//
// It exists as its own module so exactly one piece of code knows how the
// credential is stored and how it comes back out. The dashboard action, the
// MCP tool and the publisher all call through here; none of them ever touch
// the encrypted column directly, and none of them can accidentally read it
// into a log line or a tool response.
//
// The rule this file enforces: a WordPress password is written encrypted, read
// only at the moment of a call to the customer's site, and never returned to
// anyone - not to the dashboard, not to an agent, not in an error.

export type ConnectOutcome =
  | {
      ok: true;
      siteName: string;
      roles: string[];
      seoPlugin: string | null;
      canPublish: boolean;
      canUploadMedia: boolean;
      /** True when the user can edit posts written by someone else - which is
       *  what internal linking into existing content needs. Not fatal. */
      canEditOthers: boolean;
    }
  | { ok: false; reason: string; message: string };

/**
 * Validate credentials against the live site and, only if they work, store
 * them. Deliberately in that order: saving first and validating later is how
 * a project ends up "connected" to a site that will refuse every publish, and
 * the owner finds out days afterwards when an article silently fails to appear.
 */
export async function connectAndStore(
  projectId: string,
  input: { url: string; username: string; applicationPassword: string },
): Promise<ConnectOutcome> {
  const creds: WordPressCredentials = {
    url: input.url.trim(),
    username: input.username.trim(),
    applicationPassword: input.applicationPassword,
  };

  const result = await connectWordPress(creds);
  if (!result.ok) {
    return { ok: false, reason: result.reason, message: result.message };
  }

  // A connection that cannot publish is not a connection. Say so now, with the
  // exact fix, rather than storing it and failing on the first article.
  if (!result.capabilities.edit_posts) {
    return {
      ok: false,
      reason: "cannot_create_posts",
      message:
        "That WordPress user cannot create posts. In WordPress, go to Users, edit that user, and set their role to Editor - then connect again.",
    };
  }

  // tryEncryptSecret, not encryptSecret: an install whose dashboard password
  // comes from the DASHBOARD_PASSWORD env never ran the claim flow, so
  // instance_settings has no row for key() and the throwing variant would
  // blow this form into the generic error boundary instead of the inline
  // sentence every sibling connect action returns (crypto.ts documents this
  // exact install shape; actions.ts's other credential forms all use try).
  const encrypted = await tryEncryptSecret(creds.applicationPassword);
  if (encrypted == null) {
    return {
      ok: false,
      reason: "storage_failed",
      message:
        "Your WordPress details were correct, but this install has no secrets-encryption " +
        "key to store them with. Add DATAFORSEO_ENC_KEY to your .env (any random string - " +
        "`openssl rand -base64 32` makes a good one), restart, and connect again - nothing " +
        "was changed on your site.",
    };
  }

  const { error } = await db()
    .from("projects")
    .update({
      publish_target: "wordpress",
      wp_url: normalizeSiteUrl(creds.url),
      wp_username: creds.username,
      wp_app_password: encrypted,
      wp_connected_at: new Date().toISOString(),
      wp_seo_plugin: result.seoPlugin,
      wp_capabilities: result.capabilities,
    })
    .eq("id", projectId);

  if (error) {
    return {
      ok: false,
      reason: "storage_failed",
      message:
        "Your WordPress details were correct, but we could not save them. Try again in a moment - nothing was changed on your site.",
    };
  }

  // Read the site now rather than at the first article. Internal links and the
  // digest their AI writes against both come out of this crawl, and an owner
  // who connects on Monday and asks for an article on Monday should not get an
  // article with no links in it. Queued, not run: this is a form submission,
  // and 150 pages do not fit inside one.
  try {
    await enqueue({
      projectId,
      kind: "crawl",
      payload: { isWordPress: true, maxPages: 150 },
      idempotencyKey: `crawl:${projectId}:connect`,
    });
  } catch {
    // The connection itself worked, which is what the owner is waiting to
    // hear. The daily cron re-checks every project's digest age and queues
    // this same job, so a queue hiccup here delays the crawl by a day rather
    // than losing it.
  }

  return {
    ok: true,
    siteName: result.siteName,
    roles: result.roles,
    seoPlugin: result.seoPlugin,
    canPublish: result.capabilities.publish_posts,
    canUploadMedia: result.capabilities.upload_files,
    canEditOthers: result.capabilities.edit_others_posts,
  };
}

/**
 * The decrypted credentials for a project, or null when this project has no
 * WordPress connection. Call this at the moment of use and let the value go
 * out of scope immediately - never hold it, never pass it further than the
 * wordpress.ts call that needs it.
 *
 * Returns null rather than throwing when decryption fails, because the caller
 * (a cron, a publish job) must treat "cannot read the credential" as this
 * project being unconfigured and skip it, not as a crash that takes down every
 * other project in the same run.
 */
export async function credentialsFor(project: Project): Promise<WordPressCredentials | null> {
  if (!project.wp_url || !project.wp_username || !project.wp_app_password) return null;
  try {
    const applicationPassword = await decryptSecret(project.wp_app_password);
    if (!applicationPassword) return null;
    return { url: project.wp_url, username: project.wp_username, applicationPassword };
  } catch {
    return null;
  }
}

/** Forget a WordPress connection. The site itself is untouched: we cannot
 *  revoke an application password from outside, and pretending otherwise would
 *  be a lie. The owner is told to revoke it in WordPress themselves. */
export async function disconnectWordPress(projectId: string): Promise<void> {
  // Self-host with no repo: stay a (now unconnected) WordPress project. Falling
  // back to "github" there makes a GitHub project with no repo, which the
  // self-host wizard cannot resume or finish - it has no connect-a-repo step
  // after creation the way cloud's c1 does. Drafts wait; reconnecting fixes it.
  const { data } = await db()
    .from("projects")
    .select("github_repo")
    .eq("id", projectId)
    .maybeSingle();
  const repo = (data as { github_repo?: string | null } | null)?.github_repo;
  const keepWordPress = !isCloudMode() && !repo;
  await db()
    .from("projects")
    .update({
      publish_target: keepWordPress ? "wordpress" : "github",
      wp_url: null,
      wp_username: null,
      wp_app_password: null,
      wp_connected_at: null,
      wp_seo_plugin: null,
      wp_capabilities: null,
    })
    .eq("id", projectId);
}

/** What the dashboard and MCP tools may see: everything except the password. */
export function connectionSummary(project: Project) {
  return {
    connected: Boolean(project.wp_url && project.wp_app_password),
    url: project.wp_url,
    username: project.wp_username,
    connected_at: project.wp_connected_at,
    seo_plugin: project.wp_seo_plugin,
    capabilities: project.wp_capabilities,
    publish_target: project.publish_target ?? "github",
  };
}

/** Normalize to origin + path with no trailing slash. The PATH IS KEPT on
 *  purpose: a WordPress install commonly lives in a subdirectory
 *  (https://site.com/blog), which is half the reason wp_url exists as its own
 *  column - wordpress.ts joins every request path under it. Stripping to the
 *  bare origin here once made every subdirectory install read as "not a
 *  WordPress site". Query strings and fragments are dropped; a trailing slash
 *  is dropped so path joining never doubles one. */
function normalizeSiteUrl(raw: string): string {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.origin}${path}`;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}
