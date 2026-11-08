import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/cloud-auth";
import { maybeSignedIn } from "@/lib/auth-gate";
import { classifyPath, recordVisit } from "@/lib/visits";
import { rateLimitHit, rateLimitKey } from "@/lib/rate-limit";
import { clientIp } from "@/lib/login-lockout";

// The visit beacon (components/visit-beacon.tsx): one POST per page view from
// a browser that ran our script. Same row shape as the proxy's, kind=beacon.
// Always 204, even on garbage - a beacon has nobody to answer to - except a
// 429 past 120 beacons a minute from one address, so a script can't flood
// web_visits. The limiter fails OPEN: analytics never waits on the database.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // p path, q query, r referrer (first page only), w navigator.webdriver,
  // e the first real interaction on this page (a second, separate ping).
  let body: { p?: unknown; q?: unknown; r?: unknown; w?: unknown; e?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const path = typeof body.p === "string" && body.p.startsWith("/") && body.p.length < 512 ? body.p : null;
  if (!path) return new NextResponse(null, { status: 204 });
  const area = classifyPath(path);
  if (!area) return new NextResponse(null, { status: 204 });
  const search = typeof body.q === "string" && body.q.startsWith("?") && body.q.length < 512 ? body.q : "";
  const url = new URL(path + search, req.nextUrl.origin);
  if (!(await rateLimitHit(rateLimitKey("t", clientIp(req.headers)), 120, 60, { failOpen: true }))) {
    return NextResponse.json({}, { status: 429 });
  }
  // Only verify a session when a cookie says there might be one: anonymous
  // traffic (most of it) never pays the auth round trip.
  const userId = (await maybeSignedIn()) ? ((await currentUser())?.id ?? null) : null;
  await recordVisit({
    kind: body.e === 1 ? "engaged" : "beacon",
    automated: body.w === 1,
    area,
    url,
    headers: req.headers,
    userId,
    referrer: typeof body.r === "string" ? body.r.slice(0, 512) : null,
  });
  return new NextResponse(null, { status: 204 });
}
