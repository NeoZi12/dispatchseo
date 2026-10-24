import { cx } from "./styles";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

// The variants and sizes are component classes in globals.css (.btn,
// .btn-primary, .btn-md, ...), built with @apply from the same utilities
// this file used to inline. Same look; but a ~250-character class string per
// button was repeated in the HTML and again in the RSC payload on every
// screen, so the short names cut real page weight. Being in the components
// layer, any utility a caller adds (mt-5, w-full, border-accent/45) still
// overrides them.
// Primary is ink-on-canvas, not violet: the accent stays reserved for
// "now / active", so the one button that matters reads by contrast alone.

/** Class string for anything that should look like a button - a <Link> or
 *  an <a> as well as a <button>. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className = ""): string {
  return cx("btn", `btn-${variant}`, `btn-${size}`, className);
}

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  className = "",
  children,
  type = "button",
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button while a server action runs. */
  pending?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {pending ? (
        <svg viewBox="0 0 24 24" className="dispatch-spin h-3.5 w-3.5" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
