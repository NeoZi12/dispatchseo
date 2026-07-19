"use client";

// The "agent active" heartbeat pill at the top of Home. Only rendered when the
// automation loop is truly live (the server decides that - pipeline installed
// AND a builder automation on); this component just picks the right second
// segment. The countdown targets the daily builder's cron (05:00 UTC, see
// seo-daily.yml in the pipeline pack) and follows the NextUpdate pattern:
// nothing clock-derived renders until mounted, so server HTML never carries a
// time that could mismatch on hydration.

import { useEffect, useState } from "react";

function nextBuildUtc(now: number): number {
  const d = new Date(now);
  const today5 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5);
  return now < today5 ? today5 : today5 + 86_400_000;
}

function countdown(ms: number): string {
  if (ms <= 60_000) return "next build any minute";
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `next build in ${h}h ${m}m` : `next build in ${h}h`;
  return `next build in ${m}m`;
}

export function AgentStatus({
  building,
  guidesQueued,
  toolsQueued,
}: {
  building: boolean;
  guidesQueued: boolean;
  toolsQueued: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  const needsClock = !building && guidesQueued;

  useEffect(() => {
    if (!needsClock) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [needsClock]);

  let detail: string | null = null;
  let title: string | undefined;
  if (building) {
    detail = "building now";
  } else if (guidesQueued) {
    if (now != null) {
      const target = nextBuildUtc(now);
      detail = countdown(target - now);
      title = `the daily builder picks up the top approved idea ~${new Date(target).toLocaleString()}`;
    }
  } else if (toolsQueued) {
    detail = "tool build queued";
  } else {
    detail = "queue empty · new ideas Monday";
  }

  return (
    <div
      className="inline-flex items-center gap-2.5 text-sm text-neutral-400"
      title={title}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 ring-3 ring-emerald-400/20"
        aria-hidden="true"
      />
      <span>
        agent active
        {detail ? <span className="text-neutral-500"> · {detail}</span> : null}
      </span>
    </div>
  );
}
