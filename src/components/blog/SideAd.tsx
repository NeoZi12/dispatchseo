import { DispatchMark } from "@/components/logo";

// The self-promo card in the reading rail (and, on short posts with no ToC,
// inline in the article flow - see [slug]/page.tsx). Quiet and self-contained:
// one filled card, two actions, no gradients. The credibility line borrows the
// "agent active" pulsing-dot idiom from the dashboard (AgentStatus) - it is
// true and it is the whole pitch, so it gets to say so plainly.
const WAITLIST_URL = "https://dispatchseo.com/";
const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.7-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
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
        Claude Code as your SEO manager - research, guides, tools, and rank
        tracking on autopilot.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <a
          href={WAITLIST_URL}
          className="rounded-lg bg-violet-500 px-3.5 py-2 text-center text-[13px] font-semibold text-white outline-none transition-colors hover:bg-violet-400 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
        >
          Join the waitlist
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-800 px-3.5 py-2 text-[13px] font-medium text-neutral-300 outline-none transition-colors hover:border-neutral-700 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
        >
          <GitHubIcon className="h-3.5 w-3.5" />
          Star on GitHub
        </a>
      </div>
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
