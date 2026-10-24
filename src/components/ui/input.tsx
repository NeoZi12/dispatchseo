import { CONTROL, cx } from "./styles";

export function Input({
  id,
  invalid = false,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={id ? `${id}-hint ${id}-error` : undefined}
      className={cx(CONTROL, "h-10", invalid ? "border-danger/60" : "border-line hover:border-surface-3", className)}
      {...rest}
    />
  );
}
