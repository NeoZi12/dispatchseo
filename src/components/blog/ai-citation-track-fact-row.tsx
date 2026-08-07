// This project's own AI-visibility numbers - the same job as Clearscope's
// Expand/Protect modules - checked live via get_ai_visibility during the
// session that wrote this guide, not an illustrative claim.

import { StatRow, BigStatTile } from "@/components/ui";

export function AiCitationTrackFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="AI-engine answers checked so far"
          value="97"
          sub="ChatGPT, Claude, and Google AI Overview combined - get_ai_visibility, this run"
        />
        <BigStatTile
          title="Of those, this site got cited"
          value="0"
          sub="still true 21 days in - the same cold-start every new site has, tracked or not"
        />
        <BigStatTile
          title="Days since this site's first guide"
          value="21"
          sub="tracking started with the site, no separate module to turn on"
        />
      </StatRow>
    </div>
  );
}
