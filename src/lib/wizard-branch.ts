// Which wizard the cloud owner actually walks.
//
// Two facts decide it, and the pre-checkout qualifier already collected both:
// where finished articles go, and which AI writes them. A WordPress owner has
// no repo to install a pipeline into, and someone whose only AI is the
// claude.ai app has no terminal to paste a credential into - so sending either
// of them through "Connect GitHub" and "paste your agent token" is a dead end
// they pay for first. Two paid trials died exactly there in August 2026.
//
// These are pure functions in their own module ON PURPOSE: the wizard is a
// client component and the server action that validates its form both need the
// same answers, and anything importing db.ts or projects.ts here would drag
// the service-role key into the browser bundle. Same reasoning as
// qualifier-options.ts. NOTHING SERVER-ONLY MAY EVER BE IMPORTED HERE.

export type PublishChoice = "github" | "wordpress" | "manual";
export type AiKind = "chat" | "coding";

/** The ai_choice values c0 will accept. A subset of the qualifier's list:
 *  gemini and "none" can't drive this at all, and chatgpt's connector is not
 *  built yet - the qualifier refuses all three before checkout, so a wizard
 *  that accepted them would be creating a project that cannot work. */
export const WIZARD_AI_VALUES = ["claude-web", "claude-code", "codex", "cursor"] as const;

export function isPublishChoice(value: string): value is PublishChoice {
  return value === "github" || value === "wordpress" || value === "manual";
}

/** `allowHosted`: "hosted" (DispatchSEO writes - the cloud autopilot,
 *  2026-10-23) is valid ONLY on cloud. This module is client-safe and cannot
 *  read the deploy mode itself, so server callers pass isCloudMode(); a
 *  self-host form must never store an AI that self-host cannot run. */
export function isWizardAiChoice(value: string, opts: { allowHosted?: boolean } = {}): boolean {
  if (value === "hosted") return opts.allowHosted === true;
  return (WIZARD_AI_VALUES as readonly string[]).includes(value);
}

/** Chat app or coding agent - the only distinction the flow turns on.
 *
 *  Anything unrecognised reads as "coding", which is exactly today's behaviour
 *  for every row that predates ai_choice: those projects walked the GitHub +
 *  agent-token flow, and a legacy project must resume into the same wizard it
 *  left. */
export function aiKind(aiChoice: string | null | undefined): AiKind {
  return aiChoice === "claude-web" || aiChoice === "chatgpt" ? "chat" : "coding";
}

/** The coding agent a choice implies, or null when the AI is a chat app (which
 *  has no builder to run and must not overwrite projects.agent). */
export function agentForAiChoice(
  aiChoice: string | null | undefined,
): "claude" | "codex" | "cursor" | null {
  if (aiChoice === "claude-code") return "claude";
  if (aiChoice === "codex") return "codex";
  if (aiChoice === "cursor") return "cursor";
  return null;
}

/** The screen that connects the site itself, or null when there is nothing to
 *  connect ("manual" places articles by hand, so the flow skips straight to
 *  the AI step). */
export function siteStep(publish: PublishChoice): "c1" | "c1w" | null {
  if (publish === "github") return "c1";
  if (publish === "wordpress") return "c1w";
  return null;
}

/** The screen that connects the AI. Three of them, because the paste differs:
 *  a coding agent on a repo needs a credential stored as a GitHub secret (c2),
 *  the same agent without a repo only needs one connect command (c2a), and a
 *  chat app needs a connector URL pasted into claude.ai (c2c). */
export function aiStep(publish: PublishChoice, kind: AiKind): "c2" | "c2a" | "c2c" {
  if (kind === "chat") return "c2c";
  return publish === "github" ? "c2" : "c2a";
}

/** Where c0 hands off to: the site step when the branch has one, otherwise
 *  straight to the AI step. */
export function firstStepAfterCreate(
  publish: PublishChoice,
  kind: AiKind,
): "c1" | "c1w" | "c2" | "c2a" | "c2c" {
  return siteStep(publish) ?? aiStep(publish, kind);
}
