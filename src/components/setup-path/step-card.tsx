"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { Instruction, SetupStep, StepId } from "@/lib/setup-path-core";
import { isBuilderAgent, projectAgent, type AgentId } from "@/lib/agents";
import { PixelDesk } from "@/components/pixel-dispatcher";
import { CopyBlock } from "@/components/client";
import { CopyBox, ErrorLine, StepHelp } from "@/components/wizard-ui";
import { WordPressConnect, type WordPressStatus } from "@/components/wordpress-connect";
import {
  completeConnectPhase,
  deferSetupStep,
  retryResearchFromPath,
  retrySetupFromPath,
  runPipelineInstallFromPath,
} from "@/app/setup-actions";
import { useSetupStep, stageKey } from "./use-setup-step";
import { GENERIC_GITHUB_FLAG } from "@/lib/flag-text";
import { SetupRail } from "./rail";
import { ElapsedLine, WaitBody } from "./wait-state";
import { DoneBeat, DoneEmblem } from "./done-beat";
import { SiteForm, type SiteQualifier } from "./forms/site-form";
import { RepoPick } from "./forms/repo-pick";
import { GscPropertyPick } from "./forms/gsc-property-pick";
import { AgentCredentialForm } from "./forms/agent-credential";
import {
  CommandCopy,
  CopyPrimary,
  ExternalArrow,
  PasteText,
  PreviewToast,
  RichText,
  SetupPreviewContext,
  Spinner,
  primaryBtn,
  useReducedMotionSafe,
} from "./shared";

// <SetupStepCard>: the ONE action in front of the customer.
//
// Same component full-screen on /onboarding (mode "screen", connect phase)
// and as the hero card on Home (mode "hero", launch + first-article). It
// renders whatever single step the server engine (setup-path-core.ts)
// computed - it never decides what comes next, it only shows the step, runs
// the step's one action, and asks the server again.
//
// Order, top to bottom, and nothing else: rail · mascot · title · why ·
// instructions · the one primary · evidence line · "I'll do this later".

export type SetupStepCardProps = {
  /** The step the server computed for this render. Later steps arrive by
   *  polling /api/setup/step, or by the page re-rendering with a new one. */
  step: SetupStep;
  mode: "screen" | "hero";
  /** null only on the `site` step, before the project exists. */
  slug: string | null;
  origin: string;
  /** The project's coding agent (projects.agent). Drives the connect command
   *  and the credential form. Defaults to Claude Code. */
  agentId?: AgentId | string | null;
  /** The project's MCP key, for the agent_connect command. When omitted it is
   *  read off the step's copy payload (the engine puts the MCP address there). */
  token?: string | null;
  /** WordPress connection, in <WordPressConnect>'s shape. */
  wp?: WordPressStatus | null;
  /** Live installation repo list, for the github_repo / let_us_publish pick. */
  repos?: string[] | null;
  /** Live Search Console property list, for the gsc_property pick. */
  gscSites?: string[] | null;
  gscSiteUrl?: string | null;
  /** The latest signup qualifier answers, for the `site` step's summary line. */
  qualifier?: SiteQualifier;
  prefillDomain?: string | null;
  /** Callback flags off the URL (?gh=error&msg=…, ?connected=1 | ?error=…). */
  ghFlag?: string | null;
  ghError?: string | null;
  gscFlag?: string | null;
  /** Called after an action lands on a step that renders server-loaded props
   *  (SERVER_PROP_STEPS). Default: router.refresh(), so the repo list,
   *  property list or WordPress status follow. Other steps refresh live only. */
  onRefresh?: () => void;
  /** The server clock the step was computed with (elapsed lines anchor to it). */
  serverNow?: number;
  /** Dev preview: nothing is saved, nothing polls, nothing navigates. */
  preview?: boolean;
};

const EMPTY_WP: WordPressStatus = {
  connected: false, url: null, username: null, seoPlugin: null, canPublish: false, canUploadMedia: false,
};

