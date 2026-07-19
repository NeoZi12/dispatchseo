"use client";

// The "At a glance" stat row on Home, with a range selector for the two GSC
// tiles. Daily ranges window the full stored history client-side, so
// switching is instant. "24 hours" is different: GSC's daily data lags 2-3
// days, so it comes from Google's live fresh hourly feed instead
// (pre-aggregated server-side) and its numbers are provisional until Google
// finalizes them.
//
// Daily windows are anchored to the most recent date that HAS data, not to
// today - same as Google's own Search Console UI - so "7 days" always means
// seven full days of real data.

import { useState } from "react";
import Link from "next/link";
import { halfDelta, sumGsc, type GscRow } from "@/lib/metrics";
import type { Fresh24h } from "@/lib/gsc";
import { BigStatTile, DeltaPill, RangeSelector, StatRow } from "@/components/ui";
import { NextUpdate } from "@/components/next-update";

const RANGES = [
  { key: "24h", label: "24 hours", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "all time", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function windowRows(daily: GscRow[], days: number | null): GscRow[] {
  if (days == null || daily.length === 0) return daily;
  const latest = daily[daily.length - 1].date;
  const cutoffMs = new Date(latest + "T00:00:00Z").getTime() - (days - 1) * 86400000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  return daily.filter((r) => r.date >= cutoff);
}

export function GlanceSection({
  daily,
  fresh24,
  keywordsTracked,
  guidesPublished,
}: {
  daily: GscRow[];
  fresh24: Fresh24h | null;
  keywordsTracked: number;
  guidesPublished: number;
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  // No fresh data (GSC hiccup) - drop the 24h option rather than show zeros.
  const ranges = fresh24 ? RANGES : RANGES.filter((r) => r.key !== "24h");
  const active = ranges.find((r) => r.key === range) ?? RANGES[2];
  const is24 = active.key === "24h" && fresh24 != null;

  const rows = is24 ? [] : windowRows(daily, active.days);
  const clicks = is24 ? fresh24.clicks : sumGsc(rows, "clicks");
  const impressions = is24 ? fresh24.impressions : sumGsc(rows, "impressions");
  const clicksDelta = is24 ? fresh24.clicks - fresh24.prevClicks : halfDelta(rows, "clicks");
  const imprsDelta = is24
    ? fresh24.impressions - fresh24.prevImpressions
    : halfDelta(rows, "impressions");
  const deltaTitle = is24
    ? "vs the previous 24 hours"
    : "second half of this window vs the first half";

  const gscLabel = active.days == null ? "all time" : `last ${active.label}`;
  const gscSub = (
    <>
      {is24 ? "vs. the day before" : gscLabel} · <NextUpdate live={is24} hourly />
    </>
  );

  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        <RangeSelector
          options={ranges}
          active={active.key}
          onChange={(k) => setRange(k as RangeKey)}
        />
      </div>
      <StatRow>
        <BigStatTile
          title="Clicks"
          value={clicks}
          pill={<DeltaPill delta={clicksDelta} title={deltaTitle} />}
          sub={gscSub}
        />
        <BigStatTile
          title="Impressions"
          value={impressions}
          pill={<DeltaPill delta={imprsDelta} title={deltaTitle} />}
          sub={gscSub}
        />
        <BigStatTile
          title={
            <Link href="/keywords" className="hover:underline hover:underline-offset-4">
              Keywords tracked
            </Link>
          }
          value={keywordsTracked}
          sub={<NextUpdate live />}
        />
        <BigStatTile
          title={
            <Link href="/pages" className="hover:underline hover:underline-offset-4">
              Guides published
            </Link>
          }
          value={guidesPublished}
          sub={<NextUpdate live />}
        />
      </StatRow>
    </section>
  );
}
