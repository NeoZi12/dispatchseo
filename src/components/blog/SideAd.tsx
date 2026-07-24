import { DispatchMark } from "@/components/logo";

// The self-promo card in the reading rail (and, on short posts with no ToC,
// inline in the article flow - see [slug]/page.tsx). Quiet and self-contained:
// one filled card, a short tick list of what you get, one action. No waitlist
// anymore, so the ticks carry the pitch and the single CTA sends you to the
// product. The credibility line borrows the "agent active" pulsing-dot idiom
// from the dashboard (AgentStatus) - it is true and it is the whole pitch, so
// it gets to say so plainly.
const SITE_URL = "https://dispatchseo.com/";

const TICKS = [
  "Keyword research on autopilot",
  "Guides & tools shipped as PRs you approve",
  "Daily rank + Search Console tracking",
  "Open source, free to self-host",
];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
  );
}

export function SideAd({ className = "" }: { className?: string }) {
  return (
    <aside
      aria-label="About DispatchSEO"
      className={`rounded-xl bg-neutral-900 p-5 ${className}`}
    >
      <DispatchMark className="h-7 w-7" />
      <p className="mt-3 text-[15px] font-semibold text-neutral-100">DispatchSEO</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
        Claude Code as your SEO manager.
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {TICKS.map((tick) => (
          <li key={tick} className="flex items-start gap-2.5">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
            <span className="text-[13px] leading-snug text-neutral-300">{tick}</span>
          </li>
        ))}
      </ul>
      <a
        href={SITE_URL}
        className="mt-5 block rounded-lg bg-violet-500 px-3.5 py-2 text-center text-[13px] font-semibold text-white outline-none transition-colors hover:bg-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
      >
        Try it free
      </a>
      <p className="mt-4 flex items-center gap-2 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20"
          aria-hidden="true"
        />
        Written and shipped by DispatchSEO&apos;s own pipeline
      </p>
    </aside>
  );
}
