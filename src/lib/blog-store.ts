import "server-only";
import { db } from "@/lib/db";
import { effectiveAutomations, type Project } from "@/lib/projects";
import { mergePr, tokenForRef } from "@/lib/github";
import { creditLine, githubApi, type RepoDraft } from "@/lib/repo-publish";
import { siteRoot, sitePath } from "@/lib/site-root";
import { fetchProjectUrl } from "@/lib/url-guard";
import { generate, parseJson } from "@/lib/writer/models";
import { articleSignature } from "@/lib/article-signature";
import { creditParts } from "@/lib/hosted-blog";
import { isFreeProject } from "@/lib/billing";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { SECRET_FILE, redact } from "@/lib/repo-layout";

// A site's own blog whose posts are DATA in the repo rather than markdown
// files: a JSON array, an array in a code file, or one JSON file per post.
//
// WHY. The repo route only knew folders of markdown. A site that keeps its
// posts in `src/content/posts.json` (dfmsolutions.de, 2026-11-10: 81 posts in
// one JSON file plus a per-slug registry in a .ts file) runs a real /blog the
// repo route could not see, so its articles went to our hosted blog at
// /articles, beside the blog the owner actually has. The owner's rule
// (2026-11-10): a blog we can reach through the repo takes our articles in
// the exact shape it already uses; one we cannot reach falls back to /articles.
//
// HOW, in two halves:
//   scout   once per site (cached in blog_stores): the live /blog's post
//           slugs, a plain substring search of the repo for them, ONE model
//           call that names the store and its rules from what the search
//           found, then deterministic checks of everything it named. Any
//           check that fails = "none", and the site keeps /articles.
//   publish per article: the model writes one new entry shaped like the
//           newest ones; every field is checked against what the store
//           already holds; the entry is inserted as text (nothing else in the
//           file moves) and re-parsed to prove it; then one pull request,
//           exactly like a markdown article's, and the verify job as ever.
//
// Simple on purpose: a model only proposes, and nothing it proposes reaches
// a repo before a check in this file has passed. Every failure ends in the
// hosted blog, never in a question to the owner.

// ---------------------------------------------------------------- types

export type StoreSpec = {
  /** The file (json, code) or the pattern of files (file) holding the posts. */
  path: string;
  format: "json" | "code" | "file";
  /** json: dot path to the array inside the file ("" = the file is the array). */
  arrayPath?: string;
  /** code: the exact source text that ends in the array's opening "[". */
  anchor?: string;
  /** Where a new post goes, read off the existing order (not the model). */
  position: "start" | "end" | "sorted";
  /** file: e.g. "content/posts/{slug}.json". */
  filePattern?: string;
};

export type StoreRecipe = {
  v: 1;
  status: "ready" | "none";
  reason?: string;
  checkedAt: string;
  /** Set when a publish into the store broke the site's build or never went
   *  live: such a store is never re-scouted on its own, only on request. */
  abandoned?: boolean;
  store?: StoreSpec;
  fields?: { slug: string; title: string; date?: string; image?: string };
  /** Relative to the site root: "/blog/{slug}". */
  urlPattern?: string;
  /** Other registries that need one line per post (a map keyed by slug). */
  companions?: { path: string; anchor: string; template: string }[];
  /** Prose lifted from the repo's own tests and conventions. */
  rules?: string;
  /** Strings the repo's own tests forbid. */
  banned?: string[];
  bodyFormat?: "markdown" | "html" | "mdx" | "blocks" | "text";
  /** Where a link can live in this shape (the free plan's credit). */
  creditHint?: string;
  /** Where the posts' picture files sit in the repo, and the prefix their
   *  field values carry ("public/images/blog" served as "/images/blog").
   *  Only set when a post's value was found there as a real file. */
  imageDir?: string;
  imagePrefix?: string;
  sampleSlugs?: string[];
  /** What every existing slug starts / ends with ("-dfm"). */
  slugAffix?: { prefix: string; suffix: string };
};

/** What the scout and the publisher read the repo through. GitHub in
 *  production (githubReader); a script may hand in another read-only one. */
export type RepoReader = {
  branch: string;
  headSha: string;
  baseTree: string;
  files: { path: string; size: number; sha: string }[];
  read(path: string): Promise<string | null>;
};

const NONE_RECHECK_MS = 14 * 24 * 3_600_000;

/** A failure that says nothing about the site (GitHub or the site did not
 *  answer, a model call failed): reported as "none for now", never cached. */
class Transient extends Error {}

function none(reason: string): StoreRecipe {
  return { v: 1, status: "none", reason, checkedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- scanner
//
// Enough of a tokenizer to find brackets in JSON and in JS/TS data files:
// strings, template literals (their ${...} parts as code) and comments are
// stepped over. A regex literal is not understood; one inside the scanned
// container fails the scan, which fails the check, which is the safe answer.

/** Index just past the string or comment starting at i; -1 when none starts
 *  there; -2 when one starts and never ends. */
export function skipNonCode(text: string, i: number): number {
  const c = text[i];
  if (c === "/" && text[i + 1] === "/") {
    const n = text.indexOf("\n", i);
    return n < 0 ? text.length : n;
  }
  if (c === "/" && text[i + 1] === "*") {
    const n = text.indexOf("*/", i + 2);
    return n < 0 ? -2 : n + 2;
  }
  if (c === '"' || c === "'") {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") {
        j++;
        continue;
      }
      if (text[j] === c) return j + 1;
      if (text[j] === "\n") return -2;
    }
    return -2;
  }
  if (c === "`") {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") {
        j++;
        continue;
      }
      if (text[j] === "`") return j + 1;
      if (text[j] === "$" && text[j + 1] === "{") {
        const end = matchClose(text, j + 1);
        if (end < 0) return -2;
        j = end;
      }
    }
    return -2;
  }
  return -1;
}

/** Index of the bracket closing the one at `open`, or -1. */
export function matchClose(text: string, open: number): number {
  const want: string[] = [];
  for (let i = open; i < text.length; i++) {
    const skip = skipNonCode(text, i);
    if (skip === -2) return -1;
    if (skip >= 0) {
      i = skip - 1;
      continue;
    }
    const c = text[i];
    if (c === "[" || c === "{" || c === "(") want.push(c === "[" ? "]" : c === "{" ? "}" : ")");
    else if (c === "]" || c === "}" || c === ")") {
      if (want.pop() !== c) return -1;
      if (!want.length) return i;
    }
  }
  return -1;
}

export type Span = { start: number; end: number };

/** The elements of the array or object whose bracket sits at `open`, each as
 *  [start, end) without the whitespace and commas around it. */
export function containerElements(text: string, open: number): { close: number; elements: Span[] } | null {
  const close = matchClose(text, open);
  if (close < 0) return null;
  const elements: Span[] = [];
  let depth = 0;
  let start = -1;
  let last = -1;
  for (let i = open + 1; i < close; i++) {
    const skip = skipNonCode(text, i);
    if (skip >= 0) {
      // A comment between elements belongs to neither; a string is content.
      if (text[i] !== "/") {
        if (start < 0) start = i;
        last = skip;
      }
      i = skip - 1;
      continue;
    }
    const c = text[i];
    if (c === " " || c === "\n" || c === "\t" || c === "\r") continue;
    if (depth === 0 && c === ",") {
      if (start >= 0) elements.push({ start, end: last });
      start = -1;
      continue;
    }
    if (start < 0) start = i;
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    last = i + 1;
  }
  if (start >= 0) elements.push({ start, end: last });
  return { close, elements };
}

/** A JS/TS data literal (objects, arrays, strings without ${}, numbers,
 *  true/false/null, comments, trailing commas, bare keys). Anything else -
 *  an identifier, a call, an import - throws: an entry we cannot read as
 *  data is an entry we cannot imitate safely. */
export function parseLiteral(src: string): unknown {
  let i = 0;
  const ws = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("//", i)) {
        const n = src.indexOf("\n", i);
        i = n < 0 ? src.length : n;
        continue;
      }
      if (src.startsWith("/*", i)) {
        const n = src.indexOf("*/", i + 2);
        if (n < 0) throw new Error("unclosed comment");
        i = n + 2;
        continue;
      }
      return;
    }
  };
  const str = (): string => {
    const q = src[i++];
    let out = "";
    while (i < src.length) {
      const c = src[i++];
      if (c === q) return out;
      if (q === "`" && c === "$" && src[i] === "{") throw new Error("template expression");
      if (c === "\n" && q !== "`") throw new Error("line break in a string");
      if (c !== "\\") {
        out += c;
        continue;
      }
      const e = src[i++];
      if (e === "u" && src[i] === "{") {
        const end = src.indexOf("}", i);
        out += String.fromCodePoint(parseInt(src.slice(i + 1, end), 16));
        i = end + 1;
      } else if (e === "u") {
        out += String.fromCharCode(parseInt(src.slice(i, i + 4), 16));
        i += 4;
      } else if (e === "x") {
        out += String.fromCharCode(parseInt(src.slice(i, i + 2), 16));
        i += 2;
      } else if (e === "\n") {
        // a line continuation adds nothing
      } else {
        out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" } as Record<string, string>)[e] ?? e;
      }
    }
    throw new Error("unclosed string");
  };
  const key = (): string => {
    if (src[i] === '"' || src[i] === "'") return str();
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200));
    if (!m) throw new Error(`no key at ${i}`);
    i += m[0].length;
    return m[0];
  };
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === "{") {
      i++;
      const out: Record<string, unknown> = {};
      for (;;) {
        ws();
        if (src[i] === "}") {
          i++;
          return out;
        }
        const k = key();
        ws();
        if (src[i] !== ":") throw new Error(`expected ":" at ${i}`);
        i++;
        out[k] = value();
        ws();
        if (src[i] === ",") i++;
        else if (src[i] !== "}") throw new Error(`expected "," or "}" at ${i}`);
      }
    }
    if (c === "[") {
      i++;
      const out: unknown[] = [];
      for (;;) {
        ws();
        if (src[i] === "]") {
          i++;
          return out;
        }
        out.push(value());
        ws();
        if (src[i] === ",") i++;
        else if (src[i] !== "]") throw new Error(`expected "," or "]" at ${i}`);
      }
    }
    if (c === '"' || c === "'" || c === "`") return str();
    const n = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i, i + 40));
    if (n) {
      i += n[0].length;
      return Number(n[0]);
    }
    for (const [w, v] of [["true", true], ["false", false], ["null", null]] as const) {
      if (src.startsWith(w, i) && !/[\w$]/.test(src[i + w.length] ?? "")) {
        i += w.length;
        return v;
      }
    }
    throw new Error(`not plain data at ${i}`);
  };
  const out = value();
  ws();
  if (i < src.length) throw new Error(`text after the value at ${i}`);
  return out;
}

// ---------------------------------------------------------------- the store as text

/** How a file writes its own entries. `eol` is "\r\n" in a CRLF file, so
 *  what we add matches the lines around it. */
type Style = { json: boolean; quoteKeys: boolean; quote: '"' | "'"; unit: string; trailingComma: boolean; eol: string };

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export type LoadedStore = {
  text: string;
  open: number;
  close: number;
  elements: Span[];
  entries: Record<string, unknown>[];
  style: Style;
  /** The whitespace before each element on its line. */
  indent: string;
};

function lineIndent(text: string, pos: number): string {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const lead = text.slice(lineStart, pos);
  return /^[ \t]*$/.test(lead) ? lead : "";
}