const GITHUB_STEPS = new Set<StepId>(["github_app", "github_repo", "let_us_publish", "reconnect_app"]);
/** Form steps whose card renders server-loaded props (the installation repo
 *  list, the property list, the WordPress status): only these need a server
 *  re-render after an action. Everywhere else a router.refresh() would hand
 *  the card a cheap-pass `initial` step that can lag the live one, and the
 *  hero would flip back to the step the owner just finished. */
const SERVER_PROP_STEPS = new Set<StepId>(["github_repo", "let_us_publish", "gsc_property", "wordpress"]);
const GOOGLE_STEPS = new Set<StepId>(["google_connect", "gsc_property"]);

const HELP: Partial<Record<StepId, { href: string; label: string }>> = {
  github_app: { href: "/docs/setup-wizard#on-dispatchseo-com-the-hosted-version", label: "What does the GitHub App do?" },
  let_us_publish: { href: "/docs/setup-wizard#on-dispatchseo-com-the-hosted-version", label: "What does the GitHub App do?" },
  wordpress: { href: "/docs/setup-wizard", label: "Walk me through this" },
  agent_connect: { href: "/docs/connect-your-site", label: "What does this command do?" },
  chat_connect: { href: "/docs/connect-your-site", label: "Walk me through this" },
  google_connect: { href: "/docs/search-console", label: "Walk me through Search Console" },
  gsc_property: { href: "/docs/search-console", label: "Walk me through Search Console" },
  connected: { href: "/docs/day-to-day", label: "What happens next?" },
};

const PARKED_LINE = "Parked. It'll come back as your next step on Home.";

const spring = { type: "spring" as const, stiffness: 260, damping: 24 };

function tokenFromPrimary(step: SetupStep): string | null {
  if (step.primary.kind !== "copy") return null;
  try {
    return new URL(step.primary.text).searchParams.get("key");
  } catch {
    return null;
  }
}

function humanFlag(flag: string): string {
  return flag.replace(/[_-]+/g, " ");
}

