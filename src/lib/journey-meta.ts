// The journey's stage vocabulary, split from journey.ts so client components
// (the onboarding wizard) can import the copy without dragging in db.ts.
// Pure data - no imports, safe in any bundle. The words live in ONE place so
// the wizard, the Home card, and get_overview all tell the same story.

export type JourneyStageKey =
  | "setup"
  | "foundation"
  | "first_signals"
  | "traction"
  | "compounding";

// months/startMonth describe when a stage TYPICALLY happens - the stage
// itself is derived from real data, so a site can run ahead of (or behind)
// this timeline. Consumers must present the months as the typical schedule,
// never as a claim about where the site is now (see pace_note in journey.ts).
export const STAGE_META: Record<
  JourneyStageKey,
  { label: string; months: string | null; startMonth: number | null; expectation: string }
> = {
  setup: {
    label: "Set up",
    months: null,
    startMonth: null,
    expectation:
      "Google Search Console isn't delivering data yet, so progress can't be measured. Finish the Connect Search Console step on Home - everything below starts there.",
  },
  foundation: {
    label: "Foundation",
    months: "months 1-2",
    startMonth: 1,
    expectation:
      "Content is being built and indexed. Impressions typically start moving around month 2-3.",
  },
  first_signals: {
    label: "First signals",
    months: "month 3",
    startMonth: 3,
    expectation:
      "Google is showing your pages in search results. Clicks usually follow within weeks.",
  },
  traction: {
    label: "Earning clicks",
    months: "months 4-7",
    startMonth: 4,
    expectation: "Pages are earning clicks. The compounding phase starts here.",
  },
  compounding: {
    label: "Compounding",
    months: "months 6-12+",
    startMonth: 6,
    expectation:
      "Authority is building. Every new guide starts from a stronger base.",
  },
};

// The "setup" stage covers two very different situations, and only one of
// them needs the owner. When the connection verifiably works (the readiness
// probe answers ok) but Google has no rows yet - normal for a young site,
// reports lag ~2 days - the banner must say so instead of sending the owner
// to redo a finished step. getJourney swaps this in for that case.
export const SETUP_WAITING_EXPECTATION =
  "Search Console is connected and answering - Google just hasn't recorded any search activity for this site yet. That's normal early on: reports lag about two days, and pages need to appear in searches before there's anything to report. Nothing here needs you; this fills in on its own.";

// The visible timeline, in order. "setup" is deliberately absent - it's a
// wiring problem, not a stage of the journey.
export const JOURNEY_STAGES: JourneyStageKey[] = [
  "foundation",
  "first_signals",
  "traction",
  "compounding",
];
