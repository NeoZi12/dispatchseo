import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationFlags } from "@/lib/projects";

// The automations registry: what runs on its own, when, and how each piece
// feeds the next. Evidence lines are derived from data that already exists -
// there is no status-polling infrastructure, and none is wanted.

export type Automation = {
  id: string;
  name: string;
  status: "live" | "coming";
  statusNote?: string;
  what: string;
  schedule: string;
  flow: string[];
  note?: string;
  // Shown in amber on the card while the automation is ON - for the one
  // toggle whose upside (hands-off) carries a real SEO risk worth naming.
  warning?: string;
  staticEvidence?: string;
  // How the owner controls this automation:
  //   { flag }   - toggleable; the flag column on projects it reads/writes
  //   { locked } - always on; the string explains why it can't be disabled
  // Toggling away from a preset flips the topbar mode to "custom"; matching a
  // preset again flips it back to that preset (see modeForFlags).
  control?: { flag: keyof AutomationFlags } | { locked: string };
};

export const AUTOMATIONS: Automation[] = [
  {
    id: "rank-check",
    name: "Nightly rank check",
    status: "live",
    what: "Checks where your site ranks on Google for every tracked keyword and saves the position.",
    schedule: "Every night around 04:00 UTC",
    flow: ["Tracked keywords", "Google search check", "Rank history", "Keywords screen"],
    control: { locked: "Always on - collects data, publishes nothing." },
  },
  {
    id: "traffic-snapshot",
    name: "Nightly traffic snapshot",
    status: "live",
    what: "Pulls yesterday's clicks and impressions from Search Console into the Home graph.",
    schedule: "Every night around 04:00 UTC",
    flow: ["Search Console", "Daily snapshot", "Home graph"],
    control: { locked: "Always on - collects data, publishes nothing." },
  },
  {
    id: "ai-visibility",
    name: "AI visibility check",
    status: "live",
    what: "Tracks whether AI assistants cite your site. Alongside each nightly rank check it looks at whether Google shows an AI answer for your tracked keywords and who that answer cites; a weekly Claude scan asks the questions your customers would ask an AI assistant and records the same.",
    schedule: "Google nightly with the rank check · Claude scan Wednesdays 06:00 UTC",
    flow: ["Tracked keywords", "AI answer check", "Citations saved", "AI visibility on Home"],
    note: "The Google check adds about $0.002 per keyword per day on your DataForSEO account (SerpApi mode gets it free with the weekly rank pull; GSC-only mode skips it). The Claude scan runs on your own Claude subscription.",
    control: { locked: "Always on - collects data, publishes nothing." },
  },
  {
    id: "opportunity-scan",
    name: "Weekly research run",
    status: "live",
    what: "A Claude research agent reads the product as it exists that week, derives keyword ideas from it, validates them through DataForSEO, and queues suggestions.",
    schedule: "Mondays 06:00 UTC",
    flow: ["Fresh product read", "Keyword validation", "Suggestions queue"],
    control: {
      locked:
        "Required - it only fills the queue; the approval and merge gates below decide what happens next.",
    },
  },
  {
    id: "trend-scan",
    name: "Trend radar",
    status: "live",
    what: "Two-stage sweep of your niche. Scan now finds the SUBJECTS being talked about right now - launches, Reddit and Hacker News buzz, Google Trends - and puts them on the radar with evidence, nothing more. Get takes on a subject you pick turns it into 3-5 validated guide angles, pending for your call: add to queue or skip. An approved trend guide jumps to the front of the queue and ships on the next daily build - at most one guide a day, so tomorrow morning at the latest.",
    schedule: "On demand - Scan now on Home or Trends; Get takes per subject",
    flow: ["Scan now", "Subjects on the radar", "Your pick", "Takes + SERP check", "Your call", "Front of the build queue"],
    control: {
      locked: "Manual-only - both stages fire from your clicks and every take waits for your approval.",
    },
  },
  {
    id: "auto-approve",
    name: "Research auto-approval",
    status: "live",
    what: "Approves the research run's ideas the moment they land, so builds start without you. Off means every researched guide and tool idea waits as pending for your call on Home.",
    schedule: "With every research run",
    flow: ["Idea queued", "Auto-approved", "Ready to build"],
    staticEvidence: "Off = the human gate on WHAT gets made. On = the queue feeds itself.",
    control: { flag: "auto_approve" },
  },
  {
    id: "guide-builder",
    name: "Daily guide builder",
    status: "live",
    what: "Builds the guide at the top of your queue into a finished post - template, live SERP gate, bespoke visuals, humanizer voice pass - and opens a PR. Ships at most one guide a day (your own merges count toward the slot), and pauses while any SEO PR is still open, so only one is ever in flight.",
    schedule: "Every morning 05:00 UTC",
    flow: ["Approved guide", "Draft per template", "SERP + quality gate", "Voice pass", "PR", "Auto-merge"],
    control: { flag: "auto_build_guides" },
  },
  {
    id: "tool-builder",
    name: "Tool builder",
    status: "live",
    what: "Builds an approved tool idea into a working page through the tool pipeline. Fires the moment the idea is approved, with a weekly sweep as backup for anything the instant trigger missed.",
    schedule: "On approval, instantly - Wednesday sweep as backup",
    flow: ["Tool idea approved", "Instant build trigger", "Build per template", "PR + live validation", "Auto-merge on pass"],
    control: { flag: "auto_build_tools" },
  },
  {
    id: "tool-validation",
    name: "Tool validation",
    status: "live",
    what: "The functional reviewer for tool PRs: builds the branch for production, exercises the tool in a real browser, and delivers a verdict. A pass authorizes the merge; a fail leaves the PR for you with the concrete failures as a comment.",
    schedule: "On every tool PR",
    flow: ["Tool PR opened", "Production build", "Real browser test", "Verdict on the PR"],
    staticEvidence: "The verdict lands on the PR itself as a label and comment.",
    control: { locked: "Required - the safety gate every tool PR merges through." },
  },
  {
    id: "auto-merge",
    name: "Hands-off publishing",
    status: "live",
    what: "Merges PRs on their own once every automated check has passed - build, preview deploy, code review, and (for tools) the live validation verdict. A pending check waits for the next pass; a failing check leaves the PR for you. Off means green PRs wait for your Merge click on Home.",
    schedule: "The moment checks finish - hourly sweep as backup",
    flow: ["Open PR", "All checks green", "Merged", "Live on the site"],
    staticEvidence: "Off = the human gate on what GOES LIVE. Structural changes always stay yours.",
    warning:
      "With this on, AI-written pages go live without a human ever reading them. Unreviewed publishing at scale is exactly what Google's scaled-content-abuse policy targets - fine for a vacation week or an established site with a track record, risky as the permanent mode on a young one. A 2-minute skim of each PR is the strongest protection your rankings have.",
    control: { flag: "auto_merge" },
  },
  {
    id: "auto-indexing",
    name: "Auto-indexing ping",
    status: "live",
    what: "Tells Bing and Yandex about every new page the moment it ships to the live site.",
    schedule: "On every merged content PR",
    flow: ["PR merged", "Vercel deploy", "IndexNow ping", "Bing / Yandex"],
    staticEvidence:
      "Google ignores IndexNow - each new page instead gets a 'Get it on Google' card under Next actions the day it ships, with a one-paste request-indexing command.",
    control: { locked: "Always on - free, instant, and there is no reason to skip it." },
  },
];

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// One evidence line per automation id. Live ones read the tables the
// automations already write to; coming ones use their static line.
export async function gatherEvidence(
  client: SupabaseClient,
  projectId: string,
): Promise<Record<string, string>> {
  const evidence: Record<string, string> = {};

  const [lastCheck, lastGsc, lastSug, lastGuide, lastTool, lastTrendScan, lastAi] = await Promise.all([
    client
      .from("rank_checks")
      .select("checked_at")
      .eq("project_id", projectId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("gsc_stats")
      .select("date")
      .eq("project_id", projectId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("suggestions")
      .select("created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("pages")
      .select("published_at, pr_url")
      .eq("project_id", projectId)
      .eq("type", "guide")
      .not("pr_url", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("pages")
      .select("published_at, pr_url")
      .eq("project_id", projectId)
      .eq("type", "tool")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("projects")
      .select("last_trend_scan_at")
      .eq("id", projectId)
      .maybeSingle(),
    client
      .from("ai_snapshots")
      .select("checked_at")
      .eq("project_id", projectId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (lastCheck.data?.checked_at) {
    const checkedAt = lastCheck.data.checked_at as string;
    const dayStart = checkedAt.slice(0, 10) + "T00:00:00.000Z";
    const dayCount = await client
      .from("rank_checks")
      .select("keyword_id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("checked_at", dayStart);
    const n = dayCount.count ?? 0;
    evidence["rank-check"] = `Last ran ${shortDate(checkedAt)} - checked ${n} keyword${n === 1 ? "" : "s"}.`;
  } else {
    evidence["rank-check"] = "No runs recorded yet.";
  }

  evidence["traffic-snapshot"] = lastGsc.data?.date
    ? `Latest snapshot is from ${shortDate(lastGsc.data.date as string)}.`
    : "No snapshots recorded yet.";

  evidence["opportunity-scan"] = lastSug.data?.created_at
    ? `Last queued suggestions on ${shortDate(lastSug.data.created_at as string)}.`
    : "No suggestions queued yet.";

  // Tolerates migration 0025 not being applied yet (query error -> no data).
  evidence["ai-visibility"] = lastAi.data?.checked_at
    ? `Last check ${shortDate(lastAi.data.checked_at as string)}.`
    : "No AI checks recorded yet - starts with the next nightly rank check.";

  // Tolerates migration 0013 not being applied yet (query error -> no data).
  evidence["trend-scan"] = lastTrendScan.data?.last_trend_scan_at
    ? `Last scanned ${shortDate(lastTrendScan.data.last_trend_scan_at as string)}.`
    : "No scans yet - hit Scan now on Home or Trends.";

  const prNumber = (url: string) => {
    const n = url.split("/").pop();
    return n && /^\d+$/.test(n) ? ` (PR #${n})` : "";
  };

  // Same UTC-calendar-day test as the pace gate (pacing.ts): a guide shipped
  // today means the daily slot is used and a green-but-idle morning run is
  // expected, not broken - say so instead of leaving the owner guessing.
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const guideShippedToday =
    !!lastGuide.data?.published_at &&
    utcDay(new Date(lastGuide.data.published_at as string)) === utcDay(new Date());
  evidence["guide-builder"] = lastGuide.data?.published_at
    ? `Last guide built ${shortDate(lastGuide.data.published_at as string)}${prNumber(
        (lastGuide.data.pr_url as string | null) ?? "",
      )}.${guideShippedToday ? " Today's slot is used - the next build runs tomorrow morning." : ""}`
    : "No builds logged yet.";

  evidence["tool-builder"] = lastTool.data?.published_at
    ? `Last tool built ${shortDate(lastTool.data.published_at as string)}${prNumber(
        (lastTool.data.pr_url as string | null) ?? "",
      )}.`
    : "No tool builds logged yet - the first run fires on your next approval.";

  for (const a of AUTOMATIONS) {
    if (a.staticEvidence) evidence[a.id] = a.staticEvidence;
  }

  return evidence;
}
