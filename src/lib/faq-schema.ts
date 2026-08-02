// Pure, client-safe logic behind the FAQ Schema Generator widget: validates
// Q&A pairs against Google's structured data content rules and builds the
// FAQPage JSON-LD schema.org defines (mainEntity -> Question -> acceptedAnswer
// -> Answer). No network calls, no DOM - kept isolated so the validation and
// JSON-LD shape can be reasoned about (and hand-tested) on their own, same
// split as internal-linking-analysis.ts.

export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
};

export type FaqIssue =
  | "empty_question"
  | "empty_answer"
  | "duplicate_question"
  | "html_in_text"
  | "answer_too_short";

export type FaqEntryResult = {
  id: string;
  issues: FaqIssue[];
  included: boolean;
};

const HTML_TAG_RE = /<\/?[a-z][a-z0-9]*(\s[^<>]*)?>/i;
export const MIN_ANSWER_CHARS = 10;

const ISSUE_LABELS: Record<FaqIssue, string> = {
  empty_question: "Question is empty",
  empty_answer: "Answer is empty",
  duplicate_question: "Same question as another entry above",
  html_in_text: "Contains HTML tags - schema text should be plain text",
  answer_too_short: `Answer is under ${MIN_ANSWER_CHARS} characters - too thin to be a real answer`,
};

export function issueLabel(issue: FaqIssue): string {
  return ISSUE_LABELS[issue];
}

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

// Flags every entry against Google's structured-data content rules (marked-up
// text should be plain, not a duplicate, not empty). A flagged entry stays
// visible with its issues but is excluded from the generated JSON-LD rather
// than blocking the whole output - fixing one bad entry shouldn't cost you
// the rest.
export function validateFaqEntries(entries: FaqEntry[]): FaqEntryResult[] {
  const seenQuestions = new Map<string, number>();
  for (const e of entries) {
    const norm = normalizeQuestion(e.question);
    if (!norm) continue;
    seenQuestions.set(norm, (seenQuestions.get(norm) ?? 0) + 1);
  }

  return entries.map((e) => {
    const issues: FaqIssue[] = [];
    const question = e.question.trim();
    const answer = e.answer.trim();

    if (!question) issues.push("empty_question");
    if (!answer) issues.push("empty_answer");
    if (question && (seenQuestions.get(normalizeQuestion(question)) ?? 0) > 1) {
      issues.push("duplicate_question");
    }
    if (HTML_TAG_RE.test(question) || HTML_TAG_RE.test(answer)) issues.push("html_in_text");
    if (answer && answer.length < MIN_ANSWER_CHARS) issues.push("answer_too_short");

    return { id: e.id, issues, included: issues.length === 0 };
  });
}

export type FaqJsonLd = {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: {
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }[];
};

// The exact nesting schema.org's Question/Answer/FAQPage types define -
// FAQPage.mainEntity is an array of Question, each with a `name` (the
// question text) and an `acceptedAnswer` of type Answer carrying `text`.
export function buildFaqJsonLd(entries: FaqEntry[], results: FaqEntryResult[]): FaqJsonLd | null {
  const includedIds = new Set(results.filter((r) => r.included).map((r) => r.id));
  const mainEntity = entries
    .filter((e) => includedIds.has(e.id))
    .map((e) => ({
      "@type": "Question" as const,
      name: e.question.trim(),
      acceptedAnswer: { "@type": "Answer" as const, text: e.answer.trim() },
    }));
  if (mainEntity.length === 0) return null;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity };
}

export function faqScriptTag(jsonLd: FaqJsonLd): string {
  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}
