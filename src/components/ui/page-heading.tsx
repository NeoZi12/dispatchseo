import { cx } from "./styles";

/** Top of a screen: the title, one line of context, actions on the right.
 *  `meta` is a row under the title for small facts (a domain, a plan). */
export function PageHeading({
  title,
  description,
  meta,
  actions,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">{meta}</div> : null}
        {description ? <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
