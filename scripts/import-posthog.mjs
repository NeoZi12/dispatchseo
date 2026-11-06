#!/usr/bin/env node
// One-time import of PostHog history into our own analytics tables, so /owner
// shows the whole history of dispatchseo.com from our database alone.
//
//   node --env-file=.env.local scripts/import-posthog.mjs --dry-run
//   node --env-file=.env.local scripts/import-posthog.mjs
//
// Needs, in .env.local (never committed):
//   POSTHOG_PERSONAL_API_KEY  a personal API key with the "query:read" scope
//   POSTHOG_PROJECT_ID        the numeric project id (PostHog > Settings > Project)
// and the usual SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// What it copies, all from BEFORE our own log started (the first web_visits
// row), so nothing is counted twice:
//   - $pageview events on dispatchseo.com -> web_visits, kind='import'. These
//     are people: PostHog only loaded for visitors who accepted cookies, so the
//     imported history undercounts visitors, never overcounts them.
//   - our server-side product events (signups, checkouts, trials,
//     subscriptions...) -> app_events with their original timestamps. Those
//     were sent regardless of the cookie banner, so this history is complete.
// Every row carries source_id = 'ph:<event uuid>' and inserts skip existing
// ids, so running it twice changes nothing. Requires migration 0076.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const INGEST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
// The query API lives on the app host, not the ingestion host.
const HOST = INGEST.replace(/\/$/, "").replace(".i.posthog.com", ".posthog.com");
const SITE = (process.env.PRODUCT_DOMAIN ?? "dispatchseo.com").toLowerCase();

if (!KEY || !PROJECT) {
  console.error("Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in .env.local first (see the header of this file).");
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SERVER_EVENTS = [
  "user_signed_up", "user_logged_in", "user_confirmed_email", "checkout_started", "setup_trial_started",
  "subscription_activated", "subscription_cancel_scheduled", "subscription_canceled", "subscription_updated",
  "subscription_resumed", "project_created", "project_deleted", "github_connected", "pipeline_installed",
  "gsc_connected", "pr_merged", "account_deleted", "billing_portal_opened", "setup_step_viewed",
  "setup_step_deferred", "setup_connect_complete", "github_cost_acknowledged",
];
const KEEP_PROPS = ["tier", "interval", "status", "method", "domain", "repo", "step", "reason", "number", "flow", "mode", "anonymous"];

// Mirrors classifyPath() in src/lib/visits.ts.
const SITE_PREFIXES = ["/blog", "/docs", "/free-tools", "/plans", "/signup", "/login", "/onboarding", "/qualify", "/about", "/privacy", "/terms", "/dpa", "/subprocessors", "/google-data", "/changelog", "/forgot-password", "/reset-password", "/auth/", "/claude-code", "/codex", "/cursor", "/setup"];
function area(path) {
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return null;
  if (path === "/hosted" || path.startsWith("/hosted/")) return "hosted";
  if (path === "/") return "site";
  if (SITE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) return "site";
  return "app";
}

async function hogql(query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.results ?? [];
}

const esc = (s) => s.replace(/'/g, "\\'");

async function cutoff() {
  const { data, error } = await db.from("web_visits").select("at").neq("kind", "import").order("at", { ascending: true }).limit(1);
  if (error) throw new Error(`web_visits read failed (is migration 0073 applied?): ${error.message}`);
  return data?.[0]?.at ?? new Date().toISOString();
}

async function knownUsers() {
  const ids = new Set();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) ids.add(u.id);
    if (data.users.length < 1000) break;
  }
  return ids;
}

async function insert(table, rows) {
  if (DRY || !rows.length) return rows.length;
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from(table).upsert(chunk, { onConflict: "source_id", ignoreDuplicates: true });
    if (error) throw new Error(`${table} insert failed (is migration 0076 applied?): ${error.message}`);
    n += chunk.length;
  }
  return n;
}

