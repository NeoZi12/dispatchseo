import { requireDashboard } from "@/lib/auth-gate";
import { redirectIfHosted } from "../mode";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { AUTOMATIONS, gatherEvidence, type Automation } from "@/lib/automations";
import { effectiveAutomations, internalLinkingEnabled, type AutomationFlags } from "@/lib/projects";
import { AutomationToggle } from "@/components/automation-toggle";
import { InternalLinkingToggle } from "@/components/internal-linking-toggle";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// Horizontal flow: plain labeled rectangles joined by arrows, same rectangle
// language as the rest of the dashboard. The last box is where the result
// lands for the user - tinted on live automations.
function Flow({ steps, live }: { steps: string[]; live: boolean }) {
  return (
    <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <span key={step} className="flex items-center gap-2">
            {i > 0 ? (
              <span aria-hidden="true" className={live ? "text-neutral-600" : "text-neutral-700"}>
                →
              </span>
            ) : null}
            <span
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs ${
                live
                  ? last
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-neutral-800 text-neutral-300"
                  : "bg-neutral-800/50 text-neutral-500"
              }`}
            >
              {step}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function LockChip({ reason }: { reason: string }) {
  return (
    <span
      title={reason}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-800/70 px-2.5 py-1 text-[11px] text-neutral-500"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      always on
    </span>
  );
}

function AutomationCard({
  a,
  evidence,
  flags,
  slug,
}: {
  a: Automation;
  evidence: string;
  flags: AutomationFlags;
  slug: string;
}) {
  // A toggleable automation that is switched off renders dimmed and "paused";
  // the card itself stays fully visible so what's NOT running is as obvious
  // as what is.
  const toggleable = a.control && "flag" in a.control;
  const enabled = toggleable && a.control && "flag" in a.control ? flags[a.control.flag] : true;
  const live = a.status === "live" && enabled;
  return (
    <div className="space-y-3 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="flex items-baseline gap-2.5">
          <span className={`font-medium ${live ? "" : "text-neutral-400"}`}>{a.name}</span>
          <span
            className={`text-xs ${
              live ? "text-emerald-400" : enabled ? "text-neutral-500" : "text-amber-400/90"
            }`}
          >
            {!enabled ? "paused - waits for you" : live ? "live" : "coming"}
            {a.statusNote ? ` · ${a.statusNote}` : ""}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-neutral-500">{a.schedule}</p>
          {a.control && "flag" in a.control ? (
            <AutomationToggle flag={a.control.flag} enabled={enabled} slug={slug} />
          ) : a.control && "locked" in a.control ? (
            <LockChip reason={a.control.locked} />
          ) : null}
        </div>
      </div>

      <p className={`text-sm ${live ? "text-neutral-400" : "text-neutral-500"}`}>{a.what}</p>

      <Flow steps={a.flow} live={live} />

      <p className={`text-xs ${live ? "text-neutral-500" : "text-neutral-600"}`}>{evidence}</p>

      {a.warning && enabled ? (
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-300/90">
          {a.warning}
        </p>
      ) : null}

      {a.note ? <p className="text-xs text-neutral-600">{a.note}</p> : null}
    </div>
  );
}

export default async function AutomationsPage() {
  await requireDashboard();
  // Hosted writer: this screen belongs to the agent workflow; the hosted
  // dashboard covers it on /dashboard.
  await redirectIfHosted("/dashboard");
  await requireOnboarded();

  const project = await getActiveProject();
  const [evidence, flags] = [await gatherEvidence(db(), project.id), effectiveAutomations(project)];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automations"
        hint="What runs on its own for this site, and how each piece feeds the next."
      />
      {/* The toggle mechanics, next to the toggles themselves rather than
          crammed into the page hint. */}
      <p className="text-sm text-neutral-400">
        Toggle a publishing gate off to keep a say - locked ones only collect data or guard
        quality. Matching a preset shows as Semi or Auto in the topbar; anything else shows
        Custom.{" "}
        <a
          href="/docs/automations"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
        >
          What each one does
        </a>
        .
      </p>
      <div className="space-y-4">
        {/* Toggleable gates first - the cards you can act on - then the
            locked always-on ones; registry order kept within each group. */}
        {[...AUTOMATIONS]
          .sort((a, b) => {
            const toggleable = (x: Automation) => (x.control && "flag" in x.control ? 0 : 1);
            return toggleable(a) - toggleable(b);
          })
          .map((a) => (
            <AutomationCard
              key={a.id}
              a={a}
              evidence={evidence[a.id] ?? ""}
              flags={flags}
              slug={project.slug}
            />
          ))}
      </div>
      {/* Deliberately its OWN block below the grid, not another automation
          card: every automation above decides whether something publishes on
          its own, and this decides whether the builder may edit pages you
          already published. Different question, so it doesn't move with the
          Semi/Auto presets and doesn't belong in the same list. */}
      <div className="space-y-3 border-t border-neutral-800 pt-6">
        <h2 className="text-sm font-medium text-neutral-300">Content the agent may touch</h2>
        <div className="flex items-start justify-between gap-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-100">
              Let the builder add links from older posts
            </p>
            <p className="max-w-2xl text-sm text-neutral-400">
              When a new guide ships, the same pull request edits 2-3 of your closest existing
              posts so they link to it - one sentence each, nothing else touched. It&apos;s how a
              pile of posts turns into a cluster that lifts itself. This is the only thing
              DispatchSEO does that changes pages you already published, so it&apos;s off until you
              say otherwise, and a pull request that edits published posts always waits for your
              review even on Auto.
            </p>
          </div>
          <InternalLinkingToggle
            enabled={internalLinkingEnabled(project)}
            slug={project.slug}
          />
        </div>
      </div>
    </div>
  );
}
