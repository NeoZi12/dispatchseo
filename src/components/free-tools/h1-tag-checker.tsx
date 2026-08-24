"use client";

// The H1 Tag Checker widget: paste a page's HTML, get back exactly what's
// wrong with its H1 tags (none found, more than one, awkward length, or a
// weak match to your target keyword) and a concrete fix for each. Everything
// runs in this component - no fetch, no backend, nothing pasted ever leaves
// the browser. See src/lib/h1-checker-analysis.ts for the parsing and
// scoring itself; this file is just state + the paste/results UI around it.

import { useState } from "react";
import {
  checkH1s,
  H1_MAX_CHARS,
  H1_MIN_CHARS,
  type H1CheckResult,
  type H1Finding,
  type IssueSeverity,
} from "@/lib/h1-checker-analysis";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

const HTML_PLACEHOLDER = `<html>
  <body>
    <h1>Your page's main heading</h1>
    <p>...</p>
  </body>
</html>`;

const SEVERITY_CLASS: Record<IssueSeverity, string> = {
  error: "bg-red-500/10 text-red-400",
  warning: "bg-amber-300/10 text-amber-300",
  info: "bg-neutral-800 text-neutral-400",
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: "Issue",
  warning: "Heads up",
  info: "Note",
};

export function H1TagChecker() {
  const [html, setHtml] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<H1CheckResult | null>(null);

  const canAnalyze = html.trim().length > 0;

  function analyze() {
    setResult(checkH1s(html, keyword));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="h1c-html">
          Page HTML
        </label>
        <textarea
          id="h1c-html"
          placeholder={HTML_PLACEHOLDER}
          value={html}
          onChange={(e) => {
            setHtml(e.target.value);
            setResult(null);
          }}
          rows={10}
          className={`${inputClass} mt-2 resize-y font-mono text-xs`}
        />
        <p className="mt-1.5 text-xs text-neutral-500">
          Right-click your page and choose &quot;View Page Source&quot; (or open dev tools and copy the &lt;body&gt;
          markup), then paste the whole thing here.
        </p>

        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="h1c-keyword">
          Target keyword <span className="normal-case text-neutral-600">(optional)</span>
        </label>
        <input
          id="h1c-keyword"
          type="text"
          placeholder="e.g. h1 tag checker"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setResult(null);
          }}
          className={`${inputClass} mt-2`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={analyze}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Check H1 tags
        </button>
        {!canAnalyze ? (
          <span className="text-sm text-neutral-500">Paste your page&apos;s HTML to check its H1 tags.</span>
        ) : null}
      </div>

      {result ? <Results result={result} /> : null}
    </div>
  );
}

function Results({ result }: { result: H1CheckResult }) {
  return (
    <div className="space-y-4">
      {result.issues.length === 0 ? (
        <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
          Looks good - no issues found.
        </div>
      ) : (
        <div className="space-y-2.5">
          {result.issues.map((issue, i) => (
            <div key={i} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-100">{issue.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[issue.severity]}`}>
                  {SEVERITY_LABEL[issue.severity]}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-400">{issue.detail}</p>
            </div>
          ))}
        </div>
      )}

      {result.h1s.length > 0 ? (
        <div className="space-y-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {result.h1s.length} H1 tag{result.h1s.length === 1 ? "" : "s"} found
          </p>
          {result.h1s.map((h1, i) => (
            <H1Card key={i} h1={h1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function H1Card({ h1 }: { h1: H1Finding }) {
  const totalTerms = h1.matchedTerms.length + h1.missingTerms.length;
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-sm text-neutral-100">&quot;{h1.text}&quot;</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            h1.lengthVerdict === "good" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-300/10 text-amber-300"
          }`}
        >
          {h1.length} chars ({H1_MIN_CHARS}-{H1_MAX_CHARS} is a comfortable range)
        </span>
        {h1.keywordScore !== null ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              h1.keywordScore === 1
                ? "bg-emerald-500/10 text-emerald-400"
                : h1.keywordScore === 0
                  ? "bg-red-500/10 text-red-400"
                  : "bg-amber-300/10 text-amber-300"
            }`}
          >
            {h1.matchedTerms.length}/{totalTerms} keyword terms matched
          </span>
        ) : null}
      </div>
    </div>
  );
}
