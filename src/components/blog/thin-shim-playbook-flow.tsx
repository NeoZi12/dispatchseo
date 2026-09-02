// The real command that built THIS guide: .claude/commands/seo-build.md in
// this repo is four lines, none of them the actual instructions - traced from
// the real file on disk, not a hypothetical.

const STEPS = [
  { label: "You (or a scheduled workflow) type /seo-build", detail: "Claude Code finds .claude/commands/seo-build.md and loads its body as the next message" },
  { label: "The command's whole body is one instruction", detail: "\"call get_instructions with workflow build-guide and follow the returned markdown exactly\" - no pipeline logic lives in the file itself" },
  { label: "Claude calls the seo-manager MCP tool get_instructions", detail: "the file has no idea what the pipeline actually does - it just knows where to ask" },
  { label: "The MCP server returns the current playbook", detail: "this run got version 2026-08-20.2 - template, thin-content gate, visuals, humanizer, PR, all versioned server-side" },
  { label: "Claude follows that returned markdown for the rest of the run", detail: "editing the playbook never touches the command file, so every connected repo picks up the change on its next run" },
] as const;

export function ThinShimPlaybookFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
