// One-time (rerunnable) GSC backfill: pulls the last ~5 weeks of Search
// Console data into gsc_stats so the dashboard charts start full instead of
// accumulating one nightly snapshot at a time.
//
// Writes the exact same row shape as the daily cron (src/app/api/cron/
// daily-ranks + src/lib/gsc.ts) and upserts on the date unique key, so
// rerunning it or racing the cron is harmless.
//
// Run from the repo root:  node --env-file=.env.local scripts/backfill-gsc.mjs

import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const DAYS_BACK = 35; // covers the 28-day chart window plus GSC's 2-3 day lag

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const ymd = (d) => d.toISOString().slice(0, 10);

const credentials = JSON.parse(required("GSC_SERVICE_ACCOUNT_JSON"));
const site = required("GSC_SITE_URL");
const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
const sc = google.searchconsole({ version: "v1", auth });

const today = new Date();
const start = new Date(today.getTime() - DAYS_BACK * 86400000);

// 1. Per-day totals across the whole window in one call. Days with zero
// impressions simply don't appear - same behavior as the cron, which only
// stores days that have data.
const byDate = await sc.searchanalytics.query({
  siteUrl: site,
  requestBody: {
    startDate: ymd(start),
    endDate: ymd(today),
    dimensions: ["date"],
    rowLimit: 500,
  },
});
const dateRows = (byDate.data.rows ?? []).filter((r) => r.keys?.[0]);
console.log(`GSC returned ${dateRows.length} day(s) with data in the last ${DAYS_BACK} days.`);
if (dateRows.length === 0) process.exit(0);

// 2. For each day: top-20 queries + top-20 pages, then upsert the snapshot.
let written = 0;
for (const row of dateRows) {
  const date = row.keys[0];
  const [queriesRes, pagesRes] = await Promise.all([
    sc.searchanalytics.query({
      siteUrl: site,
      requestBody: { startDate: date, endDate: date, dimensions: ["query"], rowLimit: 20 },
    }),
    sc.searchanalytics.query({
      siteUrl: site,
      requestBody: { startDate: date, endDate: date, dimensions: ["page"], rowLimit: 20 },
    }),
  ]);

  const snapshot = {
    date,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    avg_position: row.position ?? 0,
    top_queries: (queriesRes.data.rows ?? []).map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
    })),
    top_pages: (pagesRes.data.rows ?? []).map((r) => ({
      page: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
    })),
  };

  const { error } = await db.from("gsc_stats").upsert(snapshot, { onConflict: "date" });
  if (error) throw new Error(`upsert ${date}: ${error.message}`);
  written++;
  console.log(
    `  ${date}: ${snapshot.clicks} clicks, ${snapshot.impressions} impressions, pos ${snapshot.avg_position.toFixed(1)}`,
  );
}

console.log(`Done - ${written} day(s) upserted into gsc_stats.`);
