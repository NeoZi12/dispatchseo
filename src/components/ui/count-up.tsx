"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./styles";

const FIRST_MS = 750;
const CHANGE_MS = 420;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function format(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * A number that counts up to itself on first paint, and rolls from the old
 * value to the new one when it changes (a chart's range switch).
 *
 * The server renders the real number, hidden by .dispatch-count-pending, so
 * there's no flash of the final value before the count starts from zero.
 * If the script never runs, the same class fades the real number in after
 * a beat. Reduced motion: the number just appears.
 */
export function CountUp({ value, decimals = 0, suffix = "", className = "" }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shownRef = useRef<number | null>(null);
  const [shown, setShown] = useState(value);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const first = shownRef.current === null;
    // First mount counts from zero only while the number is still hidden: if
    // the fallback already faded it in (slow script), a drop to 0 would read
    // as the data changing.
    const hidden = first && ref.current ? Number(getComputedStyle(ref.current).opacity) < 0.5 : false;
    const from = reduce ? value : first ? (hidden ? 0 : value) : (shownRef.current ?? value);
    setPending(false);
    if (from === value) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    // After the first page of the session the count is quicker, like every
    // other arrival (arrival-mode.tsx).
    const quick = document.documentElement.dataset.nav === "1";
    const dur = first && !quick ? FIRST_MS : CHANGE_MS;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const v = from + (value - from) * ease(p);
      shownRef.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    shownRef.current = from;
    setShown(from);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span ref={ref} className={cx("tabular-nums", pending ? "dispatch-count-pending" : "", className)}>
      {format(shown, decimals)}
      {suffix}
    </span>
  );
}
