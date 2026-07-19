import { timingSafeEqual } from "node:crypto";
import { instanceCronSecret } from "./dashboard-auth";

// Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}` on scheduled
// hits when CRON_SECRET is set; GitHub Actions crons send the same header,
// and curl with it triggers a run manually for testing. Setup-wizard
// installs have no env secret - theirs is generated at claim time and lives
// in instance_settings, so both sources are accepted. Returns null if
// authorized, or a Response (401/500) if not.
export async function checkCron(req: Request): Promise<Response | null> {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const secrets = [process.env.CRON_SECRET, await instanceCronSecret()].filter(
    (s): s is string => Boolean(s),
  );
  if (secrets.length === 0) {
    return Response.json({ error: "No cron secret configured" }, { status: 500 });
  }
  for (const secret of secrets) {
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return null;
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
