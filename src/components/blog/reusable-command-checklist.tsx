// What separates a command you still type in month three from one that rots
// in .claude/commands/ unused - drawn from the frontmatter and body-content
// guidance in code.claude.com's current skills reference.

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

const ITEMS = [
  {
    good: true,
    title: "Named for one action, not a topic",
    detail: "/deploy, not /helpers - the name is the whole spec of what it does",
  },
  {
    good: true,
    title: "The body says what to do, not just what's true",
    detail: "task content (\"run the test suite, then...\") reruns cleanly; reference notes don't tell Claude to act",
  },
  {
    good: true,
    title: "Takes $ARGUMENTS or $1 / $2 instead of one hardcoded target",
    detail: "one file handles every issue number or component name instead of forking into near-duplicates",
  },
  {
    good: false,
    title: "No description field",
    detail: "Claude can't decide to load a skill with nothing to match against, and six months from now neither can you",
  },
  {
    good: false,
    title: "One file quietly grew into five workflows",
    detail: "past ~500 lines it's not a command anymore, it's an unindexed wiki page - split it before that happens",
  },
] as const;

export function ReusableCommandChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className={`mt-0.5 ${item.good ? "text-emerald-400" : "text-red-400"}`}>
              {item.good ? <CheckIcon /> : <XIcon />}
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
