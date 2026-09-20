// The onboarding wizards' screen ids - shared between the client components
// and the server page that rebuilds resume state. Lives OUTSIDE the
// "use client" modules on purpose: value exports from client modules arrive
// in server components as client references, not real values (the
// `.includes is not a function` crash of 2026-07-21).
// s_gh and s_wp are alternatives for the same step (connect where articles
// get published): a GitHub project pastes a token, a WordPress project
// connects its site (the self-host twin of c1w). Only one is ever walked.
export const SELF_HOST_WIZARD_SCREENS = [
  "s0",
  "s1",
  "s2a",
  "s2b_paid",
  "s2b_free",
  "s3",
  "s3m",
  "s_gh",
  "s_wp",
  "s4b",
  "s5",
] as const;

// Nine ids over the same five steps. c1/c1w are the two ways to connect a
// site (a GitHub repo or a WordPress install) and c2/c2a/c2c the three ways to
// connect an AI (agent + repo, agent without a repo, chat app) - only one of
// each is ever walked, chosen by wizard-branch.ts from what the owner told the
// pre-checkout qualifier. Order here is documentation, not flow: the flow is
// c0 -> siteStep -> aiStep -> c3 -> c4 -> c5.
export const CLOUD_WIZARD_SCREENS = [
  "c0",
  "c1",
  "c1w",
  "c2",
  "c2a",
  "c2c",
  "c3",
  "c4",
  "c5",
] as const;

export const WIZARD_SCREENS = [...SELF_HOST_WIZARD_SCREENS, ...CLOUD_WIZARD_SCREENS] as const;

export type SelfHostWizardScreen = (typeof SELF_HOST_WIZARD_SCREENS)[number];
export type CloudWizardScreen = (typeof CLOUD_WIZARD_SCREENS)[number];
export type WizardScreen = (typeof WIZARD_SCREENS)[number];
