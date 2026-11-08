import { INSTALL_ID_RE } from "@/lib/heartbeat";
import { captureServer } from "@/lib/posthog-server";
import { rateLimitHit, rateLimitKey } from "@/lib/rate-limit";

// Receiver for the self-host heartbeat. The sender, the exact payload, and the
// opt-out all live in src/lib/heartbeat.ts - read that first.
//
// Public and unauthenticated on purpose. The callers are self-hosted installs
// running a public container image, so any credential this endpoint required
// would be sitting in that image for everyone to read - a shared secret here
// would buy nothing and would imply a guarantee it cannot make. What it does
// instead is validate shape and store nothing but shape: a UUID and a short
// version string, both discarded if they don't match. That bounds the damage
// from a stray curl to "someone can inflate an install count", which is a
// vanity metric, not a security boundary. Do not put anything behind this
// endpoint that a forged call could hurt.
//
// No /api/ path passes through the password gate in src/proxy.ts (it exempts
// /api/* wholesale so the MCP route and crons can carry their own bearer
// auth), so unlike a public PAGE this needs no allowlist entry.
//
// On a self-hosted install this route exists but does nothing: captureServer
// no-ops without a PostHog token, and self-hosts have none.

export const dynamic = "force-dynamic";

// Wide enough for semver, the legacy YYYY-MM-DD.N ids, and a fork's own
// scheme; narrow enough that nobody can push a paragraph into a property.
const VERSION_RE = /^[\w.\-]{1,32}$/;

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { install_id, version } = (body ?? {}) as Record<string, unknown>;
  if (typeof install_id !== "string" || !INSTALL_ID_RE.test(install_id)) {
    return Response.json({ ok: false, error: "invalid install_id" }, { status: 400 });
  }
  if (typeof version !== "string" || !VERSION_RE.test(version)) {
    return Response.json({ ok: false, error: "invalid version" }, { status: 400 });
  }

  // A real install pings once a day; 10 an hour per id stops a loop from
  // flooding PostHog. Fails OPEN - a database blip must not drop real pings.
  if (!(await rateLimitHit(rateLimitKey("heartbeat", install_id), 10, 3600, { failOpen: true }))) {
    return Response.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  // distinct_id IS the install id, which is what makes "unique users on
  // self_host_heartbeat, last 30 days" in PostHog read as "installs that were
  // alive in the last 30 days" with no extra query work.
  await captureServer(install_id, "self_host_heartbeat", { version });
  return Response.json({ ok: true });
}
