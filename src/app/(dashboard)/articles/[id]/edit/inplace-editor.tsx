"use client";

import Link from "next/link";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { saveArticleEdit } from "@/app/autopilot-actions";
import { markdownBlocks, renderMarkdown, type MarkdownBlock, type MarkdownBlockKind } from "@/lib/article-render";
import { EDIT_LIMITS, type ArticleRoute } from "@/lib/article-owner-shared";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { cx, FOCUS_RING } from "@/components/ui/styles";

// The in-place editor: the article exactly as the blog renders it, and every
// heading, paragraph, list and quote is the thing you type into.
//
// HOW IT STAYS FAITHFUL. The page is built from markdown by one renderer
// (article-render.ts). The editor splits that markdown into blocks on the
// renderer's own boundaries (markdownBlocks), renders each block with the
// same renderMarkdown, and shows them inside a shadow root carrying the
// blog's own stylesheet and the site's palette (hosted-blog.ts editorStyles).
// When a block loses focus its DOM is read back into markdown (the few
// inline forms the renderer emits: strong, em, code, links) and re-rendered,
// so what you see after an edit is what the page will show. Tables, code,
// rules and images are edited as source - the renderer's grammar is the
// contract, and a contenteditable table is not worth lying about.
//
// WHY NOT REACT INSIDE THE SHADOW ROOT. contenteditable and a virtual DOM
// fight over the same nodes; the article is owned by the browser while you
// type and by us between edits. So the preview is plain DOM managed by hand
// (one re-mount per structural change), and React runs the bar above it:
// title of the page, unsaved state, undo, save.
//
// NO CHROME. No masthead, no product card, no credit line: the editor is the
// article and nothing around it, which is also why the free tier's credit
// can never be reached from here.

type Block = MarkdownBlock & { key: string };
type Snapshot = { title: string; blocks: Block[] };

const TEXT_KINDS = new Set<MarkdownBlockKind>(["heading", "paragraph", "list", "quote"]);
const MAX_HISTORY = 100;

let keySeq = 0;
const withKeys = (blocks: MarkdownBlock[]): Block[] => blocks.map((b) => ({ ...b, key: `b${++keySeq}` }));

const EDITOR_CSS = `
.page{min-height:60vh;padding-bottom:48px}
main{padding-top:40px}
h1.title{outline:none;border-radius:8px;margin:0 -8px;padding:0 8px;cursor:text}
h1.title:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}
h1.title:focus{box-shadow:inset 0 0 0 1px var(--accent)}
h1.title:empty::before{content:"Title";color:var(--muted)}
.blk{position:relative;border-radius:8px;margin:0 -12px;padding:0 12px}
.blk:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}
.blk:focus-within{box-shadow:inset 0 0 0 1px var(--accent)}
.ed{outline:none;min-height:1.2em;cursor:text}
.ed:empty::before{content:"Write here, or delete this block";color:var(--muted)}
.view{cursor:pointer}
.body>.blk:first-child .ed>p{font-size:18px;color:var(--ink2)}
.tools{position:absolute;top:-13px;right:10px;display:none;gap:4px;z-index:2}
.blk:hover .tools,.blk:focus-within .tools{display:flex}
.tools button,.rawbar button{font:500 12px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink2);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:6px 10px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.tools button:hover,.rawbar button:hover{color:var(--ink);border-color:var(--accent)}
.tools button.danger:hover{color:#dc2626;border-color:#dc2626}
.rawbar button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.raw{display:block;width:100%;min-height:140px;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);background:var(--code);border:1px solid var(--line);border-radius:10px;padding:12px 14px;resize:vertical;outline:none;margin:0 0 8px}
.raw:focus{border-color:var(--accent)}
.rawbar{display:flex;gap:8px;margin:0 0 18px}
.body .blk[data-kind="hr"] .view{padding:8px 0}
.addend{margin:8px -12px 0;padding:10px 12px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:14px;cursor:pointer;background:none;width:calc(100% + 24px);text-align:start;font-family:inherit}
.addend:hover{color:var(--ink);border-color:var(--accent)}
`;

