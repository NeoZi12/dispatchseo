import { db } from "@/lib/db";
import { getProjectById, type Project } from "@/lib/projects";
import { publishRoute } from "./draft-status";
import { finishArticle, schemaScript } from "@/lib/article-render";
import { enqueue } from "@/lib/jobs";
import { dryDraftBlocked, parkDryDraft } from "./dry-guard";
import type { Job } from "@/lib/jobs";

// Turns an accepted draft into a page that is ready to go out.
//
// This is where "their agent wrote it" becomes "our side finished it": the
// markdown their AI submitted is rendered to sanitized HTML, internal links
// into their existing pages are inserted, the meta description and JSON-LD are
// built, and the result is stored on the draft. Nothing here calls a model -
// it is all deterministic transformation, which is exactly why the split is
// worth having: the expensive, judgement-heavy half runs on the customer's own
// subscription, and the mechanical half runs on ours for a fraction of a cent.
//
// After this the draft is "finished" and a publish job is queued for the hour
// the owner chose.

/** Default publish slot when a project has not set one: 09:00 in the site's
 *  own day. Early enough to be "today's article", late enough that a European
 *  or American reader sees it in the morning rather than overnight. */
const DEFAULT_PUBLISH_HOUR = 9;

export type FinishableDraft = {
  id: string;
  title: string;
  slug: string;
  meta_description: string | null;
  primary_keyword: string | null;
  markdown: string;
  faq: { question: string; answer: string }[] | null;
  sources: { url: string; title?: string }[] | null;
};

/**
 * The deterministic half, reusable: the same draft rendered for a given
 * route. The hosted publish handler calls this too, because a draft finished
 * for the repo route (canonical https://site/<slug>) and then switched to
 * the hosted blog has to be re-rendered for https://site/blog/<slug> - the
 * structured data and the self-link check both name the page's address.
 */
export async function renderDraftForRoute(
  project: Project,
  row: FinishableDraft,
  route: ReturnType<typeof publishRoute>,
  publishedAt: string,
) {
  // The page inventory feeds internal linking. A project whose site has never
  // been crawled simply gets no internal links - worth having the article
  // without them rather than refusing to publish over a missing nicety.
  const { data: digestRow } = await db()
    .from("site_digests")
    .select("link_candidates")
    .eq("project_id", project.id)
    .maybeSingle();
  const pages = Array.isArray((digestRow as { link_candidates?: unknown } | null)?.link_candidates)
    ? ((digestRow as { link_candidates: { url: string; title: string; keywords?: string[] }[] })
        .link_candidates)
    : [];

  // Where the page will live. WordPress knows its own origin; the hosted
  // blog serves from the origin the site actually answers on (www or apex,
  // learned from its homepage); the repo route is the bare domain.
  // Hosted: the origin the site serves from. Every other route exactly as
  // before the hosted blog existed: wp_url whenever one is stored.
  const siteUrl =
    route === "hosted"
      ? (project.hosted_origin ?? `https://${project.domain}`)
      : (project.wp_url ?? `https://${project.domain}`);

  return finishArticle({
    submission: {
      title: row.title,
      slug: row.slug,
      metaDescription: row.meta_description ?? "",
      primaryKeyword: row.primary_keyword ?? "",
      markdown: row.markdown,
      faq: row.faq ?? [],
      sources: row.sources ?? [],
    },
    siteUrl,
    siteName: project.name,
    pages,
    // The hosted blog serves the article under /blog, so its canonical url,
    // structured data and self-link check must name that path.
    ownSlug: route === "hosted" ? `blog/${encodeURIComponent(row.slug)}` : row.slug,
    publishedAt,
    // The byline. A real person the owner named (Settings > Author, or the
    // set_author MCP tool) is a Person, with their page when they gave one.
    // Without one the byline is the site itself - and a site is an
    // Organization: claiming a Person named "Acme Store" is a
    // fabricated-author signal, the one thing Google names as deception.
    ...(project.author_name?.trim()
      ? { authorName: project.author_name.trim(), authorType: "Person" as const, authorUrl: project.author_url ?? undefined }
      : { authorType: "Organization" as const }),
  });
}

