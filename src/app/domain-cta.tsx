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
    <form className="domain-group" onSubmit={submit}>
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
      <button type="submit" className="btn btn-solid">
        Automate my SEO
      </button>
    </form>
  );
}
