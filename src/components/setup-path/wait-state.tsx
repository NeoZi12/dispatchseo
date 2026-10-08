"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { SetupStep } from "@/lib/setup-path-core";
import { ExternalArrow } from "./shared";

// The "nothing for you to do" half of a wait step: a live elapsed line under
// the title, the reassurance sentence, and - only once the step is running
// longer than it ever should - an amber hint with the one link that helps.
// The card around it carries the breathing border glow; this is the text.

/** Live clock. `serverNow` anchors the first frame to the server's clock
 *  (the step was computed against it), then real time moves it forward, so
 *  a skewed laptop clock never shows "Running for -3 min". */
export function useLiveNow(serverNow?: number): number {
  const [anchor] = useState(() => ({ server: serverNow ?? Date.now(), client: Date.now() }));
  const [now, setNow] = useState(anchor.server);
  useEffect(() => {
    const tick = () => setNow(anchor.server + (Date.now() - anchor.client));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [anchor]);
  return now;
}

export function formatElapsed(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "less than a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) {
    const rest = min % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }
  return `${Math.floor(h / 24)} days`;
}

export function ElapsedLine({
  waiting,
  serverNow,
  className = "",
}: {
  waiting: NonNullable<SetupStep["waiting"]>;
  serverNow?: number;
  className?: string;
}) {
  const now = useLiveNow(serverNow);
  const since = waiting.since ? Date.parse(waiting.since) : NaN;
  const elapsed = Number.isFinite(since) ? Math.max(0, now - since) : null;
  return (
    <p className={`text-sm tabular-nums text-violet-200/80 ${className}`}>
      {elapsed != null ? (
        <>
          Running for {formatElapsed(elapsed)}
          <span className="mx-1.5 text-neutral-600">·</span>
        </>
      ) : null}
      <span className="text-neutral-400">usually {waiting.typical}</span>
    </p>
  );
}

export function WaitBody({
  step,
  serverNow,
  reduced,
  align = "center",
}: {
  step: SetupStep;
  serverNow?: number;
  reduced: boolean;
  align?: "center" | "left";
}) {
  const now = useLiveNow(serverNow);
  const w = step.waiting;
  const since = w?.since ? Date.parse(w.since) : NaN;
  const slow = w != null && Number.isFinite(since) && now - since > w.slowAfterMs;
  const external = w?.slowHref?.startsWith("http");
  const justify = align === "center" ? "justify-center text-center" : "justify-start text-left";

  return (
    <div className="space-y-3">
      <p className={`flex items-center gap-2.5 text-[15px] text-neutral-300 ${justify}`}>
        <WorkingDots reduced={reduced} />
        <span className="min-w-0 break-words">{step.evidence || "Nothing for you to do. This turns green on its own."}</span>
      </p>
      {slow && w ? (
        <motion.p
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.15 : 0.35 }}
          className={`flex items-center gap-2 text-sm text-amber-300 ${justify}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 2" strokeLinecap="round" />
          </svg>
          {w.slowHref ? (
            <a
              href={w.slowHref}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="inline-flex min-w-0 items-center gap-1 break-words underline decoration-amber-300/40 underline-offset-4 transition-colors hover:text-amber-200 hover:decoration-amber-200"
            >
              {w.slowHint}
              {external ? <ExternalArrow /> : null}
            </a>
          ) : (
            <span className="min-w-0 break-words">{w.slowHint}</span>
          )}
        </motion.p>
      ) : null}
    </div>
  );
}

/** Three dots pulsing in sequence: "working", without a spinner's urgency. */
function WorkingDots({ reduced }: { reduced: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) =>
        reduced ? (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-violet-400/70" />
        ) : (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-violet-400"
            animate={{ opacity: [0.25, 1, 0.25], scale: [0.85, 1.1, 0.85] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
          />
        ),
      )}
    </span>
  );
}