export function SetupStepCard(props: SetupStepCardProps) {
  const { mode, origin, preview = false } = props;
  const reduced = useReducedMotionSafe();
  const router = useRouter();

  const [slug, setSlug] = useState<string | null>(props.slug);
  useEffect(() => setSlug(props.slug), [props.slug]);

  const { step, celebrating, refresh } = useSetupStep(preview ? null : slug, props.step, { poll: !preview });

  const normalizedAgent = (id: string | null | undefined): AgentId => (isBuilderAgent(id) ? id : "claude");
  const [agentId, setAgentId] = useState<AgentId>(normalizedAgent(props.agentId));
  useEffect(() => setAgentId(normalizedAgent(props.agentId)), [props.agentId]);

  // Preview: a toast instead of a save.
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashPreview = useCallback(() => {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 1800);
  }, []);

  const afterChange = useCallback(() => {
    if (preview) return;
    void refresh();
    if (!SERVER_PROP_STEPS.has(step.id)) return;
    if (props.onRefresh) props.onRefresh();
    else router.refresh();
  }, [preview, refresh, props, router, step.id]);

  // The new project's slug arrives from the site form; ask the server for
  // its first step right away instead of waiting for the page to re-render.
  const hadSlug = useRef(props.slug != null);
  useEffect(() => {
    if (slug && !hadSlug.current && !preview) {
      hadSlug.current = true;
      void refresh();
    }
  }, [slug, preview, refresh]);

  // ---- the step's server actions -----------------------------------------
  const [actionPending, startAction] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const runAction = useCallback(
    (action: "run_pipeline_install" | "retry_setup" | "retry_research") => {
      if (preview) return flashPreview();
      if (!slug) {
        setActionError("Lost track of which site this is - reload the page.");
        return;
      }
      setActionError(null);
      startAction(async () => {
        try {
          const res =
            action === "run_pipeline_install"
              ? await runPipelineInstallFromPath(slug)
              : action === "retry_setup"
                ? await retrySetupFromPath(slug)
                : await retryResearchFromPath(slug);
          if ("error" in res) {
            const reason = "reason" in res && res.reason ? res.reason : null;
            setActionError(reason ? `${res.error} ${reason}` : res.error);
          } else {
            afterChange();
          }
        } catch {
          setActionError("That didn't go through. Try again in a moment.");
        }
      });
    },
    [preview, flashPreview, slug, afterChange],
  );

  // Pipeline install auto-fire [R10]: only when the server says no attempt
  // was ever stamped (primary.autoFire) AND this mount has
  // not fired yet. A remount after a failed attempt finds autoFire false, so
  // it shows the error and the Retry button instead of firing again.
  const fired = useRef(false);
  useEffect(() => {
    if (preview || !slug || fired.current) return;
    if (step.id !== "pipeline_install" || step.primary.kind !== "action") return;
    if (step.primary.autoFire !== true) return;
    fired.current = true;
    runAction("run_pipeline_install");
  }, [step, preview, slug, runAction]);

  // ---- "I'll do this later" ------------------------------------------------
  const [parked, setParked] = useState(false);
  const [deferError, setDeferError] = useState<string | null>(null);
  const [deferring, startDefer] = useTransition();
  const key = stageKey(step);
  useEffect(() => {
    setParked(false);
    setDeferError(null);
    setActionError(null);
  }, [key]);

  const park = useCallback(
    (ids: StepId[]) => {
      setDeferError(null);
      if (preview) {
        setParked(true);
        return;
      }
      if (!slug) return;
      startDefer(async () => {
        try {
          for (const id of ids) {
            const res = await deferSetupStep(slug, id);
            if ("error" in res) {
              setDeferError(res.error);
              return;
            }
          }
          setParked(true);
          // Let the confirmation line read before the next step comes in.
          setTimeout(() => void refresh({ quiet: true }), 1400);
        } catch {
          setDeferError("Couldn't park this just now. Try again.");
        }
      });
    },
    [preview, slug, refresh],
  );

  // ---- "You're connected" -> stamp the connect phase, then Home ----------
  const [leaving, startLeave] = useTransition();
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const finishConnect = useCallback(() => {
    if (preview) return flashPreview();
    if (!slug) return;
    setLeaveError(null);
    startLeave(async () => {
      try {
        const res = await completeConnectPhase(slug);
        // `connected: true` = the phase IS stamped and only the pipeline
        // install inside it failed. Staying here would trap the owner on a
        // screen whose button now does nothing; Home's hero shows that
        // failed install with its Retry.
        if ("error" in res && !res.connected) setLeaveError(res.error);
        else window.location.assign("/dashboard");
      } catch {
        setLeaveError("That didn't go through. Try again in a moment.");
      }
    });
  }, [preview, flashPreview, slug]);

  // ---- preview: swallow submits and same-tab navigation -------------------
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!preview || !el) return;
    // Capture phase on an ancestor of every form: stopping it here means the
    // event never bubbles back to React's root listener, so no server action
    // is dispatched. The preview runs against the live database.
    const onSubmit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      flashPreview();
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      e.preventDefault();
      flashPreview();
    };
    el.addEventListener("submit", onSubmit, true);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("submit", onSubmit, true);
      el.removeEventListener("click", onClick, true);
    };
  }, [preview, flashPreview]);

  // ---- render ---------------------------------------------------------------
  const isWait = step.kind === "wait";
  const hero = mode === "hero";
  const showRail = !hero && step.phase === "connect" && step.rail.total > 0;

  const flagError =
    props.ghFlag === "error" && GITHUB_STEPS.has(step.id)
      ? props.ghError
        ? `GitHub connection failed: ${props.ghError}`
        : GENERIC_GITHUB_FLAG
      : props.gscFlag && props.gscFlag !== "connected" && GOOGLE_STEPS.has(step.id)
        ? `Google connection failed: ${humanFlag(props.gscFlag)}`
        : null;

  const glow = isWait && !reduced;

  const content = (
    <StepContent
      step={step}
      hero={hero}
      reduced={reduced}
      slug={slug}
      origin={origin}
      agentId={agentId}
      token={props.token ?? tokenFromPrimary(step)}
      wp={props.wp ?? EMPTY_WP}
      repos={props.repos ?? null}
      gscSites={props.gscSites ?? null}
      gscSiteUrl={props.gscSiteUrl ?? null}
      qualifier={props.qualifier ?? null}
      prefillDomain={props.prefillDomain ?? null}
      serverNow={props.serverNow}
      preview={preview}
      celebrating={celebrating}
      flagError={flagError}
      actionPending={actionPending}
      actionError={actionError}
      runAction={runAction}
      leaving={leaving}
      leaveError={leaveError}
      finishConnect={finishConnect}
      parked={parked}
      deferring={deferring}
      deferError={deferError}
      park={park}
      afterChange={afterChange}
      onSiteCreated={(s) => {
        setSlug(s);
        afterChange();
      }}
      onAgentChange={setAgentId}
      onAgentSaved={() => void refresh({ quiet: true })}
    />
  );

  const motionProps = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.15 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
      }
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0, transition: spring },
        exit: { opacity: 0, y: -16, transition: { duration: 0.18 } },
      };

  return (
    <SetupPreviewContext.Provider value={preview}>
      <div ref={rootRef} className={`mx-auto w-full ${hero ? "max-w-3xl" : "max-w-xl"}`}>
        {showRail ? (
          <SetupRail rail={step.rail} deferred={step.deferred} allDone={step.kind === "done"} reduced={reduced} />
        ) : null}

        {/* The cropped desk scene, not the full 4:1 dispatcher: at card
            width the full scene is a thin strip with a tiny agent. PixelDesk
            is the dispatcher's "working" state (it starts seated and loops),
            and paints one still frame under prefers-reduced-motion. */}
        {hero ? null : <PixelDesk className="mx-auto mb-5 w-[140px]" variant={agentId} />}

        <div
          className={`relative rounded-2xl border bg-gradient-to-b from-neutral-900/90 to-neutral-950/80 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)] transition-colors duration-500 ${
            hero ? "p-5 sm:p-7" : "px-5 py-7 sm:px-9 sm:py-9"
          } ${isWait ? "border-violet-500/35" : step.kind === "done" ? "border-emerald-400/25" : "border-neutral-800"}`}
        >
          {/* The wait state's breathing glow. The shadow is painted once on
              its own layer and only its OPACITY animates (0.15 -> 0.35
              alpha), so the loop stays on the compositor instead of
              repainting the whole card 60 times a second. */}
          {isWait ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_0_0_1px_rgba(139,92,246,0.35),0_0_64px_-10px_rgba(139,92,246,0.35)]"
              initial={{ opacity: 0.43 }}
              animate={glow ? { opacity: [0.43, 1] } : { opacity: 0.6 }}
              transition={glow ? { duration: 3, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : { duration: 0.3 }}
            />
          ) : null}
          {/* A faint top highlight: the card catches light from above. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
          />
          {hero ? (
            <div className="flex gap-6">
              {/* PixelDesk, not the full dispatcher: at 96 px the full 4:1
                  scene is a 24 px sliver, and the hero renders on every Home
                  visit, where the walk-in replay is noise (PixelDesk starts
                  seated). Same scene, cropped to the desk. */}
              <div className="hidden w-24 shrink-0 pt-1 sm:block">
                <PixelDesk className="w-24" variant={agentId} />
              </div>
              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait">
                  <motion.section key={key} {...motionProps}>
                    {content}
                  </motion.section>
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.section key={key} {...motionProps}>
                {content}
              </motion.section>
            </AnimatePresence>
          )}
          <PreviewToast show={toast} />
        </div>
      </div>
    </SetupPreviewContext.Provider>
  );
}

