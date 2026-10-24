"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { cancelPlan, type CancelPlanState } from "@/app/actions";
import { CANCELLATION_REASONS, REASON_LABELS } from "@/lib/cancellation-reasons";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { SelectWrap } from "@/components/ui";

// The cancel button, at the top of the billing page next to "Change plan",
// where someone looking for it will actually look - plus the one screen
// that asks why.
//
// Until this existed the only way out was a grey text link to the provider's
// hosted portal, on someone else's domain, while the landing page promised
// "cancel in one click". Making the exit hard doesn't keep customers, it just
// converts quiet churn into chargebacks and support mail.
//
// So the exit ASK follows one rule: it may never cost anyone anything to
// ignore it. Concretely -
//   - "Cancel my plan" is live from the moment the dialog opens. No field is
//     required, nothing is validated, an empty form cancels just fine.
//   - Escape, the backdrop, and an X all close it, and closing means the plan
//     is NOT cancelled - nothing is decided until the red button is pressed.
//   - One screen. No second "are you sure", no retention offer, no discount
//     ambush, no survey page after the fact.
//   - The dispatcher is here because it is the face of the product and this is
//     the last screen someone sees, not to guilt anyone into staying. The copy
//     stays matter-of-fact for the same reason.
// Anything that would break one of those rules is a dark pattern wearing a
// mascot, and belongs nowhere near this file.

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "Cancel plan", for the plan card at the top of Billing: a button that
 *  opens the one-screen dialog below. A cancellation that goes through
 *  re-renders the page into the "cancelled, runs until" state, and the
 *  dialog closes itself. */
export function CancelPlanButton({
  endsAt,
  tierName,
  siteCount,
}: {
  /** ISO date the plan runs out. Null when the provider hasn't told us one. */
  endsAt: string | null;
  tierName: string;
  siteCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, busy] = useActionState<CancelPlanState, FormData>(cancelPlan, null);
  const endLabel = formatDate(endsAt);
  const errorBlock = <ErrorBlock state={state} />;

  // A cancellation that went through closes the dialog on its own; an ERROR
  // deliberately keeps it open, with the message.
  useEffect(() => {
    if (state && "done" in state) setOpen(false);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:border-danger/40 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        Cancel plan
      </button>
      {open ? (
        <CancelDialog
          onClose={() => setOpen(false)}
          formAction={formAction}
          busy={busy}
          errorBlock={errorBlock}
          endLabel={endLabel}
          tierName={tierName}
          siteCount={siteCount}
        />
      ) : null}
    </>
  );
}

/** "Keep my plan": the undo for a cancellation that hasn't run out yet. */
export function KeepPlanButton() {
  const [state, formAction, busy] = useActionState<CancelPlanState, FormData>(cancelPlan, null);
  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="intent" value="resume" />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-canvas transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Restarting..." : "Keep my plan"}
        </button>
      </form>
      <ErrorBlock state={state} />
    </div>
  );
}

function ErrorBlock({ state }: { state: CancelPlanState }) {
  if (!state || !("error" in state)) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm leading-relaxed text-danger">
      {state.error}{" "}
      {state.portal ? (
        <a href="/api/polar/portal" className="font-medium underline underline-offset-2">
          Open the billing portal
        </a>
      ) : null}
    </p>
  );
}

function CancelDialog({
  onClose,
  formAction,
  busy,
  errorBlock,
  endLabel,
  tierName,
  siteCount,
}: {
  onClose: () => void;
  formAction: (data: FormData) => void;
  busy: boolean;
  errorBlock: React.ReactNode;
  endLabel: string | null;
  tierName: string;
  siteCount: number;
}) {
  // Portalled to <body>, same reason as the add-site dialog: the dashboard
  // header uses backdrop-blur, which makes it the containing block for any
  // position:fixed descendant - rendered in place this overlay would be
  // measured against the header and clipped by it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Move focus into the dialog, onto the dialog itself rather than the first
  // field: the fields are optional, and dropping a keyboard user straight into
  // a "why are you leaving" select reads as being asked to answer it. Focusing
  // the container announces the heading and leaves the next Tab to them.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  useEffect(() => panel?.focus(), [panel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses, so
        // a text selection dragged out of the textarea can't throw the form away.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={setPanel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-plan-title"
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-black/60 focus:outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 cursor-pointer rounded-lg px-2 py-1 text-lg leading-none text-neutral-500 transition-colors hover:text-neutral-200 disabled:opacity-40"
        >
          &times;
        </button>

        {/* `working` so it's already seated at the desk - the walk-in animation
            is for first-run screens, and making someone watch it here would be
            five seconds of whimsy in front of a thing they came to do. */}
        <PixelDispatcher working className="mx-auto mb-5 w-[min(220px,55vw)]" />

        <h2 id="cancel-plan-title" className="text-lg font-semibold text-ink">
          Cancel your {tierName} plan?
        </h2>
        {/* The consequence, in one sentence. */}
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          It keeps running {endLabel ? `until ${endLabel}` : "to the end of this period"} and you won&apos;t be charged again; after that new articles stop
          {siteCount > 1 ? ` on your ${siteCount} sites` : ""}, and nothing is deleted.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
          className="mt-5 space-y-4"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">
              Why are you leaving?{" "}
              <span className="font-normal text-neutral-500">Optional</span>
            </span>
            <SelectWrap className="w-full">
              <select
                name="reason"
                defaultValue=""
                className="w-full cursor-pointer appearance-none rounded-lg border border-neutral-800 bg-neutral-900 py-2 pl-3 pr-8 text-sm text-neutral-100 focus:border-violet-500/50 focus:outline-none"
              >
                <option value="">Rather not say</option>
                {CANCELLATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">
              Anything we should fix?{" "}
              <span className="font-normal text-neutral-500">Optional</span>
            </span>
            <textarea
              name="comment"
              rows={2}
              maxLength={1000}
              placeholder="Goes straight to the person who builds this. Skip it if you'd rather."
              className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
            />
          </label>

          {errorBlock}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
            >
              Keep my plan
            </button>
            {/* Never disabled on "no feedback given" - an empty form is a
                complete answer here. Only the in-flight submit disables it. */}
            <button
              type="submit"
              disabled={busy}
              className="cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Cancelling..." : "Cancel plan"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
