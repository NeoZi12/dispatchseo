// The six permission modes, in the order code.claude.com/docs/en/permission-modes
// lists them, each with its own "what runs without asking" and "best for" line
// pulled verbatim from that table. Deliberately NOT drawn as a strict 0-to-100
// trust scale: plan blocks edits by design regardless of how much runs, and
// dontAsk denies anything you haven't pre-approved, so neither slots cleanly
// between its neighbors on a single axis.

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M14.5 4.5 19 9l-10 10H4.5v-4.5Z" />
      <path d="M13 6l4.5 4.5" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m14.5 9.5-1.7 5.2-5.2 1.7 1.7-5.2Z" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15 15.5 9.5" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LockCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M9.5 15l1.8 1.8L14.8 13" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 7-2.5" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MODES = [
  {
    mode: "default",
    icon: EyeIcon,
    runs: "Reads only",
    bestFor: "Reviewing every action yourself, sensitive work",
  },
  {
    mode: "acceptEdits",
    icon: PencilIcon,
    runs: "Reads, file edits, and common filesystem commands",
    bestFor: "Iterating on code you're reviewing",
  },
  {
    mode: "plan",
    icon: CompassIcon,
    runs: "Reads, plus classifier-approved commands when auto mode is available",
    bestFor: "Exploring a codebase before changing it",
  },
  {
    mode: "auto",
    icon: GaugeIcon,
    runs: "Everything, with background safety checks",
    bestFor: "Long tasks, reducing prompt fatigue",
  },
  {
    mode: "dontAsk",
    icon: LockCheckIcon,
    runs: "Only pre-approved tools",
    bestFor: "Locked-down CI and scripts",
  },
  {
    mode: "bypassPermissions",
    icon: UnlockIcon,
    runs: "Everything",
    bestFor: "Isolated containers and VMs only",
  },
] as const;

export function PermissionModeSpectrum() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {MODES.map(({ mode, icon: Icon, runs, bestFor }) => (
          <div key={mode} className="rounded-lg bg-neutral-950/60 p-3">
            <div className="flex items-center gap-2 text-violet-300">
              <Icon />
              <code className="text-xs font-medium text-neutral-100">{mode}</code>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-300">{runs}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{bestFor}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Ordered as Claude Code&apos;s own docs order them, left to right - not a strict trust scale.{" "}
        <code className="rounded bg-neutral-950 px-1 py-0.5 text-neutral-400">plan</code> blocks edits by
        design regardless of how much else runs, and{" "}
        <code className="rounded bg-neutral-950 px-1 py-0.5 text-neutral-400">dontAsk</code> denies anything
        you haven&apos;t pre-approved, so neither slots cleanly between its neighbors on one axis.
      </p>
    </div>
  );
}
