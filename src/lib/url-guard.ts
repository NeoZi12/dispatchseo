// Guards the one place user-supplied URLs meet a server-side fetch: pages are
// logged via MCP (log_page) and later fetched by the sameness gate. Restricting
// page URLs to the project's own domain closes the SSRF/proxy path - a leaked
// project token must not turn this server into a request origin for arbitrary
// hosts or internal infra.

export function isProjectUrl(url: string, domain: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  const bare = domain.toLowerCase();
  return host === bare || host.endsWith(`.${bare}`);
}
