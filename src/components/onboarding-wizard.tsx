"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { JOURNEY_STAGES, STAGE_META } from "@/lib/journey-meta";
import { mcpAddCommand, setupCommand } from "@/lib/mcp-connect";
import { FirstRunStatus } from "@/components/first-run-status";
import {
  chooseGscOnly,
  connectDataforseo,
  connectSerpapi,
  setPowerupsSkipped,
  setProjectMode,
  wizardCheckGscAccess,
  wizardCreateProject,
  type ConnectDataforseoState,
  type ConnectSerpapiState,
  type WizardCreateState,
} from "@/app/actions";
import type { GscAccessProbe } from "@/lib/gsc";

// The onboarding wizard - the approved mockup, wired to real actions. Eight
// screens over five rail steps: site -> GSC -> keyword-data pick (+ one detail
// screen per pick) -> Claude Code -> power-ups -> finish. Every choice
// persists on the project row the moment its screen completes, so closing the
// tab mid-wizard loses nothing: the Home setup cards cover whatever is left.

type Screen =
  | "s0"
  | "s1"
  | "s2a"
  | "s2b_paid"
  | "s2b_free"
  | "s3"
  | "s3m"
  | "s4"
  | "s4b"
  | "s5";

const RAIL: Record<Screen, number> = {
  s0: 0,
  s1: 1,
  s2a: 2,
  s2b_paid: 2,
  s2b_free: 2,
  s3: 3,
  s3m: 4,
  s4: 5,
  s4b: 6,
  s5: 7,
};

const STEP_COUNT = 7;

const META: Record<Exclude<Screen, "s5">, { name: string; time: string }> = {
  s0: { name: "Add your site", time: "about 30 seconds" },
  s1: { name: "Search Console", time: "about 2 minutes" },
  s2a: { name: "Keyword data", time: "about 3 minutes" },
  s2b_paid: { name: "Keyword data", time: "about 3 minutes" },
  s2b_free: { name: "Keyword data", time: "about 3 minutes" },
  s3: { name: "Claude Code", time: "just read" },
  s3m: { name: "Publish mode", time: "one choice" },
  s4: { name: "Power-ups", time: "optional" },
  s4b: { name: "What happens next", time: "just read" },
};

// The honest SEO timeline, month by month - the same stage copy the Home
// journey card and get_overview use (journey-meta.ts is the one source of
// the words; it's client-safe, unlike journey.ts which imports db.ts).
const TIMELINE = JOURNEY_STAGES.map((k) => ({
  months: STAGE_META[k].months ?? "",
  label: STAGE_META[k].label,
  copy: STAGE_META[k].expectation,
}));

const POWERUPS = [
  {
    key: "merge",
    title: "One-tap merge",
    desc: "Approve content from the dashboard and it ships. Needs a GitHub token.",
  },
  {
    key: "pipeline",
    title: "Content pipeline",
    desc: "Daily article builder running in your repo's GitHub Actions, on your own Claude subscription.",
  },
  {
    key: "playbook",
    title: "Backlink playbook",
    desc: "One paste in Claude Code researches your product and prefills every backlink submission.",
  },
] as const;

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

