// Smoke-tests the sameness gate (src/lib/similarity.ts) - the deterministic
// math behind the check_sameness MCP tool and the drift audit.
//
//   node --experimental-strip-types scripts/sameness-test.mjs
//   node --env-file=.env.local --experimental-strip-types scripts/sameness-test.mjs
//
// Part 1 (always) proves each signal fires on a synthetic corpus and that the
// guards against false positives hold. Part 2 (only with Supabase env) checks
// EXTRACTION against the real published site - that half is not ceremony: a
// document-wide anchor regex once silently ate the intro, TL;DR and first two
// paragraphs of every guide, and only real HTML caught it.
import {
  compareToCorpus,
  CORPUS_SIZE,
  extractFromHtml,
  extractFromMarkdown,
  tokenize,
} from "../src/lib/similarity.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failed++;
};

const kw = (s) => new Set(tokenize(s));

// ---- part 1: the signals, on a corpus we control -------------------------
const CRUTCH = "it is important to note that this approach works";
const CRUTCH2 = "at the end of the day what really matters";

const synth = (topic) => ({
  ...extractFromMarkdown(
    `# x\n\nA distinct opening for ${topic} sharing no run of words with any sibling.\n\n## Unique ${topic} heading\n\n${CRUTCH}. ${CRUTCH2}. ${topic} specific prose that stands alone.\n`,
    kw(topic),
  ),
  label: `guide about ${topic}`,
});
const corpus = ["alpha", "beta", "gamma", "delta"].map(synth);

const fresh = extractFromMarkdown(
  `# y\n\nA wholly original opening with cadence of its own and nothing borrowed at all.\n\n## An unrelated heading\n\nEntirely new prose about something else.\n`,
  kw("epsilon"),
);
check("distinct draft passes", compareToCorpus(fresh, corpus).pass);

const sameOpen = extractFromMarkdown(
  `# y\n\nA distinct opening for alpha sharing no run of words with any sibling.\n\n## An unrelated heading\n\nEntirely new prose.\n`,
  kw("epsilon"),
);
check(
  "opening signal fires",
  compareToCorpus(sameOpen, corpus).flags.some((f) => f.kind === "opening"),
);

const sameHeads = extractFromMarkdown(
  `# y\n\nA wholly original opening with cadence of its own and nothing borrowed at all.\n\n## Unique alpha heading\n\nEntirely new prose about something else.\n`,
  kw("alpha"), // strips "alpha" -> "unique heading", the corpus skeleton
);
check(
  "heading-skeleton signal fires",
  compareToCorpus(sameHeads, corpus).flags.some((f) => f.kind === "headings"),
);

const stock = extractFromMarkdown(
  `# y\n\nA wholly original opening with cadence of its own and nothing borrowed at all.\n\n## An unrelated heading\n\n${CRUTCH}. ${CRUTCH2}. New prose.\n`,
  kw("epsilon"),
);
check(
  "stock-phrase signal fires",
  compareToCorpus(stock, corpus).flags.some((f) => f.kind === "phrases"),
);

const oneOff = extractFromMarkdown(
  `# z\n\nAnother fresh opening with its own cadence and no borrowed runs anywhere.\n\n## Yet another heading\n\nalpha specific prose that stands alone. Plus original writing.\n`,
  kw("zeta"),
);
check("phrase shared with ONE guide is not punished", compareToCorpus(oneOff, corpus).pass);

check("empty corpus passes open", compareToCorpus(fresh, []).pass);

// Code fences must not count - the same install command SHOULD repeat.
const codey = extractFromMarkdown(
  "# y\n\nA wholly original opening with cadence of its own and nothing borrowed at all.\n\n## Heading\n\n```bash\nnpm install -g claude-code\n```\n",
  kw("epsilon"),
);
check("code fences excluded from prose", !codey.words.includes("npm"));

// ---- part 2: extraction against the real published site ------------------
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await db
    .from("pages")
    .select("url, title, primary_keyword")
    .eq("type", "guide")
    .order("created_at", { ascending: false })
    .limit(CORPUS_SIZE);

  const rows = data ?? [];
  console.log(`\nreal corpus: ${rows.length} guide(s)`);
  const live = [];
  for (const r of rows) {
    try {
      const res = await fetch(r.url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const f = extractFromHtml(await res.text(), kw(r.primary_keyword ?? ""));
      live.push({ ...f, label: r.title ?? r.url });
      // The guard that would have caught the anchor-regex bug: a real guide
      // always has headings, real prose, and an opening.
      check(
        `extracted ${(r.title ?? "").slice(0, 42)}`,
        f.headings.length >= 3 && f.words.length > 500 && f.opening.length >= 6,
        `${f.headings.length} H2s, ${f.words.length} words, opening "${f.opening.slice(0, 6).join(" ")}"`,
      );
    } catch (e) {
      console.log(`  skip ${r.url} (${e.message})`);
    }
  }
  if (live.length > 1) {
    // Published guides must not flag each other - if they do, either the site
    // has real drift or the thresholds are too tight. Either way: look.
    const self = live.map((g) => ({
      label: g.label,
      v: compareToCorpus(
        g,
        live.filter((o) => o.label !== g.label),
      ),
    }));
    const dirty = self.filter((s) => !s.v.pass);
    check(
      "published guides do not flag each other",
      dirty.length === 0,
      dirty.length
        ? dirty.map((d) => `${d.label}: ${d.v.flags.map((f) => f.kind)}`).join("; ")
        : `${live.length} compared`,
    );
  }
} else {
  console.log("\n(skipped live-corpus checks - no SUPABASE env)");
}

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
