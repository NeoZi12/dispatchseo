"use client";

import { useEffect, useRef, useState } from "react";

// Shown when the user lands back from Polar checkout before the webhook has
// written the subscription row. Polls /api/billing/status every 2s; on
// active it reloads so the server gate re-evaluates and mounts the wizard.
// Postiz-style confirming state, plus the timeout Postiz forgot: after ~30s
// stop spinning and hand the user an honest next step.
export function PaymentConfirming() {
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { active?: boolean };
          if (body.active) {
            stopped = true;
            window.location.replace("/onboarding?new=1");
            return;
          }
        }
      } catch {
        // transient - keep polling
      }
      if (Date.now() - startedAt.current > 30_000) {
        setTimedOut(true);
        return;
      }
      setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      {timedOut ? (
        <>
          <h1 className="text-xl font-semibold text-white">Payment received - still finalizing</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">
            Your payment went through, but the confirmation is taking longer than usual. This
            resolves within a minute or two.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 cursor-pointer rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
          >
            Check again
          </button>
          <p className="mt-4 text-sm text-neutral-500">
            Still stuck? Email{" "}
            <a href="mailto:support@dispatchseo.com" className="text-violet-400 underline underline-offset-2">
              support@dispatchseo.com
            </a>{" "}
            - we&apos;ll sort it out.
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-violet-400" />
          <h1 className="mt-5 text-xl font-semibold text-white">Confirming your payment...</h1>
          <p className="mt-2 text-[15px] text-neutral-400">
            Usually takes a few seconds. You&apos;ll continue to setup automatically.
          </p>
        </>
      )}
    </div>
  );
}
