"use client";

import { useActionState, useEffect } from "react";
import { chooseGithubRepo, type ChooseRepoState } from "@/app/actions";
import { ErrorLine } from "@/components/wizard-ui";
import { primaryBtn, Spinner } from "../shared";

// The `github_repo` (and launch-phase `let_us_publish`) repo pick. Only shown
// when the installation shares more than one repo - exactly one is chosen by
// the install callback on its own. The list is the LIVE installation repo
// list the server page loaded; chooseGithubRepo re-validates against it.

export function RepoPick({
  slug,
  repos,
  label,
  installHref,
  onChosen,
}: {
  slug: string;
  /** null = the server could not load the list (GitHub hiccup). */
  repos: string[] | null;
  label: string;
  installHref: string;
  onChosen: () => void;
}) {
  const [state, action, pending] = useActionState<ChooseRepoState, FormData>(chooseGithubRepo, null);
  useEffect(() => {
    if (state && "ok" in state) onChosen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!repos || repos.length === 0) {
    // Two causes we can't tell apart from here: listing the repos failed on
    // the way back (a reload fixes it), or nothing is shared with the App
    // (only re-picking on GitHub does). Offer both, reload first.
    return (
      <div className="space-y-4 text-center">
        <p className="text-[15px] leading-relaxed text-neutral-400">
          We couldn&apos;t get your repo list back from GitHub. That&apos;s usually a hiccup -
          reload and it should appear.
        </p>
        <div className="flex flex-col items-center gap-3">
          <a href="" className={primaryBtn}>
            Reload
          </a>
          <a href={installHref} className="text-sm font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline">
            Choose which repos to share
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state ? <ErrorLine msg={state.error} /> : null}
      <input type="hidden" name="slug" value={slug} />
      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
        {repos.map((r, i) => (
          <label
            key={r}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-950/40 px-3.5 py-3 text-[15px] text-neutral-200 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
          >
            <input type="radio" name="repo" value={r} defaultChecked={i === 0} className="h-4 w-4 shrink-0 accent-violet-500" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden>
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" strokeLinejoin="round" />
              <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0 truncate font-mono text-sm">{r}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-center pt-1">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            label
          )}
        </button>
      </div>
    </form>
  );
}
