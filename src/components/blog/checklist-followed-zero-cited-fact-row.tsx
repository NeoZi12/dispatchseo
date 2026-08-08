// This project's own get_ai_visibility numbers, pulled live while writing
// this guide (2026-08-08, site is 23 days old, 21 guides published - all of
// them already following the tactics-checklist above). Real and unflattering:
// the checklist alone hasn't produced a single citation yet.

import { StatRow, BigStatTile } from "@/components/ui";

export function ChecklistFollowedZeroCitedFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="ChatGPT, cited"
          value="0 of 15"
          sub="15 target queries checked, all 15 got an AI answer - none named dispatchseo.com"
        />
        <BigStatTile
          title="Claude, cited"
          value="0 of 44"
          sub="44 checked over the same window, same result"
        />
        <BigStatTile
          title="Google AI Overview, cited"
          value="0 of 38"
          sub="33 of 38 checks returned an overview at all; 0 named this site"
        />
      </StatRow>
      <p className="mt-3 text-xs text-neutral-500">
        get_ai_visibility, checked 2026-08-08 - a 23-day-old domain with 21 guides already following
        the checklist above, not a broken pipeline.
      </p>
    </div>
  );
}
