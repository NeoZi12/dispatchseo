import { cx, FOCUS_RING } from "./styles";

/** A square, icon-only button. `label` is required: it becomes the
 *  accessible name, since there is no visible text. */
export function IconButton({
  label,
  className = "",
  children,
  type = "button",
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50",
        FOCUS_RING,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
