import { cx } from "./styles";

/** The one container: a surface panel with a hairline edge. `flush` drops
 *  the padding for lists and tables that run edge to edge. */
export function Card({
  children,
  className = "",
  flush = false,
  as: Tag = "div",
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  flush?: boolean;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Tag className={cx("rounded-xl border border-line-soft bg-surface", flush ? "" : "p-5 sm:p-6", className)} {...rest}>
      {children}
    </Tag>
  );
}
