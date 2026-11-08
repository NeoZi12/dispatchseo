// Lets a plain `node --experimental-strip-types` script import the backend's
// TypeScript registry (src/lib/agents/index.ts) the way the app does.
//
// TypeScript resolves "@/lib/x" and "./x" without an extension; Node's ESM
// loader does not, so both get the .ts (or .tsx, or /index.ts) that exists on
// disk. The relative case arrived with src/lib/agents/mascot.ts (2026-11-08):
// index.ts imports "./mascot", and both --check scripts died on it for an
// afternoon of red pr-check runs. One resolver, shared, so the next split of
// a src/ module cannot break one script and not the other.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function withExtension(abs) {
  if (/\.(?:[cm]?[jt]sx?|json)$/.test(abs)) return abs;
  for (const candidate of [`${abs}.ts`, `${abs}.tsx`, join(abs, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return `${abs}.ts`;
}

/** Teach Node the "@/" alias and extension-less relative imports under srcDir. */
export function registerTsResolver(srcDir) {
  const SRC = resolve(srcDir);
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith("@/")) {
        return next(withExtension(resolve(SRC, specifier.slice(2))), context);
      }
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
        const from = fileURLToPath(context.parentURL);
        if (from.startsWith(SRC)) return next(withExtension(resolve(dirname(from), specifier)), context);
      }
      return next(specifier, context);
    },
  });
}
