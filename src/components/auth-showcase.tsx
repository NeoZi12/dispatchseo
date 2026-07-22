"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { SLIDES } from "@/lib/showcase-slides";

// The signup/login page's right column: the landing screenshot reel adapted
// for auth pages (DataFast/Postiz pattern - form on the left, rotating
// product proof on the right). Tailwind-only on purpose: auth pages don't
// load landing.css.

const AUTOPLAY_MS = 2500;

export function AuthShowcase() {
  const [active, setActive] = useState(0);
  const slide = SLIDES[active];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-5 px-4 py-12">
      <div className="text-center" key={slide.id}>
        <h2 className="text-xl font-semibold text-white">{slide.title}</h2>
        <p className="mt-1 text-sm text-neutral-400">{slide.caption}</p>
      </div>
      <div
        className="relative w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]"
        style={{ aspectRatio: "16 / 10" }}
      >
        {SLIDES.map((s, i) => (
          <div
            key={s.id}
            className={`absolute inset-0 transition-opacity duration-500 ${active === i ? "opacity-100" : "opacity-0"}`}
            aria-hidden={active !== i}
          >
            <Image
              src={s.image}
              alt={active === i ? s.alt : ""}
              fill
              sizes="(max-width: 1024px) 0px, 55vw"
              quality={90}
              className="object-cover object-top"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2" role="group" aria-label="Choose slide">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={s.title}
            aria-current={active === i}
            onClick={() => setActive(i)}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${active === i ? "bg-white" : "bg-neutral-700 hover:bg-neutral-500"}`}
          />
        ))}
      </div>
    </div>
  );
}
