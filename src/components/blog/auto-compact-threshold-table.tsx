// Default auto-compact trigger points by model, from
// code.claude.com/docs/en/model-config#default-auto-compact-thresholds
// (fetched fresh for this guide) - the numbers behind "why did it compact
// right there" when nobody set a window on purpose.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    model: "Sonnet 5, Fable models, Opus 4.7+ (native 1M context)",
    threshold: "~967K tokens",
  },
  {
    model: "Sonnet 4.6 and Opus 4.6 without extended context",
    threshold: "200K token boundary",
  },
  {
    model: "Any 1M-context model with CLAUDE_CODE_DISABLE_1M_CONTEXT=1 set",
    threshold: "200K token boundary",
  },
  {
    model: "Cloud-hosted sessions",
    threshold: "As the conversation approaches the model's own limit",
  },
  {
    model: "Every other model",
    threshold: "At that model's context limit",
  },
] as const;

export function AutoCompactThresholdTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Model / session</Th>
          <Th>Default auto-compact trigger</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.model}>
              <Td className="font-medium text-neutral-100">{r.model}</Td>
              <Td className="font-mono text-xs text-neutral-400">{r.threshold}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
