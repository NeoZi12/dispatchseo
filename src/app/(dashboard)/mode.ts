import { cache } from "react";
import { redirect } from "next/navigation";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { getAutopilotReport, type AutopilotReport } from "@/lib/autopilot/report";
import { publishTarget, writerMode as projectWriterMode, type Project } from "@/lib/projects";
import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";

// Which dashboard a project gets. 'hosted' = our server writes and publishes
// (the calm report); 'agent' = the owner's own coding agent drives it (every
// legacy screen). Every dashboard file asks this helper, which defers to
// projects.ts, so a project with no writer_mode reads as 'agent' everywhere.

export type WriterMode = "hosted" | "agent";

export function writerMode(project: Pick<Project, "writer_mode"> | null | undefined): WriterMode {
  return project ? projectWriterMode(project) : "agent";
}

/** The byline columns 0066 adds. */
export function authorOf(p: Pick<Project, "author_name" | "author_bio" | "author_url">): { name: string | null; bio: string | null; url: string | null } {
  return { name: p.author_name ?? null, bio: p.author_bio ?? null, url: p.author_url ?? null };
}

/** Legacy screens call this first: a hosted project has no use for them, so
 *  it lands on the screen that replaced them instead. Must run outside any
 *  try/catch - redirect() works by throwing. */
export async function redirectIfHosted(to: string): Promise<void> {
  const project = await getActiveProjectOrNull();
  if (project && writerMode(project) === "hosted") redirect(to);
}

/** New hosted screens call this: an agent project keeps its old screen. */
export async function redirectIfAgent(to: string): Promise<void> {
  const project = await getActiveProjectOrNull();
  if (!project || writerMode(project) !== "hosted") redirect(to);
}

/** The autopilot report, once per request however many components ask (the
 *  layout's setup bar and the page both read it). Null when it can't be
 *  built - a failed read hides a surface, it never takes a page down. */
export const loadReport = cache(async (projectId: string): Promise<AutopilotReport | null> => {
  try {
    return await getAutopilotReport(projectId);
  } catch (e) {
    console.error("[dashboard] autopilot report failed", e);
    return null;
  }
});

type SetupFacts = Pick<AutopilotReport["setup"], "google" | "publish" | "hostedLive"> &
  Partial<Pick<AutopilotReport["setup"], "rewritePrUrl" | "siteUnreadable" | "keywordSource">> & { profile?: boolean };

export type SetupGap = { key: string; title: string; detail: string; href: string | null; done: boolean; blocksPublishing: boolean };

/** Setup items a hosted owner can act on, in the order to fix them. The
 *  profile row only appears when the caller knows it (the full report). */
export function setupGaps(s: SetupFacts): SetupGap[] {
  const items: SetupGap[] = [
    {
      key: "publish",
      title: "Choose where articles go",
      detail: "Connect your site's GitHub repo or WordPress, or let us host the blog.",
      href: "/settings?section=publishing",
      done: s.publish !== "none",
      blocksPublishing: true,
    },
  ];
  if (s.publish === "hosted") {
    // With a forwarding pull request open, the one thing to do is merge it -
    // say so and link straight to it (audit H3: owners read "point your blog
    // at us", went to Settings, and never found the PR we had opened).
    const pr = s.rewritePrUrl && s.rewritePrUrl !== "manual" ? s.rewritePrUrl : null;
    items.push(
      pr
        ? {
            key: "forwarding",
            title: "Merge the forwarding pull request",
            detail: "We opened a pull request in your repo that points your domain's /blog at your articles. Merge it and the blog is live within minutes of the deploy.",
            href: pr,
            done: s.hostedLive !== false,
            blocksPublishing: true,
          }
        : {
            key: "forwarding",
            title: "Point your /blog at us",
            detail: "Add the forwarding rule to your site so your domain's /blog shows the articles.",
            href: "/settings?section=publishing",
            done: s.hostedLive !== false,
            blocksPublishing: true,
          },
    );
  }
  items.push({
    key: "google",
    title: "Connect Google Search Console",
    detail: "So the report can show the clicks each article earns.",
    href: "/google",
    done: s.google,
    blocksPublishing: false,
  });
  if (s.profile !== undefined) {
    items.push(
      s.siteUnreadable && !s.profile
        ? {
            // The crawl gave up (a bot wall, a login): waiting does nothing,
            // and research and the writer both need the profile.
            key: "profile",
            title: "Describe your site",
            detail: "We couldn't read your homepage; describe your site in Settings > Site and the first article starts from that.",
            href: "/settings",
            done: false,
            blocksPublishing: false,
          }
        : {
            key: "profile",
            title: "Read your site",
            detail: "We're reading your homepage to learn what you sell and who for. Nothing to do.",
            href: null,
            done: s.profile,
            blocksPublishing: false,
          },
    );
  }
  // No keyword data source: research cannot find a single topic. Only the
  // full report knows this (undefined = not known here, no row).
  if (s.keywordSource === false) {
    items.push({
      key: "keywords",
      title: "Keyword data",
      detail: isCloudMode()
        ? "Keyword research isn't available for this site yet. Nothing to do on your side; we're on it."
        : "Connect a DataForSEO account in Settings so research can find topics for this site.",
      href: isCloudMode() ? null : "/settings",
      done: false,
      blocksPublishing: false,
    });
  }
  return items;
}

/** The slim read behind the layout's "finish setup" bar: project columns plus
 *  at most one head count, instead of building the whole report on every
 *  page. Mirrors report.ts setupSummary for the three facts the bar needs. */
export const getSetupSummary = cache(async (project: Project): Promise<SetupFacts> => {
  const target = publishTarget(project);
  const publish: SetupFacts["publish"] =
    (target === "github" && !project.github_repo) ||
    (target === "wordpress" && !project.wp_app_password) ||
    target === "manual"
      ? "none"
      : target;
  let google = Boolean(project.gsc_site_url);
  if (google && !project.gsc_oauth_refresh_token) {
    const { count, error } = await db().from("gsc_stats").select("id", { count: "exact", head: true }).eq("project_id", project.id);
    // A failed count hides the gap rather than inventing one.
    google = error ? true : (count ?? 0) > 0;
  }
  return {
    publish,
    google,
    hostedLive: target === "hosted" ? Boolean(project.hosted_rewrite_live_at) : null,
    rewritePrUrl: target === "hosted" ? (project.hosted_rewrite_pr_url ?? null) : null,
  };
});
