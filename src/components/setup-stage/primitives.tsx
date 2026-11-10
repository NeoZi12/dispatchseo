import type { ReactNode } from "react";
import { PixelReporter } from "@/components/pixel-dispatcher";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import s from "./stage.module.css";

// The setup stage's shared pieces: the rail across the top, the mascot
// companion with its speech bubble, the one primary button, the check
// mark that draws itself. Design bar (owner, 2026-11-05): very visual, fun,
// goof-proof - every screen says one thing and asks for one thing.

export type SceneId = "address" | "account" | "checkout" | "publishing" | "github" | "google";
export type SceneStep = { id: SceneId; label: string };
/** The full rail. The Plan step (scene id "checkout": pick a plan, and pay
 *  for a paid one) is in every setup on a deployment with billing; without
 *  billing (self-host) the rail is five steps (railFor). "publishing" asks
 *  once whether articles go live on their own or wait for the owner. */
export const SCENES: SceneStep[] = [
  { id: "address", label: "Your site" },
  { id: "account", label: "Account" },
  { id: "checkout", label: "Plan" },
  { id: "publishing", label: "Publishing" },
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
];
export function railFor(withPlan: boolean): SceneStep[] {
  return withPlan ? SCENES : SCENES.filter((x) => x.id !== "checkout");
}

// Purple, not lavender: the accent-strong -> accent gradient read blue on
// the account step (owner, 2026-11-09), so the primary runs violet-600 to
// purple-600 and the secondary is a violet-tinted outline.
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6d28d9] to-[#9333ea] px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#7c3aed]/30 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none " +
  FOCUS_RING;
export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#8b5cf6]/40 bg-[#8b5cf6]/10 px-6 py-3.5 text-[15px] font-semibold text-ink transition hover:border-[#a855f7]/70 hover:bg-[#8b5cf6]/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 " +
  FOCUS_RING;
/** The one green button: the action that releases an article to the site
 *  (Publish). Same shape as the primary; emerald-700 to -600 keeps white
 *  text readable. Green means "this goes live", nothing else. */
export const BTN_PUBLISH =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#047857] to-[#059669] px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#10b981]/25 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none " +
  FOCUS_RING;
export const BTN_QUIET =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-5 py-3 text-[14px] font-medium text-ink-muted transition hover:border-line hover:text-ink " + FOCUS_RING;

/** GitHub's mark, for the buttons and tiles that lead there. */
export function GithubMark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** A check that draws itself in. */
export function Check({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <svg viewBox="0 0 20 20" className={cx("h-5 w-5", className)} aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={s.drawCheck} style={{ "--d": `${delay}ms` } as React.CSSProperties} />
    </svg>
  );
}

/** Four dots that fly out of a completed step. */
export function Sparks() {
  const dots = [
    { x: "-14px", y: "-14px", d: 0 },
    { x: "14px", y: "-12px", d: 60 },
    { x: "-10px", y: "12px", d: 120 },
    { x: "12px", y: "14px", d: 40 },
  ];
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
      {dots.map((d, i) => (
        <span key={i} className={s.spark} style={{ "--x": d.x, "--y": d.y, "--d": `${d.d}ms` } as React.CSSProperties} />
      ))}
    </span>
  );
}

/** The rail: four nodes, a line that fills as steps complete, the current
 *  one breathing. `done` = how many are finished, `current` = index shown. */
