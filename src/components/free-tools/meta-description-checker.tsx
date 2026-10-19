"use client";

// The Meta Description Checker widget: paste in a batch of pages (URL,
// meta description, optional target keyword) and audit all of them at once -
// length verdict per device, a missing description, a target keyword that
// never made it into the copy, and duplicate descriptions across pages. This
// is the batch counterpart to the SEO title length checker's single live-
// typed field: neither this site's own checker nor any page-1 competitor
// audits more than one page at a time, and duplicate descriptions across a
// site are invisible to a single-field checker by construction. Everything
// runs in this component - no fetch, no backend, nothing pasted ever leaves
// the browser. See src/lib/meta-description-audit.ts for the scoring itself.

import { useMemo, useState } from "react";
import {
  auditDescriptions,
  duplicateGroups,
  type AuditedDescription,
  type DescriptionEntry,
} from "@/lib/meta-description-audit";
import { DESC_DESKTOP_AVG_CHARS, DESC_MOBILE_AVG_CHARS, DESC_SAFE_CHARS, VERDICT_LABEL, type Device, type Verdict } from "@/lib/serp-snippet";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

const VERDICT_CLASS: Record<Verdict, string> = {
  safe: "bg-emerald-500/10 text-emerald-400",
  close: "bg-amber-300/10 text-amber-300",
  truncated: "bg-red-500/10 text-red-400",
};

function emptyEntry(id: string): DescriptionEntry {
  return { id, url: "", description: "", keyword: "" };
}

export function MetaDescriptionChecker() {
  const [entries, setEntries] = useState<DescriptionEntry[]>(() => [emptyEntry("d1"), emptyEntry("d2")]);
  const [nextId, setNextId] = useState(3);
  const [device, setDevice] = useState<Device>("desktop");
  const [audited, setAudited] = useState<AuditedDescription[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const canAudit = entries.some((e) => e.description.trim().length > 0);
  const dupGroups = useMemo(() => (audited ? duplicateGroups(audited) : []), [audited]);

  function updateEntry(id: string, patch: Partial<DescriptionEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setAudited(null);
  }
  function addEntry() {
    setEntries((prev) => [...prev, emptyEntry(`d${nextId}`)]);
    setNextId((n) => n + 1);
  }
  function removeEntry(id: string) {
    setEntries((prev) => (prev.length <= 2 ? prev : prev.filter((e) => e.id !== id)));
    setAudited(null);
  }
  function runAudit() {
    setAudited(auditDescriptions(entries));
  }
  function copyNote(row: AuditedDescription) {
    const bits: string[] = [];
    if (row.missing) bits.push("no meta description");
    if (row.duplicateWith.length > 0) bits.push(`duplicates ${row.duplicateWith.length} other page(s)`);
    if (row.keywordMissing) bits.push(`missing keyword "${row.keyword}"`);
    if (bits.length === 0) bits.push(`${row.charCount} characters, looks fine`);
    navigator.clipboard.writeText(`${row.url || "(untitled page)"}: ${bits.join(", ")}`).then(() => {
      setCopiedId(row.id);
      setTimeout(() => setCopiedId((k) => (k === row.id ? null : k)), 1600);
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {entries.map((e, i) => (
          <EntryCard
            key={e.id}
            index={i}
            entry={e}
            canRemove={entries.length > 2}
            onChange={(patch) => updateEntry(e.id, patch)}
            onRemove={() => removeEntry(e.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addEntry}
          className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
        >
          + Add another page
        </button>
        <button
          type="button"
          disabled={!canAudit}
          onClick={runAudit}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Audit descriptions
        </button>
        {!canAudit ? (
          <span className="text-sm text-neutral-500">Add a meta description to at least one page.</span>
        ) : null}
      </div>

      {audited ? (
        <>
          <div className="flex items-center gap-2">
            <DeviceTab label="Desktop" active={device === "desktop"} onClick={() => setDevice("desktop")} />
            <DeviceTab label="Mobile" active={device === "mobile"} onClick={() => setDevice("mobile")} />
          </div>
          <Results
            rows={audited}
            dupGroups={dupGroups}
            device={device}
            copiedId={copiedId}
            onCopy={copyNote}
          />
        </>
      ) : null}
    </div>
  );
}

function EntryCard({
  index,
  entry,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  entry: DescriptionEntry;
  canRemove: boolean;
  onChange: (patch: Partial<DescriptionEntry>) => void;
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
          value={entry.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="Target keyword (optional)"
          value={entry.keyword}
          onChange={(e) => onChange({ keyword: e.target.value })}
          className={inputClass}
        />
      </div>
      <textarea
        placeholder="Paste this page's meta description"
        value={entry.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={2}
        className={`${inputClass} mt-2.5 resize-y`}
      />
    </div>
  );
}

function DeviceTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-violet-500 text-neutral-950"
          : "border border-neutral-700 text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
      }`}
    >
      {label}
    </button>
  );
}

function Results({
  rows,
  dupGroups,
  device,
  copiedId,
  onCopy,
}: {
  rows: AuditedDescription[];
  dupGroups: AuditedDescription[][];
  device: Device;
  copiedId: string | null;
  onCopy: (row: AuditedDescription) => void;
}) {
  const avgChars = device === "desktop" ? DESC_DESKTOP_AVG_CHARS : DESC_MOBILE_AVG_CHARS;
  const flagged = rows.filter(
    (r) => r.missing || r.keywordMissing || r.duplicateWith.length > 0 || (device === "desktop" ? r.desktopVerdict : r.mobileVerdict) !== "safe",
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {dupGroups.length > 0 ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 sm:p-5">
          <p className="text-sm font-medium text-red-400">
            {dupGroups.length} duplicate description{dupGroups.length === 1 ? "" : "s"} found
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Google may pick a different canonical page when two descriptions are identical, and it stops
            either snippet from saying anything distinct in search results.
          </p>
          <ul className="mt-3 space-y-1.5">
            {dupGroups.map((group, i) => (
              <li key={i} className="text-sm text-neutral-300">
                {group.map((r) => r.url || "(untitled page)").join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {flagged.length === 0 ? `All ${rows.length} descriptions look fine` : `${flagged.length} of ${rows.length} need attention`}
        </p>
        {rows.map((row) => {
          const verdict = device === "desktop" ? row.desktopVerdict : row.mobileVerdict;
          return (
            <div key={row.id} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-100">{row.url || "(untitled page)"}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[verdict]}`}>
                  {row.missing ? "No meta description" : VERDICT_LABEL[verdict]}
                </span>
              </div>
              {!row.missing ? (
                <p className="mt-1.5 text-xs text-neutral-500">
                  {row.charCount} / {avgChars} chars ({device}) - {DESC_SAFE_CHARS} is a safe target
                </p>
              ) : null}
              {row.duplicateWith.length > 0 ? (
                <p className="mt-2 text-xs text-amber-300">
                  Identical to {row.duplicateWith.length} other page{row.duplicateWith.length === 1 ? "" : "s"} above.
                </p>
              ) : null}
              {row.keywordMissing ? (
                <p className="mt-2 text-xs text-amber-300">
                  Target keyword &quot;{row.keyword}&quot; doesn&apos;t appear in this description.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => onCopy(row)}
                className="mt-3 rounded-md border border-neutral-700/80 bg-neutral-800/90 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:text-white"
              >
                {copiedId === row.id ? "Copied ✓" : "Copy audit note"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
