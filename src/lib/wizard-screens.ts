// The onboarding wizards' screen ids - shared between the client components
// and the server page that rebuilds resume state. Lives OUTSIDE the
// "use client" modules on purpose: value exports from client modules arrive
// in server components as client references, not real values (the
// `.includes is not a function` crash of 2026-07-21).
export const SELF_HOST_WIZARD_SCREENS = [
  "s0",
  "s1",
  "s2a",
  "s2b_paid",
  "s2b_free",
  "s3",
  "s3m",
  "s_gh",
  "s4b",
  "s5",
] as const;

export const CLOUD_WIZARD_SCREENS = ["c0", "c1", "c2", "c3", "c4", "c5"] as const;

export const WIZARD_SCREENS = [...SELF_HOST_WIZARD_SCREENS, ...CLOUD_WIZARD_SCREENS] as const;

export type SelfHostWizardScreen = (typeof SELF_HOST_WIZARD_SCREENS)[number];
export type CloudWizardScreen = (typeof CLOUD_WIZARD_SCREENS)[number];
export type WizardScreen = (typeof WIZARD_SCREENS)[number];