// ---------------------------------------------------------------------------

type ContentProps = {
  step: SetupStep;
  hero: boolean;
  reduced: boolean;
  slug: string | null;
  origin: string;
  agentId: AgentId;
  token: string | null;
  wp: WordPressStatus;
  repos: string[] | null;
  gscSites: string[] | null;
  gscSiteUrl: string | null;
  qualifier: SiteQualifier;
  prefillDomain: string | null;
  serverNow?: number;
  preview: boolean;
  celebrating: boolean;
  flagError: string | null;
  actionPending: boolean;
  actionError: string | null;
  runAction: (a: "run_pipeline_install" | "retry_setup" | "retry_research") => void;
  leaving: boolean;
  leaveError: string | null;
  finishConnect: () => void;
  parked: boolean;
  deferring: boolean;
  deferError: string | null;
  park: (ids: StepId[]) => void;
  afterChange: () => void;
  onSiteCreated: (slug: string) => void;
  onAgentChange: (id: AgentId) => void;
  onAgentSaved: () => void;
};

type Row = { ins: Instruction; tone: "step" | "note" | "caution" | "detail" | "skip" };

function StepContent(p: ContentProps) {
  const { step, hero, reduced } = p;
  const align = hero ? "text-left" : "text-center";
  const isWait = step.kind === "wait";
  const isDone = step.kind === "done";

  // The copy payload (what the primary copies) and where it sits.
  const payloadText = step.primary.kind === "copy" ? step.primary.text : null;
  const ownInstructions = step.id === "agent_credential" && step.primary.kind === "form";

  const rows: Row[] = ownInstructions
    ? []
    : step.instructions
        .filter((i) => !(payloadText && i.copy === payloadText))
        .map((i): Row => {
          if (i.detail) return { ins: i, tone: "detail" };
          if (i.text === "Skip, connect later") return { ins: i, tone: "skip" };
          if (/^This address is a password/.test(i.text)) return { ins: i, tone: "caution" };
          if (!isDone && i.text.includes("?")) return { ins: i, tone: "note" };
          return { ins: i, tone: "step" };
        });
  const steps = rows.filter((r) => r.tone === "step").map((r) => r.ins);
  const numbered = steps.length >= 2 && !isDone;

  // Payload: rendered inside the instruction that introduces it ("…paste
  // this as the URL:", "Paste this command…"), or after the list.
  let anchor = -1;
  steps.forEach((s, i) => {
    if (/:\s*$/.test(s.text) || /this command/i.test(s.text)) anchor = i;
  });

  const payload = renderPayload(p);
  const fix = step.error?.fixHref ? step.error : null;
  const help = HELP[step.id];

  return (
    <div className={align}>
      {step.meanwhile ? (
        <div className={`mb-5 flex ${hero ? "justify-start" : "justify-center"}`}>
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/[0.07] px-3 py-1 text-xs text-violet-200">
            <Spinner className="h-3 w-3 shrink-0 text-violet-300" />
            <span className="truncate">
              <span className="text-violet-300/70">In the background:</span> {step.meanwhile}
            </span>
          </span>
        </div>
      ) : hero ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-300/80">
          {isWait ? "Working on it" : isDone ? "Done" : "Your next step"}
        </p>
      ) : null}

      {isDone ? <DoneEmblem reduced={reduced} align={hero ? "left" : "center"} /> : null}

      {hero ? (
        <h2 className="break-words text-2xl font-semibold tracking-tight text-neutral-50 [text-wrap:balance]">{step.title}</h2>
      ) : (
        <h1 className="break-words text-3xl font-semibold tracking-tight text-neutral-50 [text-wrap:balance]">{step.title}</h1>
      )}
      {step.why ? (
        <p className={`mt-2 break-words text-[15px] leading-relaxed text-neutral-400 [text-wrap:pretty] ${hero ? "" : "mx-auto max-w-md"}`}>
          {step.why}
        </p>
      ) : null}
      {isWait && step.waiting ? <ElapsedLine waiting={step.waiting} serverNow={p.serverNow} className="mt-3" /> : null}

      {help && !isWait ? (
        <div className={`mt-4 ${hero ? "" : "flex justify-center"}`}>
          <StepHelp href={help.href} label={help.label} />
        </div>
      ) : (
        <div className="h-5" />
      )}

      {/* ---- instructions ---- */}
      {steps.length ? (
        numbered ? (
          <ol className={`mb-6 max-w-lg space-y-3.5 text-left ${hero ? "" : "mx-auto"}`}>
            {steps.map((ins, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-xs font-semibold text-violet-200">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2.5 break-words">
                  <InstructionText ins={ins} />
                  {ins.copy && ins.copy !== payloadText ? <CopyBox text={ins.copy} /> : null}
                  {i === anchor ? payload : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className={`mb-6 space-y-3 ${hero ? "" : "mx-auto max-w-lg"}`}>
            {steps.map((ins, i) => (
              <div key={i} className="min-w-0 space-y-2.5">
                <p className="break-words text-[15px] leading-relaxed text-neutral-300">
                  <InstructionText ins={ins} />
                </p>
                {ins.copy && ins.copy !== payloadText ? <CopyBox text={ins.copy} /> : null}
                {i === anchor ? <div className="text-left">{payload}</div> : null}
              </div>
            ))}
          </div>
        )
      ) : null}
      {anchor < 0 && payload ? <div className={`mb-6 text-left ${hero ? "" : "mx-auto max-w-lg"}`}>{payload}</div> : null}

      {/* ---- notes: cautions, questions, collapsed help ---- */}
      {rows.some((r) => r.tone !== "step" && r.tone !== "skip") ? (
        <div className={`mb-6 space-y-2.5 text-left ${hero ? "" : "mx-auto max-w-lg"}`}>
          {rows.map((r, i) =>
            r.tone === "caution" ? (
              <p key={i} className="flex gap-2.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-200/90">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden>
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <span className="min-w-0 break-words">{r.ins.text}</span>
              </p>
            ) : r.tone === "note" ? (
              <p key={i} className="text-[13px] leading-relaxed text-neutral-500">
                <InstructionText ins={r.ins} quiet />
              </p>
            ) : r.tone === "detail" ? (
              <details key={i} className="group rounded-xl border border-neutral-800 bg-neutral-950/50 px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-neutral-300 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 break-words">{r.ins.text}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180" aria-hidden>
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <p className="mt-2.5 break-words text-[13px] leading-relaxed text-neutral-400">{r.ins.detail}</p>
              </details>
            ) : null,
          )}
        </div>
      ) : null}

      {/* ---- errors ---- */}
      {p.flagError || step.error || p.actionError || p.leaveError ? (
        <div className={`mb-5 space-y-2 text-left ${hero ? "" : "mx-auto max-w-lg"}`}>
          {p.flagError ? <ErrorLine msg={p.flagError} /> : null}
          {step.error ? <ErrorLine msg={step.error.message} /> : null}
          {p.actionError ? <ErrorLine msg={p.actionError} /> : null}
          {p.leaveError ? <ErrorLine msg={p.leaveError} /> : null}
        </div>
      ) : null}

      {/* ---- the one primary (or the done beat that replaces it) ---- */}
      <AnimatePresence mode="wait" initial={false}>
        {p.celebrating ? (
          <motion.div
            key="beat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1 }}
            className={`flex ${hero ? "justify-start" : "justify-center"}`}
          >
            <DoneBeat reduced={reduced} />
          </motion.div>
        ) : (
          <motion.div
            key="primary"
            exit={reduced ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
          >
            {fix ? (
              <PrimaryRow hero={hero}>
                <PrimaryLink href={fix.fixHref!} label={fix.fixLabel ?? "Fix it"} />
              </PrimaryRow>
            ) : (
              renderPrimary(p)
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- evidence ---- */}
      {!isWait && !isDone && step.evidence ? (
        <p className={`mt-5 flex items-center gap-2 text-[13px] text-neutral-500 ${hero ? "justify-start" : "justify-center"}`}>
          {step.polls ? (
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              {reduced ? null : <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />}
              <span className="relative h-2 w-2 rounded-full bg-emerald-400/80" />
            </span>
          ) : null}
          <span className="min-w-0 break-words [text-wrap:pretty]">{step.evidence}</span>
        </p>
      ) : null}

      {isWait ? (
        <div className="mt-2">
          <WaitBody step={step} serverNow={p.serverNow} reduced={reduced} align={hero ? "left" : "center"} />
        </div>
      ) : null}

      {/* ---- "Skip, connect later" (gsc_property with no properties) ---- */}
      {rows.some((r) => r.tone === "skip") && !p.parked ? (
        <div className={`mt-4 ${hero ? "" : "text-center"}`}>
          <button
            type="button"
            disabled={p.deferring}
            // Parks Google as a whole: with Google connected, a parked
            // google_connect alone is already "done" and would be dropped,
            // so the property pick is parked with it [see report].
            onClick={() => p.park(["google_connect", "gsc_property"])}
            className="cursor-pointer text-sm font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline disabled:opacity-50"
          >
            Skip, connect later
          </button>
        </div>
      ) : null}

      {/* ---- deferral ---- */}
      {step.deferrable && !p.celebrating ? (
        <div className={`mt-6 min-h-[1.5rem] ${hero ? "" : "text-center"}`}>
          <AnimatePresence mode="wait" initial={false}>
            {p.parked ? (
              <motion.p
                key="parked"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={reduced ? { duration: 0.15 } : spring}
                className="text-sm text-neutral-300"
                role="status"
              >
                {PARKED_LINE}
              </motion.p>
            ) : (
              <motion.button
                key="later"
                type="button"
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                disabled={p.deferring}
                onClick={() => p.park([step.id])}
                className="cursor-pointer text-sm text-neutral-500 underline-offset-4 transition-colors hover:text-neutral-300 hover:underline disabled:opacity-50"
              >
                {p.deferring ? "Parking…" : "I'll do this later"}
              </motion.button>
            )}
          </AnimatePresence>
          {p.deferError ? <p className="mt-2 text-xs text-red-400">{p.deferError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function InstructionText({ ins, quiet }: { ins: Instruction; quiet?: boolean }) {
  if (!ins.href) return <RichText text={ins.text} />;
  const external = ins.external || /^https?:/.test(ins.href);
  return (
    <a
      href={ins.href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`underline underline-offset-4 transition-colors [&>svg]:ml-1 [&>svg]:inline [&>svg]:align-[-1px] ${
        quiet
          ? "text-neutral-400 decoration-neutral-700 hover:text-neutral-200"
          : "text-violet-200 decoration-violet-400/40 hover:text-violet-100 hover:decoration-violet-300"
      }`}
    >
      <RichText text={ins.text} />
      {external ? <ExternalArrow /> : null}
    </a>
  );
}

function PrimaryRow({ hero, children }: { hero: boolean; children: ReactNode }) {
  return <div className={`flex ${hero ? "justify-start" : "justify-center"}`}>{children}</div>;
}

function PrimaryLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={primaryBtn}
    >
      {label}
      {external ? <ExternalArrow /> : <span aria-hidden>→</span>}
      {external ? <span className="sr-only">(opens in a new tab)</span> : null}
    </a>
  );
}

/** The thing the copy primary copies, shown in place. */
function renderPayload(p: ContentProps): ReactNode {
  const { step } = p;
  if (step.primary.kind !== "copy") return null;
  if (step.id === "agent_connect") {
    // The engine carries the MCP address; the command is built here from the
    // project's own agent [R22] - never AgentConnectTabs, which defaults to
    // the first agent and would hand a Codex owner `claude mcp add`.
    if (p.slug && p.token) {
      const agent = projectAgent({ agent: p.agentId });
      return (
        <CommandCopy
          bash={agent.connect.mcpAddBash(p.slug, p.origin, p.token)}
          powershell={agent.connect.mcpAddPowershell(p.slug, p.origin, p.token)}
        />
      );
    }
    return <CopyBox text={step.primary.text} emphasis />;
  }
  if (step.id === "chat_connect") return <CopyBlock text={step.primary.text} />;
  return <PasteText text={step.primary.text} />;
}

function renderPrimary(p: ContentProps): ReactNode {
  const { step, hero } = p;
  const pr = step.primary;
  switch (pr.kind) {
    case "none":
      return null;
    case "link": {
      if (step.id === "connected") {
        return (
          <PrimaryRow hero={hero}>
            <button type="button" onClick={p.finishConnect} disabled={p.leaving} className={primaryBtn}>
              {p.leaving ? (
                <>
                  <Spinner /> Opening your dashboard…
                </>
              ) : (
                <>
                  {pr.label} <span aria-hidden>→</span>
                </>
              )}
            </button>
          </PrimaryRow>
        );
      }
      // GitHub / Google redirect back here, so they open in the same tab;
      // anything the engine marks external (a PR, a settings page, a doc)
      // opens a new one and the poll notices when it is done.
      return (
        <PrimaryRow hero={hero}>
          <PrimaryLink href={pr.href} label={pr.label} external={pr.external} />
        </PrimaryRow>
      );
    }
    case "copy":
      // agent_connect's CopyBox emphasis already carries the violet Copy.
      if (step.id === "agent_connect") return null;
      return (
        <PrimaryRow hero={hero}>
          <CopyPrimary text={pr.text} label={pr.label} />
        </PrimaryRow>
      );
    case "action": {
      // An install attempt stamped under two minutes ago with no error yet
      // is still in flight (often in another tab): show it running rather
      // than offering a second click.
      const inFlight = pr.action === "run_pipeline_install" && pr.autoFire === false && !step.error;
      const busy = p.actionPending || inFlight;
      return (
        <PrimaryRow hero={hero}>
          <button type="button" onClick={() => p.runAction(pr.action)} disabled={busy} className={primaryBtn}>
            {busy ? (
              <>
                <Spinner />
                {pr.action === "run_pipeline_install" ? "Installing…" : "Starting…"}
              </>
            ) : (
              pr.label
            )}
          </button>
        </PrimaryRow>
      );
    }
    case "form":
      return renderForm(p, pr.form, pr.label);
  }
}

function renderForm(p: ContentProps, form: "site" | "wordpress" | "agent_credential" | "github_repo" | "gsc_property", label: string): ReactNode {
  const { step } = p;
  const wrap = (node: ReactNode) => <div className={`text-left ${p.hero ? "" : "mx-auto max-w-lg"}`}>{node}</div>;
  if (form === "site") {
    return wrap(
      <SiteForm qualifier={p.qualifier} prefillDomain={p.prefillDomain} preview={p.preview} onCreated={p.onSiteCreated} />,
    );
  }
  if (!p.slug) return <ErrorLine msg="Lost track of which site this is - reload the page." />;
  if (form === "wordpress") {
    return wrap(<WordPressConnect status={p.wp} slug={p.slug} onConnected={p.afterChange} buttonClassName={primaryBtn} />);
  }
  if (form === "agent_credential") {
    return wrap(
      <AgentCredentialForm
        slug={p.slug}
        agentId={p.agentId}
        instructions={step.instructions}
        onAgentChange={p.onAgentChange}
        onAgentSaved={p.onAgentSaved}
        onSaved={p.afterChange}
      />,
    );
  }
  if (form === "github_repo") {
    return wrap(
      <RepoPick
        slug={p.slug}
        repos={p.repos}
        label={label}
        installHref={`/api/github/install/start?slug=${encodeURIComponent(p.slug)}`}
        onChosen={p.afterChange}
      />,
    );
  }
  // gsc_property
  if (p.gscSites && p.gscSites.length) {
    return wrap(<GscPropertyPick slug={p.slug} sites={p.gscSites} current={p.gscSiteUrl} onSaved={p.afterChange} />);
  }
  return (
    <PrimaryRow hero={p.hero}>
      <a href="" className={primaryBtn}>
        Reload the property list
      </a>
    </PrimaryRow>
  );
}
