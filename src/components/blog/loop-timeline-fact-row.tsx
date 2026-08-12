// This exact guide's own trip through the queue - real timestamps from the
// suggestion record (get_suggestions/get_build_brief), pulled during the
// session that wrote it, not a hypothetical pipeline diagram.

import { StatRow, BigStatTile } from "@/components/ui";

export function LoopTimelineFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Seconds from proposed to approved"
          value="31"
          sub="research flagged this keyword and auto-approved it in the same session - no dashboard click"
        />
        <BigStatTile
          title="Days from approved to built"
          value="13"
          sub="the wait was the one-guide-a-day pace, not a backlog nobody looked at"
        />
        <BigStatTile
          title="Guides still queued behind this one"
          value="6"
          sub="already researched, already approved, waiting for tomorrow's slot and the days after"
        />
      </StatRow>
    </div>
  );
}
