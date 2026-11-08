"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cleanDomain, isValidDomain } from "@/lib/domain";
import { checkSite } from "@/app/onboarding/setup-actions";

// The hero's single CTA: type your domain, watch your own favicon appear,
// land on /onboarding already personalized to your site. One decision for the
// visitor instead of a start-vs-pricing fork.

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18Z" />
    </svg>
  );
}

export function DomainCta() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [iconOk, setIconOk] = useState(true);
  const domain = useMemo(() => cleanDomain(value), [value]);
  const showFavicon = iconOk && isValidDomain(domain);

  // Check the site while it is being typed, so the setup's first step opens
  // with the answer already on it: checkSite leaves the verdict in this
  // browser's signed cookie, which /onboarding reads on render. Nothing is
  // shown here - the hero stays one field and one button. If the visitor is
  // faster than the probe, /onboarding checks again on arrival.
  const prechecked = useRef<string | null>(null);
  useEffect(() => {
    if (!isValidDomain(domain) || prechecked.current === domain) return;
    const t = setTimeout(() => {
      prechecked.current = domain;
      void checkSite(domain).catch(() => {});
    }, 450);
    return () => clearTimeout(t);
  }, [domain]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(
      isValidDomain(domain) ? `/onboarding?domain=${encodeURIComponent(domain)}` : "/onboarding",
    );
  }

  return (
    <form className="domain-cta" onSubmit={submit}>
      {/* Handwritten nudge at the one thing to do on the page: purple
          "Type your domain" left of the field, a pen-drawn arrow curving into
          it. Decorative only (the input has its own label); desktop only -
          a phone has no room beside the field (landing.css). */}
      <span className="cta-note" aria-hidden="true">Type your domain</span>
      <svg className="cta-note-arrow" viewBox="0 0 72 48" aria-hidden="true">
        {/* One lopsided cubic for the shaft; the head is a single pen stroke
            (barb in, tip, barb out) aimed along the shaft's end tangent. */}
        <path d="M4 27C18 14 42 12 62 25" />
        <path d="M50.6 25.6C54.4 25.8 58.4 25.5 62 25C60.1 21.7 58.6 18.6 57.4 15" />
      </svg>
      <div className="domain-group">
        <span className="domain-ic">
          {showFavicon ? (
            // Google's favicon service resolves any domain without us proxying
            // anything; on a miss it still returns a placeholder image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
              alt=""
              onError={() => setIconOk(false)}
            />
          ) : (
            <GlobeIcon />
          )}
        </span>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="yourwebsite.com"
          aria-label="Your website's domain"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setIconOk(true);
          }}
        />
      </div>
      <button type="submit" className="btn btn-solid">
        Get free traffic
      </button>
      {/* The free plan's terms, said once, under the button. Which sites
          work (GitHub-repo sites only since 2026-11-05) is left to the FAQ
          and the setup flow - the owner wants this line to be the offer. */}
      {/* One row, no wider than the button, by design: the hero is the
          headline and the sub; this is the small print. What is NOT supported
          (Wix, Squarespace, Shopify...) lives in the FAQ and in /qualify, which
          everyone passes before paying - the builder names used to sit here
          and made the line spill past the form on both sides. */}
      <p className="domain-note">
        2 free articles every month &middot; No card
      </p>
    </form>
  );
}
