"use client";

import { useActionState, useEffect, useState } from "react";
import { wizardSetGscProperty, type WizardGscPropertyState } from "@/app/actions";
import { ErrorLine } from "@/components/wizard-ui";
import { Spinner } from "../shared";

// The `gsc_property` pick: only shown when onboarding's `sc-domain:` guess is
// not in the Google account's property list. Choosing a radio saves it - no
// button, the choice is the action. Validated server-side against the live
// list (wizardSetGscProperty), same as the old c3 picker.

export function GscPropertyPick({
  slug,
  sites,
  current,
  onSaved,
}: {
  slug: string;
  sites: string[];
  current: string | null;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState<WizardGscPropertyState, FormData>(wizardSetGscProperty, null);
  const [picked, setPicked] = useState<string | null>(current && sites.includes(current) ? current : null);
  useEffect(() => {
    if (state && "ok" in state) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="space-y-3">
      {state && "error" in state ? <ErrorLine msg={state.error} /> : null}
      <input type="hidden" name="slug" value={slug} />
      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
        {sites.map((s) => (
          <label
            key={s}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-950/40 px-3.5 py-3 text-neutral-200 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
          >
            <input
              type="radio"
              name="site_url"
              value={s}
              checked={picked === s}
              disabled={pending}
              onChange={(e) => {
                setPicked(s);
                e.currentTarget.form?.requestSubmit();
              }}
              className="h-4 w-4 shrink-0 accent-violet-500"
            />
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{s}</span>
            {pending && picked === s ? <Spinner className="h-4 w-4 text-violet-300" /> : null}
          </label>
        ))}
      </div>
      <p className="text-center text-[13px] leading-relaxed text-neutral-500">
        Don&apos;t see your site? We only list properties already verified in{" "}
        <a
          href="https://search.google.com/search-console"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
        >
          Search Console
        </a>
        .
      </p>
    </form>
  );
}
