import { NextResponse, type NextRequest } from "next/server";

import { currentUser } from "@/lib/cloud-auth";
import { maybeSignedIn } from "@/lib/auth-gate";
import { classifyPath, recordVisit } from "@/lib/visits";

// The visit beacon (components/visit-beacon.tsx): one POST per page view from
// a browser that ran our script. Same row shape as the proxy's, kind=beacon.
// Always 204, even on garbage - a beacon has nobody to answer to.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { p?: unknown; q?: unknown; r?: unknown } = {};
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
  // Only verify a session when a cookie says there might be one: anonymous
  // traffic (most of it) never pays the auth round trip.
  const userId = (await maybeSignedIn()) ? ((await currentUser())?.id ?? null) : null;
  await recordVisit({
    kind: "beacon",
    area,
    url,
    headers: req.headers,
    userId,
    referrer: typeof body.r === "string" ? body.r.slice(0, 512) : null,
  });
  return new NextResponse(null, { status: 204 });
}
