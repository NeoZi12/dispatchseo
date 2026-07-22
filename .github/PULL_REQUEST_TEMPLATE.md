## What and why

<!-- One or two sentences. Link the issue this came from - PRs without a
     prior issue are usually closed (see CONTRIBUTING.md). Typo fixes and
     obvious one-line bug fixes with a repro are the exception. -->

Closes #

## How I tested it

<!-- Concretely: what you ran, what you clicked, what happened.
     "It compiles" is not testing. -->

## Checklist

- [ ] `pnpm build` passes (it's the typecheck - there is no separate test suite)
- [ ] I understand every line in this diff, including the AI-assisted ones,
      and can answer review questions without asking a model
- [ ] No drive-by refactors, reformatting, or comment "improvements" around the change
- [ ] If this touches state (reads, writes, approvals, config): both the
      dashboard and the matching MCP tool ship, or the PR explains why not
