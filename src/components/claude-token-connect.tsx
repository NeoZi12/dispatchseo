"use client";

import { useActionState } from "react";
import { connectClaudeToken, type ConnectClaudeState } from "@/app/actions";
import { CopyBox, ErrorLine, inputClass } from "@/components/wizard-ui";

// Cloud Settings: rotate or re-store the CLAUDE_CODE_OAUTH_TOKEN repo secret
// through the GitHub App - the permanent home of the wizard's c2 paste, for
// when the token expires or was revoked.
export function ClaudeTokenConnect() {
  const [state, action, pending] = useActionState<ConnectClaudeState, FormData>(
    connectClaudeToken,
    null,
  );
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-neutral-400">
        Builds run on your own Claude Code subscription. Run this on your computer and paste the
        token it prints - it's stored as a secret on your repo, never on our side:
      </p>
      <CopyBox text="claude setup-token" />
      {state && "error" in state ? <ErrorLine msg={state.error} /> : null}
      {state && "ok" in state ? (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Token stored on your repo. The next scheduled run verifies it - a bad paste shows up on
          the Home banner within the hour.
        </p>
      ) : null}
      <form action={action} className="flex gap-2.5">
        <input
          type="password"
          name="token"
          required
          placeholder="sk-ant-oat..."
          className={`${inputClass} font-mono text-sm`}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Storing..." : "Store token"}
        </button>
      </form>
    </div>
  );
}
