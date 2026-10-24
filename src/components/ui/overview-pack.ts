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