// Walks a query forward by timestamp in pages, so history of any length works.
// Pages overlap by a second (>=) so events sharing the boundary second are
// never skipped; the uuid set drops the overlap. Times are compared in UTC.
const chTime = (ts) => new Date(ts).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
async function* pages(select, where) {
  let after = "1970-01-01 00:00:00";
  const seen = new Set();
  for (;;) {
    const rows = await hogql(`select ${select} from events where ${where} and timestamp >= toDateTime('${after}', 'UTC') order by timestamp asc limit 5000`);
    const fresh = rows.filter((r) => !seen.has(r[0]));
    for (const r of fresh) seen.add(r[0]);
    if (fresh.length) yield fresh;
    if (rows.length < 5000) return;
    const next = chTime(rows[rows.length - 1][2]);
    if (next === after) return; // 5000 events in one second: nothing sane left to page
    after = next;
  }
}

const day = (ts) => String(ts).slice(0, 10);
const visitorOf = (distinct, ts) => createHash("sha256").update(`ph|${distinct}|${day(ts)}`).digest("hex").slice(0, 20);

const until = await cutoff();
const users = await knownUsers();
const untilCh = chTime(until);
console.log(`${DRY ? "[dry run] " : ""}Importing PostHog history before ${until} from ${HOST}, project ${PROJECT}`);

// 1. Page views on the product's own site.
let views = 0;
let first = null;
let last = null;
for await (const rows of pages(
  "uuid, distinct_id, timestamp, properties.$pathname, properties.$referring_domain, properties.$geoip_country_code, properties.$device_type, properties.utm_source, properties.utm_medium, properties.utm_campaign, properties.$host",
  `event = '$pageview' and timestamp < toDateTime('${esc(untilCh)}', 'UTC') and (properties.$host = '${esc(SITE)}' or properties.$host = 'www.${esc(SITE)}')`,
)) {
  const out = [];
  for (const [uuid, distinct, ts, path, ref, country, device, us, um, uc] of rows) {
    const p = String(path || "/").slice(0, 512);
    const a = area(p);
    if (!a) continue;
    const refHost = ref && ref !== "$direct" ? String(ref).toLowerCase().replace(/^www\./, "") : null;
    out.push({
      source_id: `ph:${uuid}`,
      at: new Date(ts).toISOString(),
      kind: "import",
      area: a,
      path: p,
      referrer: refHost && refHost !== SITE ? refHost.slice(0, 120) : null,
      ua: null,
      bot: false,
      bot_name: null,
      device: device ? String(device).toLowerCase() : null,
      country: country ? String(country).toUpperCase().slice(0, 2) : null,
      visitor: visitorOf(distinct, ts),
      user_id: users.has(String(distinct)) ? String(distinct) : null,
      hosted_key: a === "hosted" ? (/^\/hosted\/([^/]+)/.exec(p)?.[1] ?? null) : null,
      utm_source: us ? String(us).slice(0, 80) : null,
      utm_medium: um ? String(um).slice(0, 80) : null,
      utm_campaign: uc ? String(uc).slice(0, 120) : null,
    });
  }
  views += await insert("web_visits", out);
  first ??= out[0]?.at ?? null;
  last = out.at(-1)?.at ?? last;
  process.stdout.write(`\r  page views: ${views}`);
}
console.log(`\r  page views: ${views}${first ? ` (${first.slice(0, 10)} to ${last?.slice(0, 10)})` : ""}`);

// 2. Our server-side product events.
let events = 0;
const counts = {};
for await (const rows of pages(
  `uuid, distinct_id, timestamp, event, ${KEEP_PROPS.map((k) => `properties.${k}`).join(", ")}`,
  `event in (${SERVER_EVENTS.map((e) => `'${e}'`).join(", ")}) and timestamp < toDateTime('${esc(untilCh)}', 'UTC')`,
)) {
  const out = rows.map(([uuid, distinct, ts, event, ...vals]) => {
    counts[event] = (counts[event] ?? 0) + 1;
    const props = {};
    KEEP_PROPS.forEach((k, i) => {
      if (vals[i] != null && vals[i] !== "") props[k] = vals[i];
    });
    return { source_id: `ph:${uuid}`, at: new Date(ts).toISOString(), distinct_id: String(distinct), event, props };
  });
  events += await insert("app_events", out);
  process.stdout.write(`\r  product events: ${events}`);
}
console.log(`\r  product events: ${events}`);
for (const [e, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`    ${e.padEnd(32)} ${n}`);
console.log(DRY ? "Dry run: nothing written. Run again without --dry-run to import." : "Done. Reload /owner and pick 12m.");
