"use client";

import { useEffect, useRef, useState, useTransition, type JSX } from "react";
import { useActionState } from "react";
import { JOURNEY_STAGES, STAGE_META } from "@/lib/journey-meta";
import { FirstRunStatus } from "@/components/first-run-status";
import {
  chooseGithubRepo,
  connectClaudeToken,
  runPipelineInstall,
  setProjectMode,
  setWizardScreen,
  wizardCreateProject,
  wizardSetGscProperty,
  type ChooseRepoState,
  type ConnectClaudeState,
  type WizardCreateState,
  type WizardGscPropertyState,
} from "@/app/actions";
import type { CloudWizardScreen } from "@/lib/wizard-screens";
import { CopyBox, ErrorLine, StepIcon, inputClass } from "@/components/wizard-ui";

// The cloud onboarding wizard - six screens (c0-c5) over a 5-step rail.
// Cloud drops everything self-host's wizard needs a terminal for: GitHub
// connects through the App (no token to paste), Claude Code needs one
// setup-token paste instead of a whole install command, and the pipeline
// installs itself server-side (runPipelineInstall) instead of the owner
// pasting an install command into their own Claude Code. Screen persistence
// (setWizardScreen) and the resume-on-reload pattern are copied verbatim
// from onboarding-wizard.tsx so the two wizards never drift on the basics.

const RAIL: Record<CloudWizardScreen, number> = {
  c0: 0,
  c1: 1,
  c2: 2,
  c3: 3,
  c4: 4,
  c5: 5,
};

const STEP_COUNT = 5;

const META: Record<Exclude<CloudWizardScreen, "c5">, { name: string; time: string }> = {
  c0: { name: "Add your site", time: "about 30 seconds" },
  c1: { name: "Connect GitHub", time: "about 1 minute" },
  c2: { name: "Connect Claude Code", time: "about 1 minute" },
  c3: { name: "Search Console", time: "about 2 minutes" },
  c4: { name: "Publish mode", time: "30 seconds" },
};

// The honest SEO timeline - same stage copy the Home journey card and
// get_overview use (journey-meta.ts is client-safe, unlike journey.ts).
const TIMELINE = JOURNEY_STAGES.map((k) => ({
  months: STAGE_META[k].months ?? "",
  label: STAGE_META[k].label,
  copy: STAGE_META[k].expectation,
}));

export type CloudWizardResume = {
  screen: CloudWizardScreen;
  created: { slug: string; name: string; domain: string } | null;
  githubRepo: string | null;
  installationId: number | null;
  installationRepos: string[] | null; // live repo list when installation exists but repo not chosen, else null
  gscConnected: boolean;
  gscSites: string[] | null; // live property list when connected, else null
  gscSiteUrl: string | null; // current tracked property
  mode: "semi" | "auto" | "custom";
};

type PipelineInstallResult = Awaited<ReturnType<typeof runPipelineInstall>>;

function chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloudOnboardingWizard(props: {
  resume: CloudWizardResume | null;
  prefillDomain: string | null;
  ghFlag?: string | null;
  ghError?: string | null;
  gscFlag?: string | null;
}): JSX.Element {
  const { resume, prefillDomain, ghFlag, ghError, gscFlag } = props;

  const [screen, setScreenRaw] = useState<CloudWizardScreen>(() =>
    resume?.created && resume.screen === "c0" ? "c1" : resume?.screen ?? "c0",
  );
  function setScreen(next: CloudWizardScreen) {
    setScreenRaw(next);
    void setWizardScreen(next);
  }

  const [created, setCreated] = useState<{ slug: string; name: string; domain: string } | null>(
    resume?.created ?? null,
  );
  const [githubRepo, setGithubRepo] = useState<string | null>(resume?.githubRepo ?? null);
  const [gscSiteUrl, setGscSiteUrl] = useState<string | null>(resume?.gscSiteUrl ?? null);
  const [modeChoice, setModeChoice] = useState<"semi" | "auto">(
    resume?.mode === "auto" ? "auto" : "semi",
  );

  // These only ever change via a full navigation away and back (the GitHub
  // App install flow, the Google OAuth flow), which remounts this component
  // with a fresh `resume` - so they're read straight from props, not state.
  const installationId = resume?.installationId ?? null;
  const installationRepos = resume?.installationRepos ?? null;
  const gscConnected = resume?.gscConnected ?? false;
  const gscSites = resume?.gscSites ?? null;

  const step = RAIL[screen];

  // ---- c0: create the project ----------------------------------------------
  const [createState, createAction, createPending] = useActionState<WizardCreateState, FormData>(
    wizardCreateProject,
    null,
  );
  useEffect(() => {
    if (createState && "ok" in createState) {
      setCreated({ slug: createState.slug, name: createState.name, domain: createState.domain });
      setScreen("c1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState]);

  // ---- c1: GitHub App install + repo pick -----------------------------------
  const [repoState, repoAction, repoPending] = useActionState<ChooseRepoState, FormData>(
    chooseGithubRepo,
    null,
  );
  useEffect(() => {
    if (repoState && "ok" in repoState) {
      setGithubRepo(repoState.repo);
      setScreen("c2");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoState]);
  // Returning from the GitHub install redirect is a full page reload, so this
  // component remounts - but `screen` resumes from wherever it was PERSISTED
  // (c1, since that's where the owner left to go install the App), while
  // `resume.githubRepo` now reflects the pick made mid-flow. One mount-time
  // check bumps past the now-stale c1 without needing a second navigation.
  useEffect(() => {
    if (screen === "c1" && resume?.githubRepo) setScreen("c2");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- c2: Claude Code token -------------------------------------------------
  const [claudeState, claudeAction, claudePending] = useActionState<ConnectClaudeState, FormData>(
    connectClaudeToken,
    null,
  );
  useEffect(() => {
    if (claudeState && "ok" in claudeState) setScreen("c3");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claudeState]);

  // ---- c3: Search Console property pick --------------------------------------
  const [gscPropState, gscPropAction] = useActionState<WizardGscPropertyState, FormData>(
    wizardSetGscProperty,
    null,
  );
  const gscError = gscFlag && gscFlag !== "connected" ? gscFlag : null;

  // ---- c4: publish mode -------------------------------------------------------
  const [pendingMode, startMode] = useTransition();
  function confirmMode() {
    startMode(async () => {
      await setProjectMode(modeChoice);
      setScreen("c5");
    });
  }

  // ---- c5: fire-and-poll the install ------------------------------------------
  const [installResult, setInstallResult] = useState<PipelineInstallResult | null>(null);
  const [installPending, startInstall] = useTransition();
  const installedOnce = useRef(false);
  function fireInstall() {
    startInstall(async () => {
      setInstallResult(await runPipelineInstall());
    });
  }
  useEffect(() => {
    // ONLY at the finale. Firing on any earlier screen calls runPipelineInstall
    // before a project exists, whose getActiveProject() redirects a fresh user
    // back to /onboarding - which remounts this wizard and re-fires the effect,
    // a ~0.3s redirect loop that stole focus from every field (2026-07-23).
    if (screen !== "c5" || installedOnce.current) return;
    installedOnce.current = true;
    fireInstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function renderInstallBanner(): JSX.Element | null {
    if (!installResult) {
      return installPending ? (
        <p className="text-sm text-neutral-400">Installing your automation pipeline…</p>
      ) : null;
    }
    if ("error" in installResult) {
      return (
        <div className="space-y-3">
          <ErrorLine msg={installResult.error} />
          <button
            type="button"
            onClick={fireInstall}
            disabled={installPending}
            className="cursor-pointer rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {installPending ? "Retrying..." : "Retry"}
          </button>
        </div>
      );
    }
    if (installResult.mode === "pr") {
      return (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-sm text-amber-100/90">
          <b className="font-semibold text-amber-200">Your move:</b> your repo&apos;s branch
          protection requires a pull request - merge it to finish.
          {installResult.pr_url ? (
            <>
              {" "}
              <a
                href={installResult.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
              >
                Open the pull request
              </a>
            </>
          ) : null}
        </div>
      );
    }
    if (!installResult.setup_dispatched) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">
            Setup will start automatically once your Claude Code token finishes verifying in the
            background. If this hasn&apos;t moved in a few minutes, retry.
          </p>
          <button
            type="button"
            onClick={fireInstall}
            disabled={installPending}
            className="cursor-pointer rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {installPending ? "Retrying..." : "Retry"}
          </button>
        </div>
      );
    }
    return (
      <p className="text-sm text-neutral-300">
        Pipeline installed. Your agent is starting first research and personalizing the backlink
        playbook - the checklist below fills in as it works.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* header */}
      <div className="flex items-center justify-between pb-4 pt-1">
        <p className="text-sm font-semibold tracking-tight">Set up your site</p>
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          ~5 minutes
        </p>
      </div>

      {/* progress rail */}
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors ${
              step > i || screen === "c5"
                ? "bg-violet-500"
                : step === i
                  ? "bg-gradient-to-r from-violet-500 from-45% to-neutral-800 to-45%"
                  : "bg-neutral-800"
            }`}
          />
        ))}
      </div>
      <div className="mb-5 mt-2 flex items-baseline justify-between text-xs text-neutral-500">
        {screen === "c5" ? (
          <span className="font-medium text-neutral-100">Setup complete</span>
        ) : (
          <>
            <span className="text-neutral-400">
              Step {step + 1} of {STEP_COUNT} ·{" "}
              <b className="font-medium text-neutral-100">{META[screen].name}</b>
            </span>
            <span>{META[screen].time}</span>
          </>
        )}
      </div>

      {/* ============ c0 · Add your site ============ */}
      {screen === "c0" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <path d="M2 12h20" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Add your site</h2>
          <p className="mb-4 text-base text-neutral-400">
            The website you want Google traffic for. Takes 30 seconds - GitHub and Claude Code
            connect next.
          </p>
          <form action={createAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {createState && "error" in createState ? <ErrorLine msg={createState.error} /> : null}
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">Site name</span>
              <input name="name" required placeholder="UsageCut" autoComplete="off" className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-base font-medium text-neutral-200">Your site&apos;s domain</span>
              <input
                name="domain"
                required
                placeholder="usagecut.com"
                autoComplete="off"
                defaultValue={prefillDomain ?? undefined}
                className={inputClass}
              />
              <span className="block text-sm leading-relaxed text-neutral-500">
                The website whose rankings DispatchSEO will grow and track.
              </span>
            </label>
            {/* Cloud detects the repo's content layout during setup instead of
                asking here - the blog-location question doesn't exist yet
                because there's no repo to inspect until step 2. */}
            <input type="hidden" name="content_mode" value="detect" />
            <input type="hidden" name="mode" value="semi" />
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={createPending}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createPending ? "Creating..." : "Continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* ============ c1 · Connect GitHub ============ */}
      {screen === "c1" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="7" cy="12" r="3" />
              <circle cx="17" cy="12" r="3" />
              <path d="M10 12h4" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect GitHub</h2>
          <p className="mb-4 text-base text-neutral-400">
            DispatchSEO installs its pipeline into your repo and opens (and merges) pull requests
            through the DispatchSEO GitHub App - no tokens to paste.
          </p>
          {ghFlag === "error" ? (
            <ErrorLine
              msg={ghError ? `GitHub connection failed: ${ghError}` : "GitHub connection failed. Try again."}
            />
          ) : null}
          <div className="mt-3.5 rounded-xl bg-neutral-900 p-4">
            {githubRepo ? (
              <p className="text-sm text-neutral-400">GitHub is connected. Continuing…</p>
            ) : installationId ? (
              <form action={repoAction} className="space-y-2.5">
                {repoState && "error" in repoState ? <ErrorLine msg={repoState.error} /> : null}
                <p className="text-base font-medium text-neutral-200">
                  Pick the repo DispatchSEO should publish into
                </p>
                <div className="space-y-1.5">
                  {(installationRepos ?? []).map((r, i) => (
                    <label
                      key={r}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-700 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
                    >
                      <input
                        type="radio"
                        name="repo"
                        value={r}
                        defaultChecked={i === 0}
                        className="h-4 w-4 accent-violet-500"
                      />
                      {r}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={repoPending}
                    className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {repoPending ? "Saving..." : "Continue"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="mb-3.5 text-[15px] leading-relaxed text-neutral-400">
                  One click, on GitHub&apos;s own install screen - pick the repo(s) to share and
                  come straight back here.
                </p>
                <a
                  href={created ? `/api/github/install/start?slug=${encodeURIComponent(created.slug)}` : "#"}
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
                >
                  Install the DispatchSEO GitHub App
                </a>
              </>
            )}
          </div>
        </section>
      ) : null}

      {/* ============ c2 · Connect Claude Code ============ */}
      {screen === "c2" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <polyline points="4 17 10 11 4 5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="19" x2="20" y2="19" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect your Claude Code</h2>
          <p className="mb-4 text-base text-neutral-400">
            Your Claude Code does the research and writing, on your existing subscription -
            nothing extra to pay, and nothing is billed by DispatchSEO.
          </p>
          <div className="rounded-xl bg-neutral-900 p-4">
            <p className="mb-2 text-base font-medium text-neutral-200">
              Run this in a terminal and copy what it prints
            </p>
            <CopyBox text="claude setup-token" />
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              Open a terminal on your computer — the macOS <b className="font-medium text-neutral-300">Terminal</b> app,
              or the terminal panel in VS Code — and run the command above. It opens a browser login, then prints a
              token starting with <code className="font-mono text-neutral-300">sk-ant-oat...</code>. Paste it below.
            </p>
            <form action={claudeAction} className="mt-3.5 space-y-2.5">
              {claudeState && "error" in claudeState ? <ErrorLine msg={claudeState.error} /> : null}
              <input
                name="token"
                type="password"
                placeholder="sk-ant-oat-..."
                autoComplete="off"
                className={inputClass}
              />
              <p className="text-sm text-neutral-500">
                Verification happens in the background after setup starts - this screen won&apos;t
                show an instant green check, and that&apos;s expected.
              </p>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={claudePending}
                  className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {claudePending ? "Saving..." : "Continue"}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {/* ============ c3 · Search Console ============ */}
      {screen === "c3" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M3 3v17a1 1 0 0 0 1 1h17" />
              <path d="M7 14l4-4 4 3 5-6" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Connect Google Search Console</h2>
          <p className="mb-4 text-base text-neutral-400">
            This is where your traffic and ranking data comes from. One click, no key files to
            manage.
          </p>
          {gscError ? <ErrorLine msg={gscError} /> : null}
          <div className="mt-3.5 rounded-xl bg-neutral-900 p-4">
            {gscConnected ? (
              <>
                <p className="text-sm text-emerald-300">
                  Search Console is connected - data starts flowing today.
                </p>
                {gscSites && gscSites.length > 0 ? (
                  <div className="mt-3.5">
                    <p className="mb-2 text-base font-medium text-neutral-200">Which property is this?</p>
                    <form action={gscPropAction} className="space-y-1.5">
                      {gscPropState && "error" in gscPropState ? <ErrorLine msg={gscPropState.error} /> : null}
                      {gscSites.map((s) => (
                        <label
                          key={s}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-700 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 has-[:checked]:border-violet-500 has-[:checked]:bg-[#191521]"
                        >
                          <input
                            type="radio"
                            name="site_url"
                            value={s}
                            checked={gscSiteUrl === s}
                            onChange={(e) => {
                              setGscSiteUrl(s);
                              e.currentTarget.form?.requestSubmit();
                            }}
                            className="h-4 w-4 accent-violet-500"
                          />
                          {s}
                        </label>
                      ))}
                    </form>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="mb-3.5 text-[15px] leading-relaxed text-neutral-400">
                  Sign in with the Google account that manages this site in Search Console.
                </p>
                <a
                  href="/api/oauth/google/start?returnTo=onboarding"
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
                >
                  Connect Google
                </a>
              </>
            )}
          </div>
          <div className="mt-5 flex items-center justify-end">
            {gscConnected ? (
              <button
                type="button"
                onClick={() => setScreen("c4")}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setScreen("c4")}
                className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                Skip - connect later
              </button>
            )}
          </div>
        </section>
      ) : null}

      {/* ============ c4 · Publish mode ============ */}
      {screen === "c4" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12 22a10 10 0 1 0-10-10" strokeLinecap="round" />
              <path d="M2 17v5h5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">Should anything go live without you?</h2>
          <p className="mb-4 text-base text-neutral-400">
            Both modes research and build the same way. The only difference is whether a human
            says yes before something is published.
          </p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={modeChoice === "semi"}
              onClick={() => setModeChoice("semi")}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                modeChoice === "semi"
                  ? "border-violet-500 bg-[#191521]"
                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
              }`}
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  Recommended to start
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Semi-automatic</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Claude researches and builds on its own, but nothing goes live without you. You
                approve ideas and merge finished pull requests right from the dashboard.
              </p>
              <p className="mt-2 text-sm text-neutral-400">A few minutes of your attention a week.</p>
            </button>
            <button
              type="button"
              aria-pressed={modeChoice === "auto"}
              onClick={() => setModeChoice("auto")}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                modeChoice === "auto"
                  ? "border-violet-500 bg-[#191521]"
                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
              }`}
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Hands-off
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Automatic</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Everything runs itself. Ideas are approved for you, and every page that passes its
                checks merges and goes live without anyone touching it.
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                You can watch everything, and undo anything, from the dashboard.
              </p>
            </button>
          </div>
          <p className="mt-2.5 text-center text-sm text-neutral-400">
            Switch anytime with the Semi / Auto toggle in the top bar.
          </p>
          {modeChoice === "auto" ? (
            <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-neutral-300">
              One tip for automatic mode: after setup, spend two minutes on the{" "}
              <a
                href="/docs/troubleshooting#get-emailed-when-something-breaks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
              >
                failure email
              </a>
              . When everything runs itself, nobody opens the dashboard on a normal day - the email
              is what tells you if a job ever breaks.
            </p>
          ) : null}
          <div className="mt-5 flex items-center justify-end">
            <button
              type="button"
              onClick={confirmMode}
              disabled={pendingMode}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingMode ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ c5 · Finish ============ */}
      {screen === "c5" ? (
        <section>
          <StepIcon done>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" />
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-2xl font-semibold tracking-tight">You&apos;re live.</h2>
          <p className="mb-4 text-base text-neutral-400">
            Installing the pipeline into {created?.name ?? "your"}&apos;s repo now - no more
            pastes needed. This runs on GitHub and usually takes{" "}
            <b className="font-medium text-neutral-200">5-15 minutes</b>. You can leave this page
            and come back - setup finishes on its own, and your dashboard unlocks the moment
            it&apos;s done.
          </p>

          <div className="rounded-xl bg-neutral-900 p-4">{renderInstallBanner()}</div>

          {/* The dashboard unlocks the moment the repo is connected (which it is
              by now), so don't trap the owner on this page - the background run
              keeps going and the dashboard shows its own "setting up" banner. */}
          <div className="mt-4 flex justify-center">
            <a
              href="/dashboard"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition-colors hover:border-violet-500/50 hover:bg-neutral-800"
            >
              Explore your dashboard while this finishes →
            </a>
          </div>

          <p className="mt-4 rounded-lg bg-neutral-900 px-3.5 py-3 text-sm text-neutral-400">
            Keyword data: included in your plan - nothing to set up.
          </p>

          <details className="group mt-4 rounded-xl bg-neutral-900 px-4 py-3">
            <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200">
              What to expect next
              {chevron()}
            </summary>
            <div className="mt-1">
              {TIMELINE.map((t) => (
                <div key={t.label} className="flex gap-3 border-b border-neutral-800 py-2.5 last:border-b-0">
                  <span className="w-20 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                    {t.months}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-neutral-200">{t.label}</p>
                    <p className="text-sm text-neutral-400">{t.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </details>

          {created ? <FirstRunStatus slug={created.slug} cloud /> : null}
        </section>
      ) : null}
    </div>
  );
}
