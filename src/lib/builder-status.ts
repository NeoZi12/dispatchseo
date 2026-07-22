import { db } from "@/lib/db";
import { instanceSettings } from "@/lib/dashboard-auth";

// Docker installs have two possible build paths: the in-stack builder
// (heartbeats via instance_settings.builder_last_seen_at on every claiming
// poll) and the GitHub Actions pipeline in the site's repo (reports home as
// seo-daily--<slug> / seo-tools--<slug> rows in cron_runs). "Builds are on"
// means EITHER shows recent life - the setup nag must never fire while pages
// demonstrably ship through the other path, and must survive schema drift
// (a pre-0032 database has no heartbeat column at all, which reads as
// "never checked in" no matter what the builder is doing).
//
// Recent only: a build path that has been silent this long is worth nagging
// about again - failures are the red banner's job, absence is this one's.
const EVIDENCE_WINDOW_DAYS = 14;

export async function buildsActive(): Promise<boolean> {
  const inst = (await instanceSettings()) as unknown as {
    builder_last_seen_at?: string | null;
  } | null;
  if (inst?.builder_last_seen_at) return true;
  // PostgREST's like patterns inside or() use * as the wildcard.
  const { data } = await db()
    .from("cron_runs")
    .select("id")
    .or("job.like.builder-*,job.like.seo-daily--*,job.like.seo-tools--*")
    .gte(
      "created_at",
      new Date(Date.now() - EVIDENCE_WINDOW_DAYS * 86400000).toISOString(),
    )
    .limit(1);
  return (data ?? []).length > 0;
}
