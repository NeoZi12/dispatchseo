"use client";

import { useEffect, useState } from "react";

// Docker installs only: one quiet, dismissible line on Home telling the
// owner how to get back here tomorrow (Docker on -> this URL). Real users
// closed the wizard tab and then didn't know the dashboard survives at
// localhost:<port> (2026-07-23 e2e). Dismissal is per-browser
// (localStorage) - it's a tip, not state worth a migration.
const KEY = "dispatch-docker-access-tip-dismissed";

export function DockerAccessTip() {
  const [visible, setVisible] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (localStorage.getItem(KEY)) return;
    setOrigin(window.location.origin);
    setVisible(true);
  }, []);

  if (!visible) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3.5 py-2.5 text-sm text-neutral-400">
      <p>
        <b className="font-medium text-neutral-200">Pro tip:</b> this dashboard lives at{" "}
        <b className="font-medium text-neutral-200">{origin}</b> whenever Docker is running -
        bookmark it. Ever find it down? Re-run{" "}
        <code className="font-mono text-neutral-300">sh start.sh</code> in the install folder.
      </p>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => {
          localStorage.setItem(KEY, "1");
          setVisible(false);
        }}
        className="shrink-0 cursor-pointer rounded p-0.5 text-neutral-500 transition-colors hover:text-neutral-200"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
