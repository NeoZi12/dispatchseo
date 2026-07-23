import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bustInstallationTokenCache } from "@/lib/github-app";

// GitHub App lifecycle webhook. Keeps projects in sync when a customer
// uninstalls the App or removes repo access from an installation. An
// uninstall does NOT stop their already-committed workflows (those run on
// GitHub's own token + repo secrets) - it only breaks OUR control-plane
// operations (dispatch, merge, secret/file writes), so we clear the
// installation pointer and nothing else. Never touches github_repo data,
// pipeline_installed_at, or any SEO state on uninstall.

export const dynamic = "force-dynamic";

function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  const body = await req.text();
  if (!verifySignature(secret, body, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  let payload: {
    action?: string;
    installation?: { id?: number };
    repositories_removed?: Array<{ full_name?: string }>;
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  const installationId = payload.installation?.id;
  if (!installationId) return NextResponse.json({ ok: true });

  if (event === "installation" && payload.action === "deleted") {
    await db()
      .from("projects")
      .update({ github_installation_id: null, github_app_installed_at: null })
      .eq("github_installation_id", installationId);
    bustInstallationTokenCache(installationId);
  }

  if (event === "installation_repositories" && payload.action === "removed") {
    const removed = (payload.repositories_removed ?? [])
      .map((r) => r.full_name)
      .filter((n): n is string => Boolean(n));
    for (const fullName of removed) {
      // The repo left the installation: keep the repo name (it identifies
      // the project's site) but the App can no longer act on it - clearing
      // the installation pointer makes the dashboard show the reconnect card.
      await db()
        .from("projects")
        .update({ github_installation_id: null, github_app_installed_at: null })
        .eq("github_installation_id", installationId)
        .eq("github_repo", fullName);
    }
  }

  return NextResponse.json({ ok: true });
}
