# Contributing

Thanks for considering it. Before you open anything, three ground rules that
save everyone time:

## 1. Open an issue before a PR

This is a deliberately small, opinionated codebase run by one maintainer.
PRs that show up without a prior issue - especially large ones - will mostly
be closed, not because the work is bad but because unplanned surface area is
the most expensive thing you can add to a solo project. Describe the problem
first; if the direction fits, the PR is welcome.

Exceptions where a direct PR is fine: typo fixes, doc corrections, an
obvious one-line bug fix with a repro.

## 2. AI-assisted PRs: you must understand every line

Plenty of this project was built with Claude Code, and the product itself
exists to put an agent to work, so AI-assisted PRs are obviously welcome.
But *you* are the author.
If a review question about your own diff gets an answer you can't give
without asking the model, the PR gets closed. Untested, unread AI output
("slop PRs") is the fastest way to get banned from the repo. Concretely:

- Run `pnpm build` before pushing - it's the typecheck; there is no test suite.
- Test the actual behavior you changed, and say in the PR how you tested it.
- No drive-by refactors, reformatting, or "improved" comments around your change.

## 3. Match the project's conventions

The repo's [CLAUDE.md](CLAUDE.md) is the source of truth for architecture
and conventions (it's written for agents, which makes it unusually precise
documentation for humans too). The ones people trip on:

- **Every feature ships with an MCP version.** Dashboard capability and MCP
  tool are two doors to the same state - logic goes in `src/lib/`, called
  from both. A dashboard-only feature is half a feature.
- **Migrations are additive and numbered.** New file, never edit an old one;
  new columns need defaults that keep in-flight rows valid.
- **Server-only modules stay server-only.** Nothing that touches
  `SUPABASE_SERVICE_ROLE_KEY` or other secrets may reach a client bundle.
- **Working > pretty.** Single-user ethos, no over-engineering, deferred
  ideas go to `LATER.md`.

## Development setup

```bash
pnpm install
cp .env.local.example .env.local   # fill it in - see docs/SELF_HOSTING.md
pnpm dev                            # localhost:3000
pnpm build                          # the check that must pass
```

You'll need your own free Supabase project with the migrations applied
([docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) walks through it).

## Security issues

Not here - see [SECURITY.md](SECURITY.md) for private reporting.
