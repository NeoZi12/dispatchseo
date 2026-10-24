import { isCloudMode } from "@/lib/cloud";
import { criticalCronIssues, getCronHealth, jobProjectSlug, type CronHealth } from "@/lib/cron-alerts";
import { listProjects, writerMode } from "@/lib/projects";

// The operator's "All sites" strip (audit 2026-10-24, C1).
//
// Operator emails are OFF by design (cron-banner-policy), and the bare
// instance-wide rows that carry every tenant's failures are hidden from
// tenants on cloud - correctly. That left the operator with no surface at
// all for "site X's articles stopped" short of querying the database. So the
// operator's own Home grows one strip: every hosted site with a critical
// issue.
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
};

export async function operatorOverview(): Promise<OperatorSite[]> {
  const [projects, health] = await Promise.all([listProjects(), getCronHealth()]);
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
  const out: OperatorSite[] = [];
  if (instance.length) {
    out.push({
      projectId: "",
      slug: "",
      name: "Instance",
      domain: "every site",
      issues: instance.map((h) => ({ job: h.job, error: (h.errors[0] ?? (h.stale ? "overdue" : "failed")).slice(0, 300) })),
    });
  }
  for (const p of hosted) {
    const issues = (bySlug.get(p.slug) ?? []).map((h) => ({ job: h.job, error: (h.errors[0] ?? (h.stale ? "overdue" : "failed")).slice(0, 300) }));
    if (issues.length) out.push({ projectId: p.id, slug: p.slug, name: p.name, domain: p.domain, issues });
  }
  return out;
}
