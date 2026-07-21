// Guards the one place user-supplied URLs meet a server-side fetch: pages are
// logged via MCP (log_page) and later fetched by the sameness gate. Restricting
// page URLs to the project's own domain closes the SSRF/proxy path - a leaked
// project token must not turn this server into a request origin for arbitrary
// hosts or internal infra.

// A project domain is always a real hostname (e.g. example.com), never a raw IP
// or localhost. Rejecting IP literals + loopback names closes the SSRF hole
// where a project's domain is set to an internal address (169.254.169.254 cloud
// metadata, 127.0.0.1, 10.x, a container hostname) and then fetched: the guard
// refuses it at the fetch boundary regardless of how the domain was set.
function isIpLiteralOrLocal(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.includes(":")) return true; // IPv6 literal (URL hostname strips the brackets)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4 dotted-quad
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
  if (isIpLiteralOrLocal(host)) return false;
  const bare = domain.toLowerCase();
  return host === bare || host.endsWith(`.${bare}`);
}
