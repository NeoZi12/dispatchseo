import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { draftPicturePath, loadPictureCover, renderCoverPng, storePictureCover } from "@/lib/cover-art";
import { normalizeTheme } from "@/lib/hosted-theme";

// The cover image for a writer article, drawn on demand (src/lib/cover-art.ts).
//
// 1. WHAT IT DRAWS. The article's own drawing - a line-diagram subject layer
//    the writer's illustrator call made from the plan (article_drafts.cover_svg,
//    migration 0072) - composited onto the house base. Without one (older
//    drafts, a refused or failed drawing, 0072 not applied) it draws the
//    title card on the same base.
//
// 2. NOTHING IS STORED here. The publish handlers fetch this URL and commit or
//    upload the PNG to the customer's site; the dashboard shows it straight
//    from here. The drawing is the only stored part, and it is tiny.
//
// 3. RTL WORKS. resvg shapes text itself from fonts bundled in
//    src/lib/cover-fonts (Hebrew and Arabic included). The previous next/og
//    route laid Hebrew out left-to-right, letter-reversed, which is how the
//    first Paperbot cover shipped broken (2026-11-05).
//
// 4. PUBLIC BY NECESSITY. Under /api, which the proxy leaves ungated: the
//    publisher fetches it as an ordinary HTTP client, and it only ever shows
//    an article that got past review (statuses below) - a rejected or
//    discarded draft 404s like one that never existed.

export const runtime = "nodejs";

// "review": written and passed the gate, waiting for the owner's Publish
// (article-review.ts) - its preview shows the cover it will go out with.
const LIVE_STATUSES = ["accepted", "finished", "published", "blocked_setup", "review"];

type Row = { title: string; slug: string | null; project_id: string; cover_svg?: string | null };

export async function GET(_req: Request, { params }: { params: Promise<{ draftId: string }> }): Promise<Response> {
  const { draftId: rawId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(rawId)) return new Response("No such article", { status: 404 });
  // One spelling of the id for the row lookup AND the storage path: Postgres
  // reads DRAFTID and draftid as the same uuid, and each spelling must not
  // get its own cached object (security audit 2026-11-08).
  const draftId = rawId.toLowerCase();

  const read = (cols: string) => db().from("article_drafts").select(cols).eq("id", draftId).in("status", LIVE_STATUSES).maybeSingle();
  let res = await read("title, slug, project_id, cover_svg");
  // Before 0072 the column read errors: draw the title card, never 404 a
  // finished article over a missing migration.
  if (res.error) res = await read("title, slug, project_id");
  const draft = res.data as Row | null;
  // A missing draft must 404 rather than draw a blank card: the publish
  // handler treats any non-image response as "no cover" and ships the
  // article without one, which is the right outcome, and a 404 says why.
  if (!draft) return new Response("No such article", { status: 404 });

  // A painted picture, when the writer made one (cover-art.ts, "picture
  // covers"), is the cover; the drawing below is for everything else.
  const picture = await loadPictureCover(draftPicturePath(draftId)).catch(() => null);
  if (picture) {
    return new Response(new Uint8Array(picture.bytes), { headers: { "Content-Type": picture.contentType, "Cache-Control": "public, max-age=3600" } });
  }

  // The site's colours, when we have read them (lib/hosted-theme.ts): the
  // cover is drawn in them. No theme read (or a DB without the column) = the
  // house look.
  let projectRes = await db().from("projects").select("name, hosted_theme").eq("id", draft.project_id).maybeSingle();
  if (projectRes.error) projectRes = (await db().from("projects").select("name").eq("id", draft.project_id).maybeSingle()) as typeof projectRes;
  const projectRow = projectRes.data as { name: string; hosted_theme?: unknown } | null;
  const siteName = projectRow?.name ?? "";
  const theme = projectRow?.hosted_theme ? normalizeTheme(projectRow.hosted_theme) : null;

  const inputs = {
    subjectSvg: draft.cover_svg ?? null,
    title: draft.title ?? "",
    siteName,
    seed: draft.slug || draftId,
    theme: theme && theme.source !== "default" ? { accent: theme.accent, mode: theme.mode } : null,
  };
  // The kept render is keyed by what it was drawn from, so a new title, a
  // re-read theme or a drawing attached later gets a fresh picture; the old
  // object is a few KB left behind.
  const fingerprint = createHash("sha1").update(JSON.stringify(inputs)).digest("hex").slice(0, 10);
  const keptPath = `${draftPicturePath(draftId)}.${fingerprint}.png`;
  const kept = await loadPictureCover(keptPath).catch(() => null);
  if (kept) {
    return new Response(new Uint8Array(kept.bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  }
  const png = await renderCoverPng(inputs);
  // Kept in the covers bucket as drafts/<id>.png, where loadPictureCover above
  // finds it next time: a render costs real CPU, and a request with a
  // cache-busting query reached it every time (security audit 2026-11-08).
  // A painted picture stored later under drafts/<id> still wins (it is tried
  // first). Best-effort: a storage failure only means another render.
  await storePictureCover(keptPath, Buffer.from(png), "image/png").catch(() => false);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
