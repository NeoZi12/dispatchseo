import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Container health probe (Dockerfile HEALTHCHECK + docker-compose): 200 when
// the app can reach its database, 503 otherwise. Deliberately unauthenticated
// and cheap - it reveals nothing beyond up/down, and compose healthchecks
// can't carry secrets. Not used by the Vercel deployment (deploy-check covers
// that path with real self-checks).
export async function GET() {
  try {
    const { error } = await db().from("projects").select("id").limit(1);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
