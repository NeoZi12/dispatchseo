"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  addManualSuggestion,
  buildToolNow,
  decideSuggestion,
  dismissTrendTopic,
  expandTrendTopic,
  markCronFixedAction,
  markIndexRequested,
  markIndexRequestedBulk,
  mergeSeoPr,
  restoreSuggestion,
  setPlaybookStatus,
  setProspectStatus,
  type AddIdeaState,
} from "@/app/actions";

// Optimistic UI, the pattern every Tier-A control here follows: the click
// applies the visual result IMMEDIATELY (buttons swap to a one-line
// confirmation), the server action runs behind it, and the eventual
// revalidate removes the card. Only a failure walks it back - buttons return
// with one quiet red line.
const ERR = "Couldn't save - try again";

export function DecideButtons({ id }: { id: string }) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "approved" | "rejected" | "failed">("idle");

  function decide(status: "approved" | "rejected") {
    setState(status); // instant - the round trip runs behind this
    start(async () => {
      try {
        await decideSuggestion(id, status);
      } catch {
        setState("failed");
      }
    });
  }

  if (state === "approved")
    return <p className="text-sm text-emerald-400">✓ Approved - queued for the builders</p>;
  if (state === "rejected") return <p className="text-sm text-neutral-400">Skipped</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => decide("approved")}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Approve
      </button>
      <button
        onClick={() => decide("rejected")}
        className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        Reject
      </button>
      {state === "failed" ? <span className="text-xs text-red-400">{ERR}</span> : null}
    </div>
  );
}

// Tier B - a GitHub merge is an external outcome, so success is never faked:
// the button acknowledges instantly ("Merging...", disabled against double
// fire) and only says Merged once GitHub does.
export function MergeButton({ number }: { number: number }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "merged" | "failed">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  if (state === "merged")
    return <span className="text-sm font-semibold text-emerald-400">Merged ✓</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await mergeSeoPr(number);
              if (r.ok) {
                setState("merged");
              } else {
                setState("failed");
                setMsg(r.message);
              }
            } catch {
              setState("failed");
              setMsg("Merge failed - try again");
            }
          })
        }
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50"
      >
        {pending ? "Merging..." : state === "failed" ? "Retry merge" : "Merge"}
      </button>
      {state === "failed" && msg ? <span className="text-xs text-red-400">{msg}</span> : null}
    </span>
  );
}

// Pulls an idea out of the active queue (Research/Trends screens) - records
// it as rejected, exactly like a Reject on Home, so the builders and the
// research quota both see it as decided. Not shown for in_progress builds.
export function QueueRemoveButton({
  id,
  onRemoved,
  onRestored,
}: {
  id: string;
  // Optional hooks so a client parent (DraggableQueue) can hide the whole row
  // instantly and un-hide it on the rare failure.
  onRemoved?: () => void;
  onRestored?: () => void;
}) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "removed" | "failed">("idle");

  if (state === "removed")
    return <span className="whitespace-nowrap text-xs text-neutral-400">Removed ✓</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => {
          setState("removed"); // instant
          onRemoved?.();
          start(async () => {
            try {
              await decideSuggestion(id, "rejected");
            } catch {
              setState("failed");
              onRestored?.();
            }
          });
        }}
        title="Remove from queue"
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        Remove
      </button>
      {state === "failed" ? (
        <span className="whitespace-nowrap text-xs text-red-400">{ERR}</span>
      ) : null}
    </span>
  );
}

// Approves a "your call" idea without leaving the queue (Research/Trends
// screens) - same semantics as Approve on Home: guides queue for the daily
// builder, tools fire their build dispatch immediately (decideSuggestion
// handles both). The row re-renders as queued on revalidate.
export function QueueApproveButton({
  id,
  onApproved,
  onReverted,
}: {
  id: string;
  // Optional hooks so a client parent (DraggableQueue) can flip the row to
  // its queued look instantly and walk it back on the rare failure.
  onApproved?: () => void;
  onReverted?: () => void;
}) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "approved" | "failed">("idle");

  if (state === "approved")
    return <span className="whitespace-nowrap text-xs text-emerald-400">✓ Queued</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => {
          setState("approved"); // instant
          onApproved?.();
          start(async () => {
            try {
              await decideSuggestion(id, "approved");
            } catch {
              setState("failed");
              onReverted?.();
            }
          });
        }}
        title="Approve - queue it for the builders"
        className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Approve
      </button>
      {state === "failed" ? (
        <span className="whitespace-nowrap text-xs text-red-400">{ERR}</span>
      ) : null}
    </span>
  );
}