export function InplaceEditor({
  id,
  slug,
  initial,
  updatedAt,
  fileSha,
  url,
  route,
  repo,
  autoMerge,
  styles,
  lang,
  dir,
  metaLine,
  siteUrl,
}: {
  id: string;
  slug: string;
  initial: { title: string; metaDescription: string; body: string };
  updatedAt: string;
  fileSha: string | null;
  url: string | null;
  route: ArticleRoute | null;
  repo: string | null;
  autoMerge: boolean;
  /** The blog's stylesheet with the site's palette (hosted-blog.ts editorStyles). */
  styles: string;
  lang: string;
  dir: "ltr" | "rtl";
  /** The byline/date line under the title, as the page prints it. */
  metaLine: string;
  siteUrl: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<ShadowRoot | null>(null);
  const titleRef = useRef(initial.title);
  const blocksRef = useRef<Block[]>(withKeys(markdownBlocks(initial.body)));
  const historyRef = useRef<Snapshot[]>([]);
  const savedRef = useRef<Snapshot>({ title: initial.title, blocks: blocksRef.current });
  const [meta, setMeta] = useState(initial.metaDescription);
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [state, formAction, pending] = useActionState(saveArticleEdit, null);
  const lastSavedAt = useRef<number | null>(null);

  const bodyOf = (blocks: Block[]) => blocks.map((b) => b.source.trim()).filter(Boolean).join("\n\n");
  const dirty = titleRef.current !== savedRef.current.title || meta !== initial.metaDescription || bodyOf(blocksRef.current) !== bodyOf(savedRef.current.blocks);
  void tick;

  // ---- the preview: plain DOM inside a shadow root --------------------------

  const renderBlockHtml = useCallback(
    (b: Block, index: number, all: Block[]) => {
      const html = renderMarkdown(b.source, { siteUrl }).html;
      if (b.kind === "table") return `<div class="tbl">${html}</div>`;
      // The opening quote is the page's "In short" callout (hosted-blog.ts
      // decorateBody) when it comes before the first heading.
      if (b.kind === "quote" && !all.slice(0, index).some((x) => x.kind === "heading")) {
        return html.replace(/^<blockquote>([\s\S]*)<\/blockquote>$/, '<aside class="tldr"><span class="tldr-k" contenteditable="false">In short</span>$1</aside>');
      }
      return html;
    },
    [siteUrl],
  );

  const blockEl = useCallback(
    (b: Block, index: number, all: Block[]) => {
      const el = document.createElement("div");
      el.className = "blk";
      el.dataset.key = b.key;
      el.dataset.kind = b.kind;
      const text = TEXT_KINDS.has(b.kind);
      const tools = document.createElement("div");
      tools.className = "tools";
      tools.setAttribute("contenteditable", "false");
      const btn = (act: string, label: string, danger = false) => `<button type="button" data-act="${act}" class="${danger ? "danger" : ""}">${label}</button>`;
      tools.innerHTML =
        (text ? btn("add", "+ Text") : btn("raw", "Edit")) +
        (b.kind === "heading" ? btn("section", "Delete section", true) : "") +
        btn("delete", "Delete", true);
      const content = document.createElement("div");
      content.className = text ? "ed" : "view";
      if (text) content.setAttribute("contenteditable", "true");
      content.innerHTML = renderBlockHtml(b, index, all);
      el.append(tools, content);
      return el;
    },
    [renderBlockHtml],
  );

  const mountBlocks = useCallback(() => {
    const body = rootRef.current?.querySelector(".body");
    if (!body) return;
    body.replaceChildren(...blocksRef.current.map((b, i, all) => blockEl(b, i, all)));
    const add = document.createElement("button");
    add.type = "button";
    add.className = "addend";
    add.dataset.act = "add-end";
    add.textContent = "+ Add a paragraph at the end";
    body.append(add);
  }, [blockEl]);

  const snapshot = (): Snapshot => ({ title: titleRef.current, blocks: blocksRef.current.map((b) => ({ ...b })) });
  const remember = () => {
    historyRef.current.push(snapshot());
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  };

  const focusBlock = useCallback((key: string, atEnd = true) => {
    const ed = rootRef.current?.querySelector<HTMLElement>(`.blk[data-key="${key}"] .ed`);
    if (!ed) return;
    ed.focus();
    const sel = (rootRef.current as unknown as { getSelection?: () => Selection | null })?.getSelection?.() ?? window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(!atEnd);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  /** A block's DOM read back into markdown and re-rendered. Returns the keys
   *  the block became (one, several when the text now holds several blocks,
   *  none when it is empty). */
  const commitBlock = useCallback(
    (key: string): string[] => {
      const i = blocksRef.current.findIndex((b) => b.key === key);
      if (i < 0) return [];
      const el = rootRef.current?.querySelector<HTMLElement>(`.blk[data-key="${key}"] .ed`);
      if (!el) return [key];
      const b = blocksRef.current[i];
      const md = domToMarkdown(el, b.kind).trim();
      if (md === b.source.trim()) {
        // Unchanged in substance: still re-render so stray browser markup goes.
        el.innerHTML = renderBlockHtml(b, i, blocksRef.current);
        return [key];
      }
      remember();
      const next = withKeys(markdownBlocks(md));
      blocksRef.current = [...blocksRef.current.slice(0, i), ...next, ...blocksRef.current.slice(i + 1)];
      mountBlocks();
      bump();
      return next.map((n) => n.key);
    },
    [mountBlocks, renderBlockHtml, bump],
  );

  const insertAfter = useCallback(
    (key: string | null, kind: MarkdownBlockKind, source: string, focus = true) => {
      remember();
      const i = key ? blocksRef.current.findIndex((b) => b.key === key) : blocksRef.current.length - 1;
      const [nb] = withKeys([{ kind, source }]);
      blocksRef.current = [...blocksRef.current.slice(0, i + 1), nb, ...blocksRef.current.slice(i + 1)];
      mountBlocks();
      bump();
      if (focus) focusBlock(nb.key, false);
      return nb.key;
    },
    [mountBlocks, bump, focusBlock],
  );

  const removeBlocks = useCallback(
    (keys: string[]) => {
      if (!keys.length) return;
      remember();
      const first = blocksRef.current.findIndex((b) => b.key === keys[0]);
      blocksRef.current = blocksRef.current.filter((b) => !keys.includes(b.key));
      mountBlocks();
      bump();
      const prev = blocksRef.current[Math.max(0, first - 1)];
      if (prev && TEXT_KINDS.has(prev.kind)) focusBlock(prev.key, true);
    },
    [mountBlocks, bump, focusBlock],
  );

  const undo = useCallback(() => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    titleRef.current = snap.title;
    blocksRef.current = snap.blocks;
    const h1 = rootRef.current?.querySelector<HTMLElement>("h1.title");
    if (h1) h1.textContent = snap.title;
    mountBlocks();
    bump();
  }, [mountBlocks, bump]);

  /** The raw editor for a source-edited block (table, code, rule, image). */
  const openRaw = useCallback(
    (key: string) => {
      const blk = rootRef.current?.querySelector<HTMLElement>(`.blk[data-key="${key}"]`);
      const b = blocksRef.current.find((x) => x.key === key);
      if (!blk || !b) return;
      const ta = document.createElement("textarea");
      ta.className = "raw";
      ta.value = b.source;
      ta.rows = Math.min(24, Math.max(4, b.source.split("\n").length + 1));
      ta.setAttribute("spellcheck", "false");
      const bar = document.createElement("div");
      bar.className = "rawbar";
      bar.innerHTML = `<button type="button" class="primary" data-act="raw-done">Done</button><button type="button" data-act="raw-cancel">Cancel</button>`;
      blk.replaceChildren(ta, bar);
      ta.focus();
    },
    [],
  );

  const closeRaw = useCallback(
    (key: string, apply: boolean) => {
      const blk = rootRef.current?.querySelector<HTMLElement>(`.blk[data-key="${key}"]`);
      const ta = blk?.querySelector<HTMLTextAreaElement>("textarea.raw");
      const i = blocksRef.current.findIndex((b) => b.key === key);
      if (i < 0) return;
      if (apply && ta && ta.value.trim() !== blocksRef.current[i].source.trim()) {
        remember();
        const next = withKeys(markdownBlocks(ta.value));
        blocksRef.current = [...blocksRef.current.slice(0, i), ...next, ...blocksRef.current.slice(i + 1)];
      }
      mountBlocks();
      bump();
    },
    [mountBlocks, bump],
  );

  // Mount once: the shadow root, the styles, the article; then delegate every
  // event from inside it.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || rootRef.current) return;
    const root = host.attachShadow({ mode: "open" });
    rootRef.current = root;
    root.innerHTML = `<style>${styles}${EDITOR_CSS}</style><div class="page" lang="${esc(lang)}" dir="${dir}"><main><article><h1 class="title" contenteditable="true" spellcheck="true"></h1><p class="meta">${esc(metaLine)}</p><div class="body"></div></article></main></div>`;
    root.querySelector("h1.title")!.textContent = titleRef.current;
    mountBlocks();

    const keyOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>(".blk")?.dataset.key ?? null : null);

    const onClick = (e: Event) => {
      const t = e.target as Element | null;
      const btn = t?.closest<HTMLButtonElement>("button[data-act]");
      if (btn) {
        e.preventDefault();
        const act = btn.dataset.act!;
        const key = keyOf(btn);
        if (act === "add-end") return void insertAfter(null, "paragraph", "");
        if (!key) return;
        if (act === "add") return void insertAfter(key, "paragraph", "");
        if (act === "delete") return removeBlocks([key]);
        if (act === "section") {
          const i = blocksRef.current.findIndex((b) => b.key === key);
          const level = (blocksRef.current[i].source.match(/^ {0,3}(#{1,6})/)?.[1].length ?? 2);
          const keys = [key];
          for (let j = i + 1; j < blocksRef.current.length; j++) {
            const b = blocksRef.current[j];
            const l = b.kind === "heading" ? (b.source.match(/^ {0,3}(#{1,6})/)?.[1].length ?? 6) : 7;
            if (b.kind === "heading" && l <= level) break;
            keys.push(b.key);
          }
          return removeBlocks(keys);
        }
        if (act === "raw") return openRaw(key);
        if (act === "raw-done") return closeRaw(key, true);
        if (act === "raw-cancel") return closeRaw(key, false);
        return;
      }
      // A source-edited block opens its editor on click; a link inside the
      // article must not navigate away from the editor.
      const view = t?.closest(".view");
      const key = keyOf(t);
      if (view && key) return openRaw(key);
      if (t?.closest("a")) e.preventDefault();
    };

    const onFocusOut = (e: Event) => {
      const t = e.target as Element | null;
      if (t?.classList.contains("ed")) {
        const key = keyOf(t);
        // Let the click that took focus land first (a toolbar button on the
        // same block re-mounts the DOM under it otherwise).
        if (key) setTimeout(() => commitBlock(key), 0);
      } else if (t?.matches?.("h1.title")) {
        const next = (t.textContent ?? "").replace(/\s+/g, " ").trim();
        if (next !== titleRef.current) {
          remember();
          titleRef.current = next;
          t.textContent = next;
          bump();
        }
      }
    };

    const onInput = () => bump();

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.matches("h1.title")) {
        if (e.key === "Enter") {
          e.preventDefault();
          t.blur();
        }
        return;
      }
      if (!t.classList.contains("ed")) return;
      const key = keyOf(t);
      const kind = t.closest<HTMLElement>(".blk")?.dataset.kind as MarkdownBlockKind | undefined;
      if (!key || !kind) return;
      if (e.key === "Enter" && !e.shiftKey && (kind === "paragraph" || kind === "heading")) {
        // Enter splits here: what is after the caret becomes the next
        // paragraph. In a list Enter stays native (a new item).
        e.preventDefault();
        // Chrome exposes the selection inside a shadow root on the root itself.
        const sel = (root as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection();
        let after = "";
        if (sel && sel.rangeCount) {
          const r = sel.getRangeAt(0);
          const tail = document.createRange();
          tail.setStart(r.endContainer, r.endOffset);
          tail.setEnd(t, t.childNodes.length);
          after = fragmentToMarkdown(tail.extractContents()).trim();
        }
        const keys = commitBlock(key);
        insertAfter(keys[keys.length - 1] ?? null, "paragraph", after, true);
        return;
      }
      if (e.key === "Backspace" && kind === "paragraph" && (t.textContent ?? "").trim() === "") {
        e.preventDefault();
        removeBlocks([key]);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest(".ed, h1.title")) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, text.replace(/\r\n/g, "\n"));
    };

    root.addEventListener("click", onClick);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", onKeyDown as EventListener);
    root.addEventListener("paste", onPaste as EventListener);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("input", onInput);
      root.removeEventListener("keydown", onKeyDown as EventListener);
      root.removeEventListener("paste", onPaste as EventListener);
    };
  }, [styles, lang, dir, metaLine, mountBlocks, commitBlock, insertAfter, removeBlocks, openRaw, closeRaw, bump]);

  // ---- saving ---------------------------------------------------------------

  const save = useCallback(() => {
    if (pending) return;
    // Anything still focused is committed first.
    const active = rootRef.current?.activeElement as HTMLElement | null;
    active?.blur();
    setTimeout(() => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("slug", slug);
      fd.set("updated_at", updatedAt);
      if (fileSha) fd.set("file_sha", fileSha);
      fd.set("title", titleRef.current);
      fd.set("meta_description", meta);
      fd.set("body", bodyOf(blocksRef.current));
      startTransition(() => formAction(fd));
    }, 10);
  }, [pending, id, slug, updatedAt, fileSha, meta, formAction]);

  useEffect(() => {
    if (state?.ok && state.at !== lastSavedAt.current) {
      lastSavedAt.current = state.at;
      savedRef.current = snapshot();
      bump();
    }
  }, [state, bump]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) save();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save, undo]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const where =
    route === "repo"
      ? autoMerge
        ? `Saving opens a pull request in ${repo ?? "your repo"}; it merges on its own once your site's checks pass.`
        : `Saving opens a pull request in ${repo ?? "your repo"}. Merge it and your site shows the change.`
      : route === "wordpress"
        ? "Saving updates the post on your WordPress site."
        : "Saving updates the live page within a minute.";

  return (
    <div className="arrive-in">
      {/* The bar: what this is, where a save goes, and the save itself. */}
      {/* Sticks just under the dashboard header (h-14, z-20 in the layout). */}
      <div className="sticky top-14 z-10 -mx-4 border-b border-line-soft bg-canvas/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link href={`/articles/${encodeURIComponent(id)}`} className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              {dirty ? "Leave without saving" : "Back to the article"}
            </Link>
            <p className="hidden min-w-0 truncate text-[13px] text-ink-muted md:block">{where}</p>
          </div>
          <div className="flex items-center gap-3">
            <Toast state={state} />
            {state?.ok && !dirty && url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
                Open the live article
              </a>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={undo} disabled={historyRef.current.length === 0}>
              Undo
            </Button>
            <Button type="button" variant="primary" size="md" pending={pending} disabled={!dirty} onClick={save}>
              {dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </div>
      </div>

      {/* The description Google shows under the title: not on the page, so
          it gets a field of its own above the article. */}
      <div className="mx-auto mt-5 flex max-w-[48rem] items-baseline gap-3 px-6">
        <label htmlFor="edit-meta" className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ink-faint">
          Description
        </label>
        <input
          id="edit-meta"
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          maxLength={EDIT_LIMITS.metaDescription}
          placeholder="The line Google shows under the title"
          className={cx("min-w-0 flex-1 bg-transparent py-1 text-[13.5px] text-ink-muted outline-none placeholder:text-ink-faint focus:text-ink", FOCUS_RING, "rounded")}
        />
        <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{meta.length}/{EDIT_LIMITS.metaDescription}</span>
      </div>

      {/* The article, as the page shows it. */}
      <div className="mt-2 overflow-hidden rounded-3xl border border-line-soft">
        <div ref={hostRef} />
      </div>

      <p className="mx-auto mt-4 max-w-[48rem] px-6 text-center text-[12.5px] text-ink-faint">
        Click any text to change it. Hover a block for more. {route !== "hosted" ? "Shown in DispatchSEO's blog layout; your site's own design may differ. " : ""}
        <kbd className="rounded bg-surface-2 px-1">⌘S</kbd> saves, <kbd className="rounded bg-surface-2 px-1">⌘⇧Z</kbd> undoes.
      </p>
    </div>
  );
}

// ---- DOM -> markdown ----------------------------------------------------------
// Only the forms renderMarkdown emits (and what a browser adds while you
// type: b/i, divs on Enter, spans). Anything else keeps its text.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (!(node instanceof Element)) return "";
  const tag = node.tagName.toLowerCase();
  const inner = () => Array.from(node.childNodes).map(inlineMd).join("");
  switch (tag) {
    case "strong":
    case "b": {
      const t = inner().trim();
      return t ? `**${t}**` : "";
    }
    case "em":
    case "i": {
      const t = inner().trim();
      return t ? `*${t}*` : "";
    }
    case "code":
      return `\`${(node.textContent ?? "").replace(/`/g, "'")}\``;
    case "a": {
      const href = node.getAttribute("href") ?? "";
      const t = inner().trim();
      return href && t ? `[${t}](${href})` : t;
    }
    case "img": {
      const src = node.getAttribute("src") ?? "";
      return src ? `![${node.getAttribute("alt") ?? ""}](${src})` : "";
    }
    case "br":
      return " ";
    case "script":
    case "style":
    case "button":
      return "";
    default:
      if (node.classList.contains("tldr-k")) return "";
      return inner();
  }
}

