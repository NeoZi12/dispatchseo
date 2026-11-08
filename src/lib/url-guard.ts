import { fetch as pinnedFetch } from "undici";
import { pinnedAgent } from "@/lib/writer/fetch";
// Guards every place a user-influenced URL meets a server-side fetch: pages are
// logged via MCP (log_page) and later fetched by the sameness gate and the build
// brief, pending pages are probed for liveness, and a brand-new project's domain
// is probed during onboarding. Restricting those fetches to real, public,
// project-owned hosts closes the SSRF/proxy path - a leaked project token, or
// merely a signed-up cloud tenant, must not turn this server into a request
// origin for arbitrary hosts or internal infra.

// Hosts a server-side fetch must never be pointed at. A project domain is always
// a real, publicly-resolvable hostname (e.g. example.com) - never a raw IP,
// never loopback, never an internal service name. Rejecting those closes the
// SSRF hole where a domain (or a redirect target) is an internal address
// - 169.254.169.254 cloud metadata, 127.0.0.1, 10.x, a container hostname -
// and then gets fetched: the guard refuses it at the fetch boundary regardless
// of how the value was set.
export function isPrivateHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.$/, ""); // trailing dot = same host
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // Names that only resolve inside a network: mDNS, Docker/Kubernetes service
  // discovery, and the suffixes cloud providers hand out internally.
  if (/\.(local|internal|localdomain|home|lan|intranet|corp|test|example|invalid)$/.test(host)) {
    return true;
  }
  // IPv6 literal. WHATWG URL keeps the brackets in hostname, but accept both.
  if (host.includes(":") || host.startsWith("[")) return true;
  // A single label with no dot is either a container/service name or a numeric
  // host (http://2130706433/ is 127.0.0.1). Neither is ever a real site.
  if (!host.includes(".")) return true;
  const quad = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (quad) {
    // Every IPv4 literal is refused, not just the private ranges: a project
    // domain is a hostname, so an IP here is always either an internal target
    // or an attempt to skip DNS. Keeping it absolute means no range table to
    // keep in sync.
    return true;
  }
  // Any other all-numeric or hex form (0x7f.1, 017700000001, 2130706433.) that
  // still contains a dot - none of these are registrable domain names.
  if (/^[\d.]+$/.test(host) || /^0x[\da-f.]+$/.test(host)) return true;
  return false;
}

export function isProjectUrl(url: string, domain: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  if (isPrivateHost(host)) return false;
  const bare = domain.toLowerCase();
  if (!bare || isPrivateHost(bare)) return false;
  return host === bare || host.endsWith(`.${bare}`);
}

// Shape check for a Search Console property string (projects.gsc_site_url).
// Google names properties in exactly two forms; anything else is a typo at
// best. Lives here rather than in gsc.ts so gsc-oauth.ts - which gsc.ts itself
// imports - can use it without an import cycle. It is also what keeps a
// TENANT-WRITABLE column (set_gsc_property, /google's picker, the wizard) from
// holding arbitrary text, or a loopback/internal host, that another code path
// later hands to an API client.
export function isGscPropertyShape(site: string): boolean {
  if (!site || site.length > 263) return false;
  if (site.startsWith("sc-domain:")) {
    const host = site.slice("sc-domain:".length).toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !isPrivateHost(host);
  }
  let parsed: URL;
  try {
    parsed = new URL(site);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return !isPrivateHost(parsed.hostname);
}

// Fetch a URL that must stay on the project's own domain, FOLLOWING REDIRECTS
// BY HAND so every hop is re-checked.
//
// This is the half `isProjectUrl` alone could not cover. The guard proved the
// FIRST url was on the project's domain, then handed the request to fetch()
// with the default `redirect: "follow"` - and the project's domain belongs to
// the tenant. A cloud customer could point their own site at a 302 to
// http://169.254.169.254/ or an internal address and have this server fetch it,
// with the response body handed back to their agent (the build brief and the
// sameness gate both read res.text()). Validating only the entry point is not a
// guard, it is a suggestion.
//
// Returns null instead of throwing on any refusal - every caller already treats
// an unreachable page as "sits this one out".
const MAX_REDIRECTS = 3;

/** True when the URL names a port (WHATWG URL drops the scheme's default,
 *  so `https://x:443/` reads as no port). Unparseable counts as refused. */
export function hasExplicitPort(url: string | URL): boolean {
  try {
    return (typeof url === "string" ? new URL(url) : url).port !== "";
  } catch {
    return true;
  }
}

export async function fetchProjectUrl(
  url: string,
  domain: string,
  init: { timeoutMs: number; userAgent: string },
): Promise<Response | null> {
  let target = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isProjectUrl(target, domain)) return null;
    // Default ports only, on every hop: a tenant's site has no business
    // steering us at :8080 or :6379 on whatever its name resolves to.
    if (hasExplicitPort(target)) return null;
    let res: Response;
    try {
      // pinnedAgent resolves the name once, refuses any private answer and
      // connects to that same vetted address - isProjectUrl's lexical check
      // alone loses to DNS rebinding (writer/fetch.ts).
      res = (await pinnedFetch(target, {
        dispatcher: pinnedAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(init.timeoutMs),
        headers: { "user-agent": init.userAgent },
      })) as unknown as Response;
    } catch {
      return null;
    }
    if (res.status < 300 || res.status > 399) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    try {
      target = new URL(location, target).toString();
    } catch {
      return null;
    }
  }
  return null; // redirect loop / too many hops
}
