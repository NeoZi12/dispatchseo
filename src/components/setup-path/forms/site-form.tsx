"use client";

import { useActionState, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createSiteFromPath } from "@/app/setup-actions";
import { ErrorLine, inputClass } from "@/components/wizard-ui";
import { isWizardAiChoice } from "@/lib/wizard-branch";
import type { PublishTarget } from "@/lib/setup-path-core";
import { primaryBtn, Spinner } from "../shared";

// The `site` step: ONE ask, the domain. The two branch answers (where
// articles go, which AI writes) were already given to the qualifier before
// checkout, so they show as a one-line summary with "change". The expander
// opens on its own when there is nothing usable to summarise [R25]. Radio
// values are exactly the old c0 PickOption values.

export type SiteQualifier = { publish_target: PublishTarget | null; ai_choice: string | null } | null;

type CreateState = { error: string } | { ok: true; slug: string } | null;

const PUBLISH_SUMMARY: Record<PublishTarget, string> = {
  wordpress: "WordPress site",
  github: "Site built from a GitHub repo",
  manual: "Placing articles yourself",
};

const AI_SUMMARY: Record<string, string> = {
  "claude-web": "the Claude app",
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

export function SiteForm({
  qualifier,
  prefillDomain,
  preview,
  onCreated,
}: {
  qualifier: SiteQualifier;
  prefillDomain?: string | null;
  preview?: boolean;
  onCreated: (slug: string) => void;
}) {
  const usable =
    qualifier != null &&
    qualifier.publish_target != null &&
    qualifier.ai_choice != null &&
    isWizardAiChoice(qualifier.ai_choice);
  const [open, setOpen] = useState(!usable);
  const [state, action, pending] = useActionState<CreateState, FormData>(
    createSiteFromPath as (prev: CreateState, fd: FormData) => Promise<CreateState>,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) onCreated(state.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const publishDefault = qualifier?.publish_target ?? "github";
  const aiDefault = qualifier?.ai_choice && isWizardAiChoice(qualifier.ai_choice) ? qualifier.ai_choice : null;

  return (
    <form action={action} className="space-y-4" onSubmit={preview ? (e) => e.preventDefault() : undefined}>
      {state && "error" in state ? <ErrorLine msg={state.error} /> : null}
      <label className="block">
        <span className="sr-only">Your website address</span>
        <input
          name="domain"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={prefillDomain ?? ""}
          placeholder="yoursite.com"
          className={`${inputClass} py-3.5 text-center text-lg`}
        />
      </label>

      {usable && !open ? (
        <p className="text-center text-sm text-neutral-400">
          {PUBLISH_SUMMARY[qualifier!.publish_target!]}
          <span className="mx-1.5 text-neutral-600">·</span>
          written by {AI_SUMMARY[qualifier!.ai_choice!] ?? qualifier!.ai_choice}
          <span className="mx-1.5 text-neutral-600">·</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="cursor-pointer font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline"
          >
            change
          </button>
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="choices"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-5 pt-1 text-left">
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-[15px] font-medium text-neutral-200">
                  Where should finished articles go?
                </legend>
                <PickOption name="publish_target" value="wordpress" label="WordPress"
                  hint="I host it myself. We post articles straight into it - no plugin."
                  defaultChecked={publishDefault === "wordpress"} />
                <PickOption name="publish_target" value="github" label="A GitHub repo"
                  hint="My site is built from code. We open pull requests."
                  defaultChecked={publishDefault === "github"} />
                <PickOption name="publish_target" value="manual" label="Neither yet"
                  hint="Finish each article and I'll place it myself."
                  defaultChecked={publishDefault === "manual"} quiet />
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-[15px] font-medium text-neutral-200">
                  Which AI will do the writing?
                </legend>
                <PickOption name="ai_choice" value="claude-web" label="Claude app"
                  hint="claude.ai, the ordinary chat app" defaultChecked={aiDefault === "claude-web"} required />
                <PickOption name="ai_choice" value="claude-code" label="Claude Code"
                  defaultChecked={aiDefault === "claude-code"} required />
                <PickOption name="ai_choice" value="codex" label="Codex"
                  defaultChecked={aiDefault === "codex"} required />
                <PickOption name="ai_choice" value="cursor" label="Cursor"
                  defaultChecked={aiDefault === "cursor"} required />
                <PickOption name="ai_choice" value="chatgpt" label="ChatGPT" hint="not available yet" disabled />
              </fieldset>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex justify-center pt-1">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? (
            <>
              <Spinner /> Setting up your site…
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </form>
  );
}

/** Same grammar as the old wizard's c0 PickOption (not exported there). */
function PickOption({
  name, value, label, hint, defaultChecked, disabled, quiet, required,
}: {
  name: string; value: string; label: string; hint?: string;
  defaultChecked?: boolean; disabled?: boolean; quiet?: boolean; required?: boolean;
}) {
  return (
    <label
      className={`flex flex-col gap-1 rounded-lg border transition-colors ${quiet ? "p-3" : "p-3.5"} ${
        disabled
          ? "cursor-not-allowed border-neutral-800 bg-neutral-950/40"
          : "cursor-pointer border-neutral-700 hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <input type="radio" name={name} value={value} defaultChecked={defaultChecked}
          disabled={disabled} required={required} className="h-4 w-4 shrink-0 accent-violet-500" />
        <span className={`min-w-0 ${quiet || disabled ? "text-[13px] font-medium text-neutral-400" : "text-sm font-semibold text-neutral-100"}`}>
          {label}
        </span>
      </span>
      {hint ? (
        <span className={`pl-6 text-[13px] leading-relaxed ${disabled ? "text-neutral-600" : "text-neutral-400"}`}>{hint}</span>
      ) : null}
    </label>
  );
}
