import { cx } from "./styles";

export type StatusTone = "ok" | "active" | "warn" | "danger" | "neutral";

const DOT: Record<StatusTone, string> = {
  ok: "bg-ok",
  active: "bg-accent",
  warn: "bg-warn",
  danger: "bg-danger",
  neutral: "bg-ink-faint",
};

const TEXT: Record<StatusTone, string> = {
  ok: "text-ok",
  active: "text-accent",
  warn: "text-warn",
  danger: "text-danger",
  neutral: "text-ink-muted",
};

/** A status as a coloured dot and a word - no capsule, no fill. Colour is
 *  meaning only, and the word always carries it too (colour-blind safe).
 *  `live` is work happening right now: the dot pings a few times, then
 *  settles into a slow, calm pulse for as long as the work goes on. */
export function StatusPill({
  tone,
  children,
  live = false,
  className = "",
}: {
  tone: StatusTone;
  children: React.ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-[13px] font-medium", TEXT[tone], className)}>
      <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden="true">
        {live ? <span className={cx("dispatch-ping absolute inset-0 rounded-full opacity-0", DOT[tone])} /> : null}
        <span className={cx("relative inline-flex h-2 w-2 rounded-full", DOT[tone], live ? "dispatch-calm" : "")} />
      </span>
      {children}
    </span>
  );
}
