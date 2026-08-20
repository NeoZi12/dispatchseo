// The actual page-1 organic field for "ubersuggest alternative", pulled live
// via check_serp during the session that wrote this guide - real positions,
// real domains. Ubersuggest's own homepage sits at position 9, after a rival
// keyword tool's dedicated landing page, three listicles, and a competing
// SaaS's alternative page - the searcher meets everyone else first.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const KIND_LABEL = {
  competitor: "Competing keyword tool",
  listicle: "Roundup listicle",
  saas: "Competing all-in-one SaaS",
  media: "SEO media brand",
  vendor: "Ubersuggest's own page",
  video: "Video review",
} as const;

const KIND_COLOR = {
  competitor: "bg-violet-500/10 text-violet-400",
  listicle: "bg-neutral-800 text-neutral-400",
  saas: "bg-sky-400/10 text-sky-300",
  media: "bg-amber-300/10 text-amber-300",
  vendor: "bg-emerald-500/10 text-emerald-400",
  video: "bg-red-400/10 text-red-400",
} as const;

const ROWS = [
  { pos: 1, domain: "keywordtool.io", kind: "competitor" as const, label: "\"Ubersuggest Alternative - Better Keywords, Faster\"" },
  { pos: 3, domain: "blog.answersocrates.com", kind: "listicle" as const, label: "\"Top 10 Ubersuggest Alternatives in 2025 (Free & Paid)\"" },
  { pos: 4, domain: "sitechecker.pro", kind: "saas" as const, label: "\"Ubersuggest Alternative for Agencies with White Label\"" },
  { pos: 5, domain: "seo.com", kind: "media" as const, label: "\"12 Ubersuggest Alternatives To Consider for 2026\"" },
  { pos: 7, domain: "outsourceaccelerator.com", kind: "listicle" as const, label: "\"Top 10 SEO software to use as an Ubersuggest alternative\"" },
  { pos: 8, domain: "morningscore.io", kind: "saas" as const, label: "\"Simple all-in-one SEO tool | Ubersuggest alternative\"" },
  { pos: 9, domain: "app.neilpatel.com", kind: "vendor" as const, label: "Ubersuggest's own homepage" },
  { pos: 10, domain: "youtube.com", kind: "video" as const, label: "\"Ubersuggest Review - Keyword Research, AI Writer, and ...\"" },
] as const;

export function UbersuggestSerpFieldTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Pos</Th>
          <Th>Domain</Th>
          <Th>What's there</Th>
          <Th>Result</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.pos}>
              <Td className="tabular-nums text-neutral-500">{r.pos}</Td>
              <Td className="font-mono text-neutral-100">{r.domain}</Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_COLOR[r.kind]}`}>
                  {KIND_LABEL[r.kind]}
                </span>
              </Td>
              <Td className="text-neutral-400">{r.label}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Eight results, checked live: one direct competitor's dedicated landing page, three listicles,
        two competing all-in-one SaaS tools, one SEO media brand, and Ubersuggest's own homepage at
        position 9 - fourth from the bottom of its own branded query.
      </p>
    </div>
  );
}
