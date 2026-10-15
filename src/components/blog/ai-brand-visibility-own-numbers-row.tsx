// This site's own get_ai_visibility totals as of 2026-10-14, pulled by the
// run that wrote the guide. Unflattering on purpose: it is the honest
// baseline of a young domain, and every number is also written in the prose.

import { StatRow, BigStatTile } from "@/components/ui";

export function AiBrandVisibilityOwnNumbersRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Claude, cited"
          value="1 of 110"
          sub="110 checks, 110 answers. One citation, on 2026-09-16, never repeated."
        />
        <BigStatTile
          title="Google AI Overview, cited"
          value="0 of 89"
          sub="91 checks, 89 returned an overview. None named dispatchseo.com."
        />
        <BigStatTile
          title="Sweeps in the log"
          value="15"
          sub="Check days from 2026-09-02 to 2026-10-14, 15 to 90 queries each."
        />
      </StatRow>
      <p className="mt-3 text-xs text-neutral-500">
        get_ai_visibility, read 2026-10-15. A months-old domain with 11 clicks in 28 days, not a broken pipeline.
      </p>
    </div>
  );
}
