// What `claude -p` actually loaded, measured for this guide: Claude Code
// 2.1.285, reading the tool list off the system/init event under three
// environment settings and three models. The numbers are the tool names the
// init event returned, shown as real text so the finding is readable by
// crawlers - the whole point is that the default silently differs by model.

const ROWS = [
  { model: "claude-opus-5-5", byDefault: "none", optIn: "TaskCreate, TaskGet, TaskList, TaskUpdate", legacy: "TodoWrite", missing: true },
  { model: "claude-sonnet-4-6", byDefault: "TaskCreate, TaskGet, TaskList, TaskUpdate", optIn: "TaskCreate, TaskGet, TaskList, TaskUpdate", legacy: "TodoWrite", missing: false },
  { model: "claude-haiku-4-5", byDefault: "TaskCreate, TaskGet, TaskList, TaskUpdate", optIn: "TaskCreate, TaskGet, TaskList, TaskUpdate", legacy: "TodoWrite", missing: false },
];

export function TaskToolAvailabilityMatrix() {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl bg-neutral-900 p-4 sm:p-5">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-neutral-500">
            <th className="pb-3 pr-4 font-medium">Model</th>
            <th className="pb-3 pr-4 font-medium">Default</th>
            <th className="pb-3 pr-4 font-medium">CLAUDE_CODE_ENABLE_TODO_TOOLS=1</th>
            <th className="pb-3 font-medium">…and CLAUDE_CODE_ENABLE_TASKS=0</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/70">
          {ROWS.map((r) => (
            <tr key={r.model} className="align-top">
              <td className="py-3 pr-4 font-mono text-xs text-neutral-100">{r.model}</td>
              <td className={`py-3 pr-4 ${r.missing ? "font-medium text-amber-300" : "text-emerald-400"}`}>{r.byDefault}</td>
              <td className="py-3 pr-4 text-neutral-300">{r.optIn}</td>
              <td className="py-3 text-neutral-300">{r.legacy}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-neutral-500">Claude Code 2.1.285, tool names read from the system/init event of claude -p.</p>
    </div>
  );
}
