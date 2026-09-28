// A verdict per kind of scheduled job: should it run with fast mode? The
// reasoning follows the docs' own guidance (fast mode for interactive work,
// standard for long autonomous tasks and CI/CD) applied to the job shapes an
// unattended pipeline actually runs. The verdicts are this site's judgment,
// not Anthropic's.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    job: "Overnight guide or research build",
    bound: "Tool calls, fetches, builds - long wall clock",
    verdict: "Skip",
    why: "Speed is not what the run is waiting on, and it pays the premium on every token of a large context.",
  },
  {
    job: "Scheduled smoke test or status check",
    bound: "Short, mostly output tokens",
    verdict: "Optional",
    why: "Cheap either way. Faster helps only if a human reads the result the minute it lands.",
  },
  {
    job: "PR-triggered review a person waits on",
    bound: "A human is watching the clock",
    verdict: "Worth it",
    why: "This is the interactive case the docs describe - latency is felt by someone.",
  },
  {
    job: "Batch or bulk processing",
    bound: "Throughput and cost",
    verdict: "Skip",
    why: "The docs list batch and CI/CD pipelines under standard mode.",
  },
] as const;

const TONE = {
  Skip: "text-neutral-300",
  Optional: "text-amber-300",
  "Worth it": "text-emerald-400",
} as const;

export function ScheduledJobFastModeTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Scheduled job</Th>
          <Th>What bounds it</Th>
          <Th>Fast mode?</Th>
          <Th>Why</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.job}>
              <Td className="font-medium text-neutral-100">{r.job}</Td>
              <Td className="text-neutral-400">{r.bound}</Td>
              <Td className={`font-medium ${TONE[r.verdict]}`}>{r.verdict}</Td>
              <Td className="text-neutral-400">{r.why}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
