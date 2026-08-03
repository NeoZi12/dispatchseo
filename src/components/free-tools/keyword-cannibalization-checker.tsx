"use client";

// The Keyword Cannibalization Checker widget: paste in the URL, title, and
// target keyword of a few pages and get back which pairs are likely
// competing for the same search query, plus which one to keep as canonical.
// Everything runs in this component - no fetch, no backend, nothing pasted
// ever leaves the browser. See src/lib/keyword-cannibalization-analysis.ts
// for the scoring itself; this file is just state + the entry-list/results
// UI around it.

import { useState } from "react";
import {
  analyzeCannibalization,
  type CannibalizationPage,
  type CannibalizationSuggestion,
} from "@/lib/keyword-cannibalization-analysis";

type PageEntry = { id: string; url: string; title: string; keyword: string };

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

function emptyPage(id: string): PageEntry {
  return { id, url: "", title: "", keyword: "" };
}

export function KeywordCannibalizationChecker() {
  const [pages, setPages] = useState<PageEntry[]>(() => [emptyPage("p1"), emptyPage("p2")]);
  const [nextId, setNextId] = useState(3);
  const [results, setResults] = useState<CannibalizationSuggestion[] | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filledCount = pages.filter((p) => p.keyword.trim().length > 0).length;
  const canAnalyze = filledCount >= 2;

  function updatePage(id: string, patch: Partial<PageEntry>) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setResults(null);
  }
  function addPage() {
    setPages((prev) => [...prev, emptyPage(`p${nextId}`)]);
    setNextId((n) => n + 1);
  }
  function removePage(id: string) {
    setPages((prev) => (prev.length <= 2 ? prev : prev.filter((p) => p.id !== id)));
    setResults(null);
  }
  function analyze() {
    const usable: CannibalizationPage[] = pages
      .filter((p) => p.keyword.trim().length > 0)
      .map((p, i) => ({
        id: p.id,
        url: p.url.trim() || `Page ${i + 1}`,
        title: p.title.trim(),
        keyword: p.keyword.trim(),
      }));
    setResults(analyzeCannibalization(usable));
  }
  function copyNote(s: CannibalizationSuggestion) {
    const key = `${s.aId}-${s.bId}`;
    const note = `${s.aTitle || s.aUrl} and ${s.bTitle || s.bUrl} both target "${s.sharedTerms.join(" ")}" - ${s.keepReason}`;
    navigator.clipboard.writeText(note).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {pages.map((p, i) => (
          <PageCard
            key={p.id}
            index={i}
            page={p}
            canRemove={pages.length > 2}
            onChange={(patch) => updatePage(p.id, patch)}
            onRemove={() => removePage(p.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addPage}
          className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
        >
          + Add another page
        </button>
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={analyze}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Check for cannibalization
        </button>
        {!canAnalyze ? (
          <span className="text-sm text-neutral-500">Add a target keyword to at least 2 pages to check.</span>
        ) : null}
      </div>

      {results ? <Results results={results} copiedKey={copiedKey} onCopy={copyNote} /> : null}
    </div>
  );
}

function PageCard({
  index,
  page,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  page: PageEntry;
  canRemove: boolean;
  onChange: (patch: Partial<PageEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Page {index + 1}</p>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove page ${index + 1}`}
            className="text-xs font-medium text-neutral-500 transition-colors hover:text-red-400"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <input
          type="url"
          inputMode="url"
          placeholder="https://yoursite.com/some-page (optional)"
          value={page.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Page title (optional, sharpens the canonical pick)"
          value={page.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className={inputClass}
        />
      </div>
      <input
        type="text"
        placeholder="Target keyword, e.g. best running shoes for flat feet"
        value={page.keyword}
        onChange={(e) => onChange({ keyword: e.target.value })}
        className={`${inputClass} mt-2.5`}
      />
    </div>
  );
}

function severityBadge(severity: CannibalizationSuggestion["severity"]): { label: string; cls: string } {
  if (severity === "direct") return { label: "Direct cannibalization", cls: "bg-red-500/10 text-red-400" };
  return { label: "Possible overlap", cls: "bg-amber-500/10 text-amber-300" };
}

function Results({
  results,
  copiedKey,
  onCopy,
}: {
  results: CannibalizationSuggestion[];
  copiedKey: string | null;
  onCopy: (s: CannibalizationSuggestion) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
        No keyword overlap found between these pages - each one looks like it&apos;s targeting a distinct query.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {results.length} conflict{results.length === 1 ? "" : "s"} found
      </p>
      {results.map((s) => {
        const key = `${s.aId}-${s.bId}`;
        const badge = severityBadge(s.severity);
        const keepLabel = s.keepId === s.aId ? s.aTitle || s.aUrl : s.bTitle || s.bUrl;
        const mergeLabel = s.keepId === s.aId ? s.bTitle || s.bUrl : s.aTitle || s.aUrl;
        return (
          <div key={key} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-neutral-100">
                {s.aTitle || s.aUrl}
                <span className="mx-2 text-neutral-600" aria-hidden="true">
                  ×
                </span>
                {s.bTitle || s.bUrl}
              </p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-400">
              Both target{" "}
              <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-200">
                {s.sharedTerms.join(" ")}
              </code>
              . Keep <span className="text-neutral-200">{keepLabel}</span> as canonical, then merge or 301 redirect{" "}
              <span className="text-neutral-200">{mergeLabel}</span> into it.
            </p>
            <p className="mt-2 text-xs text-neutral-500">{s.keepReason}</p>
            <button
              type="button"
              onClick={() => onCopy(s)}
              className="mt-3 rounded-md border border-neutral-700/80 bg-neutral-800/90 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:text-white"
            >
              {copiedKey === key ? "Copied ✓" : "Copy note"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
