// Pure, client-safe logic behind the Meta Description Checker widget: audits
// a BATCH of pages at once (not one live-typed field like the SEO title
// length checker) for the three things a single-page checker can't catch -
// duplicate descriptions across pages, a missing description, and a target
// keyword that never made it into the copy - plus the same length verdict
// every page-level checker gives. Reuses the sourced thresholds from
// serp-snippet.ts so both tools agree on what "safe" means. No network
// calls, no DOM - kept isolated from the widget so it can be hand-tested.

import { descriptionVerdict, type Device, type Verdict } from "@/lib/serp-snippet";

export type DescriptionEntry = {
  id: string;
  url: string;
  description: string;
  keyword: string;
};

export type AuditedDescription = {
  id: string;
  url: string;
  description: string;
  charCount: number;
  missing: boolean;
  desktopVerdict: Verdict;
  mobileVerdict: Verdict;
  keyword: string;
  keywordMissing: boolean;
  /** ids of other entries whose description is identical once normalized. */
  duplicateWith: string[];
};

// Duplicates are compared on trimmed, whitespace-collapsed, lowercased text -
// exact-match only. Fuzzy near-duplicate scoring would trade a mechanical,
// explainable result for a guess; a content audit needs to know precisely
// which pages are byte-for-byte the same, which is what Search Console's own
// "duplicate, Google chose different canonical" signal is reacting to.
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function auditDescriptions(entries: DescriptionEntry[]): AuditedDescription[] {
  const usable = entries.filter((e) => e.description.trim().length > 0 || e.url.trim().length > 0);

  const groups = new Map<string, string[]>();
  for (const e of usable) {
    const norm = normalize(e.description);
    if (!norm) continue;
    const group = groups.get(norm) ?? [];
    group.push(e.id);
    groups.set(norm, group);
  }

  return usable.map((e): AuditedDescription => {
    const trimmed = e.description.trim();
    const charCount = trimmed.length;
    const missing = charCount === 0;
    const norm = normalize(e.description);
    const group = norm ? (groups.get(norm) ?? []) : [];
    const duplicateWith = group.filter((id) => id !== e.id);

    const keyword = e.keyword.trim();
    const keywordMissing = keyword.length > 0 && !trimmed.toLowerCase().includes(keyword.toLowerCase());

    return {
      id: e.id,
      url: e.url.trim(),
      description: trimmed,
      charCount,
      missing,
      desktopVerdict: missing ? "truncated" : descriptionVerdict(charCount, "desktop" as Device),
      mobileVerdict: missing ? "truncated" : descriptionVerdict(charCount, "mobile" as Device),
      keyword,
      keywordMissing,
      duplicateWith,
    };
  });
}

export function duplicateGroups(rows: AuditedDescription[]): AuditedDescription[][] {
  const seen = new Set<string>();
  const out: AuditedDescription[][] = [];
  for (const row of rows) {
    if (row.duplicateWith.length === 0 || seen.has(row.id)) continue;
    const groupIds = new Set([row.id, ...row.duplicateWith]);
    const group = rows.filter((r) => groupIds.has(r.id));
    group.forEach((r) => seen.add(r.id));
    out.push(group);
  }
  return out;
}
