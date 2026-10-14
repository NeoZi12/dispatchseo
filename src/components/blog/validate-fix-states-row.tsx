// The three states Search Console shows after you click "Validate fix", with
// Google's own wording for each and the documented timing. Shapes under the
// text are decoration; every fact is DOM text.

const STATES = [
  { name: "Started", tone: "text-sky-400", text: "You began a validation attempt and no remaining instances of the issue have been found yet." },
  { name: "Passed", tone: "text-emerald-400", text: "All known instances of the issue are gone, or the affected URL is no longer available." },
  { name: "Failed", tone: "text-amber-300", text: "A certain threshold of pages still contain the issue. Fix the rest and restart validation." },
] as const;

export function ValidateFixStatesRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {STATES.map((s) => (
          <div key={s.name} className="rounded-lg bg-neutral-950 p-3">
            <p className={`text-xs font-medium uppercase tracking-wide ${s.tone}`}>{s.name}</p>
            <p className="mt-1.5 text-sm text-neutral-300">{s.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Google says validation typically takes up to about two weeks, and sometimes much longer.
      </p>
    </div>
  );
}