const BLOCKISH = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "ASIDE", "UL", "OL", "PRE", "TABLE"]);

/** Top-level runs of a container: each block element on its own, and inline
 *  runs between them grouped. */
function parts(container: Node): Node[][] {
  const out: Node[][] = [];
  let run: Node[] = [];
  for (const n of Array.from(container.childNodes)) {
    if (n instanceof Element && BLOCKISH.has(n.tagName)) {
      if (run.length) out.push(run);
      run = [];
      out.push([n]);
    } else {
      run.push(n);
    }
  }
  if (run.length) out.push(run);
  return out;
}

function listMd(list: Element, depth: number): string {
  const ordered = list.tagName === "OL";
  const lines: string[] = [];
  let n = 1;
  for (const li of Array.from(list.children)) {
    if (li.tagName !== "LI") continue;
    const sub = Array.from(li.children).find((c) => c.tagName === "UL" || c.tagName === "OL") ?? null;
    const text = Array.from(li.childNodes)
      .filter((c) => c !== sub)
      .map(inlineMd)
      .join("")
      .trim();
    if (text) lines.push(`${"    ".repeat(depth)}${ordered ? `${n}.` : "-"} ${text}`);
    n++;
    if (sub) lines.push(listMd(sub, depth + 1));
  }
  return lines.join("\n");
}

