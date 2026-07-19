// One-off/rerunnable maintenance: seed projects.site_launched_at from the
// domain's RDAP registration date (mirrors src/lib/domain-age.ts, which does
// this at project creation since migration 0015 - rows created BEFORE that
// were backfilled from created_at, which reads as "brand new" and wrongly
// throttles the publishing pace).
//
// Only touches rows still carrying the untouched default (site_launched_at
// equal to created_at or null) - a date the owner corrected in Settings is
// never overwritten. Run with:
//   node --env-file=.env.local scripts/backfill-launch-dates.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing - load .env.local");
  process.exit(1);
}
const db = createClient(url, key);

// Same candidate logic as src/lib/domain-age.ts: registrable domain first,
// then the last two labels for hosts like app.example.com.
function candidates(domain) {
  const labels = domain.split(".").filter(Boolean);
  const list = [domain];
  if (labels.length > 2) list.push(labels.slice(-2).join("."));
  return list;
}

async function fetchDomainRegistrationDate(domain) {
  for (const d of candidates(domain)) {
    try {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(d)}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/rdap+json, application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const date = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
      if (!date) continue;
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) continue;
      return parsed.toISOString();
    } catch {
      // timeout/network - try the next candidate or give up
    }
  }
  return null;
}

const { data: projects, error } = await db
  .from("projects")
  .select("id, slug, domain, site_launched_at, created_at");
if (error) {
  console.error("read failed:", error.message);
  process.exit(1);
}

for (const p of projects ?? []) {
  const untouched =
    p.site_launched_at == null || p.site_launched_at === p.created_at;
  if (!untouched) {
    console.log(`${p.slug}: owner-set date kept (${p.site_launched_at})`);
    continue;
  }
  const registered = await fetchDomainRegistrationDate(p.domain);
  if (!registered) {
    console.log(`${p.slug}: RDAP gave nothing for ${p.domain} - left as is`);
    continue;
  }
  const { error: upErr } = await db
    .from("projects")
    .update({ site_launched_at: registered })
    .eq("id", p.id);
  console.log(
    upErr
      ? `${p.slug}: update failed - ${upErr.message}`
      : `${p.slug}: ${p.domain} registered ${registered} (was ${p.site_launched_at})`,
  );
}