/** The last character before `end` that is code or a string, not a space or
 *  a comment. */
function lastCodeChar(text: string, end: number): string {
  let last = "";
  for (let i = 0; i < end; i++) {
    const skip = skipNonCode(text, i);
    if (skip >= 0) {
      if (text[i] !== "/") last = text[skip - 1];
      i = skip - 1;
      continue;
    }
    if (!/\s/.test(text[i])) last = text[i];
  }
  return last;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The value start of `key` among the members of the object at `open`. */
function memberValue(text: string, open: number, key: string): number {
  const box = containerElements(text, open);
  if (!box) return -1;
  for (const el of box.elements) {
    let colon = -1;
    for (let i = el.start; i < el.end; i++) {
      const skip = skipNonCode(text, i);
      if (skip >= 0) {
        i = skip - 1;
        continue;
      }
      if (text[i] === ":") {
        colon = i;
        break;
      }
    }
    if (colon < 0) continue;
    let k: unknown;
    try {
      k = parseLiteral(`{${text.slice(el.start, colon)}: 0}`);
    } catch {
      continue;
    }
    if (isPlainObject(k) && key in k) {
      let v = colon + 1;
      while (/\s/.test(text[v] ?? "")) v++;
      return v;
    }
  }
  return -1;
}

/** Find the array, read every entry as plain data, and learn the file's
 *  formatting. A string is the reason it could not. */
export function loadStore(text: string, spec: StoreSpec): LoadedStore | string {
  let open = -1;
  if (spec.format === "json") {
    let root: unknown;
    try {
      root = JSON.parse(text);
    } catch {
      return "the store file is not valid JSON";
    }
    open = text.search(/\S/);
    for (const seg of (spec.arrayPath ?? "").split(".").filter(Boolean)) {
      if (!isPlainObject(root) || !(seg in root) || text[open] !== "{") return `no "${spec.arrayPath}" in the store file`;
      root = root[seg];
      open = memberValue(text, open, seg);
      if (open < 0) return `could not find "${seg}" in the store file`;
    }
    if (!Array.isArray(root) || text[open] !== "[") return "the store path is not an array";
  } else if (spec.format === "code") {
    const anchor = (spec.anchor ?? "").trim();
    if (!anchor.endsWith("[")) return "the store anchor does not end at the array's opening bracket";
    const at = text.indexOf(anchor);
    if (at < 0 || text.indexOf(anchor, at + 1) >= 0) return "the store anchor is missing or not unique";
    open = at + anchor.length - 1;
  } else {
    return "a post-per-file store has no array";
  }
  const box = containerElements(text, open);
  if (!box) return "the store array's brackets do not balance";
  const entries: Record<string, unknown>[] = [];
  for (const el of box.elements) {
    let v: unknown;
    try {
      v = spec.format === "json" ? JSON.parse(text.slice(el.start, el.end)) : parseLiteral(text.slice(el.start, el.end));
    } catch {
      return `entry ${entries.length + 1} is not plain data we can read`;
    }
    if (!isPlainObject(v)) return `entry ${entries.length + 1} is not an object`;
    entries.push(v);
  }
  const first = box.elements[0];
  const indent = first ? lineIndent(text, first.start) : "  ";
  const sample = first ? text.slice(first.start, first.end) : "{}";
  const inner = /\n([ \t]+)\S/.exec(sample)?.[1] ?? "";
  const eol = eolOf(text);
  const unit = inner.length > indent.length && inner.startsWith(indent) ? inner.slice(indent.length) : "  ";
  const singles = (sample.match(/:\s*'/g) ?? []).length;
  const doubles = (sample.match(/:\s*"/g) ?? []).length;
  const style: Style = {
    json: spec.format === "json",
    quoteKeys: spec.format === "json" || /^\{\s*["']/.test(sample),
    quote: singles > doubles ? "'" : '"',
    unit,
    trailingComma: spec.format !== "json" && sample.endsWith("}") && lastCodeChar(sample, sample.length - 1) === ",",
    eol,
  };
  return { text, open, close: box.close, elements: box.elements, entries, style, indent };
}

function quoteString(s: string, q: '"' | "'"): string {
  const json = JSON.stringify(s);
  if (q === '"') return json;
  return `'${json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
}

/** One value written the way the file writes its own. */
export function serializeLike(v: unknown, style: Style, indent: string): string {
  const nl = style.eol;
  if (style.json) return JSON.stringify(v, null, style.unit).replace(/\n/g, `${nl}${indent}`);
  const tc = style.trailingComma ? "," : "";
  const ser = (x: unknown, ind: string): string => {
    if (x === null || x === undefined) return "null";
    if (typeof x === "string") return quoteString(x, style.quote);
    if (typeof x === "number" || typeof x === "boolean") return String(x);
    const inner = ind + style.unit;
    if (Array.isArray(x)) {
      if (!x.length) return "[]";
      return `[${nl}${x.map((y) => inner + ser(y, inner)).join(`,${nl}`)}${tc}${nl}${ind}]`;
    }
    const keys = Object.keys(x as Record<string, unknown>);
    if (!keys.length) return "{}";
    const k = (key: string) => (!style.quoteKeys && /^[A-Za-z_$][\w$]*$/.test(key) ? key : quoteString(key, style.quote));
    return `{${nl}${keys.map((key) => `${inner}${k(key)}: ${ser((x as Record<string, unknown>)[key], inner)}`).join(`,${nl}`)}${tc}${nl}${ind}}`;
  };
  return ser(v, indent);
}

/** The file with one more element, and nothing else moved. */
export function insertElement(store: LoadedStore, index: number, elementText: string): string {
  const { text, elements, indent } = store;
  const nl = store.style.eol;
  if (!elements.length) {
    const closeIndent = lineIndent(text, store.close);
    return `${text.slice(0, store.open + 1)}${nl}${indent || closeIndent + "  "}${elementText}${nl}${closeIndent}${text.slice(store.close)}`;
  }
  if (index < elements.length) {
    const at = elements[index].start;
    return `${text.slice(0, at)}${elementText},${nl}${indent}${text.slice(at)}`;
  }
  const lastEnd = elements[elements.length - 1].end;
  let j = lastEnd;
  while (/\s/.test(text[j] ?? "")) j++;
  if (text[j] === ",") {
    // A trailing-comma file: the new last element keeps the habit.
    return `${text.slice(0, j + 1)}${nl}${indent}${elementText},${text.slice(j + 1)}`;
  }
  return `${text.slice(0, lastEnd)},${nl}${indent}${elementText}${text.slice(lastEnd)}`;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => deepEqual(x, (b as unknown[])[i]));
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Insert and prove it: the new file must read back as the old entries plus
 *  exactly this one, at this index. */
export function insertEntry(store: LoadedStore, spec: StoreSpec, entry: Record<string, unknown>, index: number): { text: string } | { error: string } {
  const elementText = serializeLike(entry, store.style, store.indent);
  const next = insertElement(store, index, elementText);
  const reread = loadStore(next, spec);
  if (typeof reread === "string") return { error: `after the insert: ${reread}` };
  const want = [...store.entries.slice(0, index), entry, ...store.entries.slice(index)];
  if (reread.entries.length !== store.entries.length + 1) return { error: "after the insert the store does not have exactly one more entry" };
  if (!deepEqual(reread.entries, want)) return { error: "after the insert the store does not read back as the old entries plus the new one" };
  if (next.slice(0, store.open) !== store.text.slice(0, store.open) || next.slice(next.length - (store.text.length - store.close)) !== store.text.slice(store.close)) {
    return { error: "the insert changed text outside the array" };
  }
  return { text: next };
}

const PLACEHOLDER = /\{([A-Za-z_$][\w$]*)\}/g;
/** What a placeholder other than {slug} may be filled with: nothing that can
 *  end a string or start an expression in any quoting a file uses. */
const SAFE_VALUE = /^[^'"`$\\\r\n]*$/;

/** Why a companion line template is unsafe, or null. Every placeholder must
 *  sit inside a double-quoted string, and the line with its placeholders
 *  filled must read as one plain-data member (no call, no identifier, no
 *  template literal) - checked by parsing it, in insertCompanion. */
export function companionTemplateProblem(template: string): string | null {
  if (!template.includes("{slug}")) return "the line is not keyed by {slug}";
  if (/[\r\n]/.test(template)) return "the line is more than one line";
  let quote: string | null = null;
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      else if (c === "{" && quote !== '"' && /^\{[A-Za-z_$][\w$]*\}/.test(template.slice(i))) return "a placeholder is not inside a double-quoted string";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{" && /^\{[A-Za-z_$][\w$]*\}/.test(template.slice(i))) return "a placeholder is not inside a double-quoted string";
  }
  return quote ? "the line leaves a string open" : null;
}

function marker(name: string): string {
  return `@@dispatchseo:${name}@@`;
}

/** Replace every marker inside the parsed value's strings (keys too). */
function fillMarkers(v: unknown, values: Record<string, string>): unknown {
  const sub = (t: string) => t.replace(/@@dispatchseo:([A-Za-z_$][\w$]*)@@/g, (_m, k: string) => values[k] ?? "");
  if (typeof v === "string") return sub(v);
  if (Array.isArray(v)) return v.map((x) => fillMarkers(x, values));
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [sub(k), fillMarkers(x, values)]));
  return v;
}

/**
 * One line after a companion's unique anchor (the opening of a map or array
 * keyed by slug), proven before it is kept: the template is safe
 * (companionTemplateProblem), every value is from a safe character set, the
 * new member parses as plain data equal to what we meant to write, the map
 * has exactly one more member, nothing after it moved, and a .json file
 * still parses as a whole.
 */
export function insertCompanion(
  text: string,
  anchor: string,
  template: string,
  fill: { slug: string; entry: Record<string, unknown> },
  opts: { json?: boolean } = {},
): { text: string } | { error: string } {
  const unsafe = companionTemplateProblem(template);
  if (unsafe) return { error: `the companion line is unsafe: ${unsafe}` };
  const values: Record<string, string> = {};
  for (const m of template.matchAll(PLACEHOLDER)) {
    const k = m[1];
    const v = k === "slug" ? fill.slug : fill.entry[k];
    if (typeof v !== "string") return { error: `the post has no "${k}" for the companion line` };
    if (!SAFE_VALUE.test(v) || (k === "slug" && !/^[\w.~-]+$/.test(v))) return { error: `the post's "${k}" holds characters the companion line cannot carry safely` };
    values[k] = v;
  }
  const a = anchor.trim();
  const at = text.indexOf(a);
  if (at < 0 || text.indexOf(a, at + 1) >= 0) return { error: "the companion anchor is missing or not unique" };
  const open = at + a.length - 1;
  if (text[open] !== "{" && text[open] !== "[") return { error: "the companion anchor does not end at an opening bracket" };
  const box = containerElements(text, open);
  if (!box) return { error: "the companion's brackets do not balance" };
  const isMap = text[open] === "{";
  const wrap = (member: string) => (isMap ? `{${member}}` : `[${member}]`);
  const parse = (src: string): unknown => (opts.json ? JSON.parse(src) : parseLiteral(src));

  // What we mean to write: the template parsed with markers in place of its
  // placeholders, then the markers filled - so the check below compares
  // values, not text, and cannot be fooled by quoting.
  const body = template.trim().replace(/,\s*$/, "");
  let want: unknown;
  try {
    want = fillMarkers(parse(wrap(body.replace(PLACEHOLDER, (_m, k: string) => marker(k)))), values);
  } catch {
    return { error: "the companion line is not plain data" };
  }
  const line = body.replace(PLACEHOLDER, (_m, k: string) => values[k]);

  const nl = eolOf(text);
  const first = box.elements[0];
  const indent = first ? lineIndent(text, first.start) : `${lineIndent(text, at)}  `;
  const next = first ? `${text.slice(0, first.start)}${line},${nl}${indent}${text.slice(first.start)}` : `${text.slice(0, open + 1)}${nl}${indent}${line},${text.slice(open + 1)}`;
  const after = containerElements(next, open);
  if (!after || after.elements.length !== box.elements.length + 1) return { error: "the companion line does not read back as exactly one more member" };
  if (next.slice(after.close) !== text.slice(box.close) || next.slice(0, open) !== text.slice(0, open)) return { error: "the companion line changed text outside the map" };
  const added = after.elements[0];
  try {
    if (!deepEqual(parse(wrap(next.slice(added.start, added.end))), want)) return { error: "the companion line does not read back as what we meant to write" };
    if (opts.json) JSON.parse(next);
  } catch {
    return { error: "the companion line does not parse after the insert" };
  }
  return { text: next };
}

// ---------------------------------------------------------------- what the store holds

type Kind = "string" | "number" | "boolean" | "null" | "array" | "object";
function kindOf(v: unknown): Kind {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v === "object" ? "object" : (typeof v as Kind);
}

/** What the existing entries hold at one place in their shape: the kinds of
 *  value, the strings seen (for enums and patterns), the fields of objects
 *  (per `type` when the objects are tagged blocks). */
type ShapeNode = {
  kinds: Set<Kind>;
  n: number;
  strings: Map<string, number>;
  objects: number;
  props: Map<string, ShapeNode>;
  present: Map<string, number>;
  items?: ShapeNode;
  tagged?: Map<string, ShapeNode>;
  /** Longest string seen here. */
  maxLen: number;
  /** A number seen here that is not a whole number. */
  fractions: boolean;
  /** Arrays seen here, the shortest one's length, and the "type" each one
   *  ends with ("" = not a typed block). */
  arrays: number;
  minItems: number;
  lastTypes: Set<string>;
};

function newNode(): ShapeNode {
  return { kinds: new Set(), n: 0, strings: new Map(), objects: 0, props: new Map(), present: new Map(), maxLen: 0, fractions: false, arrays: 0, minItems: Infinity, lastTypes: new Set() };
}

function learn(node: ShapeNode, v: unknown): void {
  const k = kindOf(v);
  node.kinds.add(k);
  node.n++;
  if (k === "string") {
    if (node.strings.size < 500) node.strings.set(v as string, (node.strings.get(v as string) ?? 0) + 1);
    node.maxLen = Math.max(node.maxLen, (v as string).length);
  }
  if (k === "number" && !Number.isInteger(v)) node.fractions = true;
  if (k === "array") {
    const arr = v as unknown[];
    node.arrays++;
    node.minItems = Math.min(node.minItems, arr.length);
    const last = arr[arr.length - 1];
    node.lastTypes.add(isPlainObject(last) && typeof last.type === "string" ? last.type : "");
    node.items ??= newNode();
    for (const x of arr) learn(node.items, x);
  }
  if (k === "object") {
    const obj = v as Record<string, unknown>;
    let target = node;
    if (typeof obj.type === "string") {
      node.tagged ??= new Map();
      target = node.tagged.get(obj.type) ?? newNode();
      node.tagged.set(obj.type, target);
      target.kinds.add("object");
      target.n++;
    }
    target.objects++;
    for (const [key, val] of Object.entries(obj)) {
      if (val === undefined) continue;
      target.present.set(key, (target.present.get(key) ?? 0) + 1);
      const child = target.props.get(key) ?? newNode();
      target.props.set(key, child);
      learn(child, val);
    }
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const INT_STRING = /^\d+$/;

function enumOf(node: ShapeNode): string[] | null {
  const distinct = node.strings.size;
  // Dates bunch up (posts imported in batches) without being a choice.
  const re = patternOf(node);
  if (re === ISO_DATE || re === ISO_DATETIME) return null;
  if (!onlyStrings(node) || distinct === 0 || distinct > 12) return null;
  if (node.n < 6 || node.n < distinct * 3) return null;
  // A choice is a short word, never an address or a sentence.
  const values = [...node.strings.keys()];
  if (values.some((v) => v.length > 40 || /^https?:\/\//.test(v))) return null;
  return values;
}

/** Strings here, and at most nulls beside them (an optional field). */
function onlyStrings(node: ShapeNode): boolean {
  return node.kinds.has("string") && [...node.kinds].every((k) => k === "string" || k === "null");
}

function patternOf(node: ShapeNode): RegExp | null {
  if (node.n < 3 || !onlyStrings(node) || node.strings.size >= 500) return null;
  const all = [...node.strings.keys()];
  for (const re of [ISO_DATE, ISO_DATETIME, INT_STRING]) if (all.every((s) => re.test(s))) return re;
  return null;
}

function check(node: ShapeNode, v: unknown, path: string, out: string[]): void {
  if (out.length > 30) return;
  const k = kindOf(v);
  if (!node.kinds.has(k)) {
    out.push(`${path}: a ${k} where the existing posts have ${[...node.kinds].join(" or ") || "nothing"}`);
    return;
  }
  if (k === "string") {
    const allowed = enumOf(node);
    if (allowed && !allowed.includes(v as string)) out.push(`${path}: "${v}" is not one of the values the posts use (${allowed.map((a) => JSON.stringify(a)).join(", ")})`);
    const re = patternOf(node);
    if (re && !re.test(v as string)) out.push(`${path}: "${v}" does not match the format every post uses${re === INT_STRING ? " (a whole number)" : ""}`);
  }
  if (k === "number" && !node.fractions && node.n >= 3 && !Number.isInteger(v)) out.push(`${path}: ${v} where every post has a whole number`);
  if (k === "array") {
    const arr = v as unknown[];
    // An empty or cut-short list, or a body that does not end the way every
    // post ends (DFM: a sources block), is not a post like the others.
    if (node.arrays >= 3 && arr.length < node.minItems) out.push(`${path}: ${arr.length} item(s) where every post has at least ${node.minItems}`);
    const ends = [...node.lastTypes][0];
    if (node.arrays >= 3 && node.lastTypes.size === 1 && ends) {
      const last = arr[arr.length - 1];
      if (!isPlainObject(last) || last.type !== ends) out.push(`${path}: must end with a "${ends}" block, as every post does`);
    }
    if (node.items) arr.forEach((x, i) => check(node.items!, x, `${path}[${i}]`, out));
  }
  if (k === "object") {
    const obj = v as Record<string, unknown>;
    let target = node;
    if (node.tagged && typeof obj.type === "string") {
      const t = node.tagged.get(obj.type);
      if (!t) {
        out.push(`${path}: type "${obj.type}" is not one the posts use (${[...node.tagged.keys()].join(", ")})`);
        return;
      }
      target = t;
    } else if (node.tagged && node.objects === 0) {
      out.push(`${path}: needs a "type" (${[...node.tagged.keys()].join(", ")})`);
      return;
    }
    for (const [key, val] of Object.entries(obj)) {
      if (val === undefined) continue;
      const child = target.props.get(key);
      if (!child) out.push(`${path}.${key}: a field the posts never use`);
      else check(child, val, `${path}.${key}`, out);
    }
    if (target.objects >= 2) {
      for (const [key, count] of target.present) {
        if (count === target.objects && !(key in obj)) out.push(`${path}: missing "${key}", which every post has`);
      }
    }
  }
}

function strings(v: unknown, out: { text: string; heading: boolean }[], heading = false): void {
  if (typeof v === "string") out.push({ text: v, heading });
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (isPlainObject(v)) {
    const isHeading = typeof v.type === "string" && /^h[1-6]$|heading/i.test(v.type);
    for (const [k, x] of Object.entries(v)) strings(x, out, isHeading && k !== "type");
  }
}

/** Top-level string fields whose values are all short: the longest one,
 *  which a new post's value may not exceed. */
function lengthLimits(root: ShapeNode): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, node] of root.props) {
    if (onlyStrings(node) && node.n >= 3 && node.maxLen > 0 && node.maxLen <= 80) out.set(key, node.maxLen);
  }
  return out;
}

/** Whether the posts' text already carries HTML tags: only then may our
 *  hidden signature go in, or it would show as text. */
function postsCarryHtml(entries: Record<string, unknown>[]): boolean {
  for (const e of entries) {
    const list: { text: string; heading: boolean }[] = [];
    strings(e, list);
    if (list.some((x) => /<[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/i.test(x.text))) return true;
  }
  return false;
}

/** The common start and end every slug shares, cut at a dash. */
export function slugAffix(slugs: string[]): { prefix: string; suffix: string } {
  if (slugs.length < 2) return { prefix: "", suffix: "" };
  let pre = slugs[0];
  let suf = slugs[0];
  for (const s of slugs) {
    while (pre && !s.startsWith(pre)) pre = pre.slice(0, -1);
    while (suf && !s.endsWith(suf)) suf = suf.slice(1);
  }
  const prefix = pre.includes("-") ? pre.slice(0, pre.lastIndexOf("-") + 1) : "";
  const suffix = suf.includes("-") ? suf.slice(suf.indexOf("-")) : "";
  // A prefix or suffix that is most of a slug is a coincidence of two posts.
  return { prefix: prefix.length <= 12 ? prefix : "", suffix: suffix.length <= 12 ? suffix : "" };
}

/** The slug a draft takes in this store. */
export function storeSlug(draftSlug: string, recipe: Pick<StoreRecipe, "slugAffix">): string {
  const { prefix = "", suffix = "" } = recipe.slugAffix ?? {};
  let s = draftSlug.toLowerCase();
  if (prefix && !s.startsWith(prefix)) s = prefix + s;
  if (suffix && !s.endsWith(suffix)) s = s + suffix;
  return s;
}

export type EntryContext = {
  entries: Record<string, unknown>[];
  recipe: StoreRecipe;
  slug: string;
  /** `line` = the exact nofollow anchor the body must carry (creditLine). */
  credit: { href: string; label: string; line: string } | null;
  signature: string | null;
};

// ---------------------------------------------------------------- nothing that runs
//
// The entry is written by a model that read an article and pages of someone
// else's repo, and it lands on the owner's site, rendered by code we never
// see. So the check is an allowlist learned from the posts already there,
// with a short list of things refused whatever they use - not a search for
// "<script". A refusal costs one article its place in the store (it goes to
// the hosted blog); it never costs the store.

/** Refused whatever the site's posts use: no article we write needs one. */
const NEVER_TAGS = new Set(["script", "iframe", "frame", "frameset", "object", "embed", "applet", "style", "link", "meta", "base", "form", "input", "button", "textarea", "select", "svg", "math", "template", "noscript", "portal", "audio", "video", "source", "track"]);
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const ENTITIES: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", sol: "/", lpar: "(", rpar: ")", nbsp: " " };

/** As a browser reads an attribute: character references decoded. */
function decodeEntities(s: string): string {
  return s.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]{2,8}));?/gi, (m, hex, dec, name) => {
    if (hex || dec) {
      const code = hex ? parseInt(hex, 16) : Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[String(name).toLowerCase()] ?? m;
  });
}

/** The scheme of an address the way a browser finds it (tabs and line breaks
 *  dropped, leading spaces and control characters ignored). null = relative. */
function schemeOf(url: string): string | null {
  const u = url.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "");
  return /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1].toLowerCase() ?? null;
}

/** A markdown body without its code: a renderer shows `Array<string>` in a
 *  fence as text, so it is not a tag to learn or to refuse. Other formats are
 *  read whole. */
function prose(text: string, format: string | undefined): string {
  if (format !== "markdown" && format !== "mdx") return text;
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "");
}

/** Every tag name in a text. An autolink to a safe address (<https://...>)
 *  and an address in angle brackets are not tags. Capitalised names are JSX
 *  components and keep their case. */
function tagNames(text: string, into: Set<string>): void {
  for (const m of text.matchAll(/<\/?([A-Za-z][A-Za-z0-9._-]*)([:@]?)/g)) {
    if (m[2] === "@" || (m[2] === ":" && SAFE_SCHEMES.has(m[1].toLowerCase()))) continue;
    into.add((/^[A-Z]/.test(m[1]) ? m[1] : m[1].toLowerCase()) + (m[2] === ":" ? ":" : ""));
  }
}

/** Why this text may not go on the owner's site, or null. `known` = the tags
 *  the site's posts already use. */
export function unsafeMarkup(text: string, known: Set<string>, format: string | undefined): string | null {
  // Whatever the format: tags no article needs, in any spelling.
  const never = /<\s*\/?\s*([A-Za-z][A-Za-z0-9-]*)/g;
  for (const m of text.matchAll(never)) if (NEVER_TAGS.has(m[1].toLowerCase())) return `contains a <${m[1].toLowerCase()}> tag, which may not be in an article`;
  const decoded = decodeEntities(text);
  // An inline handler, however the attribute is set off (<img/onerror=...).
  if (/<[^>]*[\s/"'`]on[a-z]+\s*=/i.test(decoded)) return "contains an inline event handler (on...=)";
  // Addresses: only http, https, mailto, tel or a relative one, wherever an
  // address can sit - an attribute, a markdown link, an autolink, or a
  // string that is nothing but an address.
  const addresses: string[] = [];
  for (const m of decoded.matchAll(/\b(?:href|src|srcset|action|formaction|poster|background|ping|data|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{\s*["'`]([^"'`]*)|([^\s>]+))/gi)) addresses.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "");
  for (const m of decoded.matchAll(/\]\(\s*<?([^)\s>]*)/g)) addresses.push(m[1]);
  for (const m of decoded.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*<?(\S+)/gm)) addresses.push(m[1]);
  for (const m of decoded.matchAll(/<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi)) addresses.push(m[1]);
  if (!/\s/.test(decoded.trim())) addresses.push(decoded);
  for (const a of addresses) {
    const scheme = schemeOf(a);
    if (scheme && !SAFE_SCHEMES.has(scheme)) return `contains a ${scheme}: address; only http, https, mailto and tel are allowed`;
  }
  // A javascript: address written with spaces in a field that holds only it.
  if (/^[\u0000- ]*(?:java[\t\n\r]*script|vbscript)[\t\n\r]*:\S/i.test(decoded)) return "contains a javascript: address";
  // The site's own posts are the allowlist for every other tag.
  const mineTags = new Set<string>();
  tagNames(prose(text, format), mineTags);
  for (const t of mineTags) if (!known.has(t)) return `contains a <${t}> tag, which none of this site's posts uses (write it as plain text)`;
  if (format === "mdx") {
    if (/^\s*(import|export)\s/m.test(text)) return "an MDX body may not contain import or export lines";
    // An expression runs at build time on the owner's machine.
    if (/[{}]/.test(prose(text, format))) return "an MDX body may not contain { or } outside code";
  }
  return null;
}

/** Every reason this entry would not sit in the store like its neighbours.
 *  Empty = it may be written. */
export function validateEntry(entry: Record<string, unknown>, ctx: EntryContext): string[] {
  const out: string[] = [];
  const f = ctx.recipe.fields!;
  const root = newNode();
  for (const e of ctx.entries) learn(root, e);
  check(root, entry, "entry", out);
  // Short fields keep within the longest value the posts use (a snippet
  // title with a 44-character budget is exactly this).
  for (const [key, limit] of lengthLimits(root)) {
    if (key === f.slug) continue; // ours, built from the draft's slug
    const v = entry[key];
    if (typeof v === "string" && v.length > limit) out.push(`entry.${key}: ${v.length} characters, longer than any post's (at most ${limit})`);
  }

  if (entry[f.slug] !== ctx.slug) out.push(`the ${f.slug} must be exactly "${ctx.slug}"`);
  const slugs = ctx.entries.map((e) => e[f.slug]).filter((s): s is string => typeof s === "string");
  if (slugs.includes(ctx.slug)) out.push(`a post with the slug "${ctx.slug}" already exists`);
  if (slugs.length && slugs.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ctx.slug)) out.push("the slug is not kebab-case like every other");
  if (typeof entry[f.title] !== "string" || !(entry[f.title] as string).trim()) out.push(`the ${f.title} is empty`);

  const mine: { text: string; heading: boolean }[] = [];
  strings(entry, mine);
  const joined = mine.map((s) => s.text).join("\n").toLowerCase();
  // Nothing that runs. The allowlist is the site's own posts: a tag none of
  // them uses is refused, whatever renders the field (unsafeMarkup).
  const known = new Set<string>(ctx.credit ? ["a"] : []);
  for (const e of ctx.entries) {
    const theirs: { text: string; heading: boolean }[] = [];
    strings(e, theirs);
    for (const s of theirs) tagNames(prose(s.text, ctx.recipe.bodyFormat), known);
  }
  for (const { text } of mine) {
    const bad = unsafeMarkup(ctx.signature ? text.split(ctx.signature).join("") : text, known, ctx.recipe.bodyFormat);
    if (bad) {
      out.push(bad);
      break;
    }
  }
  for (const b of ctx.recipe.banned ?? []) {
    if (b.trim() && joined.includes(b.trim().toLowerCase())) out.push(`contains "${b}", which this site's own tests forbid`);
  }

  // Duplicates of what other posts already say: a long string that one other
  // post carries (the same paragraph twice), or any heading another post has.
  // Strings two posts already share are the site's stock phrases.
  const seen = new Map<string, number>();
  const headings = new Set<string>();
  for (const e of ctx.entries) {
    const list: { text: string; heading: boolean }[] = [];
    strings(e, list);
    for (const s of new Set(list.map((x) => x.text.trim()))) seen.set(s, (seen.get(s) ?? 0) + 1);
    for (const s of list) if (s.heading) headings.add(s.text.trim());
  }
  for (const s of mine) {
    const t = s.text.trim();
    if (!t || /^https?:\/\//.test(t) || /dispatchseo/i.test(t)) continue;
    if (s.heading && headings.has(t)) out.push(`the heading "${t.slice(0, 80)}" is already used by another post`);
    else if (t.length >= 20 && seen.get(t) === 1) out.push(`"${t.slice(0, 80)}" repeats text another post already has`);
  }

  if (ctx.credit && !mine.some((s) => s.text.includes(ctx.credit!.line))) out.push(`the body must carry exactly ${ctx.credit.line}`);
  // One link to us, and only the nofollow one: a second (a "source", a links
  // field) would render followed by the site's own code.
  const ours = joined.match(/dispatchseo\.com/g)?.length ?? 0;
  if (ours > (ctx.credit ? 1 : 0)) out.push(ctx.credit ? "dispatchseo.com may appear only in the credit line" : "the entry may not link to dispatchseo.com");
  if (ctx.signature && !mine.some((s) => s.text.includes(ctx.signature!))) out.push(`the body must end with ${ctx.signature}`);
  return [...new Set(out)].slice(0, 25);
}

// ---------------------------------------------------------------- reading the repo

const TEXT_EXT = /\.(json|ts|tsx|js|jsx|mjs|cjs|ya?ml|md|mdx|astro|vue|svelte|html?|toml)$/i;
const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|coverage|\.next|\.git|\.vercel|\.turbo)\//;
const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.lock|Cargo\.lock|Gemfile\.lock)$/;
const MAX_FILE = 3_000_000;
const MAX_READS = 60;

/** At most `max` characters of a response body: a page we do not control
 *  must not fill a job's memory. */
async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  try {
    while (out.length < max) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
  } catch {
    // a body cut off mid-read: what arrived is what we have
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return out.slice(0, max);
}

/** The default branch's tree, read through GitHub (GET only). */
export async function githubReader(project: Project): Promise<RepoReader | null> {
  const repo = project.github_repo;
  if (!repo) return null;
  const token = await tokenForRef(project);
  if (!token) return null;
  const info = await githubApi(token, "GET", `/repos/${repo}`);
  if (info.status !== 200) return null;
  const branch = String(info.json?.default_branch ?? "main");
  const ref = await githubApi(token, "GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`);
  const headSha = (ref.json?.object as { sha?: string } | undefined)?.sha;
  if (ref.status !== 200 || !headSha) return null;
  const commit = await githubApi(token, "GET", `/repos/${repo}/git/commits/${headSha}`);
  const baseTree = (commit.json?.tree as { sha?: string } | undefined)?.sha;
  if (commit.status !== 200 || !baseTree) return null;
  const tree = await githubApi(token, "GET", `/repos/${repo}/git/trees/${baseTree}?recursive=1`);
  if (tree.status !== 200) return null;
  const files = ((tree.json?.tree as { path?: string; type?: string; size?: number; sha?: string }[] | undefined) ?? [])
    .filter((e) => e.type === "blob" && e.path && e.sha)
    .map((e) => ({ path: String(e.path), size: Number(e.size ?? 0), sha: String(e.sha) }));
  const byPath = new Map(files.map((f) => [f.path, f]));
  return {
    branch,
    headSha,
    baseTree,
    files,
    // Through the blob API: the contents API stops returning content at 1 MB,
    // and a store of eighty articles is half of that already.
    async read(path) {
      const f = byPath.get(path);
      if (!f || f.size > MAX_FILE) return null;
      const blob = await githubApi(token, "GET", `/repos/${repo}/git/blobs/${f.sha}`);
      if (blob.status !== 200 || typeof blob.json?.content !== "string") return null;
      const text = Buffer.from(blob.json.content as string, "base64").toString("utf8");
      return text.slice(0, 2000).includes("\u0000") ? null : text;
    },
  };
}

// ---------------------------------------------------------------- the live blog

const TAXONOMY = /^(category|categories|kategorie|kategorien|tag|tags|topic|topics|author|authors|autor|autoren|page|seite|feed|rss|archive|archiv)$/i;

/** The posts the live /blog links to: their slugs and the paths the links
 *  use, from the same link shape looksLikeBlogIndex counts. One segment
 *  under /blog only - a category or author page is two. */
export function liveBlogLinks(html: string, folder: string): { slug: string; path: string }[] {
  const out = new Map<string, string>();
  // A plain href match, then the path test: one pattern that also has to
  // find "/blog/" inside the value backtracks on a page of near-misses.
  for (const m of html.matchAll(/href=["']([^"'#?]+)["']/gi)) {
    if (!m[1].includes("/blog/")) continue;
    let path = m[1].replace(/^https?:\/\/[^/]+/i, "");
    if (folder && path.startsWith(folder)) path = path.slice(folder.length);
    const rest = /^\/blog\/([^/]+)\/?$/.exec(path)?.[1];
    if (!rest || rest.includes(".") || TAXONOMY.test(rest)) continue;
    let slug = rest;
    try {
      slug = decodeURIComponent(rest);
    } catch {
      // a stray "%": keep it raw
    }
    if (!out.has(slug)) out.set(slug, path);
  }
  return [...out].map(([slug, path]) => ({ slug, path }));
}

// ---------------------------------------------------------------- the scout

const SCOUT_SYSTEM = `You find where a website keeps its blog posts inside its own git repository, so a new post can be added in exactly the same shape.

You get: the post slugs the live /blog links to, the repo's file list, the files that contain those slugs (with excerpts), the blog's route files, and any conventions or tests that mention the blog.

Decide which ONE place the posts live:
- "json": a JSON file holding an array of post objects. Give arrayPath: "" when the file itself is the array, else the dot path to it.
- "code": an array of post objects inside a JS/TS file, e.g. export const posts = [ ... ]. Give anchor: the exact source text that ends with the array's opening "[" (copy it from the file, unique in that file), e.g. "export const posts: Post[] = [".
- "file": one JSON file per post. Give filePattern with {slug}, e.g. "content/posts/{slug}.json".
If the posts are not in the repo (a CMS, a database the repo only reads at runtime, an external API) answer status "none" with the reason.

Also name:
- fields: the key names of the slug, the title, the publish date and the image (null when there is no picture field; a field that is text, a command or anything else that is not a picture file is NOT the image).
- companions: other files that need one new line for every new post or the build/tests fail (e.g. a map keyed by slug that the tests require to have every slug). For each: path, anchor = the exact unique source text ending with the map's or array's opening "{" or "[", and template = ONE line in that file's style for a new post, with {slug} and optionally {fieldName} placeholders taken from the new post, the smallest line the rules allow. [] when none.
- rules: the repo's own rules for a post, in short plain prose (from its tests and conventions: required blocks, uniqueness, citations, language and tone, what must not appear, field formats).
- banned: exact strings the tests forbid in posts (lowercase), [] when none.
- bodyFormat: how the post body is written: "blocks" (an array of typed objects), "markdown", "mdx", "html" or "text".
- creditHint: where in this shape a visible link with a label can live (e.g. "an item {label,url} in the final sources block"), or "" when no field can hold a link.
- imageDir: the repo folder the image files sit in, or null.

If you need to see up to 5 more files before deciding, answer ONLY {"need": ["path", ...]} (you get one such round). Otherwise answer ONLY a JSON object:
{"status":"ready"|"none","reason":"...","store":{"path":"...","format":"json"|"code"|"file","arrayPath":"...","anchor":"...","filePattern":"..."},"fields":{"slug":"...","title":"...","date":"...","image":null},"companions":[],"rules":"...","banned":[],"bodyFormat":"...","creditHint":"...","imageDir":null}`;

type ScoutAnswer = {
  need?: string[];
  status?: string;
  reason?: string;
  store?: { path?: string; format?: string; arrayPath?: string; anchor?: string; filePattern?: string };
  fields?: { slug?: string; title?: string; date?: string | null; image?: string | null };
  companions?: { path?: string; anchor?: string; template?: string }[];
  rules?: string;
  banned?: string[];
  bodyFormat?: string;
  creditHint?: string;
  imageDir?: string | null;
};

function isTest(path: string): boolean {
  return /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[jt]sx?$/i.test(path);
}

function excerpt(text: string, needles: string[], max: number): string {
  const parts: string[] = [text.slice(0, Math.min(1200, max))];
  let budget = max - parts[0].length;
  let from = 1200;
  for (const n of needles) {
    if (budget <= 0) break;
    const at = text.indexOf(n, from);
    if (at < 0) continue;
    const s = Math.max(from, at - 900);
    const piece = text.slice(s, Math.min(text.length, at + 1500, s + budget));
    parts.push(`\n[... offset ${s} ...]\n${piece}`);
    budget -= piece.length;
    from = s + piece.length;
  }
  if (from < text.length) parts.push(`\n[... ${text.length - from} more characters ...]`);
  return parts.join("");
}

/**
 * Work out, once, whether this site's blog keeps its posts somewhere in the
 * repo we can add to. Never throws for the site's sake: every answer that
 * says something about the site is a recipe ("ready" or "none" with the
 * reason); a GitHub, network or model failure throws Transient, which the
 * caller reports without caching.
 */
export async function scoutBlogStore(project: Project, opts: { reader?: RepoReader; deadline?: number; runId?: string | null } = {}): Promise<StoreRecipe & { costUsd?: number; rounds?: number }> {
  if (!project.github_repo) return none("no repo is connected");
  // 1. The live blog's posts.
  const root = siteRoot(project);
  const res = await fetchProjectUrl(`${root}/blog`, project.domain, { timeoutMs: 8_000, userAgent: "DispatchSEO-Check/1.0" });
  if (!res || res.status >= 500) throw new Transient("the site's /blog did not answer");
  if (res.status !== 200) return none(`the site's /blog answers ${res.status}`);
  const live = liveBlogLinks(await readCapped(res, 2_000_000), sitePath(project));
  if (live.length === 0) return none("the site's /blog links to no posts");
  const patterns = new Set(live.map((l) => l.path.replace(encodeURI(l.slug), "{slug}").replace(l.slug, "{slug}")));
  if (patterns.size !== 1) return none("the blog's post links do not share one address pattern");
  const urlPattern = [...patterns][0];

  // 2. Where those slugs appear in the repo.
  const reader = opts.reader ?? (await githubReader(project));
  if (!reader) throw new Transient("could not read the repo");
  const slugs = live.map((l) => l.slug);
  // Never a file that can hold secrets, and every excerpt below goes through
  // the same redaction get_repo_layout uses: repo text reaches a model here.
  const paths = reader.files.filter((f) => !SKIP_DIR.test(f.path) && !LOCKFILE.test(f.path) && !SECRET_FILE.test(f.path));
  const candidates = paths
    .filter((f) => TEXT_EXT.test(f.path) && f.size <= MAX_FILE)
    .map((f) => {
      const p = f.path.toLowerCase();
      const named = slugs.some((s) => p.includes(s.toLowerCase())) ? 10 : 0;
      const words = (p.match(/blog|post|article|content|data|seed/g) ?? []).length;
      return { ...f, score: named + words * 2 + (/\.(json|ya?ml|ts|js|mjs)$/.test(p) ? 1 : 0) };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_READS);
  const texts = new Map<string, string>();
  const hits: { path: string; found: number; inPath: boolean }[] = [];
  // Six at a time: sixty reads one by one is most of the launch's minute.
  for (let i = 0; i < candidates.length; i += 6) {
    if (opts.deadline && Date.now() > opts.deadline) throw new Transient("out of time reading the repo");
    const batch = candidates.slice(i, i + 6);
    const read = await Promise.all(batch.map((f) => reader.read(f.path).catch(() => null)));
    batch.forEach((f, j) => {
      const text = read[j];
      if (text === null) return;
      texts.set(f.path, text);
      const found = slugs.filter((s) => text.includes(s)).length;
      const inPath = slugs.some((s) => f.path.includes(s));
      if (found || inPath) hits.push({ path: f.path, found, inPath });
    });
  }
  if (hits.length === 0) return none("none of the live posts' slugs appear in the repo, so the posts live outside it");
  hits.sort((a, b) => b.found - a.found || Number(b.inPath) - Number(a.inPath));

  // 3. One model call (plus at most one round of "show me these files").
  const routeFiles = paths
    .filter((f) => /(^|\/)(app|pages|routes)\/.*blog/i.test(f.path) && /\.(tsx?|jsx?|astro|vue|svelte|mdx?)$/.test(f.path))
    .sort((a, b) => Number(/\[|\{/.test(b.path)) - Number(/\[|\{/.test(a.path)))
    .slice(0, 4);
  const docFiles = paths
    .filter((f) => /^\.dispatchseo\/conventions\.md$|(^|\/)(CONTRIBUTING|AGENTS|CLAUDE)\.md$/i.test(f.path) || (/(^|\/)(tests?|__tests__|spec)\//i.test(f.path) && /blog|post|article|content/i.test(f.path)) || /(blog|post|article).*\.(test|spec)\.[jt]sx?$/i.test(f.path))
    .slice(0, 6);
  const readCached = async (p: string) => texts.get(p) ?? (await reader.read(p)) ?? "";
  const blocks: string[] = [];
  blocks.push(`Site: ${root}\nLive post links (${live.length}): ${live.slice(0, 15).map((l) => l.path).join(", ")}\nSlugs: ${slugs.slice(0, 15).join(", ")}`);
  blocks.push(`Files in the repo (${paths.length}):\n${paths.filter((f) => !/\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|pdf|zip)$/i.test(f.path)).map((f) => f.path).join("\n").slice(0, 12_000)}`);
  let hitBudget = 20_000;
  for (const h of hits.slice(0, 8)) {
    const text = texts.get(h.path) ?? "";
    const piece = redact(excerpt(text, slugs.slice(0, 3), Math.min(6_000, hitBudget)));
    hitBudget -= piece.length;
    blocks.push(`<file path="${h.path}" chars="${text.length}" liveSlugsFound="${h.found}/${slugs.length}">\n${piece}\n</file>`);
    if (hitBudget <= 0) break;
  }
  for (const f of routeFiles) blocks.push(`<route path="${f.path}">\n${redact((await readCached(f.path)).slice(0, 2_500))}\n</route>`);
  // Tests whole (their assertions are the rules a post must pass, and the
  // strictest ones tend to sit at the end), conventions around the blog.
  let docBudget = 30_000;
  for (const f of docFiles.sort((a, b) => Number(isTest(b.path)) - Number(isTest(a.path)))) {
    const text = await readCached(f.path);
    const cap = Math.min(isTest(f.path) ? 14_000 : 10_000, docBudget);
    const piece = redact(isTest(f.path) && text.length <= cap ? text : excerpt(text, ["blog", "slug", "post", "content"], cap));
    docBudget -= piece.length;
    blocks.push(`<doc path="${f.path}">\n${piece}\n</doc>`);
    if (docBudget <= 0) break;
  }

  let costUsd = 0;
  let rounds = 0;
  const ask = async (user: string): Promise<ScoutAnswer> => {
    rounds++;
    let r;
    try {
      r = await generate({ slot: "planner", projectId: project.id, runId: opts.runId ?? null, system: SCOUT_SYSTEM, user, json: true, deadline: opts.deadline, dry: () => JSON.stringify({ status: "none", reason: "dry run" }) });
    } catch (e) {
      throw new Transient(`the scout's model call failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    costUsd += r.costUsd;
    return parseJson<ScoutAnswer>(r.text) ?? {};
  };
  let user = blocks.join("\n\n");
  let answer = await ask(user);
  if (Array.isArray(answer.need) && answer.need.length) {
    const more: string[] = [];
    for (const p of answer.need.slice(0, 5)) {
      if (!paths.some((f) => f.path === p) || !TEXT_EXT.test(p)) continue;
      more.push(`<file path="${p}">\n${redact(excerpt(await readCached(p), slugs.slice(0, 3), 6_000))}\n</file>`);
    }
    user = `${user}\n\nThe files you asked for:\n\n${more.join("\n\n") || "(none of them exist)"}\n\nNow answer with the final JSON object (no more "need").`;
    answer = await ask(user);
  }
  const recipe = await verifyRecipe(answer, { reader, readCached, live, urlPattern });
  return { ...recipe, costUsd, rounds };
}

/** Everything the model named, checked against the repo itself. */
async function verifyRecipe(
  a: ScoutAnswer,
  ctx: { reader: RepoReader; readCached: (p: string) => Promise<string>; live: { slug: string; path: string }[]; urlPattern: string },
): Promise<StoreRecipe> {
  if (a.status !== "ready") return none(a.reason?.trim() || "the posts are not in the repo");
  const fmt = a.store?.format;
  const path = (a.store?.path ?? "").trim();
  const slugKey = a.fields?.slug?.trim();
  const titleKey = a.fields?.title?.trim();
  if (fmt !== "json" && fmt !== "code" && fmt !== "file") return none("the scout named no store format we write");
  if (!slugKey || !titleKey) return none("the scout named no slug or title field");
  if (SECRET_FILE.test(path) || (a.companions ?? []).some((c) => SECRET_FILE.test(c.path ?? ""))) return none("the scout named a file that can hold secrets");
  const spec: StoreSpec = { path, format: fmt, position: "end" };

  let entries: Record<string, unknown>[] = [];
  if (fmt === "file") {
    // One JSON file per post: the pattern must name real files for the live slugs.
    const pattern = (a.store?.filePattern ?? "").trim();
    if (!/^[^{}]*\{slug\}[^{}]*\.json$/.test(pattern)) return none("only one-JSON-file-per-post stores are written for now");
    spec.filePattern = pattern;
    spec.path = pattern.slice(0, pattern.lastIndexOf("/") + 1) || "";
    for (const l of ctx.live) {
      const p = pattern.replace("{slug}", l.slug);
      if (!ctx.reader.files.some((f) => f.path === p)) continue;
      try {
        const v = JSON.parse(await ctx.readCached(p));
        if (isPlainObject(v)) entries.push(v);
      } catch {
        return none(`${p} is not valid JSON`);
      }
      if (entries.length >= 8) break;
    }
  } else {
    if (!ctx.reader.files.some((f) => f.path === path)) return none(`the store file ${path} is not in the repo`);
    if (fmt === "json") spec.arrayPath = (a.store?.arrayPath ?? "").trim();
    else spec.anchor = (a.store?.anchor ?? "").trim();
    const loaded = loadStore(await ctx.readCached(path), spec);
    if (typeof loaded === "string") return none(loaded);
    entries = loaded.entries;
  }
  const stored = new Set(entries.map((e) => e[slugKey]).filter((s): s is string => typeof s === "string"));
  const matched = ctx.live.filter((l) => stored.has(l.slug)).map((l) => l.slug);
  const need = Math.min(3, ctx.live.length);
  if (matched.length < need) return none(`only ${matched.length} of the live posts are in ${path} under "${slugKey}"`);
  if (!entries.every((e) => typeof e[titleKey] === "string")) return none(`not every post has a "${titleKey}"`);

  // The order new posts go in, read off the entries rather than asked for.
  const slugsInOrder = entries.map((e) => String(e[slugKey] ?? ""));
  const dateKey = a.fields?.date?.trim() || undefined;
  const dates = dateKey ? entries.map((e) => (typeof e[dateKey] === "string" ? (e[dateKey] as string) : "")) : [];
  const sorted = (xs: string[], dir: 1 | -1) => xs.every((x, i) => i === 0 || dir * xs[i - 1].localeCompare(x) <= 0);
  if (entries.length >= 3 && sorted(slugsInOrder, 1)) spec.position = "sorted";
  else if (dates.length >= 3 && dates.every(Boolean) && sorted(dates, -1)) spec.position = "start";

  // Companions: real, uniquely anchored, already keyed by the posts.
  const companions: NonNullable<StoreRecipe["companions"]> = [];
  for (const c of a.companions ?? []) {
    const cpath = (c.path ?? "").trim();
    const anchor = (c.anchor ?? "").trim();
    const template = (c.template ?? "").trim();
    if (!cpath || !anchor || !template) return none("a companion was named without its path, anchor or line");
    if (!ctx.reader.files.some((f) => f.path === cpath)) return none(`the companion ${cpath} is not in the repo`);
    const unsafe = companionTemplateProblem(template);
    if (unsafe) return none(`the companion line for ${cpath} is unsafe: ${unsafe}`);
    const text = await ctx.readCached(cpath);
    if (!matched.some((s) => text.includes(s))) return none(`the companion ${cpath} does not mention the posts`);
    // Every field the line names must be a string on the posts; the probe
    // fills them with plain words, so a post's own apostrophe cannot fail it.
    const named = [...template.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((k) => k !== "slug");
    if (named.some((k) => typeof entries[0][k] !== "string")) return none(`the companion line for ${cpath} names a field the posts do not have`);
    const probeEntry = Object.fromEntries(named.map((k) => [k, "probe"]));
    const probe = insertCompanion(text, anchor, template, { slug: "dispatchseo-probe-slug", entry: probeEntry }, { json: cpath.endsWith(".json") });
    if ("error" in probe) return none(`${cpath}: ${probe.error}`);
    companions.push({ path: cpath, anchor, template });
  }

  // A picture field only counts when it holds picture files that exist: the
  // model is told a text field is not one, and this makes sure (a field of
  // terminal commands or dead paths is not where a cover goes).
  let image = a.fields?.image?.trim() || undefined;
  let imageDir = a.imageDir?.trim().replace(/\/+$/, "") || undefined;
  let imagePrefix: string | undefined;
  if (image && imageDir) {
    const values = entries.map((e) => e[image!]).filter((v): v is string => typeof v === "string" && v.trim() !== "");
    const pictures = values.filter((v) => /\.(png|jpe?g|webp|avif|gif)$/i.test(v));
    const found = pictures.find((v) => ctx.reader.files.some((f) => f.path === `${imageDir}/${v.slice(v.lastIndexOf("/") + 1)}`));
    if (found && pictures.length * 2 >= values.length) imagePrefix = found.slice(0, found.lastIndexOf("/"));
    else image = imageDir = undefined;
  } else {
    image = imageDir = undefined;
  }
  const bodyFormat = (["markdown", "html", "mdx", "blocks", "text"] as const).find((b) => b === a.bodyFormat) ?? "text";
  return {
    v: 1,
    status: "ready",
    checkedAt: new Date().toISOString(),
    store: spec,
    fields: { slug: slugKey, title: titleKey, ...(dateKey ? { date: dateKey } : {}), ...(image ? { image } : {}) },
    urlPattern: ctx.urlPattern,
    companions,
    rules: (a.rules ?? "").trim().slice(0, 4_000),
    banned: (Array.isArray(a.banned) ? a.banned : []).filter((b) => typeof b === "string" && b.trim()).map((b) => b.trim()).slice(0, 30),
    bodyFormat,
    creditHint: (a.creditHint ?? "").trim().slice(0, 300),
    ...(image && imageDir ? { imageDir, imagePrefix } : {}),
    sampleSlugs: matched.slice(0, 5),
    slugAffix: slugAffix([...stored]),
  };
}

// ---------------------------------------------------------------- the cache

type CacheRead = { ok: true; recipe: StoreRecipe | null } | { ok: false };

async function readCache(projectId: string): Promise<CacheRead> {
  const { data, error } = await db().from("blog_stores").select("recipe").eq("project_id", projectId).maybeSingle();
  if (error) return { ok: false };
  const r = (data as { recipe?: StoreRecipe } | null)?.recipe;
  return { ok: true, recipe: r && r.v === 1 ? r : null };
}

/** The cached recipe, or null (none cached, or a DB without 0086). */
export async function readBlogStore(projectId: string): Promise<StoreRecipe | null> {
  const r = await readCache(projectId);
  return r.ok ? r.recipe : null;
}

async function saveBlogStore(projectId: string, recipe: StoreRecipe): Promise<boolean> {
  const { error } = await db()
    .from("blog_stores")
    .upsert({ project_id: projectId, recipe, checked_at: recipe.checkedAt }, { onConflict: "project_id" });
  if (error) console.warn(`[blog-store] ${projectId}: recipe not cached: ${error.message}`);
  return !error;
}

/** Stop writing into this site's store (a build it broke, a post that never
 *  went live). The reason is kept, and only rescan_blog_store looks again:
 *  re-scouting on the clock would find the same store and break it again. */
export async function markBlogStoreNone(projectId: string, reason: string): Promise<void> {
  const cached = await readBlogStore(projectId);
  // Throws when it cannot be saved: the caller must not queue a publish that
  // would find the store still "ready" and write into it again.
  if (!(await saveBlogStore(projectId, { ...(cached ?? none(reason)), status: "none", reason, abandoned: true, checkedAt: new Date().toISOString() }))) {
    throw new Error("could not mark the blog store as not to be used");
  }
}

/**
 * The site's store recipe: a cached "ready" is reused as it is, a cached
 * "none" is re-scouted after 14 days or on `force`. A cache that cannot be
 * read at all (a DB that has not run 0086) is "none" without a scout - the
 * old behaviour, and no model spend on every publish. A scout that runs out
 * of `deadlineMs` or hits a transient failure answers "none for now" and
 * caches nothing, so the next attempt scouts again.
 */
export async function ensureBlogStore(project: Project, opts: { force?: boolean; deadlineMs?: number } = {}): Promise<StoreRecipe> {
  if (!project.github_repo) return none("no repo is connected");
  const cache = await readCache(project.id);
  if (!cache.ok) return none("the blog store cache cannot be read");
  const cached = cache.recipe;
  if (!opts.force && cached?.status === "ready") return cached;
  if (!opts.force && cached && (cached.abandoned || Date.now() - Date.parse(cached.checkedAt) < NONE_RECHECK_MS)) return cached;
  const ms = opts.deadlineMs ?? 150_000;
  const deadline = Date.now() + ms;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const recipe = await Promise.race([
      scoutBlogStore(project, { deadline }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Transient("the scout ran out of time")), ms);
      }),
    ]);
    const { costUsd, rounds: _rounds, ...clean } = recipe;
    if (costUsd) console.log(`[blog-store] ${project.slug}: scout ${clean.status}${clean.reason ? ` (${clean.reason})` : ""}, $${costUsd.toFixed(3)}`);
    await saveBlogStore(project.id, clean);
    return clean;
  } catch (e) {
    if (e instanceof Transient) return none(`not checked yet: ${e.message}`);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- publishing

export type StoreDraft = RepoDraft & { sources?: { url: string; title?: string | null }[] | null };

export type StoreFileChange = { path: string; before: string | null; after: string };

export type StorePublishResult =
  | {
      ok: true;
      prUrl: string;
      prNumber: number;
      /** Always "": the store file is never the article's own file, and
       *  article_drafts.repo_path is what Edit and Remove rewrite. */
      repoPath: string;
      predictedUrls: string[];
      merged: boolean;
      slug: string;
      entry?: Record<string, unknown>;
      files?: StoreFileChange[];
      attempts?: number;
      /** What the checks refused on the attempts before the one that passed. */
      rejected?: string[];
      costUsd: number;
      dryRun?: boolean;
    }
  | {
      ok: false;
      reason: "no-store" | "not-store-pr" | "store-invalid" | "no-token" | "github-error";
      message: string;
      problems?: string[];
      entry?: Record<string, unknown>;
      costUsd: number;
    };

const PUBLISH_SYSTEM = `You add ONE new post to a website's own blog store, written in exactly the shape of the existing posts you are shown, so the site's build, its tests and its templates treat it like any other post.

Rules:
- Use only the fields the existing posts use, with the same kinds of values. Where a field only ever takes a few values, use one of those values exactly.
- Convert the article faithfully into this shape: keep its facts, numbers, sections, lists and FAQ; drop nothing that carries information. Where the shape has no table, turn a table into a list or sentences. Follow the shape's own habits for links: if the existing posts carry no links in their body text, write none, and put cited sources only where the shape keeps citations.
- Never reuse a heading, a sentence or a paragraph from the existing posts.
- Follow the site's own rules below exactly; they come from its tests and conventions.
- Answer ONLY with JSON: {"entry": { ...the new post... }}`;

/**
 * Write one article into the site's store and open the pull request - or,
 * with `dryRun`, do everything up to the first GitHub write and return the
 * would-be files instead. A failure is a result, never a throw: every one of
 * them sends the caller to the hosted fallback.
 */
export async function publishDraftToStore(
  project: Project,
  draft: StoreDraft,
  opts: { dryRun?: boolean; recipe?: StoreRecipe; reader?: RepoReader; deadline?: number; today?: string } = {},
): Promise<StorePublishResult> {
  let costUsd = 0;
  const fail = (reason: Extract<StorePublishResult, { ok: false }>["reason"], message: string, extra: { problems?: string[]; entry?: Record<string, unknown> } = {}): StorePublishResult => ({ ok: false, reason, message, costUsd, ...extra });
  const repo = project.github_repo;
  const recipe = opts.recipe ?? (await readBlogStore(project.id));
  if (!repo || !recipe || recipe.status !== "ready" || !recipe.store || !recipe.fields || !recipe.urlPattern) return fail("no-store", "this site has no blog store we can write to");
  const spec = recipe.store;
  const f = recipe.fields;
  const slug = storeSlug(draft.slug, recipe);
  const predictedUrls = [`${siteRoot(project)}${recipe.urlPattern.replace("{slug}", encodeURIComponent(slug))}`];

  // The one door to GitHub. Reads go through `get`; every write through
  // `write`, which refuses on a dry run - so a dry run cannot write even if
  // a bug below forgets to stop.
  const token = opts.dryRun && opts.reader ? null : await tokenForRef(project);
  if (!opts.dryRun && !token) return fail("no-token", "no GitHub credential resolved");
  const get = (path: string) => (token ? githubApi(token, "GET", path) : Promise.resolve({ status: 0, json: null }));
  const write = (method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body: unknown) => {
    if (opts.dryRun || !token) throw new Error("dry run: refusing a GitHub write");
    return githubApi(token, method, path, body);
  };

  // ALREADY OPEN: a retry resumes from the pull request, as the markdown
  // route does - provided that pull request really is a store publish.
  if (draft.pr_number && !opts.dryRun) {
    const pr = await get(`/repos/${repo}/pulls/${draft.pr_number}`);
    if (pr.status !== 200 || !pr.json) return fail("github-error", `pull request lookup: HTTP ${pr.status}`);
    const files = await get(`/repos/${repo}/pulls/${draft.pr_number}/files?per_page=100`);
    const names = Array.isArray(files.json) ? (files.json as { filename?: string }[]).map((x) => x.filename) : [];
    const storeFile = spec.format === "file" ? spec.filePattern!.replace("{slug}", slug) : spec.path;
    if (!names.includes(storeFile)) return fail("not-store-pr", "the open pull request is not a store publish");
    return { ok: true, prUrl: String(pr.json.html_url ?? draft.pr_url ?? ""), prNumber: draft.pr_number, repoPath: "", predictedUrls, merged: Boolean(pr.json.merged_at), slug, costUsd };
  }

  const reader = opts.reader ?? (await githubReader(project));
  if (!reader) return fail("github-error", "could not read the repo");

  // The store, read fresh.
  let store: LoadedStore | null = null;
  let entries: Record<string, unknown>[] = [];
  let samples: string[] = [];
  let sampleFileText = "";
  const storeFile = spec.format === "file" ? spec.filePattern!.replace("{slug}", slug) : spec.path;
  if (spec.format === "file") {
    if (reader.files.some((x) => x.path === storeFile)) return fail("store-invalid", `${storeFile} already exists`);
    const re = new RegExp(`^${spec.filePattern!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\{slug\\}", "([^/]+)")}$`);
    const posts = reader.files.filter((x) => re.test(x.path)).slice(-40);
    for (const p of posts) {
      try {
        const raw = (await reader.read(p.path)) ?? "";
        const v = JSON.parse(raw);
        if (!sampleFileText) sampleFileText = raw;
        if (isPlainObject(v)) entries.push(v);
      } catch {
        // an unreadable neighbour is not a sample
      }
    }
  } else {
    const text = await reader.read(spec.path);
    if (text === null) return fail("github-error", `could not read ${spec.path}`);
    const loaded = loadStore(text, spec);
    if (typeof loaded === "string") return fail("store-invalid", loaded);
    store = loaded;
    entries = loaded.entries;
  }
  if (entries.length === 0) return fail("store-invalid", "the store has no posts to imitate");

  // The newest few, verbatim: what the model imitates.
  const order = entries.map((e, i) => ({ e, i, d: f.date && typeof e[f.date] === "string" ? (e[f.date] as string) : "" }));
  order.sort((a, b) => (b.d && a.d ? b.d.localeCompare(a.d) : 0) || (spec.position === "start" ? a.i - b.i : b.i - a.i));
  let budget = 36_000;
  for (const { e } of order.slice(0, 3)) {
    const s = JSON.stringify(e, null, 1);
    if (samples.length >= 2 && s.length > budget) break;
    samples.push(s.slice(0, Math.max(budget, 6_000)));
    budget -= s.length;
  }

  const free = await isFreeProject(project.id);
  const parts = creditParts(project, draft.id);
  const htmlBody = (recipe.bodyFormat === "html" || recipe.bodyFormat === "markdown" || recipe.bodyFormat === "mdx") && postsCarryHtml(entries);
  // The free plan's credit goes in ONLY as our own <a rel="sponsored
  // nofollow">, written into a body that renders HTML. A link in a field the
  // site's code renders (a "sources" item, a links array) comes out followed,
  // and a followed credit on every free article is a widget link scheme in
  // Google's eyes: the customer's site pays for it. Such a site gets no
  // credit at all rather than a followed one.
  const credit = free && htmlBody ? { href: parts.href, label: parts.label, line: creditLine(parts) } : null;
  const signature = htmlBody ? articleSignature(draft.id) : null;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  // What the model is told about the fields we fill ourselves and the ones
  // that only take a few values.
  const root = newNode();
  for (const e of entries) learn(root, e);
  const enums: string[] = [];
  for (const [k, node] of root.props) {
    const vals = enumOf(node);
    if (vals) enums.push(`${k}: one of ${vals.map((v) => JSON.stringify(v)).join(", ")}`);
  }
  // Typed blocks: the exact types the posts use and each one's fields - a
  // type the renderer may know but no post uses is refused by the checks.
  for (const [k, node] of root.props) {
    if (!node.items?.tagged) continue;
    const kinds = [...node.items.tagged].map(([t, n]) => `${t} {${[...n.props.keys()].join(", ")}}`);
    enums.push(`${k}: an array of objects whose "type" is one of: ${kinds.join("; ")}. No other type.`);
  }
  for (const [k, limit] of lengthLimits(root)) {
    if (k !== f.slug && k !== f.date) enums.push(`${k}: at most ${limit} characters.`);
  }
  const datePattern = f.date ? patternOf(root.props.get(f.date) ?? newNode()) : null;
  const dateValue = datePattern === ISO_DATETIME ? new Date().toISOString() : today;

  const article = [
    `Title: ${draft.title}`,
    `Meta description: ${draft.meta_description ?? ""}`,
    `Primary keyword: ${draft.primary_keyword ?? ""}`,
    `Article (markdown):\n${draft.markdown}`,
    draft.faq?.length ? `FAQ:\n${draft.faq.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n")}` : "",
    draft.sources?.length ? `Sources cited:\n${draft.sources.map((s) => `- ${s.title ?? s.url}: ${s.url}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const instructions = [
    `The site: ${siteRoot(project)} (language: ${project.language_code || "en"}).`,
    `Body format: ${recipe.bodyFormat}.`,
    `Set "${f.slug}" to exactly "${slug}".${f.date ? ` Set "${f.date}" to "${dateValue}".` : ""}`,
    f.image ? `"${f.image}": we fill it ourselves with the cover's address; write "".` : "",
    enums.length ? `What the fields may hold:\n${enums.join("\n")}` : "",
    recipe.rules ? `The site's own rules:\n${recipe.rules}` : "",
    recipe.banned?.length ? `Never write these strings anywhere: ${recipe.banned.map((b) => JSON.stringify(b)).join(", ")}.` : "",
    credit ? `Required: the body's last paragraph, just before the end, is exactly this line, character for character (keep its rel attribute): ${credit.line}\nNo other link to dispatchseo.com anywhere in the entry - not in a sources or links field.` : "",
    signature ? `Required: the body ends with exactly ${signature}` : "",
  ].filter(Boolean).join("\n\n");
  const base = `Existing posts, newest first:\n\n${samples.map((s, i) => `<post ${i + 1}>\n${s}\n</post>`).join("\n\n")}\n\n${instructions}\n\n<article>\n${article}\n</article>`;

  // THE COVER, only where the posts carry real picture files (verifyRecipe):
  // it goes next to theirs, named by the slug. A cover that cannot be had
  // drops the field when it is optional, and the store when it is not.
  let cover: { repoPath: string; ref: string; bytes: Uint8Array } | null = null;
  const imageRequired = Boolean(f.image) && entries.every((e) => typeof e[f.image!] === "string" && e[f.image!] !== "");
  if (f.image && recipe.imageDir && recipe.imagePrefix !== undefined && draft.cover_url) {
    const { fetchCover } = await import("@/lib/job-handlers/publish");
    const image = await fetchCover(draft.cover_url).catch(() => null);
    if (image) {
      const ext = image.mimeType === "image/jpeg" ? ".jpg" : image.mimeType === "image/webp" ? ".webp" : ".png";
      cover = { repoPath: `${recipe.imageDir}/${slug}${ext}`, ref: `${recipe.imagePrefix}/${slug}${ext}`, bytes: image.bytes };
      if (reader.files.some((x) => x.path === cover!.repoPath)) cover = null;
    }
  }

  let entry: Record<string, unknown> | null = null;
  let problems: string[] = [];
  let attempts = 0;
  let previous = "";
  const rejected: string[] = [];
  while (attempts < 2) {
    attempts++;
    const user = attempts === 1 ? base : `${base}\n\nYour previous answer:\n${previous.slice(0, 30_000)}\n\nIt broke these rules - fix every one and answer with the whole corrected entry:\n${problems.map((p) => `- ${p}`).join("\n")}`;
    let r;
    try {
      r = await generate({ slot: "patcher", projectId: project.id, runId: null, system: PUBLISH_SYSTEM, user, json: true, deadline: opts.deadline, dry: () => JSON.stringify({ entry: {} }) });
    } catch (e) {
      return fail("store-invalid", `the conversion's model call failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    costUsd += r.costUsd;
    previous = r.text;
    const got = parseJson<{ entry?: unknown }>(r.text)?.entry;
    if (!isPlainObject(got)) {
      problems = ["the answer had no entry object"];
      continue;
    }
    // The fields we know, set by us rather than trusted to the model.
    got[f.slug] = slug;
    if (f.date && datePattern) got[f.date] = dateValue;
    if (f.image) {
      if (cover) got[f.image] = cover.ref;
      else delete got[f.image];
    }
    entry = got;
    if (f.image && !cover && imageRequired) {
      problems = [`every post has a "${f.image}" picture and the cover could not be made`];
      break;
    }
    problems = validateEntry(entry, { entries, recipe, slug, credit, signature });
    if (!problems.length) break;
    rejected.push(...problems);
  }
  if (!entry || problems.length) return fail("store-invalid", `the entry did not pass the store's checks after ${attempts} attempts`, { problems, ...(entry ? { entry } : {}) });

  // The text of every file, proven before anything is sent.
  const files: StoreFileChange[] = [];
  if (spec.format === "file") {
    // Written the way the neighbours are: their indent, their line ends.
    const unit = /\n([ \t]+)"/.exec(sampleFileText)?.[1] ?? "  ";
    const nl = eolOf(sampleFileText);
    const end = /\r?\n$/.test(sampleFileText) ? nl : "";
    files.push({ path: storeFile, before: null, after: `${JSON.stringify(entry, null, unit).replace(/\n/g, nl)}${end}` });
  } else {
    const index =
      spec.position === "start" ? 0 : spec.position === "end" ? entries.length : (() => {
        const i = entries.findIndex((e) => String(e[f.slug] ?? "").localeCompare(slug) > 0);
        return i < 0 ? entries.length : i;
      })();
    const done = insertEntry(store!, spec, entry, index);
    if ("error" in done) return fail("store-invalid", done.error, { entry });
    files.push({ path: spec.path, before: store!.text, after: done.text });
  }
  for (const c of recipe.companions ?? []) {
    const text = await reader.read(c.path);
    if (text === null) return fail("github-error", `could not read ${c.path}`);
    if (text.includes(`"${slug}"`) || text.includes(`'${slug}'`)) return fail("store-invalid", `${c.path} already has ${slug}`, { entry });
    const done = insertCompanion(text, c.anchor, c.template, { slug, entry }, { json: c.path.endsWith(".json") });
    if ("error" in done) return fail("store-invalid", `${c.path}: ${done.error}`, { entry });
    files.push({ path: c.path, before: text, after: done.text });
  }

  if (opts.dryRun) {
    if (cover) files.push({ path: cover.repoPath, before: null, after: `(cover image, ${cover.bytes.byteLength} bytes)` });
    return { ok: true, dryRun: true, prUrl: "", prNumber: 0, repoPath: "", predictedUrls, merged: false, slug, entry, files, attempts, rejected, costUsd };
  }

  // From here on GitHub is written to.
  const branch = `dispatchseo/article-${draft.slug}-${draft.id.replace(/-/g, "").slice(0, 8)}`;
  const bad = (step: string, status: number) => fail("github-error", `${step}: HTTP ${status}`, { entry });
  const created = await write("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: reader.headSha });
  if (created.status === 422) {
    await write("PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, { sha: reader.headSha, force: true });
  } else if (created.status !== 201) {
    return bad("branch create", created.status);
  }
  const treeEntries: Record<string, unknown>[] = files.map((x) => ({ path: x.path, mode: "100644", type: "blob", content: x.after }));
  if (cover) {
    const blob = await write("POST", `/repos/${repo}/git/blobs`, { content: Buffer.from(cover.bytes).toString("base64"), encoding: "base64" });
    if (blob.status !== 201 || !blob.json?.sha) return bad("cover upload", blob.status);
    treeEntries.push({ path: cover.repoPath, mode: "100644", type: "blob", sha: String(blob.json.sha) });
  }
  const tree = await write("POST", `/repos/${repo}/git/trees`, { base_tree: reader.baseTree, tree: treeEntries });
  if (tree.status !== 201 || !tree.json?.sha) return bad("tree create", tree.status);
  const commit = await write("POST", `/repos/${repo}/git/commits`, {
    message: `Add article: ${draft.title}\n\nWritten by DispatchSEO for ${project.domain}; added to ${files.map((x) => x.path).join(" and ")} in the shape of the existing posts.`,
    tree: String(tree.json.sha),
    parents: [reader.headSha],
  });
  if (commit.status !== 201 || !commit.json?.sha) return bad("commit create", commit.status);
  const push = await write("PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, { sha: String(commit.json.sha), force: true });
  if (push.status !== 200) return bad("branch update", push.status);

  const dashboard = await backendBaseUrl();
  const body =
    `${draft.meta_description ?? ""}\n\n` +
    `Written by DispatchSEO for ${project.domain}. This pull request adds one post to your blog, in the same shape as your other posts: ` +
    `${files.map((x) => `\`${x.path}\``).join(", ")} each gain one new entry, and nothing else in them changes. ` +
    `Merge it to publish.\n\nReview it on your dashboard: ${dashboard}/articles/${draft.id}`;
  let prNumber = 0;
  let prUrl = "";
  const pr = await write("POST", `/repos/${repo}/pulls`, { title: draft.title, head: branch, base: reader.branch, body });
  if (pr.status === 201 && pr.json) {
    prNumber = Number(pr.json.number);
    prUrl = String(pr.json.html_url ?? "");
  } else if (pr.status === 422) {
    const owner = repo.split("/")[0];
    const open = await get(`/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`);
    const first = Array.isArray(open.json) ? (open.json as { number?: number; html_url?: string }[])[0] : undefined;
    if (!first?.number) return bad("pull request create", pr.status);
    prNumber = Number(first.number);
    prUrl = String(first.html_url ?? "");
  } else {
    return bad("pull request create", pr.status);
  }
  // The label the dashboard filters on; tolerated in full (see repo-publish).
  await write("POST", `/repos/${repo}/labels`, { name: "seo", color: "0e8a16", description: "DispatchSEO SEO pipeline" });
  await write("POST", `/repos/${repo}/issues/${prNumber}/labels`, { labels: ["seo"] });
  // Never merged here: the verify job merges once the checks have spoken.
  return { ok: true, prUrl, prNumber, repoPath: "", predictedUrls, merged: false, slug, entry, attempts, rejected, costUsd };
}

// ---------------------------------------------------------------- undoing a store publish

/** Close a store pull request we opened (its build stayed red). No comment:
 *  the article goes to the hosted blog instead, and nothing is asked of the
 *  owner. */
export async function closeStorePr(project: Project, prNumber: number): Promise<boolean> {
  const repo = project.github_repo;
  const token = repo ? await tokenForRef(project) : null;
  if (!repo || !token) return false;
  const res = await githubApi(token, "PATCH", `/repos/${repo}/pulls/${prNumber}`, { state: "closed" });
  return res.status === 200;
}

/**
 * Put back the files a merged store pull request changed, when the article
 * never appeared on the site: when every file's blob on the default branch
 * is still the one we wrote, each goes back to its blob from before the
 * merge (or is removed, when we added it). If any one of them changed since,
 * nothing is put back. The undo is its own pull request, merged on Auto like
 * an article. Returns the pull request's address, or null when nothing could
 * safely be put back.
 */
export async function revertStoreMerge(project: Project, prNumber: number, title: string): Promise<string | null> {
  const repo = project.github_repo;
  const token = repo ? await tokenForRef(project) : null;
  if (!repo || !token) return null;
  const gh = (method: string, path: string, body?: unknown) => githubApi(token, method, path, body);
  const pr = await gh("GET", `/repos/${repo}/pulls/${prNumber}`);
  const mergeSha = typeof pr.json?.merge_commit_sha === "string" ? pr.json.merge_commit_sha : null;
  const base = String((pr.json?.base as { ref?: string } | undefined)?.ref ?? "main");
  if (pr.status !== 200 || !pr.json?.merged_at || !mergeSha) return null;
  const merge = await gh("GET", `/repos/${repo}/git/commits/${mergeSha}`);
  const before = ((merge.json?.parents as { sha?: string }[] | undefined) ?? [])[0]?.sha;
  if (merge.status !== 200 || !before) return null;
  const files = await gh("GET", `/repos/${repo}/pulls/${prNumber}/files?per_page=100`);
  const changed = Array.isArray(files.json) ? (files.json as { filename?: string; sha?: string }[]) : [];
  const head = await gh("GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${base}`)}`);
  const headSha = (head.json?.object as { sha?: string } | undefined)?.sha;
  const headCommit = headSha ? await gh("GET", `/repos/${repo}/git/commits/${headSha}`) : null;
  const headTree = (headCommit?.json?.tree as { sha?: string } | undefined)?.sha;
  if (!headSha || !headTree) return null;
  const entries: { path: string; mode: string; type: string; sha: string | null }[] = [];
  for (const file of changed) {
    if (!file.filename || !file.sha) continue;
    const at = (ref: string) => gh("GET", `/repos/${repo}/contents/${encodeURI(file.filename!)}?ref=${encodeURIComponent(ref)}`);
    // All or nothing: one file changed since means the owner (or anyone) has
    // built on our merge, and putting back only part of it could leave a
    // post in one registry and not the other.
    const now = await at(base);
    if (now.status !== 200 || now.json?.sha !== file.sha) return null;
    const old = await at(before);
    if (old.status === 200 && typeof old.json?.sha === "string") entries.push({ path: file.filename, mode: "100644", type: "blob", sha: old.json.sha });
    else if (old.status === 404) entries.push({ path: file.filename, mode: "100644", type: "blob", sha: null });
    else return null;
  }
  if (!entries.length || entries.length !== changed.length) return null;
  const tree = await gh("POST", `/repos/${repo}/git/trees`, { base_tree: headTree, tree: entries });
  if (tree.status !== 201 || !tree.json?.sha) return null;
  const commit = await gh("POST", `/repos/${repo}/git/commits`, {
    message: `Undo article: ${title}\n\nThe article did not appear on the site after its pull request (#${prNumber}) was merged, so these files go back to exactly what they were. DispatchSEO publishes the article on its hosted blog instead.`,
    tree: String(tree.json.sha),
    parents: [headSha],
  });
  if (commit.status !== 201 || !commit.json?.sha) return null;
  const branch = `dispatchseo/undo-article-${prNumber}`;
  const ref = await gh("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: String(commit.json.sha) });
  if (ref.status === 422) await gh("PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, { sha: String(commit.json.sha), force: true });
  else if (ref.status !== 201) return null;
  const opened = await gh("POST", `/repos/${repo}/pulls`, {
    title: `Undo: ${title}`,
    head: branch,
    base,
    body: `This puts back the files pull request #${prNumber} changed. The article it added did not appear on the site within two hours of the merge, so DispatchSEO publishes it on its hosted blog instead, and your post list goes back to exactly what it was.`,
  });
  if (opened.status !== 201 || !opened.json) return null;
  const url = String(opened.json.html_url ?? "");
  if (effectiveAutomations(project).auto_merge) await mergePr(project, Number(opened.json.number)).catch(() => undefined);
  return url;
}
