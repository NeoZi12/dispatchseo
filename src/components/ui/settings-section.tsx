import { cx } from "./styles";

/** One settings topic: what it is and why it matters on the left, the
 *  control on the right. Stacks on a phone. Anchorable by `id`. */
export function SettingsSection({
  id,
  title,
  description,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cx("grid scroll-mt-24 gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 md:grid-cols-[15rem_1fr] md:gap-10", className)}
    >
      <div>
        <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
