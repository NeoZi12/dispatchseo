// Devin CLI's five permission modes, each marked by whether a run with no
// human can get through it. Mode behavior is from
// docs.devin.ai/cli/reference/permissions. The "unattended" column is this
// guide's reading of those docs: any mode where a listed action still
// prompts is one where a cron job stalls waiting for an answer.

const MODES = [
  { mode: "normal", rule: "Reads auto-approve; writes and shell commands prompt", ok: false },
  { mode: "accept-edits", rule: "Workspace edits auto-approve; shell commands still prompt", ok: false },
  { mode: "smart", rule: "A fast model judges other actions; installs, sudo and rm always prompt", ok: false },
  { mode: "autonomous", rule: "Needs --sandbox; shell and fetches auto-approve, direct file edits still prompt", ok: false },
  { mode: "bypass", rule: "Every tool call auto-approves (aliases: dangerous, yolo)", ok: true },
] as const;

export function DevinApprovalModeLadder() {
  return (
    <ul className="not-prose my-6 space-y-2 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {MODES.map((m) => (
        <li key={m.mode} className="flex items-start gap-3">
          <svg
            viewBox="0 0 24 24"
            className={`mt-0.5 h-5 w-5 shrink-0 ${m.ok ? "text-emerald-400" : "text-amber-300"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {m.ok ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            ) : (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5V12l3 2" />
              </>
            )}
          </svg>
          <div>
            <p className="font-mono text-sm text-neutral-100">
              {m.mode}{" "}
              <span className={m.ok ? "text-emerald-400" : "text-amber-300"}>
                {m.ok ? "- runs through" : "- can stall on a prompt"}
              </span>
            </p>
            <p className="text-sm text-neutral-400">{m.rule}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
