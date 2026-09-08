// The real get_ai_visibility response for this project, called live while
// writing this guide (2026-09-08) - not a "day N, zero citations" snapshot
// like this site's earlier two AI-visibility posts, but the actual per-engine
// shape the tool returns, so a reader can see what they'd get back too.

import { StatRow, BigStatTile } from "@/components/ui";

export function GeoScanCitationCallCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        get_ai_visibility - called live for this guide, 2026-09-08
      </h3>
      <div className="mt-3">
        <StatRow cols={3}>
          <BigStatTile title="ChatGPT" value="0 / 15" sub="checked, 15 got an AI answer - 0 cited dispatchseo.com" />
          <BigStatTile title="Claude" value="0 / 90" sub="checked over 90 runs since late July - still 0 cited" />
          <BigStatTile title="Google AI Overview" value="0 / 65" sub="64 of 65 checks returned an overview; 0 named this domain" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        These are the only three engines this project&apos;s own history holds data for right now - Perplexity and
        Gemini aren&apos;t in a `record_ai_citations` row yet, which is an honest gap, not a claim the tool can&apos;t
        log them.
      </p>
    </div>
  );
}
