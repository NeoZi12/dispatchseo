import type { ReactNode } from "react";
import { PixelReporter } from "@/components/pixel-dispatcher";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import s from "./stage.module.css";

// The setup stage's shared pieces: the rail across the top, the mascot
// companion with its speech bubble, the one primary button, the check
// mark that draws itself. Design bar (owner, 2026-11-05): very visual, fun,
// goof-proof - every screen says one thing and asks for one thing.

export type SceneId = "address" | "account" | "checkout" | "github" | "google";
export type SceneStep = { id: SceneId; label: string };
/** The full rail. The Payment step shows only for a paid-plan pick
 *  (railFor); the free plan's rail is four steps. */
export const SCENES: SceneStep[] = [
  { id: "address", label: "Your site" },
  { id: "account", label: "Account" },
  { id: "checkout", label: "Payment" },
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
];
export function railFor(withCheckout: boolean): SceneStep[] {
  return withCheckout ? SCENES : SCENES.filter((x) => x.id !== "checkout");
}

export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-strong to-accent px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none " +
  FOCUS_RING;
export const BTN_QUIET =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-5 py-3 text-[14px] font-medium text-ink-muted transition hover:border-line hover:text-ink " + FOCUS_RING;

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
export type StepState = "todo" | "doing" | "done";
export function StepRow({ state, label, detail, index }: { state: StepState; label: string; detail?: ReactNode; index: number }) {
  return (
    <li className={cx("flex items-start gap-3 py-2.5", s.riseIn)} style={{ "--d": `${index * 70}ms` } as React.CSSProperties}>
      <span
        className={cx(
          "relative mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
          state === "done" ? "border-ok bg-ok text-canvas" : state === "doing" ? cx("border-accent text-accent", s.pulseRing) : "border-line text-ink-faint",
        )}
        aria-hidden="true"
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" /> : state === "doing" ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
        {state === "done" ? <Sparks /> : null}
      </span>
      <div className="min-w-0">
        <p className={cx("text-[15px] font-medium", state === "todo" ? "text-ink-faint" : "text-ink")}>
          {label}
          {state === "doing" ? <span className="ml-1.5 text-ink-faint">…</span> : null}
        </p>
        {detail ? <p className="mt-0.5 text-[13.5px] text-ink-muted">{detail}</p> : null}
        {state === "doing" ? <span aria-hidden="true" className={cx("mt-2 block h-[3px] w-40 rounded-full", s.shimmer)} /> : null}
      </div>
    </li>
  );
}
