import type { CronHealth } from "@/lib/cron-alerts";

// The autopilot's internal sentences, in the owner's words.
//
// Writer runs, cron rows and job errors are written for whoever debugs them:
// "gave up at stage research after 5 attempts: DataForSEO HTTP 502" is exactly
// right in get_writer_runs and exactly wrong on a customer's article page,
// where it reads as "your product is broken and here is a stack trace". The
// MCP read model keeps the raw text (an agent wants it); every hosted
// dashboard surface passes it through here first.
//
// Matching is on stable fragments of the messages the writer and the jobs
// queue write today. Anything unrecognised falls back to a neutral sentence
// rather than leaking the internal wording - a new message that nobody mapped
// yet must read as calm, never as raw.

const FALLBACK = "The writer hit a problem; it retries by itself.";

const RULES: Array<{ test: RegExp; text: string }> = [
  // Content parks: the topic was set aside on purpose, with a reason.
  { test: /topic the owner blocked/i, text: "This topic is on your topics-to-avoid list, so it was set aside." },
  { test: /judged off-topic/i, text: "This topic didn't fit your site closely enough, so it was set aside." },
  { test: /same topic as the existing page|a refresh, not a new article/i, text: "Your site already has a page on this topic, so a new article would compete with it." },
  { test: /already ranks at position/i, text: "Your site already ranks for this search, so a second article would compete with the page you have." },
  { test: /page-one result|could not read any of the top pages|none yielded a usable|too few sources|readable/i, text: "Too few of Google's top results for this search could be read to fact-check an article, so it was set aside." },
  { test: /could not beat page one|no honest information gain/i, text: "We couldn't find anything this article would add beyond what already ranks, so it wasn't written." },
  { test: /still failing after/i, text: "The draft didn't pass the fact check after several fixes, so nothing was published." },
  { test: /already (being written|in flight)|another run is already/i, text: "This topic was already being written in another run." },
  { test: /nothing approved to write|no keyword to write/i, text: "There was no topic ready to write; research refills the queue every week." },
  { test: /quality gate/i, text: "The article failed the quality check, so nothing was published." },
  // Vendor / operator side: nothing the owner can do, and it heals itself.
  // AFTER the content parks: a park reason quotes page text and keywords
  // ("$599 plan", "500 errors"), so a bare three-digit number must never
  // read as a server error - a 5xx only counts next to a vendor or "HTTP".
  {
    test: /DataForSEO budget or daily ceiling|daily ceiling|no SERP provider|model credentials|on this deploy|gave up at stage|timed out|(anthropic|typesafe|dataforseo|HTTP|status)\s*:?\s*5\d\d|overloaded|rate.?limit|ECONN|fetch failed/i,
    text: "A problem on our side stopped this one; it retries by itself.",
  },
  { test: /keyword data budget|usage budget reached|monthly ceiling/i, text: "This month's keyword data budget is used up, so research resumes on the 1st." },
];

/** One owner-facing sentence for a raw writer/job error; null in, null out. */
export function friendlyError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const r of RULES) if (r.test.test(raw)) return r.text;
  return FALLBACK;
}

/** Strip the "<slug>: " / "a.b: " path prefix collectErrors adds. */
function bare(e: string): string {
  return e.replace(/^[a-z0-9_.-]+:\s+/i, "");
}

/**
 * One line per critical cron issue, for the hosted Home. The job decides the
 * subject; the text says what happened in plain words. The pause job is left
 * out by the caller when the report already shows the pause (it has its own
 * card with the Resume button).
 */
export function siteIssueLine(h: CronHealth): { title: string; detail: string } {
  const job = h.job.split("--")[0];
  const first = bare(h.errors[0] ?? "");
  if (h.stale && h.ok) {
    return { title: "A background check hasn't run lately", detail: "Your articles keep their schedule; we're looking into it." };
  }
  if (job === "autopilot-pause") {
    return { title: "The autopilot paused itself", detail: first.replace(/^paused:\s*/i, "").replace(/\s*\[[a-z-]+\]\s*$/i, "") };
  }
  if (job === "autopilot") {
    // health.ts writes these problems owner-ready, joined with "; ".
    return { title: "The autopilot needs a look", detail: first ? capitalize(first) + (first.endsWith(".") ? "" : ".") : FALLBACK };
  }
  if (job === "articles") {
    const why = first.replace(/^.*gave up after \d+ attempts:\s*/i, "");
    if (/github|pull request|repo/i.test(why)) {
      return { title: "An article couldn't reach your repo", detail: "We couldn't open its pull request after several tries. Check that the DispatchSEO GitHub App still has access to your repo (Settings)." };
    }
    if (/wordpress|wp-json|rest_/i.test(why)) {
      return { title: "An article couldn't reach WordPress", detail: "We couldn't post it after several tries. Check your WordPress connection on Settings." };
    }
    return { title: "An article got stuck on its way out", detail: "It failed several times in a row. Open Articles to see which one; the next publish attempt retries it on its own." };
  }
  return { title: "Something in the background failed", detail: friendlyError(first) ?? FALLBACK };
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
