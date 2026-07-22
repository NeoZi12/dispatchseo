---
name: dispatchseo-setup
description: Connect a website's repo to a DispatchSEO backend and install its content pipeline. Use when the user asks to set up DispatchSEO, connect their site to it, or install the SEO pipeline.
---

# DispatchSEO setup (agent-driven)

You are connecting the CURRENT repo (the user's website) to their DispatchSEO
backend. The backend serves you versioned instructions over MCP - your job is
to connect, fetch them, and follow them exactly. Do not improvise the
pipeline; it is centrally versioned on purpose.

## What you need from the user

1. Their DispatchSEO dashboard URL (self-hosted, e.g. `http://localhost:4005`
   or their own domain, or `https://dispatchseo.com` for the hosted instance).
2. The project's setup command. It's shown on the dashboard's Home page after
   they add their site as a project - one line, containing the MCP token.

If they only have the dashboard password, tell them: log in → add the site as
a project → copy the setup command from the Home page checklist.

## Steps

1. **Run their setup command** in the site's repo root. It is a one-liner of
   the form:

   ```
   curl -fsSL <backend>/setup.sh | bash -s -- <project-key> <slug> [backend-url]
   ```

   It registers the MCP server (`dispatchseo-<slug>`) with Claude Code,
   verifies the token, and walks the user through the repo secrets the
   pipeline needs (it explains each one before asking).

2. **Fetch the playbook**: call the `get_instructions` MCP tool with
   `workflow: "install"` and follow it exactly. It writes the GitHub workflow
   files (daily builder, auto-merge, tool validation, trend scan) into
   `.github/workflows/` and chains into the `setup` workflow, which researches
   the product and writes `.dispatchseo/conventions.md`.

3. **Verify** before declaring success:
   - `get_project` returns the right domain;
   - the workflow files exist and reference the right backend URL;
   - `mark_pipeline_installed` was called (the install instructions end with it);
   - the dashboard Home page's install card has flipped to its installed state.

## Rules

- Never paste the MCP token into files, commits, or logs - it goes into
  `claude mcp add` and `gh secret set` only.
- If `get_instructions` is reachable, its content OVERRIDES anything this
  file says about the pipeline's shape - this skill is just the front door.
- If the token is rejected, the most common cause is copied whitespace/newline
  inside it - strip and retry once before asking the user to re-copy it.
