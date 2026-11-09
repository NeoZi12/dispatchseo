import { db } from "./db";
import { marksIn, type ArticleMarks } from "./article-signature";
import { fetchProjectUrl, isProjectUrl } from "./url-guard";
import type { Project } from "./projects";

// Reads live pages for the DispatchSEO marks (article-signature.ts) and
// stamps what it found on the pages row (migration 0082). Two callers:
// the liveness probe, which already has the page's body in hand the moment
// a page first serves 200; and the daily cron, which re-reads a handful of
// long-live pages per project so an owner who later strips the credit (or
// the whole article) shows up within a fortnight.
//
// Best-effort everywhere: a site that is down, a WAF, or the migration not
// yet applied must never fail the cron or the dashboard screen that asked.

const DAY = 86_400_000;
// A page is re-read this often at most; the marks change rarely.
const RECHECK_MS = 14 * DAY;
// Pages per project per cron run: enough to cover a Scale site's month of
// articles in a few nights, small enough to never matter to the site.
const MAX_PAGES = 8;
// Enough to reach the end of any article page; a page bigger than this is
// read up to here and that is where our mark lives anyway (the body's end).
const MAX_BYTES = 2_500_000;

/** The marks in a response body, reading at most MAX_BYTES. Null when the
 *  body could not be read. */
export async function readMarks(res: Response): Promise<ArticleMarks | null> {
  try {
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml|text/i.test(type)) return null;
    // Declared far bigger than any page: not an article, and not worth a
    // byte of it. Read in chunks otherwise and stop at the cap, so a slow
    // or endless body costs at most MAX_BYTES of memory.
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES * 8) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let got = 0;
    while (got < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(Math.min(got, MAX_BYTES));
    let at = 0;
    for (const c of chunks) {
      const take = Math.min(c.byteLength, buf.byteLength - at);
      if (take <= 0) break;
      buf.set(c.subarray(0, take), at);
      at += take;
    }
    return marksIn(new TextDecoder("utf-8", { fatal: false }).decode(buf));
  } catch {
    return null;
  }
}

/** Writes a scan's result to the page. Errors are swallowed: a schema
 *  without 0082 rejects the columns, and the caller's own work is done. */
export async function stampMarks(pageId: string, marks: ArticleMarks, checkedAt = new Date().toISOString()): Promise<void> {
  await db()
    .from("pages")
    .update({ mark_checked_at: checkedAt, signature_seen: marks.signature != null, badge_seen: marks.badge })
    .eq("id", pageId);
}

type PageRow = { id: string; url: string; mark_checked_at: string | null };

/** The daily pass for one project: the live pages scanned longest ago (never
 *  first), at most MAX_PAGES, each fetched once and stamped. Returns a
 *  summary for the cron's result object; never throws for a site's sake. */
export async function scanPageMarks(project: Project, now = Date.now()): Promise<Record<string, unknown>> {
  const { data, error } = await db()
    .from("pages")
    .select("id, url, mark_checked_at")
    .eq("project_id", project.id)
    .not("live_at", "is", null)
    .order("mark_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PAGES * 2);
  if (error) {
    // The columns are the new part: without them this is "not set up yet",
    // never a failure of the run.
    if (/mark_checked_at|signature_seen|badge_seen/.test(error.message)) return { skipped: "migration 0082 (page marks) not applied" };
    return { error: error.message };
  }
  const due = ((data ?? []) as PageRow[])
    .filter((r) => r.mark_checked_at == null || now - Date.parse(r.mark_checked_at) > RECHECK_MS)
    // The same SSRF posture as the liveness probe: only this project's own domain.
    .filter((r) => isProjectUrl(r.url, project.domain))
    .slice(0, MAX_PAGES);
  if (!due.length) return { checked: 0 };

  let signed = 0;
  let badged = 0;
  let unreachable = 0;
  await Promise.all(
    due.map(async (r) => {
      const res = await fetchProjectUrl(r.url, project.domain, { timeoutMs: 8000, userAgent: "DispatchSEO-liveness-check" });
      if (!res?.ok) {
        unreachable++;
        return;
      }
      const marks = await readMarks(res);
      if (!marks) {
        unreachable++;
        return;
      }
      if (marks.signature) signed++;
      if (marks.badge) badged++;
      await stampMarks(r.id, marks);
    }),
  );
  return { checked: due.length - unreachable, signed, badged, ...(unreachable ? { unreachable } : {}) };
}
