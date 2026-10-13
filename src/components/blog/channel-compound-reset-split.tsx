// The one test the guide uses to sort marketing channels: does the work still
// pay next month if you stop today (compounds), or does it go to zero (resets)?
// Structural, no measured data - it shows how the strategy sorts channels so a
// solo founder can spend the first hours on the left column.

const COMPOUNDS = [
  { name: "SEO pages", why: "A ranking page keeps getting found with no further work." },
  { name: "Docs and guides", why: "Each page is read by new visitors long after it ships." },
  { name: "Free tools", why: "A useful widget collects searches and links on its own." },
  { name: "Product-led loops", why: "Shared outputs and invites bring users who never saw an ad." },
] as const;

const RESETS = [
  { name: "Paid ads", why: "Traffic stops the day the budget does." },
  { name: "Cold outreach", why: "Every reply is earned again from scratch each week." },
  { name: "Social posting", why: "A post is mostly gone from the feed within a day or two." },
  { name: "Launch days", why: "A spike, then the baseline. Worth doing once per launch." },
] as const;

function Column({
  label,
  tone,
  items,
  icon,
}: {
  label: string;
  tone: string;
  items: ReadonlyArray<{ name: string; why: string }>;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className={`flex items-center gap-2 ${tone}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          {icon}
        </svg>
        <h3 className="text-[15px] font-semibold text-neutral-100">{label}</h3>
      </div>
      <ul className="mt-3 space-y-2.5">
        {items.map((i) => (
          <li key={i.name}>
            <p className="text-sm font-semibold text-neutral-100">{i.name}</p>
            <p className="text-sm leading-relaxed text-neutral-400">{i.why}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChannelCompoundResetSplit() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      <Column
        label="Compounds: work pays after you stop"
        tone="text-emerald-400"
        items={COMPOUNDS}
        icon={<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />}
      />
      <Column
        label="Resets: work pays only while you do it"
        tone="text-amber-300"
        items={RESETS}
        icon={<path d="M4 4v6h6M4.5 14a8 8 0 1 0 2-7.5L4 10" />}
      />
    </div>
  );
}
