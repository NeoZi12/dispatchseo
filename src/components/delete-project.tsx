"use client";

import { useActionState, useState } from "react";
import { deleteProject, type DeleteProjectState } from "@/app/actions";

// Vercel-style confirm-by-typing: the button stays disabled until the domain
// is typed back exactly, and the server re-checks the same thing.

export function DeleteProjectForm({ slug, domain }: { slug: string; domain: string }) {
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<DeleteProjectState, FormData>(
    deleteProject,
    null,
  );
  const armed = typed.trim().toLowerCase() === domain;

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}
      <input type="hidden" name="slug" value={slug} />
      <label className="block space-y-1.5">
        <span className="text-sm text-neutral-400">
          Type <span className="font-mono text-neutral-200">{domain}</span> to confirm
        </span>
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          placeholder={domain}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
        />
      </label>
      <button
        type="submit"
        disabled={!armed || pending}
        className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Deleting..." : "Delete project"}
      </button>
    </form>
  );
}
