"use client";

import { useState, useTransition } from "react";
import { dismissOperatorIssue } from "@/app/operator-actions";

/** One line of the operator's All sites strip, with its Dismiss button.
 *  Hides at once on click; the page revalidates when the action lands, and a
 *  refusal puts the line back with the reason. */
export function OperatorIssue({ job, error }: { job: string; error: string }) {
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (hidden) return null;
  return (
    <div className="flex items-start gap-3">
      <p className="min-w-0 flex-1 break-words text-[13px] text-ink-muted">
        <span className="font-mono text-ink-faint">{job}</span> {error}
        {failed ? <span className="mt-1 block text-warn">Couldn&apos;t dismiss: {failed}</span> : null}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setFailed(null);
          setHidden(true);
          start(async () => {
            const res = await dismissOperatorIssue(job).catch((e) => ({ ok: false, error: String(e) }));
            if (!res.ok) {
              setHidden(false);
              setFailed(res.error ?? "unknown error");
            }
          });
        }}
        className="shrink-0 text-xs text-ink-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink disabled:opacity-50"
        title="Clears this line until the job fails or goes overdue again"
      >
        Dismiss
      </button>
    </div>
  );
}
