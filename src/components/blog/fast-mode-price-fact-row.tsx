// Fast mode's published per-token prices and speed claim, from
// code.claude.com/docs/en/fast-mode and platform.claude.com/docs/en/
// build-with-claude/fast-mode (both fetched fresh for this guide). Shown as
// real text so the numbers are readable by crawlers, not just by eye.

import { StatRow, BigStatTile } from "@/components/ui";

export function FastModePriceFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Speed"
          value="up to 2.5x"
          sub="Output tokens per second - the gain is in output speed, not time to first token"
        />
        <BigStatTile
          title="Opus 5.5, fast"
          value="$8 / $40"
          sub="Per million input / output tokens, flat across the 1M-token context window"
        />
        <BigStatTile
          title="Opus 5 and 4.8, fast"
          value="$10 / $50"
          sub="Per million input / output tokens - Opus 4.7 has no fast mode at all"
        />
      </StatRow>
    </div>
  );
}
