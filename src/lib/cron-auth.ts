import { timingSafeEqual } from "node:crypto";

// Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}` on scheduled hits
// when CRON_SECRET is set. The same header lets us trigger a cron manually with
// curl for testing. Returns null if authorized, or a 401 Response if not.
export function checkCron(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Server missing CRON_SECRET" }, { status: 500 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
