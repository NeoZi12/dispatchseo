import { cx } from "./styles";

/** The dispatch signal: a dot with a ring of arcs either side, the radio in
 *  the brand mark transmitting. `on` lights the arcs outward in turn (green,
 *  the "running" colour); off, it sits still and amber. The words beside it
 *  always carry the state too, so the motion is never the only signal. */
export function OnAir({ on, children, className = "" }: { on: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-medium", on ? "text-ok" : "text-warn", className)}>
      <SignalGlyph on={on} className="h-4 w-4 shrink-0" />
      {children}
    </span>
  );
}

export function SignalGlyph({ on, className = "" }: { on: boolean; className?: string }) {
  const ring = (delay: string) => (on ? { className: "dispatch-signal", style: { animationDelay: delay } } : { className: "opacity-30" });
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="1.9" fill="currentColor" stroke="none" />
      <g {...ring("0s")}>
        <path d="M10.47 5.53a3.5 3.5 0 0 1 0 4.95" />
        <path d="M5.53 5.53a3.5 3.5 0 0 0 0 4.95" />
      </g>
      <g {...ring("0.35s")}>
        <path d="M12.38 3.62a6.2 6.2 0 0 1 0 8.76" />
        <path d="M3.62 3.62a6.2 6.2 0 0 0 0 8.76" />
      </g>
    </svg>
  );
}
