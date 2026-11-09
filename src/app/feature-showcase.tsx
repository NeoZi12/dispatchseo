"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SLIDES } from "@/lib/showcase-slides";

const AUTOPLAY_MS = 3000;
// Past this the gesture is a deliberate horizontal swipe, not a wobbly scroll.
const SWIPE_PX = 44;

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const d = direction === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6";
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Frame chrome only — not welded to <Image>, so a tutorial video can sit
 *  in here later without touching the slideshow logic above. */
function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="show-frame-wrap">
      <div className="show-frame">
        <div className="show-chrome" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="show-media">{children}</div>
      </div>
    </div>
  );
}

export function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = SLIDES[active];

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [paused]);

  const goPrev = () => setActive((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  const goNext = () => setActive((i) => (i + 1) % SLIDES.length);

  // Touch swipe: on phones the arrows move onto the frame and shrink, so the
  // gesture is the primary control. Vertical intent wins ties so a swipe past
  // the reel never hijacks page scroll.
  const touch = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
    setPaused(true);
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    setPaused(false);
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  return (
    <div
      className="showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="show-head" key={slide.id}>
        <h3 className="show-title">{slide.title}</h3>
        <p className="show-cap">{slide.caption}</p>
      </div>

      <div
        className="show-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touch.current = null;
          setPaused(false);
        }}
      >
        <button type="button" className="show-arrow show-arrow-prev" aria-label="Previous slide" onClick={goPrev}>
          <ChevronIcon direction="left" />
        </button>
        <BrowserFrame>
          <div className="show-stack">
            {SLIDES.map((s, i) => (
              <div
                key={s.id}
                className={`show-slide${active === i ? " active" : ""}${s.fit === "contain" ? " show-slide-contain" : ""}`}
                aria-hidden={active !== i}
              >
                <Image
                  src={s.image}
                  alt={s.alt}
                  fill
                  sizes="(max-width: 900px) 100vw, 1080px"
                  quality={90}
                />
              </div>
            ))}
          </div>
        </BrowserFrame>
        <button type="button" className="show-arrow show-arrow-next" aria-label="Next slide" onClick={goNext}>
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="show-dots" role="group" aria-label="Choose slide">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`show-dot${active === i ? " active" : ""}`}
            aria-label={s.title}
            aria-current={active === i}
            onClick={() => setActive(i)}
          >
            <i aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
