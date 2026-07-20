// One pending trend idea awaiting the owner's queue-or-skip call, rendered
// identically on Home's radar and the Trends page. Collapsed by default -
// the "why now" walls were eating the page - with the decide buttons always
// visible outside the toggle. The helpers (age badge, keyword line, spec
// lines) live here so both surfaces and the topic cards share one source.

import { CollapsibleCard } from "./collapsible-card";
import { TakeDecideButtons } from "./client";
import type { Suggestion } from "@/lib/metrics";

function daysOld(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Hype decays - the age reads green while fresh, amber when the window is
// closing (the scan self-rejects at 14 days).
export function AgeBadge({ createdAt }: { createdAt: string }) {
  const days = daysOld(createdAt);
  return (
    <span className={`text-xs ${days > 7 ? "text-amber-400/90" : "text-emerald-400"}`}>
      {days === 0 ? "caught today" : `${days} day${days === 1 ? "" : "s"} old`}
    </span>
  );
}

export function KeywordLine({ s }: { s: Suggestion }) {
  if (!s.primary_keyword) return null;
  return (
    <span className="text-xs text-neutral-400">
      {s.primary_keyword}
      {s.keyword_volume != null ? ` · ${s.keyword_volume}/mo` : ""}
      {s.keyword_difficulty != null ? ` · KD ${s.keyword_difficulty}` : ""}
    </span>
  );
}

// Idea specs carry the hype evidence as free-form fields - render whichever
// of the known ones exist, tolerating strings and arrays alike.
export function specLines(spec: Record<string, unknown> | null | undefined) {
  if (!spec) return [];
  const label: Record<string, string> = {
    why_now: "Why now",
    signals: "Signals",
    angle: "Angle",
    serp_notes: "Page 1",
  };
  const lines: { label: string; text: string }[] = [];
  for (const key of Object.keys(label)) {
    const v = spec[key];
    const text = Array.isArray(v)
      ? v.filter((x) => typeof x === "string").join(" · ")
      : typeof v === "string"
        ? v
        : null;
    if (text) lines.push({ label: label[key], text });
  }
  return lines;
}

// A seeded idea grew from one specific viral post/video. The link renders as
// an anchor - the owner judges the source before approving - so it lives
// outside specLines' text-only rows. Shared by idea cards and topic cards.
export function SeedLine({ from }: { from: Record<string, unknown> | null | undefined }) {
  const url =
    from && typeof from.seed_url === "string" && /^https?:\/\//.test(from.seed_url)
      ? from.seed_url
      : null;
  if (!url) return null;
  const stats = from && typeof from.seed_stats === "string" ? from.seed_stats : null;
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <p className="text-xs text-neutral-400">
      <span className="font-medium text-neutral-300">Seeded by:</span>{" "}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
      >
        {host}
      </a>
      {stats ? ` · ${stats}` : ""}
    </p>
  );
}

export function IdeaCard({
  s,
  fromTopic,
}: {
  s: Suggestion;
  fromTopic?: string | null;
}) {
  const lines = specLines(s.spec);
  return (
    <CollapsibleCard
      toggleLabel="Show why now"
      header={
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-sky-400">Idea</span>
            {s.type === "update" ? (
              <span className="text-xs font-medium text-amber-400/90">Update existing page</span>
            ) : null}
            <AgeBadge createdAt={s.created_at} />
            <KeywordLine s={s} />
          </div>
          <div className="space-y-0.5">
            <p className="font-medium">{s.title}</p>
            {/* the source subject, so pulling ideas out of their topic card
                doesn't lose the connection */}
            {fromTopic ? <p className="text-xs text-neutral-400">from: {fromTopic}</p> : null}
          </div>
        </>
      }
      actions={<TakeDecideButtons id={s.id} />}
    >
      {s.rationale ? <p className="text-sm text-neutral-400">{s.rationale}</p> : null}
      {lines.length > 0 || s.spec?.seed_url ? (
        <div className="space-y-1 border-t border-neutral-800/70 pt-2">
          <SeedLine from={s.spec} />
          {lines.map((l) => (
            <p key={l.label} className="text-xs text-neutral-400">
              <span className="font-medium text-neutral-300">{l.label}:</span> {l.text}
            </p>
          ))}
        </div>
      ) : null}
    </CollapsibleCard>
  );
}
