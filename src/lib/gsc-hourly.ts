import { db } from "@/lib/db";
import type { GscClient } from "@/lib/gsc";
import { getHourlyRange } from "@/lib/gsc";

// Google's hour-by-hour numbers, saved per site per day (gsc_hourly, 0088).
//
// Search Console keeps hourly data for about ten days only, so the hourly-gsc
// cron (every 3 hours on Vercel and on self-host) calls syncHourly on every run: ONE Search Console call for the last
// ten days, upserted day by day (recent hours get revised as Google finalizes
// them, so re-saving is the point). The day page reads the stored rows and
// never waits on Google - nobody is ever asked to retry (owner, 2026-11-10).

export const HOURLY_KEEP_DAYS = 10;
const DAY = 86_400_000;

/** One stored hour: `at` is Google's own key, the hour's start with its
 *  Pacific offset ("2026-11-09T14:00:00-08:00"). The exact time, not an
 *  hour number: the day clocks go back has two different 1 AMs. */
export type StoredHour = { at: string; clicks: number; impressions: number };
export type StoredDay = { date: string; hours: StoredHour[]; utc_offset: string; updated_at?: string };

/** Fetches the last ten Google days hour by hour and saves them. Returns
 *  the days saved. Throws on a Google or database error (the cron reports
 *  it without failing the run). */
export async function syncHourly(projectId: string, site: string, sc: GscClient): Promise<string[]> {
  const now = Date.now();
  // Google's days are Pacific, never ahead of UTC: today's UTC date is the
  // newest it can have, and one extra day back covers the clock skew.
  const end = new Date(now).toISOString().slice(0, 10);
  const start = new Date(now - (HOURLY_KEEP_DAYS + 1) * DAY).toISOString().slice(0, 10);
  const rows = await getHourlyRange(site, start, end, sc);
  // The oldest day Google returns is the one its rolling ten-day window cuts
  // into (measured 2026-11-10: asked from Oct 30, it returned Oct 31 with
  // its first ten hours gone). Never save it - whichever date that is. A
  // day already saved whole on an earlier run is protected below.
  const oldest = rows.reduce<string | null>((m, r) => {
    const d = r.hour.slice(0, 10);
    return m == null || d < m ? d : m;
  }, null);
  const days = new Map<string, StoredDay>();
  for (const r of rows) {
    // "2026-11-09T14:00:00-08:00": the day and the offset are both in
    // Google's own key.
    const date = r.hour.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(r.hour))) continue;
    if (date === oldest) continue;
    const day = days.get(date) ?? { date, hours: [], utc_offset: r.hour.match(/[+-]\d{2}:\d{2}$/)?.[0] ?? "-08:00" };
    day.hours.push({ at: r.hour, clicks: r.clicks, impressions: r.impressions });
    days.set(date, day);
  }
  if (!days.size) return [];
  // Google's window rolls by the hour, so the oldest day it still returns can
  // be cut short too. A day already saved in full must never be replaced by
  // a shorter copy of itself - only the last few days, which Google is still
  // revising, are always re-saved.
  const settled = new Date(now - 3 * DAY).toISOString().slice(0, 10);
  const { data: had } = await db().from("gsc_hourly").select("date, hours").eq("project_id", projectId).in("date", [...days.keys()]);
  const hadCount = new Map(((had ?? []) as Array<{ date: string; hours: unknown[] | null }>).map((r) => [r.date, r.hours?.length ?? 0]));
  const fresh = [...days.values()].filter((d) => d.date >= settled || d.hours.length >= (hadCount.get(d.date) ?? 0));
  if (!fresh.length) return [];
  const at = new Date().toISOString();
  const { error } = await db()
    .from("gsc_hourly")
    .upsert(
      fresh.map((d) => ({
        project_id: projectId,
        date: d.date,
        hours: d.hours.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
        utc_offset: d.utc_offset,
        updated_at: at,
      })),
      { onConflict: "project_id,date" },
    );
  if (error) throw new Error(`gsc_hourly upsert: ${error.message}`);
  return fresh.map((d) => d.date).sort();
}

/** One stored day, or null when it was never saved (or the read failed -
 *  unknown reads as "not here yet", never as an error on screen). */
export async function readHourly(projectId: string, date: string): Promise<StoredDay | null> {
  const { data, error } = await db().from("gsc_hourly").select("date, hours, utc_offset, updated_at").eq("project_id", projectId).eq("date", date).maybeSingle();
  if (error || !data) return null;
  return data as StoredDay;
}
