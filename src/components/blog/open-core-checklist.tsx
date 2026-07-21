// Five concrete signals that separate real self-hosting from a "self-hosted"
// pricing tier that's actually a vendor-operated single-tenant instance -
// general, checkable properties, not a generic "read the docs" list.

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

const ITEMS = [
  {
    title: "It runs without calling home",
    detail:
      "Core functionality doesn't silently degrade without a license check reaching the vendor's servers - if it does, that's a phone-home gate, not self-hosting.",
  },
  {
    title: "You hold the credentials, not a shared vendor key",
    detail:
      "Your own API keys and tokens sit in your own environment. If the vendor's account is doing the calling on your behalf, they're still the operator.",
  },
  {
    title: "\"Self-hosted\" pricing isn't dedicated hosting in disguise",
    detail:
      "Watch for a paid tier described as self-hosted that's actually a single-tenant instance the vendor still runs - that's dedicated hosting, a different thing entirely.",
  },
  {
    title: "The code actually running is inspectable",
    detail:
      "You can read what's executing on your infrastructure, not just its config file - even under a license that doesn't let you modify it.",
  },
  {
    title: "Removing the vendor doesn't remove your data",
    detail:
      "State lives in infrastructure you control. Uninstalling the vendor's software leaves your database intact and exportable, not stranded.",
  },
] as const;

export function OpenCoreChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 text-violet-400">
              <CheckIcon />
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
