"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cleanDomain, isValidDomain } from "@/lib/domain";

// The hero's single CTA: type your domain, watch your own favicon appear,
// land on /signup already personalized to your site. One decision for the
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(
      isValidDomain(domain) ? `/signup?domain=${encodeURIComponent(domain)}` : "/signup",
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
        <path d="M5 25c9-7 21-9.5 32-7.5 8.5 1.6 15.5 5.2 22 10.6" />
        <path d="M59.4 28.4c-3.8.4-7.8.1-11.2-1.2M59.4 28.4c-.2-3.6-1.2-7.2-3-10.2" />
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
