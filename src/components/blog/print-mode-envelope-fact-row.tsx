// Three real `claude -p --output-format json` invocations, run from this
// exact sandbox during this guide's own build (Claude Code 2.1.220) - not a
// doctored example. All three fail the same way (no stored login in this CI
// environment), and trying it three different ways is the point: it shows
// auth resolves before --bare or --max-turns ever get a turn to spend.

import { StatRow, BigStatTile } from "@/components/ui";

export function PrintModeEnvelopeFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Exit code, every flag combo tried"
          value="1"
          sub='-p alone, plus --bare, plus --max-turns 1 - three separate runs in this sandbox, same result each time'
        />
        <BigStatTile
          title="is_error / terminal_reason"
          value="true / api_error"
          sub="Both agree with the exit code - terminal_reason is worth grepping for once result's prose isn't enough"
        />
        <BigStatTile
          title="num_turns"
          value="1"
          sub="Failed on the first turn, before spending any of --max-turns' budget - auth is checked ahead of every flag above"
        />
      </StatRow>
    </div>
  );
}
