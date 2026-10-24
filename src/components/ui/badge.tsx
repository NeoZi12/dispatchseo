import { cx } from "./styles";

export type BadgeTone = "neutral" | "accent" | "ok" | "warn";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-2 text-ink-muted",
  accent: "border-accent/30 bg-accent-soft text-accent",
  ok: "border-ok/30 bg-ok-soft text-ok",
  warn: "border-warn/30 bg-warn-soft text-warn",
};

/** A small square-cornered label for a fact about a thing (a plan name, a
 *  count). Deliberately not a stadium capsule; use sparingly, one per row. */
export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[12px] font-medium leading-none", TONES[tone], className)}>
      {children}
    </span>
  );
}