export function Rail({ current, done, className, steps = SCENES }: { current: number; done: number; className?: string; steps?: SceneStep[] }) {
  const n = steps.length;
  const frac = n > 1 ? Math.min(done, n - 1) / (n - 1) : 0;
  const edge = 50 / n; // % from the rail's edge to the first/last node's centre
  return (
    <nav aria-label="Setup progress" className={cx("relative mx-auto w-full max-w-2xl", className)}>
      <div aria-hidden="true" className="absolute top-[13px] h-[2px] bg-line" style={{ left: `${edge}%`, right: `${edge}%` }} />
      <div aria-hidden="true" className={cx("absolute top-[13px] h-[2px] bg-accent", s.railFill)} style={{ left: `${edge}%`, width: `calc((100% - ${2 * edge}%) * ${frac})` }} />
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {steps.map((sc, i) => {
          const isDone = i < done;
          const isCurrent = i === current;
          return (
            <li key={sc.id} className="flex flex-col items-center gap-2 text-center">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cx(
                  "relative grid h-7 w-7 place-items-center rounded-full border-2 text-[12px] font-semibold tabular-nums transition-colors",
                  isDone ? "border-accent bg-accent text-white" : isCurrent ? cx("border-accent bg-surface text-accent", s.pulseRing) : "border-line bg-surface text-ink-faint",
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
                {isDone && i === done - 1 ? <Sparks /> : null}
              </span>
              <span className={cx("text-[12.5px] font-medium", isCurrent ? "text-ink" : isDone ? "text-ink-muted" : "text-ink-faint")}>{sc.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The mascot beside the scene: the dispatcher at its desk in the "working"
 *  mood - chair, headset, keyboard, monitor with the chart climbing, the
 *  mug - the same crop the dashboard's report uses, so it is one character
 *  everywhere (owner, 2026-11-05: at the computer, high-end, fun). It walks
 *  in once per session, types, blinks, and looks up when hovered. The tile
 *  gives it a stage: a soft violet pool of light behind the desk on a
 *  gradient, nothing that competes with the pixels. `hop` plays once when
 *  it changes to true (a win). */
export function Companion({ say, hop = false, className }: { say: ReactNode; hop?: boolean; className?: string }) {
  return (
    <aside className={cx("flex flex-col items-center", className)} aria-live="polite">
      <div className={cx("relative w-[min(20rem,86vw)] overflow-hidden rounded-3xl border border-line-soft bg-gradient-to-b from-surface-3 to-surface-2 px-3 pb-3 pt-5", hop ? s.hop : "")}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(70%_80%_at_45%_100%,var(--color-accent-soft),transparent_72%)]" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-3 h-px bg-line" />
        <PixelReporter mood="working" decorative className="relative w-full" />
      </div>
      <div key={typeof say === "string" ? say : undefined} className={cx("relative mt-4 max-w-md rounded-2xl border border-line-soft bg-surface-2 px-5 py-3 text-center text-[15px] leading-snug text-ink", s.bubble)}>
        <span aria-hidden="true" className="absolute -top-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-line-soft bg-surface-2" />
        {say}
      </div>
    </aside>
  );
}

/** One scene's card: headline, one sentence, the content, the one action. */
/** `actionFirst`: the button sits right under the title, above the content -
 *  for a scene whose content is a guide to read AFTER clicking (GitHub). */
export function SceneCard({ title, lead, children, action, id, actionFirst = false }: { title: ReactNode; lead?: ReactNode; children?: ReactNode; action?: ReactNode; id: string; actionFirst?: boolean }) {
  const actionRow = action ? <div className={cx(actionFirst ? "mt-6" : "mt-7", "flex flex-wrap items-center justify-center gap-3")}>{action}</div> : null;
  return (
    <section key={id} aria-labelledby={`${id}-title`} className={cx("rounded-3xl border border-line-soft bg-surface p-6 text-center sm:p-8", s.sceneIn)}>
      <h1 id={`${id}-title`} className="text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[30px]">
        {title}
      </h1>
      {lead ? <p className="mx-auto mt-2 max-w-[34rem] text-[15px] leading-relaxed text-ink-muted">{lead}</p> : null}
      {actionFirst ? actionRow : null}
      {children ? <div className={cx(actionFirst ? "mt-7" : "mt-6", "text-left")}>{children}</div> : null}
      {actionFirst ? null : actionRow}
    </section>
  );
}

/** A labelled step row for the automatic scenes: todo / doing / done. */
/** "you": the step can't move until the owner does something (the card
 *  above it says what). Never a spinner or "…" - those read as "we're on
 *  it, wait", which is the opposite of the truth. */
export type StepState = "todo" | "doing" | "done" | "you";
export function StepRow({ state, label, detail, index }: { state: StepState; label: string; detail?: ReactNode; index: number }) {
  return (
    <li className={cx("flex items-start gap-3 py-2.5", s.riseIn)} style={{ "--d": `${index * 70}ms` } as React.CSSProperties}>
      <span
        className={cx(
          "relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
          state === "done"
            ? "border-ok bg-ok text-canvas"
            : state === "doing"
              ? cx("border-accent text-accent", s.pulseRing)
              : state === "you"
                ? "border-warn bg-warn-soft text-warn"
                : "border-line text-ink-faint",
        )}
        aria-hidden="true"
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" /> : state === "doing" ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
        {state === "you" ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" />
          </svg>
        ) : null}
        {state === "done" ? <Sparks /> : null}
      </span>
      <div className="min-w-0">
        <p className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium", state === "todo" ? "text-ink-faint" : "text-ink")}>
          <span>
            {label}
            {state === "doing" ? <span className="ml-1.5 text-ink-faint">…</span> : null}
          </span>
          {state === "you" ? (
            <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-px text-[11.5px] font-semibold text-warn">Needs you</span>
          ) : null}
        </p>
        {detail ? <p className={cx("mt-0.5 text-[13.5px]", state === "you" ? "text-ink" : "text-ink-muted")}>{detail}</p> : null}
        {state === "doing" ? <span aria-hidden="true" className={cx("mt-2 block h-[3px] w-40 rounded-full", s.shimmer)} /> : null}
      </div>
    </li>
  );
}
