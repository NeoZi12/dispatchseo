// The pattern behind why solo SEO projects stall - not a checklist of tasks,
// but the sequence of how attention actually erodes over a real calendar,
// drawn from what the recurring half of any DIY checklist implies once you
// follow it past week one.

function SetupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function FirstPostIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

function GapCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <path d="M8 14h2M14 14h2M8 18h2" strokeDasharray="0.5 3.2" />
    </svg>
  );
}

function DriftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M3 17 9 9l4 4 8-10" />
      <path d="M3 21h18" />
      <path d="m17 3 4 0 0 4" opacity="0.4" />
    </svg>
  );
}

const STAGES = [
  {
    icon: <SetupIcon />,
    title: "The one-time setup gets done",
    detail: "technical basics, on-page tags, Search Console verified - this part reliably happens, because it's a finite list with an end.",
  },
  {
    icon: <FirstPostIcon />,
    title: "The first two or three posts ship",
    detail: "momentum is highest right after setup, so the first pieces of content usually go out close to on schedule.",
  },
  {
    icon: <GapCalendarIcon />,
    title: "\"This week\" loses to whatever the business actually needed",
    detail: "the checklist item with no finish line is the first one to slip once a real week gets busy - and nothing on the page tells you it slipped.",
  },
  {
    icon: <DriftIcon />,
    title: "Rankings and Search Console drift, unwatched",
    detail: "no new content means no new queries to win, and a monitoring step nobody opens can't warn anyone before it costs a month of visibility.",
  },
] as const;

export function SoloSeoDriftTimelineFlow() {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex min-w-[640px] gap-3 sm:min-w-0">
        {STAGES.map((s, i) => {
          const last = i === STAGES.length - 1;
          return (
            <div key={s.title} className="flex flex-1 items-start gap-3">
              <div className="flex flex-1 flex-col gap-2 rounded-lg bg-neutral-950/60 p-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    i < 2 ? "bg-neutral-800 text-neutral-300" : "bg-amber-300/10 text-amber-300"
                  }`}
                >
                  {s.icon}
                </span>
                <p className="text-sm font-medium text-neutral-100">{s.title}</p>
                <p className="text-xs leading-relaxed text-neutral-500">{s.detail}</p>
              </div>
              {!last ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-6 h-4 w-4 shrink-0 text-neutral-700" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
