"use client";

import { useState } from "react";

// A password field with a show/hide toggle, built as its own client island so
// the surrounding /setup page can stay a server component posting straight to
// its `claim` server action. `name` is passed through untouched, so the
// action keeps reading formData.get("password") / .get("confirm") exactly as
// before - this component only adds the eye button on top.
export function PasswordInput({
  name,
  placeholder,
  autoFocus,
}: {
  name: string;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        name={name}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="new-password"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 pr-12 text-base text-white placeholder-neutral-500 focus:border-neutral-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-neutral-500 transition-colors hover:text-neutral-300"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
            <path d="M2.5 12S6.5 5 12 5s9.5 7 9.5 7-4 7-9.5 7-9.5-7-9.5-7Z" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
            <path d="M3 3l18 18" strokeLinecap="round" />
            <path
              d="M10.6 5.1A11 11 0 0 1 12 5c5.5 0 9.5 7 9.5 7a13.6 13.6 0 0 1-3 3.8M6.3 6.4C3.6 8.3 2.5 12 2.5 12s4 7 9.5 7a10 10 0 0 0 4-.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M9.4 9.9a3 3 0 0 0 4.2 4.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
