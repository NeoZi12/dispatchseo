"use client";

// The Keyword Clustering Tool widget: paste a keyword list, get back groups
// with a "should this be one page or several" verdict per group. Everything
// runs in this component - no fetch, no backend, nothing pasted ever leaves
// the browser. See src/lib/keyword-clustering.ts for the clustering itself;
// this file is just state + the paste-box/results UI around it.

import { useState } from "react";
import { clusterKeywords, MAX_KEYWORDS, type ClusterResult, type ClusterVerdict } from "@/lib/keyword-clustering";

const VERDICT_COPY: Record<ClusterVerdict, { badge: string; cls: string; note: string }> = {
  "same-page": {
    badge: "Same page",
    cls: "bg-violet-500/10 text-violet-400",
    note: "These read as near-duplicate searches - build one page, or you risk two pages competing for the same query.",
  },
  sections: {
    badge: "One page, multiple sections",
    cls: "bg-neutral-800 text-neutral-300",
    note: "Related enough to serve from one page as separate headings, distinct enough to size each section on its own.",
  },
  standalone: {
    badge: "Standalone page",
    cls: "bg-emerald-500/10 text-emerald-400",
    note: "Nothing else pasted shares real overlap with this one - safe to build its own page.",
  },
};

export function KeywordClusteringTool() {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<ClusterResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const lineCount = raw.split("\n").filter((l) => l.trim().length > 0).length;
  const canCluster = lineCount >= 2;

  function handleChange(value: string) {
    setRaw(value);
    setResult(null);
  }

  function analyze() {
    setResult(clusterKeywords(raw.split("\n")));
  }

  function copyCluster(id: string, keywords: string[]) {
    navigator.clipboard.writeText(keywords.join("\n")).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((k) => (k === id ? null : k)), 1600);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Keywords</p>
        <textarea
          value={raw}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={"One keyword per line, e.g.\nbest running shoes for flat feet\ntop running shoes for flat feet\nemail deliverability tips"}
          rows={8}
          className="mt-2.5 w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60"
        />
        {lineCount > 0 && lineCount > MAX_KEYWORDS ? (
          <p className="mt-1.5 text-xs text-amber-300">
            Only the first {MAX_KEYWORDS} unique keywords are clustered - trim the list to see the rest.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canCluster}
          onClick={analyze}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Cluster keywords
        </button>
        {!canCluster ? (
          <span className="text-sm text-neutral-500">Paste in at least 2 keywords to cluster.</span>
        ) : null}
      </div>

      {result ? <Results result={result} copiedId={copiedId} onCopy={copyCluster} /> : null}
    </div>
  );
}

function Results({
  result,
  copiedId,
  onCopy,
}: {
  result: ClusterResult;
  copiedId: string | null;
  onCopy: (id: string, keywords: string[]) => void;
}) {
  const { clusters, uniqueCount } = result;
  const pageCount = clusters.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-xl bg-neutral-900 p-4 text-center sm:p-5">
          <p className="text-2xl font-semibold tabular-nums text-neutral-100 sm:text-3xl">{uniqueCount}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
            keyword{uniqueCount === 1 ? "" : "s"} pasted
          </p>
        </div>
        <div className="rounded-xl bg-neutral-900 p-4 text-center sm:p-5">
          <p className="text-2xl font-semibold tabular-nums text-violet-400 sm:text-3xl">{pageCount}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
            page{pageCount === 1 ? "" : "s"} recommended
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {clusters.map((cluster) => {
          const verdict = VERDICT_COPY[cluster.verdict];
          const share = uniqueCount > 0 ? Math.round((cluster.keywords.length / uniqueCount) * 100) : 0;
          return (
            <div key={cluster.id} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-100">{cluster.label}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${verdict.cls}`}>
                  {verdict.badge}
                </span>
              </div>

              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-violet-500/60"
                  style={{ width: `${Math.max(share, 4)}%` }}
                  aria-hidden="true"
                />
              </div>

              <ul className="mt-3 space-y-1">
                {cluster.keywords.map((kw) => (
                  <li key={kw} className="text-sm text-neutral-400">
                    {kw}
                  </li>
                ))}
              </ul>

              <p className="mt-2.5 text-xs text-neutral-500">{verdict.note}</p>

              <button
                type="button"
                onClick={() => onCopy(cluster.id, cluster.keywords)}
                className="mt-3 rounded-md border border-neutral-700/80 bg-neutral-800/90 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:text-white"
              >
                {copiedId === cluster.id ? "Copied ✓" : "Copy keyword list"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
