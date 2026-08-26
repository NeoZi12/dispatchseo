// The real numbers in build-schedule.ts's failureRetryHours(): a broken repo
// backs off 2h, 4h, 8h... capped at the job's own cadence (20h for a daily
// guide build), but a QUOTA-classified failure never widens past 2h - the
// customer's usage window resets on its own clock, not on how many times the
// scheduler has already failed. Same function, one boolean flips the shape.

function StepPill({ hours, capped }: { hours: string; capped?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`flex h-11 min-w-11 items-center justify-center rounded-lg px-2 font-mono text-xs font-medium tabular-nums ${
          capped ? "bg-violet-500/20 text-violet-300" : "bg-neutral-800 text-neutral-200"
        }`}
      >
        {hours}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-4 shrink-0 text-neutral-700" aria-hidden="true">
      <path d="M4 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function QuotaBackoffTimeline() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        failureRetryHours() - next retry after each consecutive failure
      </p>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-neutral-100">Ordinary failure - widens every time</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <StepPill hours="2h" />
          <Arrow />
          <StepPill hours="4h" />
          <Arrow />
          <StepPill hours="8h" />
          <Arrow />
          <StepPill hours="16h" />
          <Arrow />
          <StepPill hours="20h" capped />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          Capped at the job&apos;s own cadence - a permanently broken repo settles back to one attempt a
          day, not a runner minute burned every 2 hours forever.
        </p>
      </div>

      <div className="mt-5 border-t border-neutral-800/70 pt-4">
        <p className="mb-2 text-sm font-medium text-neutral-100">Quota-classified failure - stays flat</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <StepPill hours="2h" capped />
          <Arrow />
          <StepPill hours="2h" capped />
          <Arrow />
          <StepPill hours="2h" capped />
          <Arrow />
          <span className="px-1 font-mono text-xs text-neutral-600">...until it clears</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          A usage window resets on its own clock, so widening the retry would mean checking back{" "}
          <em>after</em> it already cleared. Real incident this rule exists for: a project&apos;s builder
          failed twice on 2026-08-02 with &quot;You&apos;ve hit your session limit · resets 1:50pm
          (UTC)&quot; - the reset was 70 minutes away, not 4 or 8 hours.
        </p>
      </div>
    </div>
  );
}
