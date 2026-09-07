// The two directories a SKILL.md can live in, per code.claude.com/docs/en/skills
// ("Personal: ~/.claude/skills/<skill-name>/SKILL.md, All your projects" /
// "Project: .claude/skills/<skill-name>/SKILL.md, This project only"). Fetched
// fresh for this guide, not carried over from memory.

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function RepoFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

const PERSONAL = [
  { title: "~/.claude/skills/<skill-name>/SKILL.md", detail: "one copy, available in every project you open on this machine" },
  { title: "Wins a name collision", detail: "per the docs' own priority order, a personal skill overrides a project skill with the same directory name" },
  { title: "Right for", detail: "your own habits and shortcuts - a writing style, a personal changelog format - that have nothing to do with any one repo" },
];

const PROJECT = [
  { title: ".claude/skills/<skill-name>/SKILL.md", detail: "committed to the repo, so it travels with a git clone and shows up in every teammate's session" },
  { title: "Loses a name collision", detail: "if a personal skill uses the same directory name, Claude loads the personal one instead - the project copy sits there unused" },
  { title: "Right for", detail: "anything specific to this codebase's own conventions, build steps, or pipeline - the shape this repo's own six SEO skills take" },
];

export function SkillScopeSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <HomeIcon />
          <h3 className="text-sm font-semibold">Personal scope</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {PERSONAL.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="font-mono text-[13px] font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sky-400">
          <RepoFolderIcon />
          <h3 className="text-sm font-semibold">Project scope</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {PROJECT.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="font-mono text-[13px] font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
