import { db } from "./db";
import { FREE_BACKLINKS, PAID_BACKLINKS } from "./playbook-data";

// The Home page's "what has the manager been doing" report, derived entirely
// from timestamps already stored on the operational tables - no event log to
// maintain. Today = since UTC midnight (the project runs on UTC), week = last
// 7 days. Today reads as a granular checklist (each publish/approval named);
// the week column aggregates into counts so it stays scannable.

export type ActivityLine = { label: string };
export type ActivityReport = { today: ActivityLine[]; week: ActivityLine[] };

const PLAYBOOK_NAMES = new Map(
  [...FREE_BACKLINKS, ...PAID_BACKLINKS].map((i) => [i.slug, i.name]),
);

type PageRow = { title: string | null; type: string | null; created_at: string };
type SugRow = {
  title: string;
  type: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  completed_at: string | null;
};
type StampRow = { created_at: string };
type CheckRow = { checked_at: string };
type PlaybookRow = { slug: string; status: string; done_at: string | null };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function getActivityReport(projectId: string): Promise<ActivityReport> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const wk = weekStart.toISOString();

  const client = db();
  const [pagesRes, sugRes, kwRes, checksRes, prospectsRes, gscRes, playbookRes] =
    await Promise.all([
      client
        .from("pages")
        .select("title, type, created_at")
        .eq("project_id", projectId)
        .gte("created_at", wk),
      client
        .from("suggestions")
        .select("title, type, status, created_at, decided_at, completed_at")
        .eq("project_id", projectId)
        .or(`created_at.gte.${wk},decided_at.gte.${wk},completed_at.gte.${wk}`),
      client.from("keywords").select("created_at").eq("project_id", projectId).gte("created_at", wk),
      client.from("rank_checks").select("checked_at").eq("project_id", projectId).gte("checked_at", wk),
      client
        .from("backlink_prospects")
        .select("created_at")
        .eq("project_id", projectId)
        .gte("created_at", wk),
      // gsc_stats.date is the DATA date (GSC lags 2-3 days), so this reads as
      // "days of search data covering the last week", not sync events.
      client.from("gsc_stats").select("date").eq("project_id", projectId).gte("date", wk.slice(0, 10)),
      client
        .from("playbook_status")
        .select("slug, status, done_at")
        .eq("project_id", projectId)
        .eq("status", "done"),
    ]);

  const pages = (pagesRes.data ?? []) as PageRow[];
  const sugs = (sugRes.data ?? []) as SugRow[];
  const keywords = (kwRes.data ?? []) as StampRow[];
  const checks = (checksRes.data ?? []) as CheckRow[];
  const prospects = (prospectsRes.data ?? []) as StampRow[];
  const gscDays = gscRes.data?.length ?? 0;
  // playbook_status may not exist yet (migration pending) - treat as empty.
  const playbookDone = ((playbookRes.data ?? []) as PlaybookRow[]).filter((r) => r.done_at);

  const inWindow = (iso: string | null, since: Date) =>
    iso != null && new Date(iso).getTime() >= since.getTime();

  // Granular checklist for today; aggregate counts for the week.
  function lines(since: Date, granular: boolean): ActivityLine[] {
    const out: ActivityLine[] = [];

    const published = pages.filter((p) => inWindow(p.created_at, since));
    if (granular) {
      for (const p of published) {
        out.push({ label: `Published ${p.type ?? "page"}: ${p.title ?? "untitled"}` });
      }
    } else if (published.length > 0) {
      out.push({ label: `Published ${plural(published.length, "page")}` });
    }

    const built = sugs.filter((s) => s.status === "done" && inWindow(s.completed_at, since));
    if (granular) {
      for (const s of built) out.push({ label: `Finished building: ${s.title}` });
    } else if (built.length > 0) {
      out.push({ label: `Finished ${plural(built.length, "build")}` });
    }

    const approved = sugs.filter(
      (s) => ["approved", "in_progress", "done"].includes(s.status) && inWindow(s.decided_at, since),
    );
    if (granular) {
      for (const s of approved) out.push({ label: `Approved ${s.type}: ${s.title}` });
    } else if (approved.length > 0) {
      out.push({ label: `Approved ${plural(approved.length, "suggestion")}` });
    }

    const proposed = sugs.filter((s) => inWindow(s.created_at, since));
    if (proposed.length > 0) {
      const guides = proposed.filter((s) => s.type === "guide").length;
      const tools = proposed.filter((s) => s.type === "tool").length;
      const parts: string[] = [];
      if (guides) parts.push(plural(guides, "guide idea"));
      if (tools) parts.push(plural(tools, "tool idea"));
      const rest = proposed.length - guides - tools;
      if (rest) parts.push(plural(rest, "other idea"));
      out.push({ label: `Researched and queued ${parts.join(", ")}` });
    }

    const kws = keywords.filter((k) => inWindow(k.created_at, since)).length;
    if (kws > 0) out.push({ label: `Started tracking ${plural(kws, "keyword")}` });

    const ranked = checks.filter((c) => inWindow(c.checked_at, since)).length;
    if (ranked > 0) out.push({ label: `Ran ${plural(ranked, "rank check")}` });

    const found = prospects.filter((p) => inWindow(p.created_at, since)).length;
    if (found > 0) out.push({ label: `Found ${plural(found, "backlink prospect")}` });

    const pbDone = playbookDone.filter((r) => inWindow(r.done_at, since));
    if (granular) {
      for (const r of pbDone) {
        out.push({ label: `Playbook done: ${PLAYBOOK_NAMES.get(r.slug) ?? r.slug}` });
      }
    } else if (pbDone.length > 0) {
      out.push({ label: `Completed ${plural(pbDone.length, "playbook item")}` });
    }

    if (!granular && gscDays > 0) {
      out.push({ label: `Collected ${plural(gscDays, "day")} of Google search data` });
    }

    return out;
  }

  return {
    today: lines(todayStart, true),
    week: lines(weekStart, false),
  };
}
