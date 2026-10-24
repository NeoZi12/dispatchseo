import { cx } from "./styles";

const COLS = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

/** A row of Stats divided by hairlines rather than boxed into tiles: the
 *  numbers carry the weight, the frame stays out of the way. min-w-0 on
 *  every cell so a long number can never push the page sideways at 390px. */
export function StatGrid({
  children,
  cols = 4,
  className = "",
}: {
  children: React.ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl className={cx("grid gap-x-8 gap-y-6 border-t border-line pt-5 [&>*]:min-w-0", COLS[cols], className)}>{children}</dl>
  );
}
