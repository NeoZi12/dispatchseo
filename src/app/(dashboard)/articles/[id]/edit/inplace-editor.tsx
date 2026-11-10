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
// so what you see after an edit is what the page will show. A table is
// edited cell by cell (the cells are the editable parts, so the grid itself
// cannot be broken), code as plain text inside its box; only an image falls
// back to editing its one line of source.
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

const TEXT_KINDS = new Set<MarkdownBlockKind>(["heading", "paragraph", "list", "quote", "table", "code"]);
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
.blk{position:relative}
.ed{outline:none;min-height:1.2em;cursor:text}
.ed>*,.view>*{outline:1px solid transparent;outline-offset:7px;transition:outline-color .12s}
.ed>:not(.tldr),.view>:not(.tbl){border-radius:4px}
.blk:hover .ed>*,.blk:hover .view>*{outline-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.blk:focus-within .ed>*{outline-color:var(--accent)}
.ed:empty{outline:1px solid transparent;outline-offset:7px;border-radius:4px}
.ed td[contenteditable],.ed th[contenteditable]{outline:none;cursor:text}
.ed td[contenteditable]:focus,.ed th[contenteditable]:focus{box-shadow:inset 0 0 0 1px var(--accent);border-radius:4px}
.ed pre[contenteditable]{outline:none;white-space:pre-wrap;cursor:text}
.blk:hover .ed:empty,.blk:focus-within .ed:empty{outline-color:var(--accent)}
.ed:empty::before{content:"Write here, or delete this block";color:var(--muted)}
.view{cursor:pointer}
.body>.blk:first-child .ed>p{font-size:18px;color:var(--ink2)}
.tools{position:absolute;top:-13px;right:-4px;display:none;gap:4px;z-index:2}
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
  pendingEdit = false,
  reviewing = false,
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
  /** An earlier edit's pull request is still open: saves join it. */
  pendingEdit?: boolean;
  /** Waiting for the owner's Publish (article-review.ts): a save rewrites
   *  the stored draft only, and the way on is back to its Publish button. */
  reviewing?: boolean;
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
  // The HTML tab: the article as HTML code, edited as text, saved as is.
  const [tab, setTab] = useState<"visual" | "html">("visual");
  const [htmlText, setHtmlText] = useState("");
  const [htmlBase, setHtmlBase] = useState("");
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [state, formAction, pending] = useActionState(saveArticleEdit, null);
  const lastSavedAt = useRef<number | null>(null);

  const bodyOf = (blocks: Block[]) => blocks.map((b) => b.source.trim()).filter(Boolean).join("\n\n");
  const dirtyVisual = titleRef.current !== savedRef.current.title || meta !== initial.metaDescription || bodyOf(blocksRef.current) !== bodyOf(savedRef.current.blocks);
  // Typing in the HTML tab counts as a change before it reaches the blocks.
  const dirty = dirtyVisual || (tab === "html" && htmlText !== htmlBase);
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
        (text ? btn("add", "+ Text") : b.kind === "image" ? btn("raw", "Edit") : "") +
        (b.kind === "heading" ? btn("section", "Delete section", true) : "") +
        btn("delete", "Delete", true);
      const content = document.createElement("div");
      content.className = text ? "ed" : "view";
      content.innerHTML = renderBlockHtml(b, index, all);
      if (b.kind === "table") {
        // The cells are what you type into; the grid stays ours.
        for (const cell of content.querySelectorAll("th, td")) cell.setAttribute("contenteditable", "true");
      } else if (b.kind === "code") {
        content.querySelector("pre")?.setAttribute("contenteditable", "plaintext-only");
      } else if (text) {
        content.setAttribute("contenteditable", "true");
      }
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
    const ed = rootRef.current?.querySelector<HTMLElement>(`.blk[data-key="${key}"] .ed [contenteditable], .blk[data-key="${key}"] .ed`);
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
      // Unchanged in substance (the same page output - a table's separator
      // row can be spelled two ways): keep the original source untouched and
      // only re-render, so stray browser markup goes and nothing reads as an
      // edit the owner did not make.
      if (md === b.source.trim() || renderMarkdown(md).html === renderMarkdown(b.source).html) {
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
    // Dev only: lets an automated check read the blocks back (never in prod).
    if (process.env.NODE_ENV !== "production") (host as HTMLElement & { __blocks?: () => Block[] }).__blocks = () => blocksRef.current;

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
      const ed = t?.closest?.(".ed");
      if (ed) {
        const key = keyOf(ed);
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

    // The hover tools sit on the content's top edge, not the block's: the
    // page's own margins (44px above an h2) live inside the block.
    const placeTools = (e: Event) => {
      const blk = (e.target as Element | null)?.closest?.<HTMLElement>(".blk");
      if (!blk) return;
      const tools = blk.querySelector<HTMLElement>(".tools");
      const content = blk.querySelector<HTMLElement>(".ed > *, .view > *, .ed:empty, textarea.raw");
      if (tools) tools.style.top = `${(content ? content.offsetTop : 0) - 14}px`;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Mid-composition (Japanese, Korean, Chinese input) Enter and Backspace
      // belong to the IME, not to us.
      if (e.isComposing || e.keyCode === 229) return;
      if (t.matches("h1.title")) {
        if (e.key === "Enter") {
          e.preventDefault();
          t.blur();
        }
        return;
      }
      if (!t.closest(".ed")) return;
      const key = keyOf(t);
      const kind = t.closest<HTMLElement>(".blk")?.dataset.kind as MarkdownBlockKind | undefined;
      if (!key || !kind) return;
      if (kind === "table" && e.key === "Enter") {
        // Enter moves to the next cell (Shift: previous); a cell holds one line.
        e.preventDefault();
        const cells = [...(t.closest(".ed")?.querySelectorAll<HTMLElement>("th, td") ?? [])];
        const i = cells.indexOf(t.closest("th, td") as HTMLElement);
        cells[i + (e.shiftKey ? -1 : 1)]?.focus();
        return;
      }
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
        return;
      }
      if (e.key === "Backspace" && kind === "paragraph" && caretAtStart(t)) {
        // Backspace at the very start joins this paragraph onto the previous
        // one (a paragraph or a heading), caret at the seam.
        const i = blocksRef.current.findIndex((b) => b.key === key);
        const prev = blocksRef.current[i - 1];
        if (!prev || (prev.kind !== "paragraph" && prev.kind !== "heading")) return;
        e.preventDefault();
        const mine = domToMarkdown(t, "paragraph").trim();
        // The seam is measured on the VISIBLE text of the previous block (its
        // source is longer wherever a link is written out).
        const prevEd = root.querySelector<HTMLElement>(`.blk[data-key="${prev.key}"] .ed`);
        const seam = (prevEd?.textContent ?? "").replace(/\s+$/, "").length;
        remember();
        const joined = `${prev.source.trim()} ${mine}`.trim();
        blocksRef.current = [...blocksRef.current.slice(0, i - 1), { ...prev, source: joined }, ...blocksRef.current.slice(i + 1)];
        mountBlocks();
        bump();
        focusBlock(prev.key, true);
        placeCaret(rootRef.current?.querySelector<HTMLElement>(`.blk[data-key="${prev.key}"] .ed`) ?? null, seam + (mine ? 1 : 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && kind === "list") {
        // Enter on an empty item leaves the list: the item goes, a paragraph
        // follows the list.
        const li = ((root as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection())?.anchorNode;
        const item = li instanceof Element ? li.closest("li") : li?.parentElement?.closest("li");
        if (item && (item.textContent ?? "").trim() === "" && !item.querySelector("ul, ol")) {
          e.preventDefault();
          item.remove();
          const keys = commitBlock(key);
          insertAfter(keys[keys.length - 1] ?? null, "paragraph", "", true);
        }
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        // At the last (first) line, the caret crosses into the next (previous)
        // block instead of stopping at the edge.
        const edge = caretOnEdgeLine(t, e.key === "ArrowDown" ? "last" : "first", root);
        if (!edge) return;
        const i = blocksRef.current.findIndex((b) => b.key === key);
        const next = blocksRef.current[i + (e.key === "ArrowDown" ? 1 : -1)];
        if (!next || !TEXT_KINDS.has(next.kind)) return;
        e.preventDefault();
        focusBlock(next.key, e.key === "ArrowUp");
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest(".ed, h1.title")) return;
      e.preventDefault();
      const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r\n/g, "\n");
      const blk = t.closest<HTMLElement>(".blk");
      const kind = blk?.dataset.kind;
      const paras = text.split(/\n[ \t]*\n+/).map((x) => x.trim()).filter(Boolean);
      if (kind === "paragraph" && paras.length > 1 && blk?.dataset.key) {
        // Pasted prose with blank lines: the first paragraph lands here, the
        // rest become blocks of their own after it.
        document.execCommand("insertText", false, paras[0]);
        const keys = commitBlock(blk.dataset.key);
        let after = keys[keys.length - 1] ?? null;
        for (const [n, para] of paras.slice(1).entries()) after = insertAfter(after, "paragraph", para, n === paras.length - 2);
        return;
      }
      document.execCommand("insertText", false, kind === "code" ? text : text.replace(/\s*\n\s*/g, " "));
    };

    root.addEventListener("click", onClick);
    root.addEventListener("mouseover", placeTools);
    root.addEventListener("focusin", placeTools);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", onKeyDown as EventListener);
    root.addEventListener("paste", onPaste as EventListener);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("mouseover", placeTools);
      root.removeEventListener("focusin", placeTools);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("input", onInput);
      root.removeEventListener("keydown", onKeyDown as EventListener);
      root.removeEventListener("paste", onPaste as EventListener);
    };
  }, [styles, lang, dir, metaLine, mountBlocks, commitBlock, insertAfter, removeBlocks, openRaw, closeRaw, bump]);

  // ---- the HTML tab ------------------------------------------------------------
  // The article as HTML code (title as its H1, then the body), in one box with
  // a Copy button. Whatever is in the box when the owner saves (or goes back
  // to the visual tab) becomes the article; Markdown pasted there works too.

  const articleHtml = useCallback(
    () => `<h1>${esc(titleRef.current)}</h1>\n${renderMarkdown(bodyOf(blocksRef.current), { siteUrl }).html}\n`,
    [siteUrl],
  );

  const applyPasted = useCallback(
    (raw: string): boolean => {
      let text = raw.replace(/\r\n/g, "\n").trim();
      if (!text) return false;
      // HTML when it opens with a tag and carries block tags anywhere.
      if (/^\s*<[a-z!]/i.test(text) && /<(p|h[1-6]|ul|ol|li|table|pre|blockquote|div|br|hr|img)\b/i.test(text)) text = htmlToMarkdown(text);
      const h1 = text.match(/^\s*#\s+([^\n]+)\n+/);
      remember();
      if (h1) {
        // The title is plain text: marks in a pasted heading stay out of it.
        titleRef.current = h1[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|__|`|(?<![A-Za-z0-9])[*_](?=\S)|(?<=\S)[*_](?![A-Za-z0-9])/g, "").replace(/\s+/g, " ").trim();
        const el = rootRef.current?.querySelector<HTMLElement>("h1.title");
        if (el) el.textContent = titleRef.current;
        text = text.slice(h1[0].length);
      }
      blocksRef.current = withKeys(markdownBlocks(text));
      mountBlocks();
      bump();
      return true;
    },
    [mountBlocks, bump],
  );

  /** The box's edits become the article (no-op when untouched). */
  const takeHtml = useCallback(() => {
    if (tab !== "html" || htmlText === htmlBase) return;
    if (applyPasted(htmlText)) {
      const fresh = articleHtml();
      setHtmlText(fresh);
      setHtmlBase(fresh);
    }
  }, [tab, htmlText, htmlBase, applyPasted, articleHtml]);

  const showTab = useCallback(
    (next: "visual" | "html") => {
      if (next === tab) return;
      if (next === "html") {
        const h = articleHtml();
        setHtmlText(h);
        setHtmlBase(h);
      } else {
        takeHtml();
      }
      setTab(next);
    },
    [tab, articleHtml, takeHtml],
  );

  const copyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(htmlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the code is selectable in the box.
    }
  }, [htmlText]);

  // ---- saving ---------------------------------------------------------------

  const save = useCallback(() => {
    if (pending) return;
    takeHtml();
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
  }, [pending, takeHtml, id, slug, updatedAt, fileSha, meta, formAction]);

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

  const where = reviewing
    ? "Saving updates this draft. Nothing reaches your site until you publish it."
    : route === "repo" && pendingEdit
      ? "An earlier edit is waiting on its pull request; saving adds to it."
      : route === "repo"
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link href={`/articles/${encodeURIComponent(id)}`} className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              {dirty ? "Leave without saving" : reviewing ? "Back to review" : "Back to the article"}
            </Link>
            <p className="hidden min-w-0 truncate text-[13px] text-ink-muted md:block">{where}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Toast state={state} />
            {state?.ok && !dirty && reviewing ? (
              // Saved: the next step is the Publish button on the review screen.
              <Link href={`/articles/${encodeURIComponent(id)}`} className="text-[13px] font-medium text-ok underline decoration-ok/40 underline-offset-[3px] hover:decoration-ok">
                Review and publish
              </Link>
            ) : state?.ok && !dirty && url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
                Open the live article
              </a>
            ) : null}
            <div role="tablist" aria-label="Editor view" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
              {(["visual", "html"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => showTab(t)}
                  className={cx("rounded-md px-3 py-1 text-[13px] font-medium transition-colors", tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink", FOCUS_RING)}
                >
                  {t === "visual" ? "Visual" : "HTML"}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={undo} disabled={historyRef.current.length === 0}>
              Undo
            </Button>
            <Button type="button" variant="primary" size="md" pending={pending} disabled={!dirty} onClick={save}>
              {dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </div>
      </div>

      {tab === "html" ? (
        // The article as HTML code. Select it and paste over it to replace
        // the article; Save keeps what's in the box.
        <section aria-label="HTML" className="mx-auto mt-5 max-w-5xl">
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="text-[13px] text-ink-muted">The article&apos;s HTML. Change it or paste over it, then Save.</p>
            <Button type="button" variant="secondary" size="sm" onClick={copyHtml}>
              {copied ? "Copied ✓" : "Copy"}
            </Button>
          </div>
          <textarea
            value={htmlText}
            onChange={(e) => setHtmlText(e.target.value)}
            spellCheck={false}
            aria-label="Article HTML"
            className={cx("h-[70vh] w-full resize-y rounded-2xl border border-line bg-surface-2 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none focus-visible:border-accent/60", FOCUS_RING)}
          />
        </section>
      ) : null}

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
      <div className={cx("mt-2 overflow-hidden rounded-3xl border border-line-soft", tab === "html" ? "hidden" : "")}>
        <div ref={hostRef} />
      </div>

      <p className="mx-auto mt-4 max-w-[48rem] px-6 text-center text-[12.5px] text-ink-faint">
        Click any text to change it, table cells too. Hover a block for Delete and more. The HTML tab shows the code, to copy or paste over. {route !== "hosted" ? "Shown in DispatchSEO's blog layout; your site's own design may differ. " : ""}
        <kbd className="rounded bg-surface-2 px-1">⌘S</kbd> saves, <kbd className="rounded bg-surface-2 px-1">⌘⇧Z</kbd> undoes.
      </p>
    </div>
  );
}

// ---- caret helpers --------------------------------------------------------------

function selectionIn(el: HTMLElement): Selection | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  const sel = (root as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection();
  return sel && sel.rangeCount ? sel : null;
}

/** Whether the caret sits at the very start of the editable, nothing selected. */
function caretAtStart(el: HTMLElement): boolean {
  const sel = selectionIn(el);
  if (!sel || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const probe = document.createRange();
  probe.setStart(el, 0);
  probe.setEnd(r.startContainer, r.startOffset);
  return probe.toString().length === 0;
}

/** Whether the caret is on the editable's first or last visual line. */
function caretOnEdgeLine(el: HTMLElement, which: "first" | "last", root: ShadowRoot): boolean {
  const sel = (root as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0).cloneRange();
  let rect = r.getBoundingClientRect();
  if (!rect.height) {
    // A collapsed range at an element boundary has no box: measure a zero-width marker.
    const m = document.createElement("span");
    m.textContent = "\u200b";
    r.insertNode(m);
    rect = m.getBoundingClientRect();
    m.remove();
  }
  const box = el.getBoundingClientRect();
  const line = rect.height || 24;
  return which === "last" ? box.bottom - rect.bottom < line * 0.6 : rect.top - box.top < line * 0.6;
}

/** Put the caret at a text offset inside the editable. */
function placeCaret(el: HTMLElement | null, offset: number): void {
  if (!el) return;
  const sel = selectionIn(el) ?? window.getSelection();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  let left = offset;
  while ((n = walker.nextNode())) {
    const len = n.textContent?.length ?? 0;
    if (left <= len) {
      const r = document.createRange();
      r.setStart(n, Math.max(0, left));
      r.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(r);
      return;
    }
    left -= len;
  }
}

// ---- DOM -> markdown ----------------------------------------------------------
// Only the forms renderMarkdown emits (and what a browser adds while you
// type: b/i, divs on Enter, spans). Anything else keeps its text.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  if (!(node instanceof Element)) return "";
  const tag = node.tagName.toLowerCase();
  const inner = () => Array.from(node.childNodes).map(inlineMd).join("");
  const style = (node as HTMLElement).style;
  const weight = style?.fontWeight ?? "";
  // Google Docs wraps a whole selection in <b style="font-weight:normal">;
  // its real bold and italic are styled spans.
  if ((tag === "b" || tag === "strong") && (weight === "normal" || weight === "400")) return inner();
  if (tag === "span" && (weight === "bold" || Number(weight) >= 600)) {
    const t = inner().trim();
    return t ? `**${t}**` : "";
  }
  if (tag === "span" && style?.fontStyle === "italic") {
    const t = inner().trim();
    return t ? `*${t}*` : "";
  }
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

const BLOCKISH = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "ASIDE", "UL", "OL", "PRE", "TABLE", "HR"]);

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
  let n = Math.max(1, Number(list.getAttribute("start")) || 1);
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
  if (tag === "PRE") return codeMd(el);
  if (tag === "TABLE") return tableMd(el);
  if (tag === "HR") return "---";
  if (tag === "IMG") return inlineMd(el);
  return Array.from(el.childNodes).map(inlineMd).join("").trim();
}

/** A table back to its rows: header, the alignment row (kept from the
 *  cells' own text-align), body. A pipe typed into a cell is escaped the way
 *  the renderer reads it. */
function tableMd(table: Element): string {
  const rows = [...table.querySelectorAll("tr")].filter((r) => r.children.length);
  if (!rows.length) return "";
  const cellText = (c: Element) => Array.from(c.childNodes).map(inlineMd).join("").trim().replace(/\|/g, "\\|") || " ";
  const cells = (r: Element) => [...r.children].map(cellText);
  const head = cells(rows[0]);
  const sep = [...rows[0].children].map((c) => {
    const a = (c as HTMLElement).style.textAlign || (c.getAttribute("align") ?? "").toLowerCase();
    return a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---";
  });
  return [`| ${head.join(" | ")} |`, `| ${sep.join(" | ")} |`, ...rows.slice(1).map((r) => `| ${cells(r).join(" | ")} |`)].join("\n");
}

function codeMd(pre: Element): string {
  const code = pre.querySelector("code") ?? pre;
  const lang = (code.className.match(/language-([A-Za-z0-9+#.-]+)/) ?? [])[1] ?? "";
  const text = ((pre as HTMLElement).innerText ?? pre.textContent ?? "").replace(/\n$/, "");
  return "```" + lang + "\n" + text + "\n```";
}

const CONTAINERS = new Set(["HTML", "BODY", "ARTICLE", "MAIN", "SECTION", "HEADER", "FOOTER", "NAV", "FIGURE", "DETAILS"]);
const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, ul, ol, table, pre, blockquote, hr";

/** A pasted HTML document as Markdown: wrappers are walked into, blocks are
 *  converted one by one, inline runs between them become paragraphs. Only
 *  what the renderer can show survives (that is the point of the trip). */
function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, template, button, nav, meta, link, head").forEach((n) => n.remove());
  // Word's <o:p>, Docs' wrapper ids and StartFragment comments carry nothing.
  doc.querySelectorAll("o\\:p").forEach((n) => n.remove());
  const out: string[] = [];
  const walk = (container: Node) => {
    for (const run of parts(container)) {
      const only = run.length === 1 && run[0] instanceof Element ? (run[0] as Element) : null;
      // Any wrapper with blocks inside is walked into - a <div>, a <section>,
      // or Google Docs' <b style="font-weight:normal"> around the whole copy.
      const wraps = only && !BLOCKISH.has(only.tagName) && Array.from(only.children).some((c) => BLOCKISH.has(c.tagName) || CONTAINERS.has(c.tagName) || c.querySelector?.(BLOCK_SELECTOR));
      if (only && (CONTAINERS.has(only.tagName) || wraps)) walk(only);
      else if (only && only.tagName === "DIV" && only.querySelector(BLOCK_SELECTOR)) walk(only);
      else if (only && BLOCKISH.has(only.tagName)) out.push(anyBlockMd(only));
      else out.push(run.map(inlineMd).join("").trim());
    }
  };
  walk(doc.body);
  return out.filter(Boolean).join("\n\n");
}

function domToMarkdown(ed: HTMLElement, kind: MarkdownBlockKind): string {
  if (kind === "table") {
    const table = ed.querySelector("table");
    if (table) return tableMd(table);
  }
  if (kind === "code") {
    const pre = ed.querySelector("pre");
    if (pre) return codeMd(pre);
  }
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