export async function runFinishJob(job: Job): Promise<void> {
  const draftId = String(job.payload.draftId ?? "");
  if (!draftId) throw new Error("finish job is missing its draft");
  // Set by the owner releasing a held article ("Publish now"): the publish
  // job is due at once, not at the next publishing hour - the first release
  // on ClockedCode (2026-10-24) sat queued for tomorrow 09:00 UTC otherwise.
  const publishNow = job.payload.publishNow === true;

  const project = await getProjectById(job.project_id);
  if (!project) throw new Error("project no longer exists");

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
    primary_keyword: string | null;
    markdown: string;
    faq: { question: string; answer: string }[] | null;
    sources: { url: string; title?: string }[] | null;
    status: string;
    validation: unknown;
  };

  // ALLOWLIST, not a blocklist: only a draft that is actually on its way to
  // being finished may be touched. "submitted" is the normal case; "accepted"
  // covers a retry after a crash between our status write and the queue
  // bookkeeping (re-rendering is deterministic and the publish enqueue below
  // is idempotent). Everything else - discarded above all - is not ours: a
  // blocklist here once let a pending finish job resurrect a draft the owner
  // had discarded minutes after submitting it.
  if (row.status !== "submitted" && row.status !== "accepted") return;
  if (dryDraftBlocked(row.validation)) return parkDryDraft(row.id, row.validation);

  const now = new Date().toISOString();
  const route = publishRoute(project);
  const finished = await renderDraftForRoute(project, row, route, now);

  // The cover points at OUR cover route, not the customer's site: the publish
  // handler fetches it and uploads the bytes to their media library, so a URL
  // on their own domain would be a request for an image that does not exist
  // yet. Nothing is rendered now - the route draws it on demand,
  // deterministically from the title, so there is no image to keep in step
  // with an edited draft.
  //
  // Stored RELATIVE on purpose. The two consumers need two different origins:
  // the drafts screen's <img> must use whatever origin the owner's browser is
  // on (localhost:4005, a Tailscale hostname, a custom domain - all fine with
  // a relative src), while the publish handler's server-side fetch resolves it
  // itself (see fetchCover in publish.ts) - on the docker stack that must be
  // the container's own 127.0.0.1:3000, because the owner-facing APP_URL is a
  // host port-mapping the app cannot reach from inside its own container.
  // Baking any single absolute origin in here breaks one consumer or the
  // other on some install shape.
  const coverUrl = `/api/cover/${row.id}`;

  // Where this article goes, decided BEFORE the write so the draft lands in
  // its final state in one update rather than being written 'accepted' and
  // corrected a line later.
  //
  //   repo      our server commits it and opens a pull request, on the same
  //             clock as WordPress (see publish-repo.ts)
  //   manual    the owner asked us to finish it and hand it over
  //   blocked   nowhere to publish yet - a normal mid-setup state, which the
  //             drafts screen shows as a setup card. NOT a failure: throwing
  //             here would burn five retries and email an owner about their
  //             own unfinished onboarding (see draft-status.ts)
  // (route decided above, before the article was finished - its canonical
  // url depends on it)

  // WHERE THE STRUCTURED DATA GOES, and why it depends on the route.
  //
  // The JSON-LD block names the page's own address. On the WordPress route we
  // do not know that address yet: the permalink is WordPress's to assign, and
  // a site using date-based or plain (?p=) permalinks publishes somewhere this
  // guess would never match - telling Google about a URL that 404s. So that
  // route ships the article without it and the publish handler attaches it
  // once the real link comes back.
  //
  // Every other route keeps it here, because there is no later moment: a
  // manual handover is finished the second the owner copies the HTML, and the
  // site's own /slug is the best address anyone can name for it.
  const html =
    route === "wordpress" ? finished.html : finished.html + schemaScript(finished.schema);

  const { error } = await db()
    .from("article_drafts")
    .update({
      // The structured data rides WITH the html rather than in a column of
      // its own: it has to reach whatever ends up serving the page, and this
      // string is the one thing every publish route carries. (Note for
      // WordPress: a script tag in post content survives only for a user with
      // unfiltered_html - Administrators and Editors on a single-site install,
      // which is the role the connect screen tells owners to use.)
      rendered_html: html,
      meta_description: finished.excerpt,
      cover_url: coverUrl,
      status: route === "blocked" ? "blocked_setup" : "accepted",
      updated_at: now,
    })
    .eq("id", row.id);
  if (error) throw new Error(`could not save the finished article: ${error.message}`);

  // The publishing routes go out on the owner's hour. Manual and blocked
  // stop here - one has nowhere to go by choice, the other by circumstance.
  if (route !== "wordpress" && route !== "repo" && route !== "hosted") return;

  await enqueue({
    projectId: project.id,
    kind: "publish",
    payload: { draftId: row.id },
    runAfter: publishNow ? new Date() : nextPublishSlot(project.publish_hour ?? DEFAULT_PUBLISH_HOUR),
    idempotencyKey: `publish:${row.id}`,
  });
}

/**
 * The next occurrence of `hour` in UTC.
 *
 * Deliberately UTC rather than the site's local timezone: we do not reliably
 * know a customer's timezone yet, and inventing one would put articles out at
 * an hour nobody chose. UTC is at least predictable and documented, and the
 * pacing rule (one guide per UTC day) is already expressed in the same clock,
 * so the two cannot drift apart. When a real timezone is captured at setup,
 * this is the one function that changes.
 */
function nextPublishSlot(hour: number): Date {
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : DEFAULT_PUBLISH_HOUR;
  const now = new Date();
  const slot = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), safeHour, 0, 0, 0),
  );
  if (slot.getTime() <= now.getTime()) slot.setUTCDate(slot.getUTCDate() + 1);
  return slot;
}
