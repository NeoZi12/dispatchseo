// Shared class fragments for the ui/* primitives. One focus ring everywhere:
// a violet ring offset from the canvas, keyboard-only (focus-visible), so a
// mouse click never leaves a halo but Tab always shows where you are.

export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Form controls share one box: surface-2 fill, hairline border that lifts on
// hover, violet on focus. Errors swap the border, never the fill.
export const CONTROL =
  "w-full rounded-lg border bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-faint transition-colors outline-none focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
