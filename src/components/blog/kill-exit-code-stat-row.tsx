// The exit codes the shell's own `timeout` left behind in the three runs shown
// in this guide (run on the CI machine that built the page). Each number is
// real DOM text; the card is just the frame. Codes are what a scheduled-run
// wrapper has to branch on to tell "timed out" from "failed".

const STATS = [
  {
    code: "124",
    label: "Child outlived the limit",
    detail: "timeout 2 sleep 10 - SIGTERM was enough",
  },
  {
    code: "124",
    label: "Same code on SIGINT",
    detail: "timeout -s INT 2 sleep 10 - the signal changes, the code doesn't",
  },
  {
    code: "137",
    label: "Child ignored SIGTERM",
    detail: "--kill-after=1 sent SIGKILL (128 + 9) and 124 never appeared",
  },
] as const;

export function KillExitCodeStatRow() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {STATS.map((s) => (
        <div key={s.label} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <p className="font-mono text-3xl font-semibold text-violet-400">{s.code}</p>
          <p className="mt-2 text-sm font-medium text-neutral-100">{s.label}</p>
          <p className="mt-1.5 border-t border-neutral-800/70 pt-2.5 font-mono text-xs leading-relaxed text-neutral-500">
            {s.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
