import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";
import { criticalCronIssues, getCronHealth, jobProjectSlug, type CronHealth } from "@/lib/cron-alerts";
import { listProjects, writerMode } from "@/lib/projects";
import { holdReleasesAt } from "./hold";

// The operator's "All sites" strip (audit 2026-10-24, C1).
//
// Operator emails are OFF by design (cron-banner-policy), and the bare
// instance-wide rows that carry every tenant's failures are hidden from
// tenants on cloud - correctly. That left the operator with no surface at
// all for "site X's articles stopped" short of querying the database. So the
// operator's own Home grows one strip: every hosted site with a critical
// issue or a held article, each linking to the article that needs reading.
//
// Who is the operator: a cloud user id listed in OPERATOR_USER_IDS
// (comma-separated). Unset = nobody, fail closed - this strip reads across
// tenants, so it must never appear for a customer. Self-host has one owner
// who already sees every project's health, so it never applies there.
//
// Operator-only telemetry, deliberately WITHOUT an MCP counterpart: an MCP
// token IS one tenant, and nothing a tenant's agent should read or set lives
// here (the per-site half of the same data is get_cron_health and
// get_autopilot).

export function isOperator(userId: string | null | undefined): boolean {
  if (!isCloudMode() || !userId) return false;
  return (process.env.OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

export type OperatorSite = {
  projectId: string;
  slug: string;
  name: string;
  domain: string;
  issues: Array<{ job: string; error: string }>;
  held: Array<{ runId: string; draftId: string | null; title: string; heldAt: string; releasesAt: string | null; reason: string | null }>;
};

export async function operatorOverview(): Promise<OperatorSite[]> {
  const [projects, health, heldRes] = await Promise.all([
    listProjects(),
    getCronHealth(),
    db()
      .from("writer_runs")
      .select("id, project_id, keyword, title_hint, draft_id, updated_at, reason:stage_outputs->verify->handoff->>reason")
      .eq("status", "held")
      .order("updated_at", { ascending: true })
      .limit(100),
  ]);
  const hosted = projects.filter((p) => writerMode(p) === "hosted");
  const bySlug = new Map<string, CronHealth[]>();
  const instance: CronHealth[] = [];
  for (const h of criticalCronIssues(health)) {
    const slug = jobProjectSlug(h.job);
    // Bare jobs (autopilot, jobs, daily-ranks) are instance-wide: the
    // writer's missing model keys, a wedged queue. The operator's first row.
    if (!slug) {
      instance.push(h);
      continue;
    }
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), h]);
  }
  const held = (heldRes.data ?? []) as { id: string; project_id: string; keyword: string | null; title_hint: string | null; draft_id: string | null; updated_at: string; reason: string | null }[];
  const draftIds = held.map((r) => r.draft_id).filter((x): x is string => Boolean(x));
  const titles = new Map<string, string>();
  if (draftIds.length) {
    const { data } = await db().from("article_drafts").select("id, title").in("id", draftIds);
    for (const d of (data ?? []) as { id: string; title: string }[]) titles.set(d.id, d.title);
  }

  const out: OperatorSite[] = [];
  if (instance.length) {
    out.push({
      projectId: "",
      slug: "",
      name: "Instance",
      domain: "every site",
      issues: instance.map((h) => ({ job: h.job, error: (h.errors[0] ?? (h.stale ? "overdue" : "failed")).slice(0, 300) })),
      held: [],
    });
  }
  for (const p of hosted) {
    const issues = (bySlug.get(p.slug) ?? []).map((h) => ({ job: h.job, error: (h.errors[0] ?? (h.stale ? "overdue" : "failed")).slice(0, 300) }));
    const mine = held
      .filter((r) => r.project_id === p.id)
      .map((r) => ({
        runId: r.id,
        draftId: r.draft_id,
        title: (r.draft_id && titles.get(r.draft_id)) || r.title_hint || r.keyword || "Untitled",
        heldAt: r.updated_at,
        releasesAt: holdReleasesAt(r.updated_at),
        reason: r.reason,
      }));
    if (issues.length || mine.length) out.push({ projectId: p.id, slug: p.slug, name: p.name, domain: p.domain, issues, held: mine });
  }
  return out;
}
