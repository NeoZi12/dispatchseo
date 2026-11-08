import type { ComponentType } from "react";
import { cx } from "@/components/ui/styles";
import s from "./stage.module.css";

// The steps of an external trip, one per row: a big numbered instruction
// first (owner, 2026-11-06: "big font and very clear"), then the real
// screenshot of that screen as wide as the card allows, so the text in it is
// readable. Pictures keep their own shape; a drawing (none left today) gets
// the box it was drawn for.

export type Frame = { caption: string; Frame: ComponentType<{ className?: string }>; /** Only drawings: the box they were drawn for. */ aspect?: string };

export function FrameStrip({ frames, className }: { frames: Frame[]; className?: string }) {
  return (
    <ol className={cx("mx-auto flex max-w-[38rem] flex-col gap-10", className)}>
      {frames.map((f, i) => (
        <li key={i} className={cx("min-w-0", s.riseIn)} style={{ "--d": `${120 + i * 110}ms` } as React.CSSProperties}>
          <p className="mb-4 flex items-start gap-3.5 text-left text-[19px] font-semibold leading-snug text-ink sm:text-[21px]">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-white">{i + 1}</span>
            <span>{f.caption}</span>
          </p>
          <div className={cx("overflow-hidden rounded-2xl border border-line-soft bg-surface-2", s.litFrame)} style={f.aspect ? { aspectRatio: f.aspect } : undefined}>
            <f.Frame className="block w-full" />
          </div>
        </li>
      ))}
    </ol>
  );
}
