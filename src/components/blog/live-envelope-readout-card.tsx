// A real `claude -p "pong" --output-format json` invocation, run from this
// exact sandbox during this guide's own build (Claude Code 2.1.273) - not a
// doctored example. It failed (no stored login in this CI environment), and
// the field worth noticing is subtype: it reads "success" on a run that
// is_error also marks true. A script grepping subtype instead of is_error
// or the exit code would get this run backwards.

import { Mono } from "@/components/ui";

const FIELDS = [
  { field: "exit code", value: "1" },
  { field: "is_error", value: "true" },
  { field: "subtype", value: '"success" - not the field to gate on' },
  { field: "terminal_reason", value: '"api_error"' },
  { field: "num_turns", value: "1" },
  { field: "result", value: '"Not logged in · Please run /login"' },
] as const;

export function LiveEnvelopeReadoutCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        claude -p &quot;pong&quot; --output-format json, run in this build&apos;s own CI sandbox
      </h3>
      <dl className="mt-3 divide-y divide-neutral-800">
        {FIELDS.map((f) => (
          <div key={f.field} className="flex items-center justify-between gap-4 py-2 text-sm">
            <dt className="text-neutral-500">
              <Mono>{f.field}</Mono>
            </dt>
            <dd className="text-right font-medium text-neutral-100">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        is_error and the exit code agree with each other on every run; subtype tracks whether the
        turn completed, not whether it succeeded. Gate a CI step on the first two, never the third.
      </p>
    </div>
  );
}
