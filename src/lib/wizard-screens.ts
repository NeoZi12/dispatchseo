// The onboarding wizard's screen ids - shared between the client component
// and the server page that rebuilds resume state. Lives OUTSIDE the
// "use client" module on purpose: value exports from client modules arrive
// in server components as client references, not real values (the
// `.includes is not a function` crash of 2026-07-21).
export const WIZARD_SCREENS = [
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

export type WizardScreen = (typeof WIZARD_SCREENS)[number];
