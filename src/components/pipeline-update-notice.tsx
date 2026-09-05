"use client";

import { useEffect, useState } from "react";
import { CopyButton, CronFixedButton } from "./client";

// The self-host "Pipeline update available" whisper, snoozable per pack
// version. The notice is true until the owner re-runs setup, and the backend
// ships a new pack most days, so without a snooze it sat on Home permanently
// for every self-hoster who doesn't chase every release. Dismissing remembers
// the pack version it was dismissed AT (localStorage, this browser only - a
// display preference, not state); the next pack ships with a new version and
// the line comes back exactly once. "mark applied" keeps writing the ok row
// server-side, so the run log and get_cron_health stay honest either way.
//
// Hidden until mounted rather than flashing: a whisper that appears a beat
// after the page is fine, one that appears and vanishes is not.
const KEY = "ds_pipeline_update_snoozed";

export function PipelineUpdateNotice({
  repo,
  packVersion,
  prompt,
  jobs,
}: {
  repo: string | null;
  packVersion: string;
  prompt: string;
  jobs: string[];
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    try {
      setShown(window.localStorage.getItem(KEY) !== packVersion);
    } catch {
      setShown(true);
    }
  }, [packVersion]);

  if (!shown) return null;

  function snooze() {
    setShown(false);
    try {
      window.localStorage.setItem(KEY, packVersion);
    } catch {
      /* it'll ask again next load */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-neutral-500">
      <span className="min-w-0">
        Pipeline update available for{" "}
        <span className="break-words font-mono text-neutral-400">{repo ?? "your site repo"}</span>{" "}
        - publishing continues on the current version; apply it whenever convenient.
      </span>
      <CopyButton text={prompt} label="Copy update prompt" subtle />
      {jobs.map((job) => (
        <CronFixedButton key={job} job={job} label="mark applied" tone="sky" />
      ))}
      <button
        type="button"
        onClick={snooze}
        className="whitespace-nowrap text-neutral-600 underline decoration-dotted underline-offset-2 transition-colors hover:text-neutral-300"
      >
        hide until the next update
      </button>
    </div>
  );
}
