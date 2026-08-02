"use client";

// The FAQ Schema Generator widget: type Q&A pairs, get back valid FAQPage
// JSON-LD - computed live, no submit button, same as any calculator. Everything
// runs in this component - no fetch, no backend, nothing typed ever leaves the
// browser. See src/lib/faq-schema.ts for the validation and JSON-LD building;
// this file is just state + the entry-list/output UI around it.

import { useMemo, useState } from "react";
import {
  buildFaqJsonLd,
  faqScriptTag,
  issueLabel,
  validateFaqEntries,
  type FaqEntry,
  type FaqIssue,
} from "@/lib/faq-schema";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

function emptyEntry(id: string): FaqEntry {
  return { id, question: "", answer: "" };
}

export function FaqSchemaGenerator() {
  const [entries, setEntries] = useState<FaqEntry[]>(() => [
    emptyEntry("q1"),
    emptyEntry("q2"),
    emptyEntry("q3"),
  ]);
  const [nextId, setNextId] = useState(4);
  const [copied, setCopied] = useState(false);

  const results = useMemo(() => validateFaqEntries(entries), [entries]);
  const jsonLd = useMemo(() => buildFaqJsonLd(entries, results), [entries, results]);
  const scriptTag = jsonLd ? faqScriptTag(jsonLd) : null;
  const includedCount = results.filter((r) => r.included).length;
  const totalWithContent = entries.filter((e) => e.question.trim() || e.answer.trim()).length;

  function updateEntry(id: string, patch: Partial<FaqEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function addEntry() {
    setEntries((prev) => [...prev, emptyEntry(`q${nextId}`)]);
    setNextId((n) => n + 1);
  }
  function removeEntry(id: string) {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.id !== id)));
  }
  function copyScript() {
    if (!scriptTag) return;
    navigator.clipboard.writeText(scriptTag).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="space-y-5">
      <EligibilityNotice />

      <div className="space-y-3">
        {entries.map((e, i) => {
          const result = results.find((r) => r.id === e.id);
          return (
            <EntryCard
              key={e.id}
              index={i}
              entry={e}
              issues={result?.issues ?? []}
              canRemove={entries.length > 1}
              onChange={(patch) => updateEntry(e.id, patch)}
              onRemove={() => removeEntry(e.id)}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={addEntry}
        className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
      >
        + Add another question
      </button>

      <Output
        scriptTag={scriptTag}
        jsonLd={jsonLd}
        includedCount={includedCount}
        totalWithContent={totalWithContent}
        copied={copied}
        onCopy={copyScript}
      />
    </div>
  );
}

function EligibilityNotice() {
  return (
    <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm text-neutral-300 sm:p-5">
      <p className="font-medium text-amber-300">Before you generate this: Google's FAQ rich snippet is mostly gone</p>
      <p className="mt-1.5">
        Google restricted the FAQ rich result to "well-known, authoritative government and health websites" back in
        August 2023, then removed it from Search entirely for everyone else on May 7, 2026. Unless you run a
        government or health site, this markup will not add a visible rich result in Google search results anymore.
      </p>
      <p className="mt-1.5">
        It is still worth generating: FAQPage JSON-LD is a standard way to tell any crawler - Bing, an AI answer
        engine, your own site tooling - exactly which text is a question and which is its accepted answer, and it
        keeps your FAQ content in one structured place instead of ad hoc HTML. Just don&apos;t build it expecting a
        Google rich snippet to show up.
      </p>
    </div>
  );
}

function EntryCard({
  index,
  entry,
  issues,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  entry: FaqEntry;
  issues: FaqIssue[];
  canRemove: boolean;
  onChange: (patch: Partial<FaqEntry>) => void;
  onRemove: () => void;
}) {
  const hasContent = entry.question.trim().length > 0 || entry.answer.trim().length > 0;

  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Question {index + 1}</p>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove question ${index + 1}`}
            className="text-xs font-medium text-neutral-500 transition-colors hover:text-red-400"
          >
            Remove
          </button>
        ) : null}
      </div>
      <input
        type="text"
        placeholder="e.g. Does this work on WordPress?"
        value={entry.question}
        onChange={(ev) => onChange({ question: ev.target.value })}
        className={`${inputClass} mt-3`}
      />
      <textarea
        placeholder="The answer, in plain text - this is what gets marked up as the accepted answer."
        value={entry.answer}
        onChange={(ev) => onChange({ answer: ev.target.value })}
        rows={3}
        className={`${inputClass} mt-2.5 resize-y`}
      />
      {hasContent && issues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {issues.map((issue) => (
            <li key={issue} className="text-xs text-amber-300">
              {issueLabel(issue)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Output({
  scriptTag,
  jsonLd,
  includedCount,
  totalWithContent,
  copied,
  onCopy,
}: {
  scriptTag: string | null;
  jsonLd: ReturnType<typeof buildFaqJsonLd>;
  includedCount: number;
  totalWithContent: number;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!jsonLd || !scriptTag) {
    return (
      <div className="rounded-xl bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
        {totalWithContent === 0
          ? "Fill in at least one question and answer above to generate valid FAQPage JSON-LD."
          : "None of your questions are ready yet - fix the issues flagged above to generate JSON-LD."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {includedCount} of {totalWithContent} question{totalWithContent === 1 ? "" : "s"} included
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
        >
          {copied ? "Copied ✓" : "Copy script tag"}
        </button>
      </div>

      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Preview</p>
        <div className="mt-3 divide-y divide-neutral-800">
          {jsonLd.mainEntity.map((q, i) => (
            <details key={`${q.name}-${i}`} className="group py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-neutral-100 marker:content-none">
                {q.name}
              </summary>
              <p className="mt-1.5 text-sm text-neutral-400">{q.acceptedAnswer.text}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">FAQPage JSON-LD</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-950 p-3 text-xs text-neutral-200">
          <code className="font-mono">{scriptTag}</code>
        </pre>
      </div>
    </div>
  );
}
