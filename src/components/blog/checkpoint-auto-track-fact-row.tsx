// The three numbers that define automatic checkpointing, straight from Claude
// Code's own checkpointing docs (code.claude.com/docs/en/checkpointing) - not
// a paraphrase of "it saves your work periodically."

import { StatRow, BigStatTile } from "@/components/ui";

export function CheckpointAutoTrackFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="A checkpoint is created"
          value="Every prompt"
          sub="one snapshot per user message, taken before that turn's edits land"
        />
        <BigStatTile
          title="Kept per session"
          value="100"
          sub="the 100 most recent checkpoints - older ones are discarded"
        />
        <BigStatTile
          title="Default retention"
          value="30 days"
          sub="deleted with the session; change it via cleanupPeriodDays"
        />
      </StatRow>
    </div>
  );
}
