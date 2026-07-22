// Shared domain cleaning for the landing hero -> /signup?domain= ->
// pending_domain cookie -> onboarding prefill chain. No server imports on
// purpose: the landing CTA is a client component and uses this too.

// "https://www.Example.com/pricing?x=1" -> "example.com"
export function cleanDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

// Good enough for display + prefill: a dot-separated hostname, nothing that
// could smuggle a path or scheme. Real validation happens at project create.
export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9.-]{0,251}\.[a-z]{2,}$/.test(domain);
}
