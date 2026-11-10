import { PixelReporter, type DispatcherMood } from "@/components/pixel-dispatcher";
import { cx } from "@/components/ui/styles";

// Whenever the dashboard has something to TELL the owner instead of a
// number to show - data not in yet, something too old, a call that failed,
// a thing to connect - the dispatcher says it, at its desk, in a speech
// bubble (owner, 2026-11-10: "not a boring message - fun, beautiful, the
// dispatcher, the dashboard a little more alive"). Never a dashed box of
// grey text.
//
// The kind of message picks the scene:
//   waiting   not here yet, comes on its own   idle at the desk, coffee, soft blue glow
//   asleep    nothing to show, by design        dozing, drifting "z", violet glow
//   working   being fetched / built right now   typing, green glow
//   alert     needs the owner, or went wrong    the amber "!" over its head, amber glow
//
// Copy is the dispatcher talking: first person, one short title, one or
// two plain sentences, at most one button. Server component; the pixel
// scene inside is the client canvas (pixel-dispatcher.tsx), which plays its
// walk-in once per browser session and looks up when hovered.

export type NoteKind = "waiting" | "asleep" | "working" | "alert";

const SCENE: Record<NoteKind, { mood: DispatcherMood; flag: boolean; steam: boolean; glow: string; ring: string; chip: string; chipText: string }> = {
  waiting: { mood: "idle", flag: false, steam: true, glow: "bg-info/15", ring: "border-info/20", chip: "bg-info-soft text-info", chipText: "From your dispatcher" },
  asleep: { mood: "paused", flag: false, steam: false, glow: "bg-accent-strong/15", ring: "border-accent/20", chip: "bg-accent-soft text-accent", chipText: "From your dispatcher" },
  working: { mood: "working", flag: false, steam: false, glow: "bg-ok/12", ring: "border-ok/20", chip: "bg-ok-soft text-ok", chipText: "On it" },
  alert: { mood: "idle", flag: true, steam: false, glow: "bg-warn/12", ring: "border-warn/25", chip: "bg-warn-soft text-warn", chipText: "From your dispatcher" },
};

export function DispatcherNote({
  kind,
  title,
  children,
  action,
  className = "",
  style,
}: {
  kind: NoteKind;
  /** What the dispatcher says, in one short line. */
  title: string;
  /** One or two plain sentences under it. */
  children?: React.ReactNode;
  /** At most one button or link. */
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const s = SCENE[kind];
  return (
    <div
      role={kind === "alert" ? "alert" : "status"}
      style={style}
      className={cx("relative isolate overflow-hidden rounded-2xl border bg-surface px-5 py-6 sm:px-8 sm:py-7", s.ring, className)}
    >
      {/* One soft glow behind the dispatcher, in the message's colour. */}
      <div aria-hidden="true" className={cx("pointer-events-none absolute -left-10 top-1/2 -z-10 h-56 w-72 -translate-y-1/2 rounded-full blur-3xl", s.glow)} />

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
        {/* The desk, on a soft shadow so it sits on something. */}
        <div className="relative shrink-0">
          <PixelReporter mood={s.mood} flag={s.flag} steam={s.steam} className="w-[132px] sm:w-[165px]" />
          <span aria-hidden="true" className="absolute inset-x-3 -bottom-1.5 h-2 rounded-[50%] bg-black/40 blur-[3px]" />
        </div>

        {/* The speech bubble, its tail pointing back at the dispatcher. */}
        <div className="relative w-full min-w-0 max-w-xl rounded-2xl border border-line bg-surface-2/80 px-5 py-4 shadow-xl shadow-black/30 sm:w-auto sm:flex-1">
          <span
            aria-hidden="true"
            className="absolute -top-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-line bg-surface-2 sm:-left-[7px] sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0 sm:-rotate-45"
          />
          <p className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", s.chip)}>
            {kind === "alert" ? (
              <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-warn/20 text-[10px] font-bold">
                !
              </span>
            ) : null}
            {s.chipText}
          </p>
          <p className="mt-2.5 text-balance text-[17px] font-semibold leading-snug tracking-tight text-ink">{title}</p>
          {children ? <div className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{children}</div> : null}
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
