"use client";

import { useEffect, useRef, useState } from "react";

// The onboarding wizard's live finale. Renders under the install command and
// polls /api/onboarding/status while the agent runs it. Installs take
// 10-60 minutes with nobody watching a terminal the whole time, so this is
// the transparency fix: a full checklist of everything the agent sets up,
// ticking off as install_progress (agent-reported step stamps) and the
// derived Status fields report in. Old agents that predate install_progress
// report {} forever - the pipeline_installed override (below) still resolves
// the whole thing to done in one shot, so nobody's stuck watching a
// permanent spinner. Background work (first research, rank checks, GSC
// data) deliberately doesn't gate "done" - it shows on Home's strip.

type Status = {
  install_progress?: Record<string, string>;
  content_mode?: "create" | "existing" | "detect" | null;
  repo_connected: boolean;
  canary_ok: boolean | null;
  canary_error: string | null;
  pipeline_installed: boolean;
  open_pr: { url: string; title: string } | null;
  profile_written: boolean;
  ideas_queued: number;
  keywords_tracked: number;
  rank_checks: number;
  gsc_rows: number;
  pages_known: number;
  is_docker: boolean;
  builds_active: boolean;
};

type ItemState = "pending" | "active" | "done" | "error";

function tileClasses(state: ItemState) {
  switch (state) {
    case "done":
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-400";
    case "active":
      return "animate-pulse border-violet-500/40 bg-violet-500/10 text-violet-400";
    case "error":
      return "border-red-500/30 bg-red-500/10 text-red-400";
    default:
      return "border-neutral-800 bg-neutral-800/40 text-neutral-600";
  }
}