// History's undo: puts a rejected idea back into its build queue. The row
// leaves History for the queue on the next render - that IS the feedback.
export function RestoreButton({ id }: { id: string }) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "restored" | "failed">("idle");

  if (state === "restored")
    return (
      <span className="whitespace-nowrap text-xs text-emerald-400">✓ Back in the queue</span>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => {
          setState("restored"); // instant; the row moves lists on revalidate
          start(async () => {
            try {
              await restoreSuggestion(id);
            } catch {
              setState("failed");
            }
          });
        }}
        title="Put this idea back in the queue"
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        Restore
      </button>
      {state === "failed" ? (
        <span className="whitespace-nowrap text-xs text-red-400">{ERR}</span>
      ) : null}
    </span>
  );
}

// "Actually, build it now" for a tool sitting approved in the queue (manual
// adds can choose to queue instead of firing the builder immediately).
export function QueueBuildNowButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="text-xs text-neutral-400">{msg}</span>;
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await buildToolNow(id);
          setMsg(r.message);
        })
      }
      className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50"
    >
      {pending ? "Requesting..." : "Build now"}
    </button>
  );
}

// Manual entry into the build queue: the owner types a guide or tool idea and
// it lands already approved - they wrote it, there is nothing to gate. A bare
// title is enough; the builders do the keyword/SERP research themselves when
// the brief is thin. Both types choose front/back placement only - firing a
// queued tool's build is the queue's Build now button, not this form.
// Collapsed to a slim dashed row until clicked.
export function AddIdeaCard({ defaultType = "guide" }: { defaultType?: "guide" | "tool" }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"guide" | "tool">(defaultType);
  const [added, setAdded] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<AddIdeaState, FormData>(
    addManualSuggestion,
    null,
  );

  // Success collapses the form back to the slim row with a short-lived
  // confirmation - the idea itself appears in the queue on revalidate.
  useEffect(() => {
    if (state && !("error" in state)) {
      setOpen(false);
      setAdded(state.message);
      const t = setTimeout(() => setAdded(null), 5000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const inputCls =
    "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";
  const radioCls =
    "flex cursor-pointer items-baseline gap-2 text-sm text-neutral-300 [&>input]:accent-emerald-500";

  if (!open) {
    return (
      <div className="space-y-1.5">
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-dashed border-neutral-700 px-4 py-3 text-left text-sm text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          + Add your own idea - a guide or tool you want built
        </button>
        {added ? <p className="text-xs text-emerald-400">✓ {added}</p> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">Add an idea</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
        >
          Close
        </button>
      </div>

      <div className="flex gap-2">
        {(["guide", "tool"] as const).map((t) => (
          <label
            key={t}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              type === t
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <input
              type="radio"
              name="type"
              value={t}
              checked={type === t}
              onChange={() => setType(t)}
              className="sr-only"
            />
            {t === "guide" ? "Guide" : "Tool"}
          </label>
        ))}
      </div>

      <input
        name="title"
        required
        placeholder={
          type === "guide"
            ? "The guide you want, e.g. Claude Code hooks explained"
            : "The tool you want, e.g. AI token cost calculator"
        }
        className={inputCls}
      />
      <input
        name="keyword"
        placeholder="Target keyword (optional - the builder researches one if empty)"
        className={inputCls}
      />
      <textarea
        name="notes"
        rows={2}
        placeholder="Notes for the builder (optional): angle, must-cover points, links..."
        className={inputCls}
      />

      <div className="space-y-1.5">
        <label className={radioCls}>
          <input type="radio" name="placement" value="back" defaultChecked />
          <span>
            End of the queue{" "}
            <span className="text-neutral-400">- builds when its turn comes</span>
          </span>
        </label>
        <label className={radioCls}>
          <input type="radio" name="placement" value="front" />
          <span>
            Next up{" "}
            <span className="text-neutral-400">
              {type === "guide"
                ? "- ships tomorrow morning"
                : "- first in line when the tool builder runs"}
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50"
        >
          {pending ? "Adding..." : "Add to queue"}
        </button>
        {state ? (
          "error" in state ? (
            <span className="text-xs text-amber-300">{state.error}</span>
          ) : (
            <span className="text-xs text-emerald-400">{state.message}</span>
          )
        ) : null}
      </div>
    </form>
  );
}

// TrendScanButton moved to trend-scan.tsx - it grew a scanning state that
// ties into the radar-sweep banner and the poller living there.

// Get takes on a radar subject - fires the trend-expand workflow for this one
// topic. Fire-and-report like Scan now: the dispatch answer is instant, the
// takes land minutes later, so the message manages expectations.
export function ExpandTopicButton({ id, again = false }: { id: string; again?: boolean }) {
  const [pending, start] = useTransition();
  const [fired, setFired] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Tier B - the ideas land minutes later via CI, so the confirmed dispatch
  // becomes a status line (the server flips the card to "working on ideas"
  // on the next render); refusals (cooldown, missing repo) re-arm the button.
  if (fired)
    return (
      <span className="text-sm text-emerald-300">
        Ideas requested ✓ - they land here in a few minutes
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await expandTrendTopic(id);
            if (r.ok) setFired(true);
            else setMsg(r.message);
          })
        }
        className={
          again
            ? "rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50"
            : "rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50"
        }
      >
        {pending ? "Requesting..." : again ? "Get more ideas" : "Get ideas"}
      </button>
      {msg ? <span className="text-xs text-amber-300">{msg}</span> : null}
    </span>
  );
}

// Pass on a radar subject - it leaves the radar and the scan won't re-propose it.
export function DismissTopicButton({ id }: { id: string }) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "dismissed" | "failed">("idle");

  if (state === "dismissed")
    return (
      <span className="whitespace-nowrap text-sm text-neutral-400">
        Dismissed ✓ - leaving the radar
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={() => {
          setState("dismissed"); // instant; the card leaves on revalidate
          start(async () => {
            try {
              await dismissTrendTopic(id);
            } catch {
              setState("failed");
            }
          });
        }}
        className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        Dismiss
      </button>
      {state === "failed" ? <span className="text-xs text-red-400">{ERR}</span> : null}
    </span>
  );
}

// The per-take decision row: queue it or skip it. Deliberately NO build-now:
// guides ship at most one per day so the cadence stays steady, so a take
// goes to the front of the queue and ships on the next daily build -
// tomorrow at the latest.
export function TakeDecideButtons({ id }: { id: string }) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "approved" | "rejected" | "failed">("idle");

  function decide(status: "approved" | "rejected") {
    setState(status); // instant swap; the card leaves on the next revalidate
    start(async () => {
      try {
        await decideSuggestion(id, status);
      } catch {
        setState("failed");
      }
    });
  }

  if (state === "approved")
    return (
      <p className="text-sm text-emerald-400">✓ Added to queue - ships on the next paced build</p>
    );
  if (state === "rejected") return <p className="text-sm text-neutral-400">Skipped</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => decide("approved")}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Add to queue
      </button>
      <button
        onClick={() => decide("rejected")}
        className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        Skip
      </button>
      {state === "failed" ? <span className="text-xs text-red-400">{ERR}</span> : null}
    </div>
  );
}

