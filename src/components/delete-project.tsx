"use client";

import { useActionState, useState } from "react";
import { deleteProject, type DeleteProjectState } from "@/app/actions";

// Vercel-style confirm-by-typing: the button stays disabled until the domain
// is typed back exactly, and the server re-checks the same thing.

export function DeleteProjectForm({
  slug,
  domain,
  // The connected repo, when there is one. Deleting now reaches into it -
  // disabling the seo-* workflows, removing the pack files and .dispatchseo/,
  // deleting the SEO_MCP_API_KEY secret - so this form has to say so BEFORE
  // the click. Naming the repo is the point: "your repo" is vague enough to
  // be scary, owner/name is checkable.
  repo = null,
  // Cloud, this is the account's only site, and the subscription is live.
  // Deleting cancels nothing, and afterwards there is no dashboard left to
  // find Billing from - so say it here, before the click, rather than leaving
  // someone to discover it on the next invoice.
  lastSiteWhileSubscribed = false,
  // A hosted-writer site: plain wording for the repo note, and no "moving to
  // another install" escape hatch (that is an agent-pipeline concept).
  hosted = false,
}: {
  slug: string;
  domain: string;
  repo?: string | null;
  lastSiteWhileSubscribed?: boolean;
  hosted?: boolean;
}) {
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
      {lastSiteWhileSubscribed ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-amber-200/90">
          This is your only site, and deleting it does not cancel your subscription - the plan
          keeps billing until you cancel it.{" "}
          <a
            href="/billing"
            className="font-medium text-amber-200 underline underline-offset-2 hover:text-white"
          >
            Manage billing
          </a>{" "}
          if that is what you are here to do.
        </p>
      ) : null}
      {repo && hosted ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-sm leading-relaxed text-neutral-400">
          This also disconnects DispatchSEO from{" "}
          <span className="font-mono text-xs text-neutral-200">{repo}</span>.{" "}
          <b className="font-medium text-neutral-300">Articles already merged into your repo stay.</b>
        </p>
      ) : repo ? (
        <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 text-sm">
          <p className="leading-relaxed text-neutral-400">
            This also removes DispatchSEO from{" "}
            <span className="font-mono text-xs text-neutral-200">{repo}</span>: the{" "}
            <span className="font-mono text-xs">seo-*</span> workflows are disabled and deleted,
            along with <span className="font-mono text-xs">.dispatchseo/</span> and the{" "}
            <span className="font-mono text-xs">SEO_MCP_API_KEY</span> secret. Otherwise they keep
            running on schedule against a project that no longer exists.{" "}
            <b className="font-medium text-neutral-300">
              Published guides, tools, and page templates are left alone.
            </b>
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-neutral-400">
            <input
              type="checkbox"
              name="keep_repo"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-neutral-600 bg-neutral-900 accent-red-500"
            />
            <span className="text-xs leading-relaxed">
              Leave the repo alone — I&apos;m moving this site to another DispatchSEO install
            </span>
          </label>
        </div>
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
