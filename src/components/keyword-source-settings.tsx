"use client";

import { useActionState, useState, useTransition } from "react";
import {
  chooseDataforseoSource,
  chooseGscOnly,
  connectSerpapi,
  type ConnectSerpapiState,
} from "@/app/actions";
import { DataforseoConnectForm } from "@/components/dataforseo-connect";

// Settings > Keyword data source: the wizard's step-3 choice, switchable
// later. Shows the active source and one expandable block per option.

const SOURCES = {
  dataforseo: "DataForSEO (paid, most accurate)",
  serpapi: "Free mode with SerpApi page-1 checks",
  gsc: "Free mode, Search Console only",
} as const;

export function KeywordSourceSettings({
  current,
  hasDataforseoCreds,
  hasSerpapiKey,
}: {
  current: keyof typeof SOURCES;
  hasDataforseoCreds: boolean;
  hasSerpapiKey: boolean;
}) {
  const [open, setOpen] = useState<"dataforseo" | "serpapi" | null>(null);
  const [confirmGsc, setConfirmGsc] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serpState, serpAction, serpPending] = useActionState<ConnectSerpapiState, FormData>(
    connectSerpapi,
    null,
  );

  const rowClass = "flex flex-wrap items-center justify-between gap-2 py-2.5";
  const ghostBtn =
    "rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 disabled:opacity-40";

  return (
    <div className="rounded-xl bg-neutral-900 px-4 py-2 sm:px-5">
      <p className="border-b border-neutral-800 py-2.5 text-sm">
        <span className="text-neutral-500">Active source: </span>
        <span className="text-neutral-200">{SOURCES[current]}</span>
      </p>

      {/* DataForSEO */}
      <div className={`${rowClass} border-b border-neutral-800`}>
        <span className="text-sm text-neutral-200">DataForSEO</span>
        {current === "dataforseo" ? (
          <span className="text-xs text-emerald-400">active</span>
        ) : hasDataforseoCreds ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => chooseDataforseoSource())}
            className={ghostBtn}
          >
            Switch to DataForSEO
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(open === "dataforseo" ? null : "dataforseo")}
            className={ghostBtn}
          >
            {open === "dataforseo" ? "Close" : "Connect"}
          </button>
        )}
      </div>
      {open === "dataforseo" && current !== "dataforseo" && !hasDataforseoCreds ? (
        <div className="border-b border-neutral-800 py-3">
          <DataforseoConnectForm />
        </div>
      ) : null}

      {/* SerpApi */}
      <div className={`${rowClass} border-b border-neutral-800`}>
        <span className="text-sm text-neutral-200">
          SerpApi{" "}
          <span className="text-xs text-neutral-600">free key, 250 searches/mo</span>
        </span>
        {current === "serpapi" && hasSerpapiKey ? (
          <span className="text-xs text-emerald-400">active</span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(open === "serpapi" ? null : "serpapi")}
            className={ghostBtn}
          >
            {open === "serpapi"
              ? "Close"
              : current === "serpapi"
                ? "Add key" // active but keyless (e.g. decrypt failure) - let the user paste one
                : hasSerpapiKey
                  ? "Switch to SerpApi"
                  : "Connect"}
          </button>
        )}
      </div>
      {open === "serpapi" && !(current === "serpapi" && hasSerpapiKey) ? (
        <form action={serpAction} className="space-y-2.5 border-b border-neutral-800 py-3">
          {serpState && "error" in serpState ? (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {serpState.error}
            </p>
          ) : null}
          <input
            name="key"
            required
            placeholder="SerpApi key (serpapi.com/manage-api-key)"
            autoComplete="off"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
          />
          <button
            type="submit"
            disabled={serpPending}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {serpPending ? "Checking with SerpApi..." : "Verify and switch"}
          </button>
        </form>
      ) : null}

      {/* GSC only */}
      <div className={rowClass}>
        <span className="text-sm text-neutral-200">
          Search Console only <span className="text-xs text-neutral-600">$0, no keys</span>
        </span>
        {current === "gsc" ? (
          <span className="text-xs text-emerald-400">active</span>
        ) : confirmGsc ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">
              Rank checks drop to Search Console data only - switch?
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => chooseGscOnly())}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              {pending ? "Switching..." : "Yes, GSC only"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmGsc(false)}
              className={ghostBtn}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmGsc(true)}
            className={ghostBtn}
          >
            Switch to GSC only
          </button>
        )}
      </div>
    </div>
  );
}
