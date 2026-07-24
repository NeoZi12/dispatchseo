"use client";

import { useActionState } from "react";
import { connectBuilderToken, type ConnectBuilderTokenState } from "@/app/actions";

// Home's "Turn on automatic builds" card, paste-in-place edition - the same
// connect the wizard finale uses (token stored encrypted, fed to the builder
// container in its poll feed). Replaces the copy that sent owners back to the
// install folder to edit .env by hand - the last terminal step of the docker
// install, gone. Env CLAUDE_CODE_OAUTH_TOKEN still overrides for scripted
// installs.
export function BuilderTokenConnect() {
  const [state, action, pending] = useActionState<ConnectBuilderTokenState, FormData>(
    connectBuilderToken,
    null,
  );
  if (state && "ok" in state) {
    return (
      <p className="mt-2 text-sm text-emerald-300">
        Saved - the builder picks it up within a few minutes, then this card disappears on its
        own.
      </p>
    );
  }
  return (
    <form action={action} className="mt-2 space-y-2">
      {state && "error" in state ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}
      <input
        name="token"
        type="password"
        placeholder="sk-ant-oat..."
        autoComplete="off"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60"
      />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Saving..." : "Turn on automatic builds"}
      </button>
    </form>
  );
}
