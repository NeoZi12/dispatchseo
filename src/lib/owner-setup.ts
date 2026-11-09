import { backendBaseUrl } from "./pipeline-pack";
import { getProjectById } from "./projects";
import { getSetupStep, type BranchHint } from "./setup-path";
import type { SetupPhase, SetupStep, StepId, StepKind } from "./setup-path-core";

// Where a customer stands in setup, for the operator's pages. The setup
// path's own engine (setup-path-core.ts) answers "what is the ONE thing in
// front of this customer" from database evidence; this module only asks it
// without the live remote reads [R14] and flattens the answer into the few
// words /owner shows: the phase, step N of M, the step's title, how long
// they have been waiting, and whether it is stuck.

export type SetupProgress = {
  /** Past every step: an article is out. */
  complete: boolean;
  phase: SetupPhase;
  stepId: StepId;
  kind: StepKind;
  title: string;
  why: string;
  /** Position in the connect rail (0-based) and the rail's labels; `index`
   *  equals `total` once the rail is behind them (launch and first-article). */
  index: number;
  total: number;
  labels: string[];
  /** A wait step: since when, and whether it is past its typical time. */
  waitingSince: string | null;
  slow: boolean;
  slowHint: string | null;
  error: string | null;
  deferred: StepId[];
};

export const PHASE_WORDS: Record<SetupPhase, string> = {
  connect: "Connecting their site",
  launch: "Launching the pipeline",
  "first-article": "Waiting for the first article",
  complete: "Set up",
};

/** One or two words for a list cell: "Connecting · 3/6". */
export function setupShort(p: SetupProgress): string {
  const stage = p.phase === "connect" ? "Connecting" : p.phase === "launch" ? "Launching" : "First article";
  return p.index < p.total ? `${stage} · ${p.index + 1}/${p.total}` : stage;
}

export function progressOf(step: SetupStep, now = Date.now()): SetupProgress {
  const since = step.waiting?.since ? Date.parse(step.waiting.since) : NaN;
  const slow = step.waiting != null && Number.isFinite(since) && now - since > step.waiting.slowAfterMs;
  return {
    complete: step.phase === "complete",
    phase: step.phase,
    stepId: step.id,
    kind: step.kind,
    title: step.title,
    why: step.why,
    index: step.rail.index,
    total: step.rail.total,
    labels: step.rail.labels,
    waitingSince: step.waiting?.since ?? null,
    slow,
    slowHint: slow ? step.waiting?.slowHint ?? null : null,
    error: step.error?.message ?? null,
    deferred: step.deferred,
  };
}

/** A site's progress. Null when the project is gone or the engine failed:
 *  the owner's page says nothing rather than something wrong. */
export async function siteSetupProgress(projectId: string, now = Date.now()): Promise<SetupProgress | null> {
  try {
    const project = await getProjectById(projectId);
    if (!project) return null;
    // mcpToken: null - the key must never ride into an operator page.
    const step = await getSetupStep(project, await backendBaseUrl(), { live: false, mcpToken: null });
    return progressOf(step, now);
  } catch {
    return null;
  }
}

/** An account with no site yet: the first step, shaped by what they said at sign-up. */
export async function accountSetupProgress(hint: BranchHint | null, now = Date.now()): Promise<SetupProgress | null> {
  try {
    const step = await getSetupStep(null, await backendBaseUrl(), { live: false, mcpToken: null, branchHint: hint });
    return progressOf(step, now);
  } catch {
    return null;
  }
}
