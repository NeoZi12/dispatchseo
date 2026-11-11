#!/usr/bin/env node
// Runs before `pnpm dev`: makes sure the local `main` is not serving stale code.
//
// Why: work often reaches origin/main from somewhere other than this folder
// (another checkout, a temp worktree, a teammate). Nothing then moves this
// folder's `main`, and `pnpm dev` quietly serves weeks-old code. This check
// fetches origin and either fast-forwards (opt-in) or says so loudly.
//
// - Never blocks the dev server and never loses work: a fast-forward is the
//   only write, and git refuses one that would touch local changes.
// - Auto fast-forward is opt-in: DEV_AUTO_SYNC=1 in the env or .env.local.
//   Without it, it only warns.
// - Silent no-op outside a git checkout, in CI, off `main`, or offline.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const git = (args, timeout = 15_000) =>
  execFileSync("git", args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }).trim();

const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const tag = "[dev-sync]";

function autoSyncEnabled() {
  if (process.env.DEV_AUTO_SYNC) return process.env.DEV_AUTO_SYNC === "1";
  if (!existsSync(".env.local")) return false;
  const m = readFileSync(".env.local", "utf8").match(/^\s*DEV_AUTO_SYNC\s*=\s*["']?([^"'\s#]*)/m);
  return m?.[1] === "1";
}

function main() {
  if (process.env.CI || process.env.DEV_SYNC_SKIP === "1") return;
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
    git(["remote", "get-url", "origin"]);
  } catch {
    return; // not a git checkout, or no origin
  }

  let branch;
  try {
    branch = git(["symbolic-ref", "--short", "-q", "HEAD"]);
  } catch {
    return; // detached HEAD: a deliberate snapshot, leave it alone
  }
  if (branch !== "main") return;

  try {
    git(["fetch", "--quiet", "origin", "main"], 10_000);
  } catch {
    console.log(`${tag} could not reach origin (offline?) - starting with what is here.`);
    return;
  }

  const [ahead, behind] = git(["rev-list", "--left-right", "--count", "main...origin/main"])
    .split(/\s+/)
    .map(Number);

  if (behind === 0) {
    console.log(green(`${tag} main is up to date with origin.`));
    return;
  }

  if (ahead === 0 && autoSyncEnabled()) {
    const before = git(["rev-parse", "HEAD"]);
    const res = spawnSync("git", ["merge", "--ff-only", "--quiet", "origin/main"], { encoding: "utf8" });
    if (res.status === 0) {
      console.log(green(`${tag} pulled ${behind} new commit(s) from origin/main.`));
      const lockChanged = git(["diff", "--name-only", before, "HEAD", "--", "pnpm-lock.yaml"]) !== "";
      if (lockChanged) {
        console.log(`${tag} lockfile changed - running pnpm install...`);
        spawnSync("pnpm", ["install", "--prefer-offline"], { stdio: "inherit" });
      }
      return;
    }
    warn(behind, ahead, `git refused the fast-forward (local edits overlap the incoming files):\n${(res.stderr || "").trim()}`);
    return;
  }

  warn(
    behind,
    ahead,
    ahead > 0
      ? "main has local commits origin does not, so it cannot fast-forward."
      : "set DEV_AUTO_SYNC=1 in .env.local to pull automatically.",
  );
}

function warn(behind, ahead, why) {
  const line = "=".repeat(68);
  console.log(
    yellow(
      [
        line,
        `${tag} STALE: main is ${behind} commit(s) behind origin/main${ahead ? ` and ${ahead} ahead` : ""}.`,
        `${tag} This dev server will NOT show the latest code.`,
        `${tag} ${why}`,
        `${tag} Fix: git status, then git pull --ff-only && pnpm install`,
        line,
      ].join("\n"),
    ),
  );
}

try {
  main();
} catch (e) {
  console.log(`${tag} skipped: ${e instanceof Error ? e.message : e}`);
}
