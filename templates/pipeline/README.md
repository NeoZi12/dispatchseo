# Pipeline templates (the canonical repo-side shim)

These are the files `get_pipeline_pack` serves to a connected repo's install
run - GitHub workflows, MCP configs, and thin slash commands. **This
directory is the single source of truth.** Almost everything here is under
hidden directories (`.github/`, `.claude/`), so use `ls -a`.

- Placeholders `{{SITE_NAME}}`, `{{DOMAIN}}`, `{{BACKEND_URL}}` are
  substituted per project at serve time (`src/lib/pipeline-pack.ts`).
- `pnpm build` regenerates `src/lib/pipeline-pack.json` from this directory
  before `next build`, so an edited template ships on the next deploy with
  no extra step. (`node scripts/generate-pipeline-pack.mjs` does it by hand,
  `--check` verifies sync.)
- Connected repos (including this repo's own dogfood copies in
  `.github/workflows/`) are *consumers*: a fix proven in one of them must be
  ported into the template here, or new installs will not get it.
- Stack-specific spots (pnpm vs npm, content dirs, dev port, public env
  placeholders) are intentionally reference-stack defaults - the install
  playbook (`src/lib/instructions/install.ts`) tells the agent to adapt them
  to the target repo.
