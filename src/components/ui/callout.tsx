import { cx } from "./styles";

export type CalloutTone = "info" | "ok" | "warn" | "danger";

const TONES: Record<CalloutTone, { bar: string; title: string; icon: string }> = {
  info: { bar: "border-l-accent", title: "text-ink", icon: "text-accent" },
  ok: { bar: "border-l-ok", title: "text-ink", icon: "text-ok" },
  warn: { bar: "border-l-warn", title: "text-ink", icon: "text-warn" },
  danger: { bar: "border-l-danger", title: "text-ink", icon: "text-danger" },
};

const ICONS: Record<CalloutTone, string> = {
  info: "M12 16v-4M12 8h.01",
  ok: "M8 12.5l2.5 2.5L16 9.5",
  warn: "M12 8v4M12 16h.01",
  danger: "M15 9l-6 6M9 9l6 6",
};

/** A message that needs reading, set apart by a coloured left edge rather
 *  than a coloured wash. One per screen, at most two. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  className = "",
  role,
}: {
  tone?: CalloutTone;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const t = TONES[tone];
  return (
    <div
      role={role}
      className={cx(
        "flex flex-col gap-4 rounded-xl border border-l-2 border-line-soft bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        t.bar,
        className,
      )}
    >
      <div className="flex min-w-0 gap-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cx("mt-0.5 h-[18px] w-[18px] shrink-0", t.icon)} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d={ICONS[tone]} />
        </svg>
        <div className="min-w-0">
          <p className={cx("text-sm font-medium", t.title)}>{title}</p>
          {children ? <div className="mt-1 text-[13px] leading-relaxed text-ink-muted">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 sm:pl-4">{action}</div> : null}
    </div>
  );
}
