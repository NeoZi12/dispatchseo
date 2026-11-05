// The overview card's daily series, packed for the wire: "20261014,23,912"
// (date, clicks, impressions, and the position when there is one) joined by
// ";". A year of days as JSON objects is ~18 KB, sent twice (HTML and RSC
// payload); packed it's about a third of that. Plain module so a server page
// can pack and the client chart can unpack.

export type PackedDay = { date: string; clicks: number; impressions: number; position?: number | null };

export function packDays(days: PackedDay[]): string {
  return days
    .map((d) => {
      const base = `${d.date.slice(0, 10).replace(/-/g, "")},${d.clicks},${d.impressions}`;
      return d.position == null ? base : `${base},${Math.round(d.position * 10) / 10}`;
    })
    .join(";");
}

export function unpackDays(s: string): PackedDay[] {
  if (!s) return [];
  return s.split(";").map((row) => {
    const [d, c, i, p] = row.split(",");
    return {
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      clicks: Number(c) || 0,
      impressions: Number(i) || 0,
      position: p === undefined ? null : Number(p),
    };
  });
}

// ---- where they landed ----
// The pages Google's clicks landed on, one list per range of the overview
// card, tallied on the server (the per-day page JSON is heavy; the lists
// are light) and keyed by the same range keys the chart's switch uses.

export type LandedRangeKey = "7d" | "30d" | "3m" | "12m" | "all";
/** Days in each range; null is "all time". The chart's switch shares this. */
export const LANDED_RANGE_DAYS: Record<LandedRangeKey, number | null> = { "7d": 7, "30d": 30, "3m": 91, "12m": 365, all: null };

export type LandedPage = {
  /** Pathname, the row's identity: www/non-www and trailing-slash variants fold together. */
  path: string;
  /** The variant Google saw most, to link to. */
  url: string;
  title: string | null;
  clicks: number;
  impressions: number;
  /** Impression-weighted average spot on Google, when known. */
  position: number | null;
  /** When the post went live, when we know (our own pages only). */
  publishedAt?: string | null;
};
export type Landed = Partial<Record<LandedRangeKey, LandedPage[]>>;