export function ProspectStatus({ id, status }: { id: string; status: string }) {
  const [, start] = useTransition();
  // Controlled so a failed write can roll the visible value back.
  const [value, setValue] = useState(status);
  const [failed, setFailed] = useState(false);
  useEffect(() => setValue(status), [status]);

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next); // instant
          setFailed(false);
          start(async () => {
            try {
              await setProspectStatus(id, next);
            } catch {
              setValue(prev);
              setFailed(true);
            }
          });
        }}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        {["new", "contacted", "acquired", "rejected"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {failed ? <span className="text-[11px] text-red-400">{ERR}</span> : null}
    </span>
  );
}

export function PlaybookDone({ slug, status }: { slug: string; status: string }) {
  const [, start] = useTransition();
  // The checkmark flips the instant you click; the write runs behind it and
  // the card's dimming catches up on revalidate. Failure flips it back.
  const [done, setDone] = useState(status === "done");
  const [failed, setFailed] = useState(false);
  useEffect(() => setDone(status === "done"), [status]);

  function flip() {
    const next = !done;
    setDone(next);
    setFailed(false);
    start(async () => {
      try {
        await setPlaybookStatus(slug, next ? "done" : "todo");
      } catch {
        setDone(!next);
        setFailed(true);
      }
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        onClick={flip}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          done
            ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 focus-visible:outline-emerald-400"
            : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-neutral-400"
        }`}
      >
        {done ? "Done ✓" : "Mark done"}
      </button>
      {failed ? <span className="text-[11px] text-red-400">{ERR}</span> : null}
    </span>
  );
}

// One-way done buttons for the "Get it on Google" card on Home - once marked,
// the row (or the whole card) is gone. No un-done: re-requesting indexing for
// an already-requested page has no value. The per-row button covers partial
// runs (quota hit mid-batch, one page already indexed); the bulk button is the
// normal path after the one-session batch command.
export function IndexRequestedDone({ id }: { id: string }) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  if (state === "done")
    return <span className="shrink-0 whitespace-nowrap text-xs text-emerald-400">Done ✓</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <button
        onClick={() => {
          setState("done"); // instant; the row clears on revalidate
          start(async () => {
            try {
              await markIndexRequested(id);
            } catch {
              setState("failed");
            }
          });
        }}
        className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        Done
      </button>
      {state === "failed" ? (
        <span className="whitespace-nowrap text-xs text-red-400">{ERR}</span>
      ) : null}
    </span>
  );
}

// Quiet outline on purpose: on the indexing card the one loud button is
// "Copy the paste" - this is the wrap-up step, not the headline action.
export function IndexRequestedDoneAll({ ids }: { ids: string[] }) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  if (state === "done")
    return (
      <span className="whitespace-nowrap text-xs text-emerald-400">
        ✓ All marked done - card clears itself
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => {
          setState("done"); // instant; the whole card clears on revalidate
          start(async () => {
            try {
              await markIndexRequestedBulk(ids);
            } catch {
              setState("failed");
            }
          });
        }}
        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        Mark all {ids.length} as done
      </button>
      {state === "failed" ? (
        <span className="whitespace-nowrap text-xs text-red-400">{ERR}</span>
      ) : null}
    </span>
  );
}

// The cron banner's quiet per-issue escape hatch: the owner declares an
// alert handled (the agent's equivalent is the mark_cron_fixed MCP tool).
// Optimistic like its siblings - the whole banner clears on revalidate.
// tone matches the box it sits in: red for the failure banner, sky for the
// pipeline-update notice (same action underneath either way).
export function CronFixedButton({
  job,
  label = "mark fixed",
  tone = "red",
}: {
  job: string;
  label?: string;
  tone?: "red" | "sky";
}) {
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  if (state === "done")
    return <span className="whitespace-nowrap text-xs text-emerald-400">✓ {label}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => {
          setState("done");
          start(async () => {
            try {
              await markCronFixedAction(job);
            } catch {
              setState("failed");
            }
          });
        }}
        className={
          tone === "sky"
            ? "text-xs text-sky-300/70 underline decoration-dotted underline-offset-2 transition-colors hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            : "text-xs text-red-300/70 underline decoration-dotted underline-offset-2 transition-colors hover:text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        }
      >
        {label}
      </button>
      {state === "failed" ? (
        <span className="whitespace-nowrap text-xs text-red-400">{ERR}</span>
      ) : null}
    </span>
  );
}

// Button-first sibling of CopyBlock for when the full text would drown the
// card: a short labeled button that copies the exact full text.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="w-full break-all rounded-lg border border-dashed border-neutral-600 bg-neutral-950 px-3 py-2 text-left font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
    >
      {copied ? "Copied ✓" : text}
    </button>
  );
}
