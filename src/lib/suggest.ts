// Google Autocomplete keyword expansion - the free-mode research primitive.
// The suggestqueries endpoint is unofficial but free, keyless, and what every
// free keyword tool is built on. No volume numbers: the agent ranks the output
// by relevance and its own judgment (or cross-checks winnability via
// check_serp when a SERP provider is connected).

const MODIFIERS = ["how", "what", "why", "best", "vs", "for", "without", "free"];

async function suggestOnce(query: string, language: string): Promise<string[]> {
  const params = new URLSearchParams({ client: "firefox", hl: language, q: query });
  const res = await fetch(`https://suggestqueries.google.com/complete/search?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    // A UA header keeps the endpoint from occasionally answering the HTML shell.
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DispatchSEO/1.0)" },
  });
  if (!res.ok) return [];
  try {
    const json = (await res.json()) as [string, string[]];
    return Array.isArray(json?.[1]) ? json[1] : [];
  } catch {
    return [];
  }
}

// Expand a seed keyword into related searches: the seed's own suggestions plus
// one round of modifier prefixes/suffixes ("how <seed>", "<seed> for", ...).
// Bounded to ~9 requests per call; failures degrade to fewer suggestions, never
// an error.
export async function expandKeyword(
  seed: string,
  language = "en",
  modifiers: string[] = MODIFIERS,
): Promise<string[]> {
  const clean = seed.trim().toLowerCase();
  if (!clean) return [];
  const queries = [
    clean,
    ...modifiers.slice(0, 8).map((m) => (m === "vs" || m === "for" ? `${clean} ${m}` : `${m} ${clean}`)),
  ];
  const batches = await Promise.allSettled(queries.map((q) => suggestOnce(q, language)));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of batches) {
    if (b.status !== "fulfilled") continue;
    for (const s of b.value) {
      const norm = s.trim().toLowerCase();
      if (!norm || norm === clean || seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}
