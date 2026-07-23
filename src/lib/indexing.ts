// "Get it on Google" next actions - the manual Search Console follow-up for
// every freshly published page.
//
// Google offers no API to push regular pages into its index: IndexNow (which
// the pipeline already pings) is Bing/Yandex only, Google's Indexing API is
// restricted to job postings and livestreams, and the URL Inspection API is
// read-only. The fastest legitimate accelerator is a human clicking "Request
// indexing" in Search Console, so the dashboard batches everything waiting
// into ONE card: a single paste-ready Claude for Chrome command that walks
// every pending page in one session (recommended) plus manual steps
// (optional), with done state backed by pages.index_requested_at (migration
// 0005). One card, not one per page - the GSC quota is per property per day,
// so batching costs nothing and saves a session per page.
//
// The done state closes itself two ways (the buttons stay as fallback): the
// browser command tells the agent to call the mark_indexing_requested MCP
// tool when it finishes, and the hourly-gsc cron verifies real index state
// through the read-only URL Inspection API, stamping pages.indexed_at
// (migration 0010) - a page Google already has never re-enters the queue.

import type { Project } from "./projects";

// The pages row shape Home reads. index_requested_at is absent (key missing,
// not null) until migration 0005 runs - callers treat that as "not done" and
// Home shows a one-time migration nudge. live_at absent until 0033.
export type IndexingPageRow = {
  id: string;
  url: string;
  title: string | null;
  type: string | null;
  published_at: string | null;
  created_at: string;
  index_requested_at?: string | null;
  indexed_at?: string | null;
  live_at?: string | null;
};

// How long a page stays in the queue before we stop nagging. New pages
// surface the day they ship; the window gives slack for a skipped day or two
// without resurfacing the whole back catalog on day one.
const WINDOW_DAYS = 7;

export function indexingQueue(
  rows: IndexingPageRow[],
  now: number = Date.now(),
): IndexingPageRow[] {
  const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return rows.filter((p) => {
    if (p.index_requested_at || p.indexed_at) return false;
    // Not verified live yet (0033): its PR hasn't merged or the deploy
    // hasn't finished - asking Google to index a 404 wastes the daily GSC
    // request quota. It enters the queue once the URL actually serves.
    if ("live_at" in p && p.live_at == null) return false;
    const published = Date.parse(p.published_at ?? p.created_at);
    return Number.isFinite(published) && published >= cutoff;
  });
}

// Deep link into Search Console's URL Inspection with the property and page
// URL prefilled - the same link GSC's own emails use. Falls back to the GSC
// home when the project has no property configured.
export function gscInspectUrl(gscSiteUrl: string | null, pageUrl: string): string {
  if (!gscSiteUrl) return "https://search.google.com/search-console";
  return (
    "https://search.google.com/search-console/inspect" +
    `?resource_id=${encodeURIComponent(gscSiteUrl)}&id=${encodeURIComponent(pageUrl)}`
  );
}

// One paste in the VS Code extension prompt box (@browser ...) walks every
// pending page in a single browser session. Same conventions as the playbook's
// browserCommand: assumes the user is already signed in (automated sign-ins
// trip bot detection - it stops on a login wall instead), and never does more
// than the intended clicks.
export function indexingBrowserCommand(project: Project, pageUrls: string[]): string {
  const first = gscInspectUrl(project.gsc_site_url, pageUrls[0]);
  const rest = pageUrls.slice(1);
  const intro =
    rest.length === 0
      ? `@browser open ${first} - it should land on URL Inspection for ${pageUrls[0]} in the ${project.domain} Search Console property. `
      : `@browser open ${first} - that is URL Inspection for the first of ${pageUrls.length} pages I need indexed in the ${project.domain} Search Console property. `;
  const loop =
    rest.length === 0
      ? ""
      : `Then inspect each remaining page the same way by pasting its URL into the search bar at the top: ${rest.join(" ; ")}. `;
  return (
    intro +
    `If Google asks me to sign in, STOP and tell me. ` +
    `For each page: wait for the inspection to finish; if it is already on Google, skip it; otherwise click "Request indexing" and wait for the confirmation before moving on. ` +
    loop +
    `If Google says the daily request limit is reached, stop there. ` +
    `At the end give me one line per page: requested, already indexed, or left over. ` +
    `Then, if the ${project.name} DispatchSEO MCP is connected in this session, call its ` +
    `mark_indexing_requested tool with requested_urls and already_indexed_urls so the ` +
    `dashboard card clears itself; if it is not connected, remind me to hit Mark as done ` +
    `on the dashboard.`
  );
}

export function indexingManualSteps(project: Project): string[] {
  return [
    `Open search.google.com/search-console and pick the ${project.domain} property.`,
    "Paste the first page URL from the list above into the inspection bar at the top and press Enter.",
    'Wait for the inspection to finish, then click "Request indexing" (skip pages already on Google).',
    "Repeat for each remaining page in the list, then mark them done here.",
  ];
}
