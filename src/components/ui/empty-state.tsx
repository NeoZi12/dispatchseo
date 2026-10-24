import { cx } from "./styles";

/** What an empty list says: what will appear here, and (when there is one)
 *  the single thing to do about it. Never an apology. */
export function EmptyState({
  title,
  children,
  action,
  icon,
  className = "",
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-4 text-ink-faint">{icon}</div> : null}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children ? <div className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
