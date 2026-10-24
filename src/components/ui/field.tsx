import { cx } from "./styles";

/** Label + control + hint/error, wired for assistive tech: pass the same
 *  `id` to the control, and give it aria-describedby={`${id}-hint`} (and
 *  `${id}-error` when there is one) - Input/Textarea do this from `id`. */
export function Field({
  id,
  label,
  hint,
  error,
  aside,
  children,
  className = "",
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  /** Right side of the label row - a character count, an "optional". */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {aside ? <span className="text-[12px] text-ink-faint tabular-nums">{aside}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] leading-relaxed text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