/** A fragment of mixed nodes (the tail of a split paragraph) as paragraphs. */
function fragmentToMarkdown(frag: DocumentFragment): string {
  return parts(frag)
    .map((run) => (run.length === 1 && run[0] instanceof Element && BLOCKISH.has((run[0] as Element).tagName) ? anyBlockMd(run[0] as Element) : run.map(inlineMd).join("").trim()))
    .filter(Boolean)
    .join("\n\n");
}

function anyBlockMd(el: Element): string {
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) {
    const t = Array.from(el.childNodes).map(inlineMd).join("").trim();
    return t ? `${"#".repeat(Number(tag[1]))} ${t}` : "";
  }
  if (tag === "UL" || tag === "OL") return listMd(el, 0);
  if (tag === "BLOCKQUOTE" || tag === "ASIDE") {
    const ps = parts(el).map((run) => run.map(inlineMd).join("").trim()).filter(Boolean);
    return ps.map((p) => `> ${p}`).join("\n>\n");
  }
  if (tag === "PRE") return "```\n" + (el.textContent ?? "").replace(/\n$/, "") + "\n```";
  return Array.from(el.childNodes).map(inlineMd).join("").trim();
}

function domToMarkdown(ed: HTMLElement, kind: MarkdownBlockKind): string {
  if (kind === "heading") {
    const h = ed.querySelector("h1,h2,h3,h4,h5,h6");
    const level = h ? Number(h.tagName[1]) : 2;
    const t = Array.from((h ?? ed).childNodes).map(inlineMd).join("").trim();
    return t ? `${"#".repeat(level)} ${t}` : "";
  }
  if (kind === "list") {
    const list = ed.querySelector("ul,ol");
    if (list) return listMd(list, 0);
  }
  if (kind === "quote") {
    const q = ed.querySelector("blockquote,aside");
    if (q) return anyBlockMd(q);
  }
  // Paragraph, or any block the browser reshaped: every top-level run is a
  // block of its own (markdownBlocks re-cuts the result on save).
  return parts(ed)
    .map((run) => (run.length === 1 && run[0] instanceof Element && BLOCKISH.has((run[0] as Element).tagName) ? anyBlockMd(run[0] as Element) : run.map(inlineMd).join("").trim()))
    .filter(Boolean)
    .join("\n\n");
}
