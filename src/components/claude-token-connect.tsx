"use client";

import { useState } from "react";
import { useActionState } from "react";
import { connectClaudeToken, type ConnectClaudeState } from "@/app/actions";
import { CopyBox, ErrorLine, inputClass } from "@/components/wizard-ui";

// Cloud Settings: rotate or re-store the CLAUDE_CODE_OAUTH_TOKEN repo secret
// through the GitHub App - the permanent home of the wizard's c2 paste, for
// when the token expires or was revoked. `connected` reflects whether a token
// is already stored on the repo, so an already-set-up owner sees "you're done,
// this is only for rotating" instead of a box that looks like a required redo.
export function ClaudeTokenConnect({ connected }: { connected?: boolean }) {
  const [state, action, pending] = useActionState<ConnectClaudeState, FormData>(
    connectClaudeToken,
    null,
  );
  // When a token is already stored, keep the rotation form tucked away until
  // the owner actually wants to replace it - nothing to do on the happy path.
  const [rotating, setRotating] = useState(false);
  const showForm = !connected || rotating;

  return (
    <div className="space-y-3">
      {connected ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2.5 text-sm text-emerald-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden>
            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <b className="font-semibold">Your Claude Code token is connected</b> - stored as a
            secret on your repo during setup. Nothing to do here unless it expires or gets revoked.
          </span>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-neutral-400">
          Builds run on your own Claude Code subscription. Run this on your computer and paste the
          token it prints - it&apos;s stored as a secret on your repo, never on our side:
        </p>
      )}

      {state && "error" in state ? <ErrorLine msg={state.error} /> : null}
      {state && "ok" in state ? (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Token stored on your repo. The next scheduled run verifies it - a bad paste shows up on
          the Home banner within the hour.
        </p>
      ) : null}

      {connected && !rotating ? (
        <button
          type="button"
          onClick={() => setRotating(true)}
          className="cursor-pointer text-sm font-medium text-neutral-400 underline underline-offset-2 transition-colors hover:text-neutral-200"
        >
          Rotate the token
        </button>
      ) : null}

      {showForm ? (
        <div className="space-y-3">
          <CopyBox text="claude setup-token" />
          <form action={action} className="flex gap-2.5">
            <input
              type="password"
              name="token"
              required
              placeholder={connected ? "Paste a new token to replace it" : "sk-ant-oat..."}
              className={`${inputClass} font-mono text-sm`}
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Storing..." : connected ? "Replace token" : "Store token"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
