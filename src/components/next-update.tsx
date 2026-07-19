"use client";

// Tiny "updates in Xh Ym" countdown shown next to a stat. SERP-backed numbers
// refresh via the daily cron at 04:00 UTC (vercel.json), so the default
// target is the next 04:00 UTC. GSC-backed numbers refresh via the hourly-gsc
// GitHub Action (:07 every hour) - pass `hourly` for those. Pass `at` (ISO)
// for stats on their own clock (Domain Rating's 24h cache), or `live` for
// numbers that read fresh from the database on every load. Renders nothing
// until mounted so the server HTML never carries a clock that could mismatch
// on hydration.

import { useEffect, useState } from "react";

function nextCronUtc(now: number): number {
  const d = new Date(now);
  const today4 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 4);
  return now < today4 ? today4 : today4 + 86_400_000;
}

function nextHourlyUtc(now: number): number {
  // The hourly-gsc Action fires at :07; count down to :10 so data has landed.
  const d = new Date(now);
  const thisHour = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 10);
  return now < thisHour ? thisHour : thisHour + 3_600_000;
}

function countdown(ms: number): string {
  if (ms <= 0) return "updates soon";
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `updates in ${h}h ${m}m` : `updates in ${h}h`;
  return `updates in ${m}m`;
}

export function NextUpdate({
  at,
  live = false,
  hourly = false,
}: {
  at?: string;
  live?: boolean;
  hourly?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (live) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [live]);

  if (live) {
    return (
      <span
        className="whitespace-nowrap text-neutral-600"
        title="always current - reads the database on every page load"
      >
        live
      </span>
    );
  }

  if (now == null) return null;
  const target = at ? Date.parse(at) : hourly ? nextHourlyUtc(now) : nextCronUtc(now);
  if (Number.isNaN(target)) return null;

  return (
    <span
      className="whitespace-nowrap text-neutral-600"
      title={`next refresh ~${new Date(target).toLocaleString()}`}
    >
      {countdown(target - now)}
    </span>
  );
}
