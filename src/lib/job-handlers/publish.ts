import { db } from "@/lib/db";
import { getProjectById } from "@/lib/projects";
import { markBlockedSetup, publishRoute } from "./draft-status";
import { credentialsFor } from "@/lib/wordpress-connect";
import { createPost, publishPost, updatePostContent, uploadMedia } from "@/lib/wordpress";
import { buildSchema, schemaScript } from "@/lib/article-render";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { enqueue } from "@/lib/jobs";
import { dryDraftBlocked, parkDryDraft } from "./dry-guard";
import type { Job } from "@/lib/jobs";

// Puts a finished article on the customer's site.
//
// The sequence is create-as-draft, then flip to published, and that is a
// deliberate design decision documented at length in src/lib/wordpress.ts:
// WordPress's own scheduler only runs when a visitor loads a page, so asking
// IT to publish at 9am on a quiet site means the article appears whenever the
// next person happens to show up. Our queue owns the clock instead.
//
// The other reason for two steps: between them the post exists, has an id, and
// has its cover image attached, so a failure at the flip is retryable without
// creating a second copy of the article.

export async function runPublishJob(job: Job): Promise<void> {
  const draftId = String(job.payload.draftId ?? "");
  if (!draftId) throw new Error("publish job is missing its draft");

  const project = await getProjectById(job.project_id);
  if (!project) throw new Error("project no longer exists");

  // TWO ROUTES, one job. A repo project's article becomes a commit and a pull
  // request instead of a WordPress post; everything before this line (the
  // clock, the idempotency key, the Publish now button) is shared, and
  // everything after it is WordPress-specific.
  //
  // The dynamic import is not stylistic: publish-repo.ts reaches back into
  // this module for fetchCover, and a static import both ways would be a load
  // -time cycle.
  const route = publishRoute(project);
  if (route === "repo") {
    const { runRepoPublish } = await import("./publish-repo");
    return runRepoPublish(project, draftId);
  }
  if (route === "hosted") {
    const { runHostedPublish } = await import("./publish-hosted");
    return runHostedPublish(project, draftId);
  }

  // Setup states park the draft and complete the job; regressions throw.
  //
  // The whole distinction rests on one fact: was a WordPress credential ever
  // stored for this project? If not, this is an owner who has not finished
  // connecting - a normal mid-setup state that must not burn five retries and
  // email them about it. If one IS stored and we still cannot use it, the
  // connection worked before and is broken now, which is exactly the case that
  // has to stay loud. See draft-status.ts.
  if (route !== "wordpress") {
    await markBlockedSetup(draftId);
    return;
  }

  const creds = await credentialsFor(project);
  if (!creds) {
    // A password IS stored (publishRoute checked) and it still did not come
    // back: it will not decrypt, or the url/username went missing with it.
    // Not transient, not the owner's half-finished setup - a real regression.
    throw new Error("this project's WordPress connection is stored but could not be read");
  }

  const { data: draft } = await db()
    .from("article_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!draft) throw new Error("that article no longer exists");

  const row = draft as {
    id: string;
    title: string;
    slug: string;
    meta_description: string | null;
    rendered_html: string | null;
    cover_url: string | null;
    wp_post_id: number | null;
    status: string;
    faq: { question: string; answer: string }[] | null;
    validation: unknown;
  };

  // ALLOWLIST, not a blocklist: "accepted" is the scheduled case, "finished"
  // is a retry after a failed flip or verify, and "blocked_setup" is a parked
  // draft being released (approve_draft / the Publish now button). Anything
  // else - a discarded draft with a still-pending job being the case that
  // matters - is a quiet no-op, never a publish. Discard does not cancel
  // queued jobs; this line is what makes that safe.
  if (!["accepted", "finished", "blocked_setup"].includes(row.status)) return;
  if (dryDraftBlocked(row.validation)) return parkDryDraft(row.id, row.validation);
  if (!row.rendered_html) throw new Error("this article has not been finished yet");
  // WordPress themes print the post title themselves: the article's own H1
  // would repeat it (the hosted route strips it the same way).
  const bodyHtml = row.rendered_html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/, "");

  // Resume rather than restart. A retry after a failed flip must not create a
  // second post - the id we already have is the article.
  let postId = row.wp_post_id;
  let featuredMediaId: number | undefined;
  // Only set on the run that actually uploaded the image. A resumed job
  // publishes a post whose cover is already attached in WordPress but whose
  // URL we did not carry across the failure, so its structured data goes out
  // without an image rather than with a guessed one.
  let coverImageUrl: string | undefined;

  if (!postId) {
    // The cover, when there is one. A failed image must never cost the
    // article: publishing without a picture is a worse-looking page, and not
    // publishing at all is a broken promise.
    if (row.cover_url) {
      const image = await fetchCover(row.cover_url);
      if (image) {
        const uploaded = await uploadMedia(creds, {
          bytes: image.bytes,
          filename: `${row.slug}.png`,
          mimeType: image.mimeType,
          altText: row.title,
        });
        if (uploaded.ok) {
          featuredMediaId = uploaded.id;
          // Kept for the structured data below: schema.org wants the image at
          // the address a reader would actually load it from, which is now
          // their media library rather than our cover route.
          coverImageUrl = uploaded.url;
        }
      }
    }

    const created = await createPost(creds, {
      title: row.title,
      html: bodyHtml,
      slug: row.slug,
      excerpt: row.meta_description ?? undefined,
      featuredMediaId,
    });
    if (!created.ok) throw new Error(created.message);

    postId = created.id;
    // Store the id BEFORE flipping. If the flip fails and this write had not
    // happened, the retry would create a duplicate post.
    await db()
      .from("article_drafts")
      .update({ wp_post_id: postId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  const published = await publishPost(creds, postId);
  if (!published.ok) {
    // The connected user can create posts but not publish them (a Contributor,
    // or an Editor someone demoted after connect). This is the owner's setup,
    // not a breakage: the connect screen promised "articles will wait for you
    // inside WordPress", and the post we just created IS waiting there as a
    // draft. Park rather than throw - throwing would burn five retries and
    // email the owner about their own role settings. Checked against the live
    // answer rather than the cached wp_capabilities, which can go stale the
    // moment someone edits the user in WordPress.
    if (published.reason === "insufficient_role") {
      await markBlockedSetup(row.id);
      return;
    }
    throw new Error(published.message);
  }

  // THE STRUCTURED DATA, now that the page has a real address.
  //
  // finish.ts deliberately left this off the WordPress route: JSON-LD names
  // the page's own URL, and until WordPress assigned the permalink the only
  // answer available was a guess - one that a site with date-based or plain
  // (?p=) permalinks would never match, handing Google a URL that 404s.
  // `published.link` is the fact rather than the guess.
  //
  // Best-effort on purpose, and it must never throw. The article is live and
  // the owner is not waiting on this; burning four more publish retries over a
  // script tag would risk the thing that already worked. A miss costs the page
  // its rich-result markup and nothing else, and says so in the run log.
  const nowIso = new Date().toISOString();
  const schema = buildSchema({
    headline: row.title,
    // finish.ts wrote its computed excerpt back to this column, so the meta
    // description and the schema description are the same sentence.
    description: row.meta_description ?? "",
    url: published.link,
    datePublished: nowIso,
    dateModified: nowIso,
    authorName: project.name,
    siteName: project.name,
    siteUrl: project.wp_url ?? `https://${project.domain}`,
    imageUrl: coverImageUrl,
    faq: row.faq ?? [],
  });
  const withSchema = await updatePostContent(
    creds,
    postId,
    bodyHtml + schemaScript(schema),
  );
  if (!withSchema.ok) {
    console.warn(
      `[publish] ${row.id} is live at ${published.link} but its search-engine markup did not attach: ${withSchema.message}`,
    );
  }

  await db()
    .from("article_drafts")
    .update({
      published_url: published.link,
      // Not "published" yet: that word is earned by the verify job actually
      // loading the page. Claiming it here would be reporting success we have
      // not confirmed.
      status: "finished",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  await enqueue({
    projectId: project.id,
    kind: "verify",
    payload: { draftId: row.id, url: published.link },
    // Give caches and the site itself a moment before asking.
    runAfter: new Date(Date.now() + 60_000),
    idempotencyKey: `verify:${row.id}`,
  });
}

/** Fetch a cover we generated ourselves. Kept small and defensive: a cover is
 *  a nice-to-have, so every failure path returns null rather than throwing.
 *  Exported because the repo route needs the same bytes for a different
 *  destination - a blob in the customer's repo rather than their media library.
 *
 *  Drafts store the cover as a RELATIVE path (/api/cover/<id>) so the same
 *  row serves the drafts screen on any origin; this is the one place it has
 *  to become absolute. On the docker stack the app must call ITSELF on
 *  127.0.0.1:3000 - backendBaseUrl() returns the owner-facing APP_URL there
 *  (e.g. http://localhost:4005), a host port-mapping the container cannot
 *  reach from inside itself, so resolving through it would ship every
 *  self-hosted article coverless, silently (same trap and same fix as
 *  onboarding/status/route.ts). Absolute URLs (rows written before the
 *  relative switch) pass through untouched. */
export async function fetchCover(
  url: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  try {
    // Only our own relative cover path is ever fetched. finish.ts is the sole
    // writer of this column and writes /api/cover/<id>; an absolute value
    // would make this a fetch sink aimed by whoever could write the column,
    // so it is refused rather than resolved.
    if (!url.startsWith("/")) return null;
    const resolved = `${process.env.POSTGREST_URL ? "http://127.0.0.1:3000" : await backendBaseUrl()}${url}`;
    const res = await fetch(resolved, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // 20MB matches the guard inside uploadMedia; refusing here saves the round
    // trip and keeps a runaway image out of memory twice.
    if (buf.byteLength === 0 || buf.byteLength > 20 * 1024 * 1024) return null;
    return { bytes: buf, mimeType: type };
  } catch {
    return null;
  }
}
