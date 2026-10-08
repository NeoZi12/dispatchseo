"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SetupStep } from "@/lib/setup-path-core";

// The card's one source of truth: the step the server computed, kept fresh.
//
// - Polls GET /api/setup/step while `step.polls` (evidence that arrives
//   from outside - a GitHub callback, an MCP request - has no other way to
//   reach an open tab): every 5 s, backing off to 15 s on a wait that has
//   run for more than 10 minutes (a setup run or an overnight build moves
//   on a scale of minutes to hours). Once more whenever the tab becomes
//   visible again (the owner coming back from GitHub or claude.ai), and once
//   on mount: a server render is the CHEAP pass (no live reads), so the
//   first live answer can differ from it - e.g. a parked step that the
//   render showed without its live evidence.
// - Follows `initial` when the server re-renders the page with a new step
//   (router.refresh after a form, a callback redirect).
// - When a `do` step is replaced by a different step, it holds the old one
//   for the DONE BEAT before letting it go, so the owner sees their action
//   land instead of a screen that silently swaps.

/** How long the done beat holds before the next step comes in. */
export const DONE_BEAT_MS = 900;
const POLL_MS = 5_000;
const SLOW_POLL_MS = 15_000;
/** A wait older than this polls every SLOW_POLL_MS instead of POLL_MS. */
const SLOW_WAIT_AFTER_MS = 10 * 60_000;

/** The delay before the next poll for this step. `shownAt` anchors a wait
 *  with no server `since` (its age in this tab). */
function pollDelay(step: SetupStep, shownAt: number): number {
  if (step.kind !== "wait") return POLL_MS;
  const since = step.waiting?.since ? Date.parse(step.waiting.since) : NaN;
  const start = Number.isFinite(since) ? since : shownAt;
  return Date.now() - start > SLOW_WAIT_AFTER_MS ? SLOW_POLL_MS : POLL_MS;
}

/** The identity AnimatePresence keys on. `let_us_publish` is one id for two
 *  screens (App install, then the repo pick), so its primary kind is part of
 *  the key: the second screen gets its own entrance. */
export function stageKey(step: SetupStep): string {
  return step.id === "let_us_publish" ? `${step.id}:${step.primary.kind}` : step.id;
}

export type RefreshOptions = {
  /** Skip the done beat for this transition (a parked step is not done). */
  quiet?: boolean;
};

export function useSetupStep(
  slug: string | null,
  initial: SetupStep,
  opts: { poll?: boolean } = {},
): {
  step: SetupStep;
  /** True while the done beat plays over the step that just finished. */
  celebrating: boolean;
  refresh: (o?: RefreshOptions) => Promise<void>;
  /** Show a step the caller already has (a server action's result). */
  apply: (next: SetupStep, o?: RefreshOptions) => void;
} {
  const poll = opts.poll !== false;
  const [step, setStep] = useState<SetupStep>(initial);
  const [celebrating, setCelebrating] = useState(false);
  const current = useRef<SetupStep>(initial);
  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<SetupStep | null>(null);

  const show = useCallback((next: SetupStep) => {
    current.current = next;
    setStep(next);
  }, []);

  const apply = useCallback(
    (next: SetupStep, o?: RefreshOptions) => {
      // A beat is already playing: land on the newest step when it ends.
      if (beatTimer.current) {
        queued.current = next;
        return;
      }
      const cur = current.current;
      const advanced = stageKey(next) !== stageKey(cur);
      if (advanced && cur.kind === "do" && !o?.quiet) {
        queued.current = next;
        setCelebrating(true);
        beatTimer.current = setTimeout(() => {
          beatTimer.current = null;
          setCelebrating(false);
          const n = queued.current;
          queued.current = null;
          if (n) show(n);
        }, DONE_BEAT_MS);
        return;
      }
      show(next);
    },
    [show],
  );

  useEffect(() => () => {
    if (beatTimer.current) clearTimeout(beatTimer.current);
  }, []);

  // Follow server re-renders. Skips the first run: `initial` is already shown.
  const lastInitial = useRef(initial);
  useEffect(() => {
    if (initial === lastInitial.current) return;
    lastInitial.current = initial;
    apply(initial);
  }, [initial, apply]);

  const inFlight = useRef(false);
  const refresh = useCallback(
    async (o?: RefreshOptions) => {
      if (!slug || inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(
          `/api/setup/step?slug=${encodeURIComponent(slug)}&last_step=${encodeURIComponent(current.current.id)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const next = (await res.json()) as SetupStep;
        if (next && typeof next.id === "string") apply(next, o);
      } catch {
        // A dropped poll is not worth a word on screen; the next one retries.
      } finally {
        inFlight.current = false;
      }
    },
    [slug, apply],
  );

  // One quiet live read on mount (see the header): never a done beat, the
  // owner did nothing.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current || !poll || !slug) return;
    mounted.current = true;
    void refresh({ quiet: true });
  }, [poll, slug, refresh]);

  // When this stage first showed in this tab: the age of a wait the server
  // gave no `since` for.
  // Both are read through refs, inside the timer only, so a fresh poll
  // result (a new object, same stage) doesn't tear down the timer chain.
  const shownAt = useRef<{ key: string; at: number } | null>(null);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
    const key = stageKey(step);
    if (shownAt.current?.key !== key) shownAt.current = { key, at: Date.now() };
  }, [step]);

  useEffect(() => {
    if (!poll || !slug || !step.polls) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        schedule();
      }, pollDelay(stepRef.current, shownAt.current?.at ?? Date.now()));
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll, slug, step.polls, refresh]);

  return { step, celebrating, refresh, apply };
}