function CheckBadge({ tone }: { tone: "done" | "error" }) {
  return (
    <span
      className={`absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-neutral-900 ${
        tone === "done" ? "bg-emerald-400" : "bg-red-400"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-2 w-2 text-neutral-950" aria-hidden>
        {tone === "done" ? (
          <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
            <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}

function ChecklistItem({
  state,
  icon,
  title,
  detail,
  prominent,
}: {
  state: ItemState;
  icon: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  prominent?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-neutral-800/70 py-3 last:border-b-0">
      <div
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${tileClasses(state)}`}
      >
        {icon}
        {state === "done" || state === "error" ? <CheckBadge tone={state} /> : null}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p
          className={`text-sm font-medium ${
            state === "pending" ? "text-neutral-500" : state === "error" ? "text-red-400" : "text-neutral-200"
          }`}
        >
          {title}
        </p>
        {detail ? (
          <p className={prominent ? "mt-0.5 text-sm text-neutral-300" : "mt-0.5 text-[13px] leading-relaxed text-neutral-500"}>
            {detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// --- topic icons, one per checklist item - all built from lines/circles/
// rects/rounded-corner arcs only, matching the wizard's inline-SVG style. ---

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4",
  "aria-hidden": true,
};

function IconFile() {
  return (
    <svg {...svgProps}>
      <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M13 3v5h5" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
      <line x1="8.5" y1="16.5" x2="13" y2="16.5" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M20.5 12h-3M6.5 12h-3M17.8 6.2l-2.1 2.1M8.3 15.6l-2.1 2.1M17.8 17.8l-2.1-2.1M8.3 8.4 6.2 6.3" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg {...svgProps}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconGitPR() {
  return (
    <svg {...svgProps}>
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="18" r="2.3" />
      <line x1="6" y1="8.3" x2="6" y2="21" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg {...svgProps}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

// Content home when the agent is building the blog from scratch - a trowel
// over foundation lines, to visually flag "this is the long one."
function IconBuild() {
  return (
    <svg {...svgProps}>
      <path d="M4 20h16" />
      <path d="M6 20V11l6-5 6 5v9" />
      <path d="M10 20v-5h4v5" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg {...svgProps}>
      <rect x="4.5" y="4" width="15" height="16" rx="1.5" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="7" y1="8" x2="9.5" y2="8" />
      <line x1="14.5" y1="8" x2="17" y2="8" />
    </svg>
  );
}

// Backlink playbook - an outbound-link glyph, since a backlink is exactly that.
function IconLink() {
  return (
    <svg {...svgProps}>
      <path d="M9 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
      <path d="M14 4h6v6" />
      <line x1="20" y1="4" x2="11" y2="13" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg {...svgProps}>
      <path d="M12 3.5 18 6.3 18 11.5 12 20.5 6 11.5 6 6.3Z" />
    </svg>
  );
}

function IconUnlock() {
  return (
    <svg {...svgProps}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg {...svgProps}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="20" y1="20" x2="15.2" y2="15.2" />
    </svg>
  );
}

function IconRobot() {
  return (
    <svg {...svgProps}>
      <rect x="5" y="8" width="14" height="11" rx="2.5" />
      <line x1="12" y1="8" x2="12" y2="4.5" />
      <circle cx="12" cy="3.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

// cloud: the App committed the pipeline and dispatched the setup workflow -
// nobody pasted anything, so the waiting copy talks about the background
// run instead of a terminal.
export function FirstRunStatus({ slug, cloud }: { slug: string; cloud?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // "Done" = every step the OWNER owns is done. The install stamp only
  // lands after the backend verified the whole checklist - setup/profile
  // included - so it is the single gate.
  const allDone = Boolean(status?.pipeline_installed);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const res = await fetch(`/api/onboarding/status?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        if (res.ok && !stopped) setStatus((await res.json()) as Status);
      } catch {
        /* transient poll failure - next tick retries */
      }
    }
    void poll();
    timer.current = setInterval(poll, 6000);
    return () => {
      stopped = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [slug]);

  useEffect(() => {
    if (allDone && timer.current) clearInterval(timer.current);
  }, [allDone]);

  const s = status;
  const ip = s?.install_progress ?? {};
  const pipelineDone = Boolean(s?.pipeline_installed);
  const hasStep = (key: string) => pipelineDone || Boolean(ip[key]);

  // Items 1-9: pipeline_installed forces every one of them done regardless
  // of install_progress - old agents that never report a single step still
  // land on a clean, fully-ticked checklist the moment the backend verifies
  // the install, instead of a permanent half-lit spinner.
  const workflowsDone = hasStep("workflows");
  const adaptationDone = hasStep("adaptation");
  const repoSettingsDone = hasStep("repo_settings");
  const installPrDone = pipelineDone;
  const contentHomeDone = hasStep("content_home");
  const siteFactsDone = hasStep("site_facts");
  const backlinkDone = pipelineDone || Boolean(s?.profile_written);
  const canaryError = !pipelineDone && s?.canary_ok === false;
  const prMachineryDone = pipelineDone || Boolean(s?.canary_ok);
  const pipelineVerifiedDone = pipelineDone;
  // Independent of the override - a background step that starts only after
  // install finishes, so it's never forced done early.
  const researchDone = Boolean(ip.research) || (s?.ideas_queued ?? 0) > 0;
  const buildsDone = Boolean(s?.builds_active);

  // The first not-yet-done step in install order reads as "active" (the one
  // spinner on the page); everything after it is quiet "pending" even if,
  // out of order, a later signal already landed true (still shown done).
  const chain = [
    workflowsDone,
    adaptationDone,
    repoSettingsDone,
    installPrDone,
    contentHomeDone,
    siteFactsDone,
    backlinkDone,
    prMachineryDone,
    pipelineVerifiedDone,
    researchDone,
  ];
  const firstGapIndex = chain.findIndex((d) => !d);
  const stateAt = (i: number, done: boolean): ItemState => (done ? "done" : i === firstGapIndex ? "active" : "pending");

  const stWorkflows = stateAt(0, workflowsDone);
  const stAdaptation = stateAt(1, adaptationDone);
  const stRepoSettings = stateAt(2, repoSettingsDone);
  let stInstallPr = stateAt(3, installPrDone);
  // An open PR is the owner's blocking move - surface it as urgent the
  // instant it exists, whatever the chain position says.
  if (!installPrDone && s?.open_pr) stInstallPr = "active";
  const stContentHome = stateAt(4, contentHomeDone);
  const stSiteFacts = stateAt(5, siteFactsDone);
  const stBacklink = stateAt(6, backlinkDone);
  const stPrMachinery: ItemState = canaryError ? "error" : stateAt(7, prMachineryDone);
  const stPipelineVerified = stateAt(8, pipelineVerifiedDone);
  const stResearch = stateAt(9, researchDone);
  // No signal exists for "about to start" here (only the binary
  // builds_active) - no fake progress, so this one never animates.
  const stBuilds: ItemState = buildsDone ? "done" : "pending";

  const isDocker = Boolean(s?.is_docker);
  const items = [stWorkflows, stAdaptation, stRepoSettings, stInstallPr, stContentHome, stSiteFacts, stBacklink, stPrMachinery, stPipelineVerified, stResearch, ...(isDocker ? [stBuilds] : [])];
  const totalCount = items.length;
  const doneCount = items.filter((x) => x === "done").length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  const contentMode = s?.content_mode ?? null;
  const contentTitle =
    contentMode === "create" ? "Creating your blog" : contentMode === "existing" ? "Connecting your existing blog" : "Finding your content home";
  const contentIcon = contentMode === "create" ? <IconBuild /> : <IconHome />;
  const contentPending =
    contentMode === "create"
      ? "Built from scratch - this is the long step, and can stretch toward an hour"
      : contentMode === "existing"
        ? "Waiting on the install PR"
        : "Waiting on the install PR";
  const contentActive =
    contentMode === "create"
      ? "Scaffolding your blog from scratch - real infrastructure, not stuck"
      : contentMode === "existing"
        ? "Locating your existing blog section"
        : "Finding where your content lives";
  const contentDone = contentMode === "create" ? "Blog scaffolded" : contentMode === "existing" ? "Connected" : "Found";

  return (
    <div className="mt-4 rounded-xl bg-neutral-900 px-4 py-4">
      <div className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-neutral-200">
            {doneCount} of {totalCount} set up
          </p>
          <p className="text-[13px] text-neutral-500">{allDone ? "Complete" : "Typically 10-20 min"}</p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        {!allDone ? (
          <p className="mt-2 text-[13px] text-neutral-500">
            Up to an hour if the content home is built from scratch - the agent is doing real work, not stuck.
          </p>
        ) : null}
      </div>

      <ul>
        <ChecklistItem
          state={stWorkflows}
          icon={<IconFile />}
          title="Automation workflows"
          detail={
            stWorkflows === "done"
              ? "Written into your repo"
              : stWorkflows === "active"
                ? "Writing GitHub Actions workflows into your repo"
                : "Not started yet - first thing the agent writes"
          }
        />
        <ChecklistItem
          state={stAdaptation}
          icon={<IconGear />}
          title="Adapted to your stack"
          detail={
            stAdaptation === "done"
              ? "Build proven the way CI runs it"
              : stAdaptation === "active"
                ? "Proving the build the way your CI actually runs it"
                : "Waiting on the workflows"
          }
        />
        <ChecklistItem
          state={stRepoSettings}
          icon={<IconTag />}
          title="Repo settings & labels"
          detail={
            stRepoSettings === "done"
              ? "Configured"
              : stRepoSettings === "active"
                ? "Configuring repo settings and PR labels"
                : "Waiting on the stack check"
          }
        />
        <ChecklistItem
          state={stInstallPr}
          icon={<IconGitPR />}
          title="Install PR"
          prominent={stInstallPr === "active" && Boolean(s?.open_pr) && !installPrDone}
          detail={
            installPrDone ? (
              "Merged - the pipeline is installed"
            ) : s?.open_pr ? (
              <>
                <b className="font-semibold text-neutral-100">Your move:</b>{" "}
                <a
                  href={s.open_pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                >
                  merge the pipeline PR
                </a>{" "}
                - the install finishes the moment it merges
              </>
            ) : cloud ? (
              "Opens once the background run finishes writing the pipeline"
            ) : (
              "Opens once your agent finishes writing the pipeline"
            )
          }
        />
        <ChecklistItem
          state={stContentHome}
          icon={contentIcon}
          title={contentTitle}
          detail={stContentHome === "done" ? contentDone : stContentHome === "active" ? contentActive : contentPending}
        />
        <ChecklistItem
          state={stSiteFacts}
          icon={<IconBook />}
          title="Site facts"
          detail={
            stSiteFacts === "done"
              ? "Conventions file written"
              : stSiteFacts === "active"
                ? "Writing your site's conventions file"
                : "Waiting on the content home"
          }
        />
        <ChecklistItem
          state={stBacklink}
          icon={<IconLink />}
          title="Backlink playbook"
          detail={
            stBacklink === "done"
              ? "Personalized to your site"
              : stBacklink === "active"
                ? "Personalizing your backlink playbook"
                : "Waiting on site facts"
          }
        />
        <ChecklistItem
          state={stPrMachinery}
          icon={<IconShield />}
          title="PR machinery"
          detail={
            stPrMachinery === "error"
              ? (s?.canary_error ?? "Check failed - see your agent's chat for details")
              : stPrMachinery === "done"
                ? "Proven end-to-end"
                : stPrMachinery === "active"
                  ? cloud
                    ? "Proving the PR pipeline end-to-end, in the background"
                    : "Proving the PR pipeline end-to-end - watch your terminal"
                  : cloud
                    ? "Waiting to prove the PR pipeline works, in the background"
                    : "Waiting to prove the PR pipeline works"
          }
        />
        <ChecklistItem
          state={stPipelineVerified}
          icon={<IconUnlock />}
          title="Pipeline verified"
          detail={
            stPipelineVerified === "done"
              ? "Verified - dashboard unlocked"
              : stPipelineVerified === "active"
                ? "Verifying the full pipeline"
                : "Final check before your dashboard unlocks"
          }
        />
        <ChecklistItem
          state={stResearch}
          icon={<IconSearch />}
          title="First keyword research"
          detail={
            stResearch === "done"
              ? `${s?.ideas_queued ?? 0} idea${(s?.ideas_queued ?? 0) === 1 ? "" : "s"} queued`
              : stResearch === "active"
                ? "Researching your first keywords in the background"
                : "Starts in the background - ideas appear on the dashboard"
          }
        />
        {isDocker ? (
          <ChecklistItem
            state={stBuilds}
            icon={<IconRobot />}
            title="Automatic builds"
            detail={
              stBuilds === "done"
                ? "Builder is polling for work"
                : "No build path yet - paste the token step below (the builder polls every 10 minutes, so green can take a few)"
            }
          />
        ) : null}
      </ul>

      <div className="border-t border-neutral-800 pt-3">
        {allDone ? (
          <a
            href="/dashboard"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-neutral-950"
          >
            Setup complete - open your dashboard →
          </a>
        ) : (
          <p className="text-sm text-neutral-500">
            {cloud
              ? "This page updates itself as the background setup run works on GitHub - anything that needs YOU appears above with a link."
              : "This page updates itself - your agent's chat shows what it's doing, and anything that needs YOU appears above with a link."}
          </p>
        )}
      </div>
    </div>
  );
}
