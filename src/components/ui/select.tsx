import { CONTROL, cx } from "./styles";

/** Native select with our own chevron, which sits a fixed distance from the
 *  text at every width (the native arrow drifts to the far edge). */
export function Select({
  id,
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative flex items-center", className)}>
      <select
        id={id}
        aria-describedby={id ? `${id}-hint ${id}-error` : undefined}
        className={cx(CONTROL, "h-10 appearance-none border-line pr-9 hover:border-surface-3")}
        {...rest}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-ink-faint"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}
