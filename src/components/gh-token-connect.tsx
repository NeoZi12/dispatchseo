"use client";

import { useActionState } from "react";
import { connectGithubToken, type ConnectGithubState } from "@/app/actions";

// Home's one-tap-merge card, paste-in-place edition - the same verified
// connect the wizard's One-tap merge screen uses (token checked against the
// repo, stored encrypted). Replaces the pre-wizard copy that sent owners to
// mint a fine-grained token and set a Vercel env var - wrong on docker,
// needless everywhere, and the reason an agent once asked an owner for a
// second GitHub token that should never exist.
export function GhTokenConnect({ repoName }: { repoName: string }) {
  const [state, action, pending] = useActionState<ConnectGithubState, FormData>(
    connectGithubToken,
    null,
  );
  if (state && "ok" in state) {
    return (
      <p className="mt-2 text-sm text-emerald-300">
        Connected - PRs now merge from the dashboard (and the builder can use it too). This
        card disappears on the next page load.
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
        placeholder="ghp_..."
        autoComplete="off"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60"
      />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Checking with GitHub..." : `Verify against ${repoName} and save`}
      </button>
    </form>
  );
}
