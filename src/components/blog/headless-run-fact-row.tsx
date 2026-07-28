// A real claude -p --output-format json invocation, run from this exact
// sandbox during this guide's own build - not a doctored example. It failed
// (no stored Claude credentials in this CI environment), and that failure is
// the point: the JSON envelope's is_error field and the process exit code
// agree, which is what a CI step actually greps for, not the prose in
// "result".

import { StatRow, BigStatTile } from "@/components/ui";

export function HeadlessRunFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Process exit code"
          value="1"
          sub='claude -p "pong" --output-format json, run in this CI sandbox'
        />
        <BigStatTile
          title="JSON is_error field"
          value="true"
          sub="Matches the exit code exactly - the field a script should gate on"
        />
        <BigStatTile
          title="result field"
          value="Not logged in"
          sub="Human-readable prose in the response - useful for a log, wrong thing to parse for pass/fail"
        />
      </StatRow>
    </div>
  );
}
