import { cx } from "./styles";

/** Title row for a Card or a page section: heading + one line of context on
 *  the left, an optional action (a link, a button) on the right. */
export function CardHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  id,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0">
        <Heading id={id} className="text-[15px] font-semibold tracking-tight text-ink">
          {title}
        </Heading>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
