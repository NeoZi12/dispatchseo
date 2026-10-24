import { CONTROL, cx } from "./styles";

export function Textarea({
  id,
  invalid = false,
  className = "",
  rows = 4,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      id={id}
      rows={rows}
      aria-invalid={invalid || undefined}
      aria-describedby={id ? `${id}-hint ${id}-error` : undefined}
      className={cx(CONTROL, "resize-y py-2.5 leading-relaxed", invalid ? "border-danger/60" : "border-line hover:border-surface-3", className)}
      {...rest}
    />
  );
}
