// The four states a task moves through and which tool call announces each one
// in the stream-json output, per the Agent SDK todo-tracking docs. Shows why a
// log reader sees intent (a status change) rather than proof of work.

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="hidden h-5 w-5 shrink-0 text-neutral-600 sm:block" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const STEPS = [
  { state: "pending", call: "TaskCreate", note: "Claude adds the item when it spots a step. The new ID comes back in the tool result, not the input." },
  { state: "in_progress", call: "TaskUpdate", note: "Set when the work starts. The activeForm label says what it's doing right now." },
  { state: "completed", call: "TaskUpdate", note: "Set when Claude decides the step finished. Nothing checks that it did." },
  { state: "deleted", call: "TaskUpdate", note: "status: \"deleted\" drops an item Claude no longer needs." },
];

export function TaskLifecycleFlow() {
  return (
    <div className="not-prose my-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      {STEPS.map((s, i) => (
        <div key={s.state} className="flex flex-1 items-center gap-3">
          <div className="flex-1 rounded-xl bg-neutral-900 p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">{s.call}</p>
            <p className="mt-1 font-mono text-sm font-semibold text-violet-400">{s.state}</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{s.note}</p>
          </div>
          {i < STEPS.length - 1 && <Arrow />}
        </div>
      ))}
    </div>
  );
}
