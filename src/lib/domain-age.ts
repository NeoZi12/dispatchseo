// Looks up when a domain was registered, via RDAP (the modern WHOIS) - free,
// keyless, no account. Used once at project creation to seed
// site_launched_at with something honest instead of "today": a signup's
// domain almost never went live the day it joined DispatchSEO, and the
// site-age readout (Journey, pacing.ts's siteAgeDays) would read wrong.
// Registration date is an upper bound on site age (the site may have
// launched later than the domain was bought); the owner can correct the
// date on Settings either way.

type RdapEvent = { eventAction?: string; eventDate?: string };

// RDAP answers for registrable domains (example.com), not hosts
// (app.example.com). Try the full domain first, then the last two labels.
// Two-label public suffixes (example.co.uk subdomains) fall through to null
// and the caller's "today" default - rare enough to not carry a suffix list.
function candidates(domain: string): string[] {
  const labels = domain.split(".").filter(Boolean);
  const list = [domain];
  if (labels.length > 2) list.push(labels.slice(-2).join("."));
  return list;
}

export async function fetchDomainRegistrationDate(domain: string): Promise<string | null> {
  for (const d of candidates(domain)) {
    try {
      // rdap.org bootstraps: it redirects to the right registry per TLD.
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(d)}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/rdap+json, application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { events?: RdapEvent[] };
      const date = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
      if (!date) continue;
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) continue;
      return parsed.toISOString();
    } catch {
      // Timeout or network failure - try the next candidate or give up; the
      // caller falls back to the column default (now) and Settings fixes it.
    }
  }
  return null;
}
