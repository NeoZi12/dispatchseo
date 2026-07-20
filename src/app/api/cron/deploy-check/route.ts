import { db } from "@/lib/db";
import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { getProjectByToken, listProjects } from "@/lib/projects";
import { missingMigrations } from "@/lib/schema-check";

// Post-deploy smoke test. The deploy-check GitHub Action hits this after
// every push to main: first polling with ?expect=<sha> until Vercel serves
// the pushed commit, then letting the check run verify the app's internals
// (core tables reachable, projects resolvable, GSC creds parse). Results go
// through reportCronRun, so a broken deploy shows on the dashboard Home
// banner and emails the owner immediately instead of surfacing as mystery
// cron failures the next morning. The workflow also probes the outside
// surface (/login, the MCP gate) and reports what it finds via ?fail=.
//
// The route doubles as the generic outcome-report door for GitHub-side
// automation: the SEO workflows and the secrets canary call it with
// ?job=<name>&ok=1 / &fail=<message>, which is how their failures reach the
// dashboard instead of dying quietly in the Actions tab.

export const maxDuration = 60;

// One cheap head-count per table the app can't function without. Catches a
// deploy pointed at the wrong Supabase, a dropped/renamed table, or a dead
// service-role key - the failure modes that otherwise wait for the 4am cron.
const CORE_TABLES = [
  "projects",
  "suggestions",
  "keywords",
  "pages",
  "rank_checks",
  "gsc_stats",
  "cron_runs",
] as const;

async function checkTable(name: string): Promise<string | null> {
  const { error } = await db().from(name).select("*", { count: "exact", head: true });
  return error ? error.message : null;
}

export async function GET(req: Request): Promise<Response> {
  // Two accepted callers. CRON_SECRET is the instance owner (full access,
  // unscoped job names, all modes). A per-project MCP token is a connected
  // repo's CI phoning an outcome home (report mode ONLY - no smoke tests, no
  // poll mode); its job name gets suffixed with the project slug so two
  // projects reporting "seo-daily" never overwrite each other's state.
  let projectSuffix = "";
  const denied = await checkCron(req);
  if (denied) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
    const project = token ? await getProjectByToken(token) : null;
    if (!project) return denied;
    projectSuffix = `--${project.slug}`;
  }

  const url = new URL(req.url);
  const liveSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";

  // Poll mode: no side effects while the pushed commit isn't serving yet.
  const expected = url.searchParams.get("expect");
  if (expected && expected !== liveSha) {
    return Response.json(
      { waiting: true, live_sha: liveSha || null, expected },
      { status: 202 },
    );
  }

  // Report mode: an external reporter asks us to record an outcome so the
  // banner + email rails fire. Two callers: the deploy-check workflow when it
  // sees a failure this process can't see itself (deploy never went live,
  // /login broken from outside), and the SEO workflows + secrets canary
  // phoning their run outcomes home under their own job name (?job=seo-daily
  // with either &fail=<message> or &ok=1; success rows clear the banner).
  const jobParam = url.searchParams.get("job");
  if (jobParam && !/^[a-z0-9_-]{1,40}$/.test(jobParam)) {
    return Response.json({ error: "bad job name" }, { status: 400 });
  }
  if (projectSuffix && !jobParam) {
    return Response.json(
      { error: "project tokens may only report (job=<name> with ok=1 or fail=<message>)" },
      { status: 403 },
    );
  }
  const job = (jobParam ?? "deploy-check") + projectSuffix;
  const failMsg = url.searchParams.get("fail");
  if (failMsg) {
    const result = { sha: liveSha || null, error: failMsg.slice(0, 300) };
    await reportCronRun(job, result, true);
    return Response.json({ recorded: result.error, job });
  }
  if (url.searchParams.get("ok")) {
    await reportCronRun(job, { sha: liveSha || null, reported: "ok" }, false);
    return Response.json({ recorded: "ok", job });
  }
  if (jobParam) {
    return Response.json({ error: "job param needs ok=1 or fail=<message>" }, { status: 400 });
  }

  // Check mode: run the internal smoke tests.
  const checks: Record<string, unknown> = {};
  let hadError = false;

  const tableResults = await Promise.all(CORE_TABLES.map((t) => checkTable(t)));
  CORE_TABLES.forEach((table, i) => {
    const err = tableResults[i];
    if (err) hadError = true;
    checks[`table_${table}`] = err ? { error: err } : "ok";
  });

  try {
    const projects = await listProjects();
    if (projects.length === 0) {
      hadError = true;
      checks.projects_resolve = { error: "no projects resolvable (env fallback included)" };
    } else {
      checks.projects_resolve = `ok (${projects.length})`;
    }
  } catch (e) {
    hadError = true;
    checks.projects_resolve = { error: e instanceof Error ? e.message : String(e) };
  }

  // Schema drift: code ships migrations faster than a self-hosted operator
  // applies them. Name the exact missing files here so the gap surfaces as
  // a post-deploy banner + email instead of features that mysteriously
  // never activate (or the projects env-fallback answering for the wrong
  // tenant - the 0027 audit's nastiest silent failure mode).
  const missing = await missingMigrations();
  if (missing.length > 0) {
    hadError = true;
    checks.schema_migrations = {
      error: `missing migration(s): ${missing.join(", ")} - run supabase/migrations/setup.sql (idempotent, safe to re-run) or paste the named files in the Supabase SQL editor`,
    };
  } else {
    checks.schema_migrations = "ok";
  }

  // Creds sanity: a service-account JSON that no longer parses (bad paste,
  // truncated env edit) breaks every GSC feature quietly. Setup-wizard
  // installs use OAuth instead and legitimately have no env here.
  const gscRaw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!gscRaw) {
    checks.gsc_credentials = "skipped (no service-account env; OAuth installs manage theirs in setup)";
  } else {
    try {
      const parsed = JSON.parse(gscRaw) as Record<string, unknown>;
      if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
        checks.gsc_credentials = "ok";
      } else {
        hadError = true;
        checks.gsc_credentials = { error: "service-account JSON missing client_email/private_key" };
      }
    } catch {
      hadError = true;
      checks.gsc_credentials = { error: "GSC_SERVICE_ACCOUNT_JSON is not valid JSON" };
    }
  }

  const result = { sha: liveSha || null, checks };
  console.log("[deploy-check]", JSON.stringify(result));
  await reportCronRun("deploy-check", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
