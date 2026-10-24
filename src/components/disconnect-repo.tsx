"use client";

import { useActionState, useState } from "react";
import { disconnectRepo, type DisconnectRepoState } from "@/app/actions";

// Confirm-by-typing, the same shape as DeleteProjectForm - this reaches into a
// real repo and commits a deletion, so it gets the same friction even though
// the project itself survives.
//
// Named BEFORE the click, not after: "your repo" is vague enough to be scary
// while telling you nothing, owner/name is something you can check against the
// tab you already have open.
export function DisconnectRepoForm({
  slug,
  repo,
  // A hosted-writer site never had the agent pipeline installed, so the
  // workflow/secret inventory below would describe things it doesn't have.
  hosted = false,
}: {
  slug: string;
  repo: string;
  hosted?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<DisconnectRepoState, FormData>(
    disconnectRepo,
    null,
  );
  const armed = typed.trim().toLowerCase() === repo.toLowerCase();

  if (state && "done" in state) {
    return (
      <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm leading-relaxed text-emerald-200/90">
        {state.done}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-400">
          {state.error}
        </p>
      ) : null}
      {hosted ? (
        <p className="text-sm leading-relaxed text-neutral-400">
          Disconnecting stops DispatchSEO from opening pull requests in{" "}
          <span className="font-medium text-neutral-200">{repo}</span>. Articles already published stay
          where they are. You can reconnect later.
        </p>
      ) : (
      <p className="text-sm leading-relaxed text-neutral-400">
        Disconnecting turns off and deletes the seo-* workflows in{" "}
        <span className="font-medium text-neutral-200">{repo}</span>, removes the .dispatchseo
        folder and the SEO_MCP_API_KEY secret, and stops every schedule - so it stops using your
        GitHub Actions minutes. Your published guides, tools and pages stay exactly where they
        are, and so does everything on this dashboard. You can reconnect later.
      </p>
      )}
      <input type="hidden" name="slug" value={slug} />
      <label className="block text-sm text-neutral-400">
        Type <span className="font-mono text-neutral-200">{repo}</span> to confirm
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-white outline-none focus:border-neutral-500"
        />
      </label>
      <button
        type="submit"
        disabled={!armed || pending}
        className="cursor-pointer rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Disconnecting..." : "Disconnect repo"}
      </button>
    </form>
  );
}
