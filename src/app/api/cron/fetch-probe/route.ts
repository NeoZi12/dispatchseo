import { checkCron } from "@/lib/cron-auth";
import { fetchPage } from "@/lib/writer/fetch";

// Operator diagnostic: what does the writer's fetcher see for one URL, from
// THIS deploy's address? Added 2026-10-31 when google.com/goto links (the
// SERP's new shape) answered a laptop with a 302 and Vercel with something
// else, and the only evidence was the run's one-line "unread" reason. Gated
// like a cron (CRON_SECRET), never per-tenant, never listed over MCP: it
// reads nothing of a site's state and is not something an agent should set
// or call. Skips reportCronRun on purpose - a probe is not a job.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return Response.json({ error: "url required" }, { status: 400 });
  const started = Date.now();
  const r = await fetchPage(url, { timeoutMs: 10_000 });
  const ms = Date.now() - started;
  if (r.ok) return Response.json({ ok: true, ms, url: r.page.url, title: r.page.title, words: r.page.wordCount, head: r.page.text.slice(0, 300) });
  return Response.json({ ok: false, ms, reason: r.reason, detail: r.detail ?? null });
}
