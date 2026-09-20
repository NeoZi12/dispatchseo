"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { acknowledgeGithubCost, addSiteAndStartSetup, type WizardCreateState } from "@/app/actions";

// Adding a site from inside the dashboard, as a dialog.
//
// It used to be a link to /new -> /onboarding?new=1, which dropped an existing
// customer into the full-screen first-run wizard: no sidebar, no switcher, no
// way back. Worse on cloud, where ?new=1 was ignored and the wizard resumed the
// ACTIVE project's saved screen - so "add a site" opened someone else's
// finished setup and re-fired its pipeline install ("GitHub App not
// installed"). The wizard is right for a first-run account that has no
// dashboard yet; a customer who already has one shouldn't be thrown out of it
// to type two fields.
//
// So this collects what creating the row needs - name, domain, and the repo on
// self-host, which has no GitHub App to pick one with - and then hands off to
// the wizard at the step right after "add your site" to finish: GitHub, Search
// Console, publish mode, pipeline install.
//
// It hands off rather than reimplementing, because two of those steps leave the
// page entirely (the App install and Google's consent screen) and come back
// through the wizard's resume path. A dialog can't survive that round trip; the
// wizard already does, and it's the same flow the first site went through.
//
// What it must NOT do is stop at the row and leave the rest to the Home setup
// cards. A project with no pipeline has no workflows, so nothing researches,
// builds, or publishes for it - it only looks real in the switcher. Adding a
// site and setting it up are one act.
export function AddSiteDialog({
  open,
  onClose,
  cloud,
  existingSiteCount,
  planFull = false,
  githubCostRequired = false,
}: {
  open: boolean;
  onClose: () => void;
  // Self-host has no GitHub App to pick a repo with, and Settings only
  // DISPLAYS github_repo (read-only InfoRow) - so outside cloud the repo can
  // only be set at creation or over MCP. The old wizard made it required at
  // step 1 for exactly that reason; this dialog has to keep that promise or
  // it hands a docker owner a site the UI can never attach a repo to.
  cloud: boolean;
  // How many sites this account already has - scopedProjects().length from the
  // layout, passed down through the switcher. Gates the GitHub Actions cost
  // notice below: the site being added here is existingSiteCount + 1, and the
  // owner should only ever see that notice when it's actionable (see the card
  // itself for why the threshold is 2).
  existingSiteCount: number;
  // The account's plan has no room for another site. The switcher already
  // swaps its add row for an upgrade link in this state, so the only ways in
  // here are ?add=1 and the /new redirect - both of which are bookmarkable and
  // both of which used to hand over a form whose submit could not succeed.
  // Showing the reason beats letting someone fill it in and lose.
  planFull?: boolean;
  // Third site, GitHub Actions cost not yet acknowledged. Shows the cost step
  // ahead of the form; createProjectCore refuses the write until it's answered,
  // so this is the polite half of a gate that holds either way.
  githubCostRequired?: boolean;
}) {
  const [state, formAction, pending] = useActionState<WizardCreateState, FormData>(
    addSiteAndStartSetup,
    null,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  // React 19 RESETS a form once its action resolves - so a rejected submit
  // (unreachable domain, duplicate site, plan full) handed the error back with
  // every field blanked, and the owner got to retype all of it to fix one
  // typo. Worse, the retry then silently no-opped: the emptied required field
  // failed native validation before the action ever ran. Both seen in a
  // browser, 2026-07-26.
  //
  // Controlled state alone does NOT fix it - the reset clears the DOM input
  // while the state still holds the old value, so React sees no change and
  // never re-renders to put it back. The reset only happens when the action is
  // passed to <form action={...}>; calling it inside a transition ourselves
  // (see onSubmit) keeps the fields exactly as typed.
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [repo, setRepo] = useState("");
  // Self-host only (cloud asks with its own radio group below): GitHub or
  // WordPress, same question as the self-host wizard's step 1. WordPress
  // drops the repo field - that site has none.
  const [selfHostTarget, setSelfHostTarget] = useState<"github" | "wordpress">("github");
  // Portalled to <body> on purpose. The switcher lives in a sticky header with
  // backdrop-blur, and a backdrop-filter makes its element the containing block
  // for position:fixed descendants - rendered in place, this overlay would be
  // positioned against the 56px header and clipped by it instead of covering
  // the viewport. Mounted-gated because document doesn't exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The GitHub Actions cost notice: dismissible but not persisted anywhere.
  // It only shows up when the owner is actively adding their 3rd+ site (see
  // the render below), which is already the one moment it's worth their
  // attention - there's no "seen it before" state worth remembering across
  // dialog opens the way the changelog banner remembers a version. Reset it
  // whenever the dialog reopens so a dismissed notice doesn't stay hidden on
  // a later, unrelated visit.
  const [acked, setAcked] = useState(false);
  const [ackPending, setAckPending] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const [costNoticeDismissed, setCostNoticeDismissed] = useState(false);
  useEffect(() => {
    if (open) {
      setCostNoticeDismissed(false);
      setAckError(null);
    }
  }, [open]);

  async function choose(reason: "billing" | "public_repos") {
    setAckPending(true);
    setAckError(null);
    const res = await acknowledgeGithubCost(reason);
    setAckPending(false);
    if ("error" in res) {
      setAckError(res.error);
      return;
    }
    setAcked(true);
  }

  // createProjectCore already switched the dash_project cookie to the new site,
  // so refreshing the current route re-renders every server component against
  // it - the owner lands on the NEW site's dashboard, setup cards and all,
  // without a navigation. Same pattern the project switch above uses.
  // Fire once per successful submit, not once per render. useActionState keeps
  // returning the same ok state forever, and onClose arrives as an inline arrow
  // whose identity changes every render - so without this guard the effect
  // re-ran and slammed the dialog shut the instant it was reopened, making
  // "Add project" work exactly once per page load. Comparing the state OBJECT
  // (not a boolean) still lets a genuinely new success re-trigger it.
  const handledRef = useRef<WizardCreateState>(null);
  useEffect(() => {
    if (!state || !("ok" in state) || !state.ok || handledRef.current === state) return;
    handledRef.current = state;
    // Clear before leaving: the fields are controlled, so without this the
    // next "Add site" opens pre-filled with the site just created.
    setName("");
    setDomain("");
    setRepo("");
    setSelfHostTarget("github");
    onClose();
    // Into the wizard, not back to the dashboard. The row exists but nothing
    // runs for it yet - no repo, no Search Console, no workflows - and the
    // action has parked it on the screen right after "add your site", so this
    // continues the same setup the first site got instead of leaving the owner
    // to discover what's still missing.
    //
    // A full load rather than router.push: this effect closes the dialog in the
    // same tick, and the push made from the unmounting subtree silently never
    // navigated (seen in a browser, 2026-07-26 - the dialog closed and the page
    // stayed put). It also guarantees the wizard's server render reads the
    // dash_project cookie createProjectCore just repointed, instead of risking
    // a cached segment for the previous project - the same staleness the
    // project switcher works around with a refresh.
    window.location.assign("/onboarding");
  }, [state, onClose]);

  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  if (!open || !mounted) return null;

  // Plan full: the reason, and the one thing that changes it. No form - the
  // server would refuse the submit anyway (createProjectCore's plan gate), and
  // a form that cannot succeed is worse than no form.
  if (planFull) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-site-full-title"
          className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl shadow-black/60"
        >
          <h2 id="add-site-full-title" className="text-lg font-semibold text-white">
            Your plan is full
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
            You&apos;re using every site your current plan covers. Upgrading adds room
            immediately - the new site picks up the same setup flow your first one went
            through, and nothing about your existing sites changes.
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
            >
              Not now
            </button>
            <Link
              href="/billing"
              onClick={onClose}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition-opacity hover:opacity-90"
            >
              See plans
            </Link>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // The third-site GitHub Actions cost step.
  //
  // Two paragraphs, three numbered steps, one obvious button. An earlier
  // version explained the situation thoroughly and left the owner staring at
  // GitHub's billing page with no idea which control to touch - GitHub renamed
  // "spending limit" to "budget" and moved it behind "Budgets and alerts", so
  // copy naming the old control sent people looking for something that is not
  // there. The payment-method line matters most and is easiest to miss: a
  // budget above $0 does nothing until GitHub has a card on file.
  //
  // The old version of this whole step was a dismissible notice above the
  // fields. It disclosed the same facts and changed nothing, because nobody had
  // to answer it.
  if (githubCostRequired && !acked) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !ackPending) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gh-cost-title"
          className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl shadow-black/60"
        >
          <h2 id="gh-cost-title" className="text-lg font-semibold text-white">
            Set a GitHub budget first
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-400">
            <p>
              Your automations run as GitHub Actions on your own GitHub account, so this
              bill is GitHub&apos;s, not ours. Free minutes cover about two sites; a third
              costs roughly $4 a month.{" "}
              <a
                href="/docs/publishing#github-actions-costs"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-neutral-300"
              >
                Cost table
              </a>
            </p>
            <p>
              With no budget set, GitHub doesn&apos;t bill you - it{" "}
              <strong className="font-medium text-neutral-200">stops your workflows</strong>{" "}
              when the free minutes run out, and nothing here says why.
            </p>
          </div>

          <ol className="mt-4 list-decimal space-y-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 py-3 pl-9 pr-4 text-sm text-neutral-300">
            <li>
              Add a payment method. GitHub won&apos;t let you create a budget without one.
            </li>
            <li>
              Under <span className="font-medium text-white">Budget type</span>, choose{" "}
              <span className="font-medium text-white">Product-level budget</span> (not the
              AI credits one it preselects), then{" "}
              <span className="font-medium text-white">Next: Configure budget</span>.
            </li>
            <li>
              Pick <span className="font-medium text-white">Actions</span> as the product,
              set an amount, and create the budget.
            </li>
          </ol>

          <a
            href="https://github.com/settings/billing/budgets/new"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block rounded-lg bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-950 transition-opacity hover:opacity-90"
          >
            Create the budget on GitHub &rarr;
          </a>

          <div className="mt-2.5 space-y-2">
            <button
              type="button"
              onClick={() => choose("billing")}
              disabled={ackPending}
              className="w-full cursor-pointer rounded-lg border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-50"
            >
              {ackPending ? "Just a moment..." : "Done - continue"}
            </button>
            <button
              type="button"
              onClick={() => choose("public_repos")}
              disabled={ackPending}
              className="w-full cursor-pointer rounded-lg px-4 py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-300 disabled:opacity-50"
            >
              My repos are public - skip this
            </button>
          </div>

          {ackError ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {ackError}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={ackPending}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:text-neutral-400 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const error = state && "error" in state ? state.error : null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses -
        // a drag that began inside the form shouldn't throw the form away.
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-site-title"
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl shadow-black/60"
      >
        <h2 id="add-site-title" className="text-lg font-semibold text-white">
          Add a site
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
          {cloud
            ? "Then setup continues here: connecting your repo, Search Console, and publishing - the same few minutes your first site took."
            : "Then setup continues here: Search Console, publishing, and installing the pipeline in your repo - the same few minutes your first site took."}
        </p>

        {/* GitHub Actions cost notice - only when this would be the 3rd+ site.
            A 1st or 2nd site never sees this, on any plan: GitHub's free
            Actions minutes cover about two sites' worth, so there's nothing
            actionable to say yet. Non-blocking - it sits above the form and
            never disables submit. */}
        {existingSiteCount >= 2 && !costNoticeDismissed ? (
          <div className="relative mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm">
            <button
              type="button"
              onClick={() => setCostNoticeDismissed(true)}
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded p-1 text-neutral-600 transition-colors hover:text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <p className="pr-5 font-medium text-neutral-200">
              A third site means GitHub may start billing you
            </p>
            <p className="mt-1.5 leading-relaxed text-neutral-400">
              Your automations run as GitHub Actions in your own repo, on your own GitHub
              account - that cost is GitHub&apos;s, not ours. GitHub&apos;s free plan covers about
              two sites&apos; worth of Actions minutes. From the third site, GitHub Pro at
              $4/month covers it, or you pay a few dollars of overage.
            </p>
            <p className="mt-1.5 leading-relaxed text-neutral-400">
              One thing worth knowing: with no Actions budget set, GitHub does not bill
              you when the free minutes run out - it pauses your workflows. In GitHub&apos;s
              billing settings, add a payment method, then use Budgets and alerts to
              create an Actions budget, so your sites do not quietly stop updating.
            </p>
            <table className="mt-3 w-full border-collapse text-xs">
              <thead>
                <tr className="text-neutral-500">
                  <th className="border-b border-neutral-800 px-0 py-1 text-left font-medium">
                    Sites
                  </th>
                  <th className="border-b border-neutral-800 px-0 py-1 text-right font-medium">
                    Rough cost/mo
                  </th>
                </tr>
              </thead>
              <tbody className="text-neutral-400">
                <tr>
                  <td className="border-b border-neutral-800/70 py-1">2</td>
                  <td className="border-b border-neutral-800/70 py-1 text-right">$0</td>
                </tr>
                <tr>
                  <td className="border-b border-neutral-800/70 py-1">3</td>
                  <td className="border-b border-neutral-800/70 py-1 text-right">
                    ~$4 (GitHub Pro covers it)
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-neutral-800/70 py-1">4</td>
                  <td className="border-b border-neutral-800/70 py-1 text-right">~$5</td>
                </tr>
                <tr>
                  <td className="border-b border-neutral-800/70 py-1">5</td>
                  <td className="border-b border-neutral-800/70 py-1 text-right">~$10</td>
                </tr>
                <tr>
                  <td className="border-b border-neutral-800/70 py-1">6</td>
                  <td className="border-b border-neutral-800/70 py-1 text-right">~$15</td>
                </tr>
                <tr>
                  <td className="border-b border-neutral-800/70 py-1">8</td>
                  <td className="border-b border-neutral-800/70 py-1 text-right">~$24</td>
                </tr>
                <tr>
                  <td className="py-1">10</td>
                  <td className="py-1 text-right">~$34</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1.5 text-xs text-neutral-500">
              Rough estimates - actual cost depends on how long your builds run.
            </p>
            <a
              href="https://github.com/settings/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-medium text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
            >
              Open GitHub&apos;s billing settings →
            </a>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
          className="mt-5 space-y-4"
        >
          {/* Defaults that the row needs and later screens own: mode is
              switchable from the header, content layout is detected during
              install. Asking here would make a two-field dialog a five-field one. */}
          <input type="hidden" name="mode" value="semi" />
          <input type="hidden" name="content_mode" value="detect" />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">Site name</span>
            <input
              ref={nameRef}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="Acme"
              autoComplete="off"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-300">Domain</span>
            <input
              name="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              placeholder="acme.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
            />
            <span className="mt-1.5 block text-xs text-neutral-500">
              The live site, without https:// - we check it answers before saving it.
            </span>
          </label>

          {/* The two answers that decide which setup this site walks - the same
              questions as the wizard's step 1, because a second site is a first
              site for that site: an owner adding a WordPress blog next to a
              GitHub one must not be parked on "Connect GitHub". */}
          {cloud ? (
            <>
              <fieldset className="block">
                <legend className="mb-1.5 block text-sm font-medium text-neutral-300">
                  Where should finished articles go?
                </legend>
                <div className="space-y-1.5">
                  {(
                    [
                      ["wordpress", "WordPress", "I host it myself. We post articles straight into it."],
                      ["github", "A GitHub repo", "My site is built from code. We open pull requests."],
                      ["manual", "Neither yet", "Finish each article and I'll place it myself."],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 has-[:checked]:border-violet-500"
                    >
                      <input
                        type="radio"
                        name="publish_target"
                        value={value}
                        required
                        defaultChecked={value === "github"}
                        className="mt-0.5 h-4 w-4 accent-violet-500"
                      />
                      <span>
                        <span className="block font-medium">{label}</span>
                        <span className="block text-xs text-neutral-500">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="block">
                <legend className="mb-1.5 block text-sm font-medium text-neutral-300">
                  Which AI will do the writing?
                </legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["claude-web", "Claude app"],
                      ["claude-code", "Claude Code"],
                      ["codex", "Codex"],
                      ["cursor", "Cursor"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 has-[:checked]:border-violet-500"
                    >
                      <input
                        type="radio"
                        name="ai_choice"
                        value={value}
                        required
                        className="h-4 w-4 accent-violet-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <span className="mt-1.5 block text-xs text-neutral-500">
                  ChatGPT isn&apos;t available yet.
                </span>
              </fieldset>
            </>
          ) : null}

          {/* Cloud picks the repo through the GitHub App later, so asking here
              would be a field the owner has to answer twice. */}
          {!cloud ? (
            <fieldset className="block">
              <legend className="mb-1.5 block text-sm font-medium text-neutral-300">
                Where should finished articles go?
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["github", "A GitHub repo"],
                    ["wordpress", "WordPress"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-600 has-[:checked]:border-violet-500"
                  >
                    <input
                      type="radio"
                      name="publish_target"
                      value={value}
                      checked={selfHostTarget === value}
                      onChange={() => setSelfHostTarget(value)}
                      className="h-4 w-4 accent-violet-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {selfHostTarget === "wordpress" ? (
                <span className="mt-1.5 block text-xs text-neutral-500">
                  WordPress you host yourself. You connect it during setup - no repo needed.
                </span>
              ) : null}
            </fieldset>
          ) : null}
          {!cloud && selfHostTarget === "github" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-neutral-300">GitHub repo</span>
              <input
                name="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                required
                placeholder="owner/repo"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/50 focus:outline-none"
              />
              <span className="mt-1.5 block text-xs text-neutral-500">
                The repo DispatchSEO opens pull requests against. A full GitHub URL works too.
              </span>
            </label>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Adding..." : "Add site"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// Opens the dialog from ?add=1 so anything outside the switcher can point at
// it with a plain link - /new redirects here rather than to the wizard, and a
// bookmarked URL keeps working. The param is stripped on open so a refresh
// (or Back) doesn't reopen a dialog the owner already dismissed.
export function useAddSiteParam(onOpen: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || params.get("add") !== "1") return;
    fired.current = true;
    onOpen();
    const next = new URLSearchParams(params.toString());
    next.delete("add");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [params, router, onOpen]);
}
