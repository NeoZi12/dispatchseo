"use client";

import { useEffect, useRef, useState } from "react";

// The hero's rotating audience word. The FIRST word is what the server renders
// (so the crawlable <h1> reads "SEO automation for vibe coders", one stable
// sentence); the rest fade through on the client.
//
// The slab is exactly as wide as the word it shows and glides to the next
// word's width: every word is rendered once, invisibly, so its width can be
// measured, and the visible slab gets that width as an explicit style with a
// CSS transition. Reserving the LONGEST word's width instead (the obvious
// approach) left "vibe coders" floating in a slab sized for "bootstrappers"
// and pushed "for" onto its own line - three lines where the design wants two.
// Pauses while hovered; stays on the first word under prefers-reduced-motion.
export function RotatingWord({
  words,
  intervalMs = 2400,
  className = "",
}: {
  words: readonly string[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [widths, setWidths] = useState<number[] | null>(null);
  const probes = useRef<(HTMLSpanElement | null)[]>([]);

  // Measure once mounted, and again whenever a probe's own box changes. The
  // mount measurement alone is not enough: it usually runs before the display
  // webfont has swapped in, so it records the narrower fallback font and the
  // slab stops short of the word's last letter. Observing the probes catches
  // the font swap and viewport (font-size) changes alike; fonts.ready and
  // resize stay as the fallback for browsers without ResizeObserver.
  useEffect(() => {
    let live = true;
    const measure = () => {
      if (!live) return;
      setWidths(probes.current.map((el) => (el ? Math.ceil(el.getBoundingClientRect().width) : 0)));
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      for (const el of probes.current) if (el) observer.observe(el);
    }
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => {
      live = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [words]);

  useEffect(() => {
    if (words.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (paused) {
        timer = setTimeout(tick, 300);
        return;
      }
      setLeaving(true);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setLeaving(false);
        timer = setTimeout(tick, intervalMs);
      }, 240);
    };
    timer = setTimeout(tick, intervalMs);
    return () => {
      if (timer) clearTimeout(timer);
      if (swap) clearTimeout(swap);
    };
  }, [words, intervalMs, paused]);

  const width = widths?.[index];
  return (
    <span
      className={`hl hl-rot ${className}`}
      style={width ? { width } : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Measurement probes: every word, invisible, never read. */}
      <span className="rw-probes" aria-hidden="true">
        {words.map((w, i) => (
          <span
            key={w}
            ref={(el) => {
              probes.current[i] = el;
            }}
          >
            {w}
          </span>
        ))}
      </span>
      <span className={`rw-word${leaving ? " rw-out" : ""}`}>{words[index]}</span>
    </span>
  );
}