function CopyBox({ text, emphasis }: { text: string; emphasis?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={
        emphasis
          ? "flex items-center gap-3 rounded-xl border border-violet-500/40 bg-neutral-950 py-4 pl-5 pr-3.5 shadow-[0_0_36px_-10px_rgba(139,92,246,0.45)]"
          : "flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-950 py-2.5 pl-3.5 pr-3"
      }
    >
      <code
        className={
          emphasis
            ? "flex-1 overflow-x-auto whitespace-nowrap font-mono text-[15px] text-neutral-100 [scrollbar-width:none]"
            : "flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-neutral-300 [scrollbar-width:none]"
        }
      >
        {text}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }, () => {});
        }}
        className={
          emphasis
            ? `shrink-0 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                copied ? "bg-emerald-400 text-neutral-950" : "bg-violet-500 text-neutral-950 hover:bg-violet-400"
              }`
            : `shrink-0 cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-700 ${copied ? "text-emerald-400" : "text-neutral-300"}`
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function StepIcon({ children, done }: { children: React.ReactNode; done?: boolean }) {
  return (
    <div
      className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg border ${
        done
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
          : "border-violet-500/25 bg-violet-500/10 text-violet-400"
      }`}
    >
      {children}
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{msg}</p>;
}

// The 3-step "add this email to Search Console" recap. Shared between the
// normal (service account exists) and muted (no service account yet) looks so
// the copy never drifts between the two - only the color weight changes.
function GscSteps({ domain, muted }: { domain: string; muted?: boolean }) {
  const item = muted ? "text-neutral-500" : "text-neutral-400";
  const bold = muted ? "font-medium text-neutral-400" : "font-medium text-neutral-200";
  const num = muted ? "bg-neutral-800/60 text-neutral-600" : "bg-neutral-800 text-neutral-300";
  return (
    <ol className={`space-y-2 text-sm ${item}`}>
      {[
        <>
          Open{" "}
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
          >
            Google Search Console
          </a>{" "}
          and pick {domain}.
        </>,
        <>
          Go to <b className={bold}>Settings</b>, then <b className={bold}>Users and permissions</b>.
        </>,
        <>
          Click <b className={bold}>Add user</b>, paste the email, keep the{" "}
          <b className={bold}>Restricted</b> permission, save.
        </>,
      ].map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-xs font-semibold ${num}`}>
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function OnboardingWizard({
  saEmail,
  origin,
}: {
  saEmail: string | null;
  origin: string;
}) {
  const [screen, setScreen] = useState<Screen>("s0");
  const [created, setCreated] = useState<{
    slug: string;
    name: string;
    domain: string;
    mcpToken: string;
  } | null>(null);
  const [choice, setChoice] = useState<"paid" | "free" | null>(null);
  const [serpConnected, setSerpConnected] = useState(false);
  // "Does the site have a blog?" - a hint the setup workflow reconciles
  // against the actual repo. Default "detect" keeps the 30-second promise:
  // ignoring the question is a valid answer.
  const [contentMode, setContentMode] = useState<"existing" | "create" | "detect">("detect");
  const [contentHint, setContentHint] = useState("");
  const [powerOn, setPowerOn] = useState<Record<string, boolean>>({
    merge: true,
    pipeline: true,
    playbook: true,
  });
  // Publish mode: semi is the row default from creation; the mode screen only
  // has to persist an escalation to auto (or a return to semi after Back).
  const [modeChoice, setModeChoice] = useState<"semi" | "auto">("semi");
  const [pendingSkip, startSkip] = useTransition();
  const [pendingMode, startMode] = useTransition();
  const [pendingFinish, startFinish] = useTransition();
  // Step 2's on-the-spot Search Console probe.
  const [gscCheck, setGscCheck] = useState<GscAccessProbe | null>(null);
  const [gscChecking, startGscCheck] = useTransition();
  function checkGsc() {
    startGscCheck(async () => {
      setGscCheck(await wizardCheckGscAccess());
    });
  }
  // Self-hosted on localhost: everything in the wizard works, but the
  // content pipeline (GitHub Actions in the site's repo) cannot call back
  // into an address only this machine can reach.
  const isLocalInstance = /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(origin);

  // Step 1: create the project.
  const [createState, createAction, createPending] = useActionState<WizardCreateState, FormData>(
    wizardCreateProject,
    null,
  );
  useEffect(() => {
    if (createState && "ok" in createState) {
      setCreated({
        slug: createState.slug,
        name: createState.name,
        domain: createState.domain,
        mcpToken: createState.mcpToken,
      });
      setScreen("s1");
    }
  }, [createState]);

  // Step 3b (paid): verify + save DataForSEO credentials.
  const [dfsState, dfsAction, dfsPending] = useActionState<ConnectDataforseoState, FormData>(
    connectDataforseo,
    null,
  );
  useEffect(() => {
    if (dfsState && "ok" in dfsState) setScreen("s3");
  }, [dfsState]);

  // Step 3b (free): verify + save the SerpApi key.
  const [serpState, serpAction, serpPending] = useActionState<ConnectSerpapiState, FormData>(
    connectSerpapi,
    null,
  );
  useEffect(() => {
    if (serpState && "ok" in serpState) {
      setSerpConnected(true);
      setScreen("s3");
    }
  }, [serpState]);

  const step = RAIL[screen];
  // The server name is unique per project (dispatchseo-<slug>) so an owner
  // connecting a second site never collides with or shadows the first one's
  // token, whatever config scope they add it at. Default (local) scope still
  // ties the connection to the folder it is run in - which is why the copy
  // says to run it in the SITE's repo. The slash commands reference the
  // server descriptively ("the seo-manager MCP"), and agents resolve tools
  // by capability, not by the configured name, so the per-slug name is safe.
  const mcpCommand = created ? mcpAddCommand(created.slug, origin, created.mcpToken) : "";

  function skipSerpapi() {
    startSkip(async () => {
      await chooseGscOnly();
      setSerpConnected(false);
      setScreen("s3");
    });
  }

  function confirmMode() {
    startMode(async () => {
      await setProjectMode(modeChoice);
      setScreen("s4");
    });
  }

  function finishPowerups() {
    const skipped = POWERUPS.filter((p) => !powerOn[p.key]).map((p) => p.key);
    startFinish(async () => {
      await setPowerupsSkipped(skipped);
      setScreen("s4b");
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* header */}
      <div className="flex items-center justify-between pb-4 pt-1">
        <p className="text-sm font-semibold tracking-tight">Set up a new site</p>
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          Setup takes about 10 minutes
        </p>
      </div>

      {/* progress rail */}
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors ${
              step > i || screen === "s5"
                ? "bg-violet-500"
                : step === i
                  ? "bg-gradient-to-r from-violet-500 from-45% to-neutral-800 to-45%"
                  : "bg-neutral-800"
            }`}
          />
        ))}
      </div>
      <div className="mb-5 mt-2 flex items-baseline justify-between text-xs text-neutral-500">
        {screen === "s5" ? (
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

      {/* ============ STEP 1 · Add your site ============ */}
      {screen === "s0" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <path d="M2 12h20" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Add your site</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            Everything on this page is about <b className="font-medium text-neutral-200">your website</b> -
            the site you want Google traffic for. DispatchSEO itself is already
            running; now point it at your site. Takes 30 seconds.
          </p>
          {isLocalInstance ? (
            <div className="mb-3.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-[13px] leading-relaxed text-amber-100/90">
              <b className="font-semibold text-amber-200">Running on {origin.replace(/^https?:\/\//, "")}.</b>{" "}
              Setup, keyword research and rank tracking all work from here. One
              thing doesn&apos;t: the automated content pipeline runs in your
              site repo&apos;s GitHub Actions, and GitHub can&apos;t reach an
              address that only exists on this machine. When you want articles
              built automatically, put this instance on a public URL or tunnel
              first - everything you set up now carries over.
            </div>
          ) : null}
          <form action={createAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {createState && "error" in createState ? <ErrorLine msg={createState.error} /> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-200">Site name</span>
              <input name="name" required placeholder="UsageCut" autoComplete="off" className={inputClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-200">Your site&apos;s domain</span>
              <input name="domain" required placeholder="usagecut.com" autoComplete="off" className={inputClass} />
              <span className="block text-xs leading-relaxed text-neutral-500">
                The website whose rankings DispatchSEO will grow and track - not
                where DispatchSEO is hosted.
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-200">Your site&apos;s GitHub repo</span>
              <input name="repo" required placeholder="owner/repo" autoComplete="off" className={inputClass} />
              <span className="block text-xs leading-relaxed text-neutral-500">
                The repo your website deploys from - Claude ships every article
                and tool to it as a pull request you review. It&apos;s the
                owner/repo part of the URL on{" "}
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                >
                  github.com
                </a>
                .
              </span>
            </label>
            {createState && "error" in createState && createState.code === "repo-not-found" ? (
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input type="checkbox" name="repo_private" value="1" className="h-4 w-4 accent-violet-500" />
                It&apos;s a private repo - it exists, continue anyway
              </label>
            ) : null}
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-neutral-200">
                Does the site have a blog or content section?
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { v: "existing", label: "Yes" },
                    { v: "create", label: "Not yet" },
                    { v: "detect", label: "Not sure" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    aria-pressed={contentMode === o.v}
                    onClick={() => setContentMode(o.v)}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      contentMode === o.v
                        ? "border-violet-500 bg-[#191521] text-neutral-100"
                        : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {contentMode === "existing" ? (
                <input
                  name="content_path_hint"
                  value={contentHint}
                  onChange={(e) => setContentHint(e.target.value)}
                  placeholder="Where? /blog, /articles... (optional)"
                  autoComplete="off"
                  className={inputClass}
                />
              ) : null}
              <p className="text-[12.5px] text-neutral-500">
                {contentMode === "create"
                  ? "Claude adds one to your repo during setup, as a PR you review."
                  : contentMode === "existing"
                    ? "Claude publishes into your existing section. It never creates a second one."
                    : "Claude checks the repo during setup and decides."}
              </p>
            </div>
            <input type="hidden" name="content_mode" value={contentMode} />
            {/* Publishing stays human-approved by default; Settings can flip it later. */}
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

      {/* ============ STEP 2 · Search Console ============ */}
      {screen === "s1" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M3 3v17a1 1 0 0 0 1 1h17" />
              <path d="M7 14l4-4 4 3 5-6" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Connect Google Search Console</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            This is where your traffic and ranking data comes from. It&apos;s free and takes 2 minutes.
          </p>
          <div className="rounded-xl bg-neutral-900 p-4">
            {saEmail ? (
              <>
                <p className="mb-2 text-sm font-medium text-neutral-200">
                  Add this email as a user in Search Console
                </p>
                <CopyBox text={saEmail} />
                <div className="mt-3.5">
                  <GscSteps domain={created?.domain ?? "your site"} />
                </div>
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={checkGsc}
                    disabled={gscChecking}
                    className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      gscCheck?.state === "ok"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                    }`}
                  >
                    {gscChecking
                      ? "Checking with Google..."
                      : gscCheck?.state === "ok"
                        ? "Connected ✓"
                        : gscCheck
                          ? "Check again"
                          : "Verify connection"}
                  </button>
                  {gscCheck?.state === "ok" ? (
                    <span className="text-[13px] text-emerald-300">
                      Search Console is connected - data starts flowing today.
                    </span>
                  ) : gscCheck ? (
                    <span className="text-[13px] text-amber-200/90">
                      Not yet: {gscCheck.why}. Google can take a few minutes
                      after you add the email - you can continue, Home re-checks
                      automatically.
                    </span>
                  ) : (
                    <span className="text-[13px] text-neutral-500">
                      Added the email? Check right away - it&apos;s usually instant.
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.06] p-3.5">
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-4 w-4 shrink-0 text-violet-400"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8h.01" strokeLinecap="round" />
                      <path d="M11 11.5h1v5.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="text-sm font-medium text-neutral-200">
                      No service account on this deployment yet
                    </p>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-neutral-400">
                    DispatchSEO reads your Search Console numbers through a &quot;service
                    account&quot; - a robot Google account it signs in as. This deployment doesn&apos;t
                    have one yet, which is why there&apos;s no email to show here.
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
                    To set one up, follow the service-account steps in the{" "}
                    <a
                      href="https://github.com/NeoZi12/dispatchseo/blob/main/docs/SELF_HOSTING.md#3-google-search-console-free-rankings--traffic-data"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                    >
                      self-hosting guide
                    </a>
                    : create the account, download its JSON key, and add it to your
                    deployment&apos;s environment as{" "}
                    <code className="font-mono text-neutral-300">GSC_SERVICE_ACCOUNT_JSON</code>{" "}
                    (the <code className="font-mono text-neutral-300">.env</code> file for docker,
                    an environment variable on Vercel), then restart.
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
                    Then come back here - or to the Home setup cards - and the email to add will
                    show up.
                  </p>
                  <p className="mt-2.5 text-[13px] font-medium text-neutral-300">
                    Nothing else depends on this. Continue the wizard now and set it up whenever.
                  </p>
                </div>
                <details className="mt-3.5">
                  <summary className="cursor-pointer select-none text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-300">
                    What you&apos;ll do once the email exists
                  </summary>
                  <div className="mt-2.5">
                    <GscSteps domain={created?.domain ?? "your site"} muted />
                  </div>
                </details>
              </>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <span />
            <button
              type="button"
              onClick={() => setScreen("s2a")}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 3a · Pick a keyword data source ============ */}
      {screen === "s2a" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z" />
              <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Where should Claude get keyword data?</h2>
          <p className="mb-3.5 text-sm text-neutral-400">Pick one. You can switch anytime in Settings.</p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setChoice("paid");
                setScreen("s2b_paid");
              }}
              className="cursor-pointer rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition-colors hover:border-neutral-600"
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Paid
                </span>
                <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  Recommended
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">DataForSEO</h3>
              <p className="mt-1 text-[13px] text-neutral-400">
                The accurate option. Real Google search volumes, keyword difficulty, and competitor
                data. The same data most SEO tools resell.
              </p>
              <p className="mt-2 text-[12.5px] text-neutral-400">
                <b className="font-medium text-neutral-300">Pay as you go.</b> $1 free credit to
                start, then a typical site costs $2 to 5 a month. No subscription.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setChoice("free");
                setScreen("s2b_free");
              }}
              className="cursor-pointer rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition-colors hover:border-neutral-600"
            >
              <div className="mb-2.5 flex gap-1.5">
                <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                  Free · $0 forever
                </span>
              </div>
              <h3 className="text-[15px] font-semibold">Free mode</h3>
              <p className="mt-1 text-[13px] text-neutral-400">
                Runs on free data. Claude finds keyword opportunities in your Search Console data
                (searches where you already show up but don&apos;t rank well yet) and expands them with
                Google&apos;s own autocomplete suggestions. What people actually type into the search box.
              </p>
              <p className="mt-2 text-[12.5px] text-neutral-400">
                What you give up vs DataForSEO: exact search volumes and difficulty scores.
              </p>
            </button>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen("s1")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <span />
          </div>
        </section>
      ) : null}

      {/* ============ STEP 3b · DataForSEO credentials ============ */}
      {screen === "s2b_paid" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z" />
              <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Connect DataForSEO</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            Two fields from your DataForSEO account. New accounts start with $1 free credit.
          </p>
          <form action={dfsAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {dfsState && "error" in dfsState ? <ErrorLine msg={dfsState.error} /> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-200">API login</span>
              <input
                name="login"
                type="email"
                required
                placeholder="Your DataForSEO account email"
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-200">API password</span>
              <input
                name="password"
                type="password"
                required
                placeholder="From app.dataforseo.com/api-access"
                autoComplete="new-password"
                className={inputClass}
              />
            </label>
            <a
              href="https://app.dataforseo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[13px] text-violet-400 hover:text-violet-300 hover:underline"
            >
              Create an account →
            </a>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setScreen("s2a")}
                className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={dfsPending}
                className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {dfsPending ? "Checking with DataForSEO..." : "Verify and continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* ============ STEP 3b · Free mode: optional SerpApi ============ */}
      {screen === "s2b_free" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Optional but worth it: free SerpApi key</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            Free mode is set. This one upgrade is worth 2 minutes, and you can skip it.
          </p>
          <form action={serpAction} className="space-y-3 rounded-xl bg-neutral-900 p-4">
            {serpState && "error" in serpState ? <ErrorLine msg={serpState.error} /> : null}
            <p className="text-[13px] text-neutral-400">
              Without it, Claude picks keywords from your own data. With it, Claude can open the
              real Google results for a keyword before writing anything and see who&apos;s on page 1. If
              it&apos;s Reddit threads and thin blog posts, the keyword is winnable. If it&apos;s all big
              brands, Claude skips it.
            </p>
            <p className="text-[13px] text-neutral-400">
              250 free searches a month, no credit card, about 2 minutes.
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-200">SerpApi key</span>
              <input name="key" placeholder="Paste your key" autoComplete="off" className={inputClass} />
            </label>
            <a
              href="https://serpapi.com/users/sign_up"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[13px] text-violet-400 hover:text-violet-300 hover:underline"
            >
              Get a free key →
            </a>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setScreen("s2a")}
                className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                ← Back
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={skipSerpapi}
                  disabled={pendingSkip}
                  className="cursor-pointer px-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendingSkip ? "Saving..." : "Not interested, let's continue"}
                </button>
                <button
                  type="submit"
                  disabled={serpPending}
                  className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {serpPending ? "Checking with SerpApi..." : "Verify and continue"}
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {/* ============ STEP 4 · Claude Code ============ */}
      {screen === "s3" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <polyline points="4 17 10 11 4 5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="19" x2="20" y2="19" strokeLinecap="round" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Your Claude Code does the work</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            Claude Code is the brain. DispatchSEO is its memory and dashboard.
          </p>
          <div className="rounded-xl bg-neutral-900 p-4">
            <p className="text-sm text-neutral-300">
              Nothing to do on this step - the last screen gives you a single command that
              connects your Claude Code to this project and sets everything up, checking each
              value as it goes.
            </p>
            <p className="mt-3 text-[13px] text-neutral-400">
              It works with the Claude Code you already have, on your existing subscription -
              nothing extra to pay, and nothing is billed by DispatchSEO. Your agent researches
              keywords, writes the guides, and opens the pull requests; this dashboard is where
              you watch and approve.
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen(choice === "paid" ? "s2b_paid" : "s2b_free")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setScreen("s3m")}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 5 · Publish mode ============ */}
      {screen === "s3m" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M12 22a10 10 0 1 0-10-10" strokeLinecap="round" />
              <path d="M2 17v5h5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Should anything go live without you?</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
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
              <p className="mt-1 text-[13px] text-neutral-400">
                Claude researches and builds on its own, but nothing goes live without you. You
                approve the ideas and click Merge on finished pages, right from the dashboard.
              </p>
              <p className="mt-2 text-[12.5px] text-neutral-400">
                A few minutes of your attention a week.
              </p>
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
              <p className="mt-1 text-[13px] text-neutral-400">
                Everything runs itself. Ideas are approved for you, and every page that passes its
                checks publishes to your live site without anyone touching it.
              </p>
              <p className="mt-2 text-[12.5px] text-neutral-400">
                You can watch everything, and undo anything, from the dashboard.
              </p>
            </button>
          </div>
          <p className="mt-2.5 text-center text-[13px] text-neutral-400">
            Switch anytime with the Semi / Auto toggle in the top bar.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen("s3")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
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

      {/* ============ STEP 6 · Power-ups ============ */}
      {screen === "s4" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M13 2 3 14h8l-1 8 11-14h-9l1-6Z" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">Power-ups</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            These are on by default. Uncheck anything you want to skip for now.
          </p>
          <div className="rounded-xl bg-neutral-900 px-4 py-1">
            {POWERUPS.map((p) => {
              const on = powerOn[p.key];
              return (
                <div
                  key={p.key}
                  className="flex items-center gap-3 border-b border-neutral-800 py-3 last:border-b-0"
                >
                  <div className={`flex-1 ${on ? "" : "opacity-45"}`}>
                    <p className="text-sm font-medium text-neutral-200">{p.title}</p>
                    <p className="text-[13px] text-neutral-400">{p.desc}</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPowerOn((s) => ({ ...s, [p.key]: !s[p.key] }))}
                    className={`shrink-0 cursor-pointer rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                      on
                        ? "border-violet-500 text-violet-400"
                        : "border-dashed border-neutral-700 text-neutral-500"
                    }`}
                  >
                    {on ? "Added" : "Skipped"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 text-[13px] text-neutral-400">
            Each one you keep shows as a setup card on Home with its exact steps.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen("s3m")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={finishPowerups}
              disabled={pendingFinish}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingFinish ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ STEP 7 · What happens next ============ */}
      {screen === "s4b" ? (
        <section>
          <StepIcon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="16 7 22 7 22 13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">What happens next</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            SEO is slow at the start - that&apos;s how it works for everyone. Here&apos;s the honest
            timeline, so a quiet first month reads as on schedule, not broken.
          </p>
          <div className="rounded-xl bg-neutral-900 px-4 py-1">
            {TIMELINE.map((t) => (
              <div key={t.label} className="flex gap-3.5 border-b border-neutral-800 py-3 last:border-b-0">
                <span className="w-24 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  {t.months}
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-200">{t.label}</p>
                  <p className="text-[13px] text-neutral-400">{t.copy}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[13px] text-neutral-400">
            Home tracks this same journey at the top of the page - stage by stage, with what
            moved each week.
          </p>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScreen("s4")}
              className="cursor-pointer text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setScreen("s5")}
              className="cursor-pointer rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
            >
              Got it
            </button>
          </div>
        </section>
      ) : null}

      {/* ============ FINISH ============ */}
      {screen === "s5" ? (
        <section>
          <StepIcon done>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" />
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </StepIcon>
          <h2 className="text-lg font-semibold tracking-tight">You&apos;re live.</h2>
          <p className="mb-3.5 text-sm text-neutral-400">
            One command connects Claude Code to this project and installs the pipeline.
          </p>

          <div className="space-y-2">
            <p className="text-sm text-neutral-300">
              Paste this in a terminal, <b className="font-medium text-neutral-100">inside your
              site&apos;s repo</b>:
            </p>
            <CopyBox emphasis text={created ? setupCommand(created.slug, origin, created.mcpToken) : ""} />
          </div>

          <div className="mt-4 rounded-lg bg-neutral-900 px-3.5 py-3 text-[13px] text-neutral-400">
            <p className="mb-1.5 font-medium text-neutral-300">What it will ask of you:</p>
            <ul className="space-y-1">
              <li>· Confirm the folder is your site&apos;s repo (it detects and asks).</li>
              <li>
                · Approve once in the browser - your Claude Code token. It verifies the token
                really works before saving it.
              </li>
              <li>
                · Only if you connected DataForSEO: your account email and the API password
                from app.dataforseo.com/api-access (not your login password).
              </li>
              <li>
                · Needs Claude Code and the GitHub CLI (
                <code className="font-mono text-neutral-300">gh</code>) installed - it tells
                you exactly what&apos;s missing if anything is. Safe to re-run any time.
              </li>
            </ul>
          </div>

          <details className="group mt-4 rounded-xl bg-neutral-900 px-4 py-3">
            <summary className="flex cursor-pointer select-none items-center justify-between text-[13px] font-medium text-neutral-400 transition-colors hover:text-neutral-200">
              What got connected
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
            </summary>
            <ul className="mt-1">
              {[
                <>
                  <b className="font-medium text-neutral-200">{created?.name ?? "Your site"}</b> (
                  {created?.domain ?? "yourdomain.com"}) added
                </>,
                <>
                  <b className="font-medium text-neutral-200">Search Console</b> access requested.
                  Confirms itself when the first data arrives.
                </>,
                choice === "paid" ? (
                  <>
                    <b className="font-medium text-neutral-200">Keyword data:</b> DataForSEO, pay as
                    you go
                  </>
                ) : serpConnected ? (
                  <>
                    <b className="font-medium text-neutral-200">Keyword data:</b> Free mode with
                    SerpApi page-1 checks
                  </>
                ) : (
                  <>
                    <b className="font-medium text-neutral-200">Keyword data:</b> Free mode, Search
                    Console + Google autocomplete
                  </>
                ),
                contentMode === "create" ? (
                  <>
                    <b className="font-medium text-neutral-200">Content home:</b> Claude adds a blog
                    section to your repo in its first setup PR
                  </>
                ) : contentMode === "existing" ? (
                  <>
                    <b className="font-medium text-neutral-200">Content home:</b> your existing
                    section{contentHint ? ` (${contentHint})` : ""}
                  </>
                ) : (
                  <>
                    <b className="font-medium text-neutral-200">Content home:</b> Claude detects
                    where content lives during setup
                  </>
                ),
                <>
                  <b className="font-medium text-neutral-200">Claude Code</b> connects with the
                  setup command above - one paste does connection, secrets, and the pipeline
                </>,
                modeChoice === "auto" ? (
                  <>
                    <b className="font-medium text-neutral-200">Publish mode:</b> Automatic, pages
                    ship themselves once checks pass
                  </>
                ) : (
                  <>
                    <b className="font-medium text-neutral-200">Publish mode:</b> Semi-automatic,
                    you approve ideas and merges
                  </>
                ),
              ].map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 border-b border-neutral-800 py-2 text-[13px] text-neutral-500 last:border-b-0"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </details>
          {created ? <FirstRunStatus slug={created.slug} /> : null}
        </section>
      ) : null}
    </div>
  );
}
