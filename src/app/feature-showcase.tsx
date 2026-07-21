"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Slide = {
  id: string;
  title: string;
  caption: string;
  image: string;
  alt: string;
};

const SLIDES: Slide[] = [
  {
    id: "traffic",
    title: "Watch your traffic grow",
    caption: "Clicks and impressions, straight from Google.",
    image: "/screenshots/search-traffic.png",
    alt: "Search traffic chart showing clicks and impressions from Google over 30 days",
  },
  {
    id: "guides",
    title: "Daily guides, on autopilot",
    caption: "Written, shipped, and indexed - one a day.",
    image: "/screenshots/guides.png",
    alt: "Guides page listing published guides with indexing status, clicks, and impressions",
  },
  {
    id: "tools",
    title: "Interactive tools that earn links",
    caption: "Calculators and generators, built and shipped for you.",
    image: "/screenshots/tools.png",
    alt: "Tools page listing interactive tools published to the site with indexing status",
  },
  {
    id: "automations",
    title: "Every automation has an off switch",
    caption: "Auto, semi, or manual - you set the gates.",
    image: "/screenshots/automations.png",
    alt: "Automations page with per-feature toggles for auto-approval and daily builds",
  },
  {
    id: "instructions",
    title: "You write the rules",
    caption: "The playbook your agent follows, editable live.",
    image: "/screenshots/instructions.png",
    alt: "Instructions page showing the site's theme, voice, and what the agent builds",
  },
  {
    id: "rankings",
    title: "Watch ranks move",
    caption: "Daily SERP checks on every keyword.",
    image: "/screenshots/rankings-v2.png",
    alt: "Rank tracking table showing keyword positions over time",
  },
  {
    id: "trends",
    title: "Catch trends early",
    caption: "Rising topics in your niche become guides.",
    image: "/screenshots/trends.png",
    alt: "Trends page showing trending subjects on the radar with ideas ready to queue",
  },
  {
    id: "ai-visibility",
    title: "Track AI visibility",
    caption: "Know when AI assistants cite you.",
    image: "/screenshots/ai-visibility.png",
    alt: "AI visibility page tracking how often AI assistants cite the site",
  },
  {
    id: "backlinks",
    title: "A backlink playbook, researched",
    caption: "Every link worth getting, with exact steps.",
    image: "/screenshots/backlinks.png",
    alt: "Backlink playbook listing free and paid link opportunities with submission steps",
  },
];

const AUTOPLAY_MS = 3000;

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

      <div className="show-stage">
        <button type="button" className="show-arrow" aria-label="Previous slide" onClick={goPrev}>
          <ChevronIcon direction="left" />
        </button>
        <BrowserFrame>
          <div className="show-stack">
            {SLIDES.map((s, i) => (
              <div key={s.id} className={`show-slide${active === i ? " active" : ""}`} aria-hidden={active !== i}>
                <Image
                  src={s.image}
                  alt={active === i ? s.alt : ""}
                  fill
                  sizes="(max-width: 900px) 100vw, 1080px"
                  quality={90}
                />
              </div>
            ))}
          </div>
        </BrowserFrame>
        <button type="button" className="show-arrow" aria-label="Next slide" onClick={goNext}>
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
          />
        ))}
      </div>
    </div>
  );
}
