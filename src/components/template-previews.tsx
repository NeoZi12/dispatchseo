import type { ThemeToken } from "@/lib/conventions";
import type { GuideBlock } from "@/lib/content-prefs";

// Miniature browser-frame previews of what DispatchSEO ships: a believable
// thumbnail of a real generated guide page and a real generated tool page,
// with actual words at tiny type sizes - not gray skeleton bars. The trick
// that makes them land: the INSIDE of each frame is painted with the
// tenant's own theme colors (from conventions theme_tokens), so the preview
// literally looks like the user's site. The dashboard chrome around the
// frame stays on the neutral grammar.
//
// The guide mirrors the real blog layout: main column (answer-first intro,
// TL;DR, question H2s, comparison table, bespoke visual, FAQ) plus the
// right sidebar with an "On this page" ToC and the docked promo card the
// live site renders bottom-right. The tool mirrors the locked funnel:
// centered title, working widget, CTA to the product, description, FAQ.
//
// Server-component-safe and dependency-light on purpose. `size="compact"`
// tightens spacing and trims the tail sections for embedding elsewhere.

export type TemplatePalette = { bg: string; text: string; accent: string };

// Fallback when no conventions row exists yet: quiet warm neutrals so the
// preview still reads, without pretending to know the user's brand.
export const NEUTRAL_TEMPLATE_PALETTE: TemplatePalette = {
  bg: "#f5f4f1",
  text: "#26251f",
  accent: "#8f8a80",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

type Parsed = { name: string; hex: string; lum: number; sat: number };

// Resolve a drawable palette from the raw theme tokens the setup agent
// captured. Heuristics: token names first (ink/cream/clay-style vocabularies
// included), luminance and saturation as fallback, and a contrast guard so a
// degenerate token set still produces a readable preview.
export function paletteFromTokens(tokens?: ThemeToken[] | null): TemplatePalette {
  const parsed: Parsed[] = [];
  for (const t of tokens ?? []) {
    if (!t.value) continue;
    const rgb = hexToRgb(t.value);
    if (!rgb) continue;
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    parsed.push({
      name: t.name.toLowerCase(),
      hex: t.value,
      lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
      sat: max === 0 ? 0 : (max - Math.min(r, g, b)) / max,
    });
  }
  if (parsed.length === 0) return NEUTRAL_TEMPLATE_PALETTE;

  const byName = (re: RegExp) => parsed.find((p) => re.test(p.name));
  const byLum = [...parsed].sort((a, b) => a.lum - b.lum);

  let text =
    byName(/ink|text|fg|foreground|black|charcoal|dark/) ?? byLum[0];
  let bg =
    byName(/bg|background|paper|cream|base|canvas|surface|light|white/) ??
    byLum[byLum.length - 1];
  if (bg === text) {
    bg = byLum[byLum.length - 1] === text ? byLum[0] : byLum[byLum.length - 1];
  }
  if (Math.abs(bg.lum - text.lum) < 0.35) {
    text =
      bg.lum > 0.5
        ? { name: "_synth", hex: "#26251f", lum: 0.13, sat: 0 }
        : { name: "_synth", hex: "#f5f4f1", lum: 0.92, sat: 0 };
  }

  const named = byName(/accent|primary|brand|highlight/);
  const candidates = parsed
    .filter((p) => p !== bg && p !== text)
    .sort((a, b) => b.sat - a.sat);
  let accent = named && named !== bg && named !== text ? named : candidates[0];
  if (!accent || Math.abs(accent.lum - bg.lum) < 0.08) accent = text;

  return { bg: bg.hex, text: text.hex, accent: accent.hex };
}

// ---------- shared chrome ----------

function BrowserFrame({
  url,
  bg,
  compact,
  label,
  interactive = false,
  children,
}: {
  url: string;
  bg: string;
  compact: boolean;
  label: string;
  // role="img" hides descendants from assistive tech - fine for the static
  // thumbnail, wrong once the blocks inside are real toggle buttons.
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role={interactive ? "group" : "img"}
      aria-label={label}
      className="overflow-hidden rounded-lg border border-neutral-800"
    >
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
        <span className="flex shrink-0 gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-neutral-700" />
          <span className="h-2 w-2 rounded-full bg-neutral-700" />
          <span className="h-2 w-2 rounded-full bg-neutral-700" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded bg-neutral-800 px-2 py-0.5 text-center font-mono text-[10px] leading-4 text-neutral-500">
          {url}
        </span>
      </div>
      <div className={compact ? "p-3" : "p-3.5 sm:p-4"} style={{ backgroundColor: bg }}>
        {children}
      </div>
    </div>
  );
}

function FaqList({ questions, text }: { questions: string[]; text: string }) {
  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ borderColor: withAlpha(text, 0.14) }}
    >
      {questions.map((q, i) => (
        <div
          key={q}
          className={`flex items-center justify-between gap-2 px-2 py-1.5 ${i > 0 ? "border-t" : ""}`}
          style={i > 0 ? { borderColor: withAlpha(text, 0.1) } : undefined}
        >
          <span
            className="truncate text-[7px] font-medium leading-none"
            style={{ color: withAlpha(text, 0.8) }}
          >
            {q}
          </span>
          <span
            className="shrink-0 font-mono text-[8px] leading-none"
            style={{ color: withAlpha(text, 0.4) }}
          >
            +
          </span>
        </div>
      ))}
    </div>
  );
}

type PreviewProps = {
  palette?: TemplatePalette;
  url?: string;
  siteName?: string;
  size?: "full" | "compact";
};

// ---------- owner-toggleable blocks (Instructions page template controls) ----------

export type GuideBlocksState = Record<GuideBlock, boolean>;

export const ALL_GUIDE_BLOCKS_ON: GuideBlocksState = {
  tldr: true,
  comparison_table: true,
  visuals: true,
  faq: true,
};

// With an onToggle the block becomes a real button: on = normal (click to
// drop), off = dimmed ghost (click to bring back). Without one - the static
// preview everywhere else - an off block simply doesn't render.
function ToggleableBlock({
  on,
  label,
  onToggle,
  children,
}: {
  on: boolean;
  label: string;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  if (!onToggle) return on ? <>{children}</> : null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={
        on
          ? `${label} - included in every guide. Click to drop it.`
          : `${label} - off. Click to bring it back.`
      }
      className={`block w-full cursor-pointer text-left transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
        on ? "hover:opacity-75" : "opacity-30 grayscale hover:opacity-50"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- the guide page ----------

export function GuideTemplatePreview({
  palette = NEUTRAL_TEMPLATE_PALETTE,
  url = "yoursite.com/guides/...",
  siteName = "your site",
  size = "full",
  blocks,
  onToggleBlock,
}: PreviewProps & {
  // Instructions-page template controls: which owner-toggleable blocks are
  // on, and (when the preview doubles as the control surface) the toggle
  // callback. Omit both for the plain static thumbnail.
  blocks?: GuideBlocksState;
  onToggleBlock?: (block: GuideBlock) => void;
}) {
  const { bg, text, accent } = palette;
  const full = size === "full";
  const body = { color: withAlpha(text, 0.72) };
  const muted = { color: withAlpha(text, 0.5) };
  const b = blocks ?? ALL_GUIDE_BLOCKS_ON;
  const toggle = (k: GuideBlock) => (onToggleBlock ? () => onToggleBlock(k) : undefined);
  const tocItems = [
    { item: "When Claude Code pulls ahead", block: null },
    { item: "Feature comparison", block: "comparison_table" as const },
    { item: "Tokens per task", block: "visuals" as const },
    { item: "FAQ", block: "faq" as const },
  ].filter((t) => !t.block || b[t.block]);
  return (
    <div>
      <BrowserFrame
        url={url}
        bg={bg}
        compact={!full}
        interactive={Boolean(onToggleBlock)}
        label={
          onToggleBlock
            ? "Preview of a generated guide page - click a block to include or drop it"
            : "Miniature preview of a generated guide page, rendered in your site's colors"
        }
      >
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          {/* main column */}
          <div className={full ? "space-y-2.5" : "space-y-2"}>
            <div className="space-y-1">
              <h4
                className="text-[10px] font-bold leading-tight tracking-tight"
                style={{ color: text }}
              >
                Claude Code vs Cursor: which one fits your workflow?
              </h4>
              <p className="text-[6.5px] leading-none" style={muted}>
                12 min read · Updated this week
              </p>
            </div>

            <p className="text-[7px] leading-[1.6]" style={body}>
              Cursor is the better fit if you live in an editor and want inline
              autocomplete. Claude Code wins for multi-file refactors and anything
              you&apos;d rather delegate whole. Most teams end up running both.
            </p>

            <ToggleableBlock on={b.tldr} label="TL;DR blockquote" onToggle={toggle("tldr")}>
              <div
                className="rounded-r-md border-l-2 py-1.5 pl-2 pr-1.5"
                style={{
                  borderColor: accent,
                  backgroundColor: withAlpha(accent, 0.08),
                }}
              >
                <p className="text-[7px] leading-[1.55]" style={body}>
                  <span className="font-bold" style={{ color: text }}>
                    TL;DR:
                  </span>{" "}
                  Pick Cursor for speed inside files, Claude Code for scope across
                  them.
                </p>
              </div>
            </ToggleableBlock>

            <div className="space-y-1">
              <h5 className="text-[8px] font-bold leading-tight" style={{ color: text }}>
                When does Claude Code pull ahead?
              </h5>
              <p className="text-[7px] leading-[1.6]" style={body}>
                The moment a change spans more than one file. It plans the edit,
                runs your build, and fixes what breaks before you ever look.
              </p>
            </div>

            <ToggleableBlock
              on={b.comparison_table}
              label="Comparison table"
              onToggle={toggle("comparison_table")}
            >
              <div
                className="overflow-hidden rounded-md border"
                style={{ borderColor: withAlpha(text, 0.14) }}
              >
                <div
                  className="grid grid-cols-[1.4fr_1fr_1fr]"
                  style={{ backgroundColor: withAlpha(accent, 0.14) }}
                >
                  {["", "Claude Code", "Cursor"].map((h, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-1 text-[6.5px] font-bold leading-none"
                      style={{ color: text }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {[
                  ["Multi-file refactors", "Excellent", "Manual"],
                  ["Inline completions", "None", "Best in class"],
                  ["Delegating whole tasks", "Built for it", "Limited"],
                ].map((row, r) => (
                  <div
                    key={r}
                    className="grid grid-cols-[1.4fr_1fr_1fr] border-t"
                    style={{ borderColor: withAlpha(text, 0.1) }}
                  >
                    {row.map((cell, c) => (
                      <span
                        key={c}
                        className={`px-1.5 py-1 text-[6.5px] leading-none ${c === 0 ? "font-medium" : ""}`}
                        style={c === 0 ? { color: withAlpha(text, 0.85) } : body}
                      >
                        {cell}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </ToggleableBlock>

            <ToggleableBlock on={b.visuals} label="Bespoke visuals" onToggle={toggle("visuals")}>
              <div
                className="rounded-md border p-1.5"
                style={{
                  borderColor: withAlpha(text, 0.12),
                  backgroundColor: withAlpha(text, 0.03),
                }}
              >
                <p className="text-[6.5px] font-bold leading-none" style={{ color: text }}>
                  Avg. tokens per task
                </p>
                <div
                  className="mt-1.5 flex items-end gap-1.5"
                  style={{ height: full ? 34 : 26 }}
                >
                  {[
                    { label: "docs", h: 35 },
                    { label: "fix", h: 55 },
                    { label: "review", h: 70 },
                    { label: "refactor", h: 100 },
                  ].map((bar) => (
                    <div
                      key={bar.label}
                      className="flex h-full flex-1 flex-col justify-end gap-0.5"
                    >
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${bar.h}%`,
                          backgroundColor: withAlpha(accent, 0.75),
                        }}
                      />
                      <span className="text-center text-[5.5px] leading-none" style={muted}>
                        {bar.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ToggleableBlock>

            {full ? (
              <ToggleableBlock on={b.faq} label="FAQ section" onToggle={toggle("faq")}>
                <div className="space-y-1">
                  <h5 className="text-[8px] font-bold leading-tight" style={{ color: text }}>
                    FAQ
                  </h5>
                  <FaqList
                    text={text}
                    questions={[
                      "Can I use Claude Code and Cursor together?",
                      "Which is cheaper for a solo developer?",
                      "Does either one work offline?",
                    ]}
                  />
                </div>
              </ToggleableBlock>
            ) : null}
          </div>

          {/* right sidebar: ToC on top, docked promo card at the bottom */}
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="space-y-1">
              <p
                className="text-[6px] font-bold uppercase leading-none tracking-[0.12em]"
                style={muted}
              >
                On this page
              </p>
              <ul className="space-y-1">
                {tocItems.map(({ item }, i) => (
                  <li
                    key={item}
                    className={`truncate border-l pl-1.5 text-[6.5px] leading-tight ${i === 0 ? "font-semibold" : ""}`}
                    style={
                      i === 0
                        ? { color: accent, borderColor: accent }
                        : {
                            color: withAlpha(text, 0.55),
                            borderColor: withAlpha(text, 0.15),
                          }
                    }
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="mt-auto space-y-1.5 rounded-md border p-2"
              style={{
                borderColor: withAlpha(accent, 0.35),
                backgroundColor: withAlpha(accent, 0.08),
              }}
            >
              <p className="text-[7px] font-bold leading-tight" style={{ color: text }}>
                Unlock {siteName}&apos;s full potential
              </p>
              <ul className="space-y-0.5">
                {["Ship faster with guided setups", "Real examples, zero fluff"].map(
                  (b) => (
                    <li
                      key={b}
                      className="flex items-start gap-1 text-[6px] leading-tight"
                      style={body}
                    >
                      <span className="font-bold" style={{ color: accent }}>
                        ✓
                      </span>
                      {b}
                    </li>
                  ),
                )}
              </ul>
              <div
                className="rounded py-1 text-center text-[6.5px] font-bold leading-none"
                style={{ backgroundColor: accent, color: bg }}
              >
                Get started
              </div>
            </div>
          </div>
        </div>
      </BrowserFrame>
      {/* Interactive mode renders its own dynamic caption in the editor. */}
      {full && !onToggleBlock ? (
        <p className="mt-2 text-xs text-neutral-400">
          Answer-first intro, TL;DR, comparison table, bespoke visuals, FAQ, your
          sidebar CTA. Ships as a PR - never straight to live.
        </p>
      ) : null}
    </div>
  );
}

// ---------- the tool page ----------

export function ToolTemplatePreview({
  palette = NEUTRAL_TEMPLATE_PALETTE,
  url = "yoursite.com/tools/...",
  siteName = "your site",
  size = "full",
}: PreviewProps) {
  const { bg, text, accent } = palette;
  const full = size === "full";
  const body = { color: withAlpha(text, 0.72) };
  const muted = { color: withAlpha(text, 0.5) };
  return (
    <div>
      <BrowserFrame
        url={url}
        bg={bg}
        compact={!full}
        label="Miniature preview of a generated tool page, rendered in your site's colors"
      >
        <div className={full ? "space-y-2.5" : "space-y-2"}>
          <div className="space-y-1 py-0.5 text-center">
            <h4
              className="text-[11px] font-bold leading-tight tracking-tight"
              style={{ color: text }}
            >
              CLAUDE.md Generator
            </h4>
            <p className="text-[7px] leading-[1.5]" style={muted}>
              Answer three questions, get a CLAUDE.md tuned to your repo.
            </p>
          </div>

          <div
            className="space-y-2 rounded-lg border p-2.5"
            style={{
              borderColor: withAlpha(text, 0.15),
              backgroundColor: withAlpha(text, 0.04),
            }}
          >
            <div className="space-y-1">
              <p
                className="text-[7px] font-semibold leading-none"
                style={{ color: text }}
              >
                What kind of project?
              </p>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "Next.js app", active: true },
                  { label: "Python API", active: false },
                  { label: "Monorepo", active: false },
                ].map((chip) => (
                  <span
                    key={chip.label}
                    className="rounded-full border px-1.5 py-0.5 text-[6.5px] font-medium leading-none"
                    style={
                      chip.active
                        ? { backgroundColor: accent, borderColor: accent, color: bg }
                        : {
                            borderColor: withAlpha(text, 0.25),
                            color: withAlpha(text, 0.65),
                          }
                    }
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>

            <div
              className="rounded py-1.5 text-center text-[7px] font-bold leading-none"
              style={{ backgroundColor: accent, color: bg }}
            >
              Generate
            </div>

            <div
              className="rounded border"
              style={{ borderColor: withAlpha(text, 0.15), backgroundColor: bg }}
            >
              <div
                className="flex items-center justify-between border-b px-1.5 py-1"
                style={{ borderColor: withAlpha(text, 0.1) }}
              >
                <span className="text-[6px] font-medium leading-none" style={muted}>
                  Your CLAUDE.md
                </span>
                <span
                  className="text-[6px] font-bold leading-none"
                  style={{ color: accent }}
                >
                  Copy
                </span>
              </div>
              <div
                className="space-y-0.5 px-1.5 py-1 font-mono text-[6px] leading-[1.5]"
                style={body}
              >
                <p># CLAUDE.md</p>
                <p>## Commands</p>
                <p>pnpm dev · pnpm build · pnpm test</p>
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-between gap-2 rounded-md border p-2"
            style={{
              borderColor: withAlpha(accent, 0.35),
              backgroundColor: withAlpha(accent, 0.08),
            }}
          >
            <p
              className="min-w-0 text-[7px] font-medium leading-[1.4]"
              style={{ color: text }}
            >
              {siteName} can wire this into your repo automatically.
            </p>
            <span
              className="shrink-0 rounded px-1.5 py-1 text-[6.5px] font-bold leading-none"
              style={{ backgroundColor: accent, color: bg }}
            >
              Get started
            </span>
          </div>

          {full ? (
            <>
              <p className="text-[7px] leading-[1.6]" style={body}>
                Every file is generated from your answers - stack, commands, and
                conventions included. Nothing to install; copy the output straight
                into your repo.
              </p>
              <div className="space-y-1">
                <h5 className="text-[8px] font-bold leading-tight" style={{ color: text }}>
                  FAQ
                </h5>
                <FaqList
                  text={text}
                  questions={["Is the output free to use?", "Can I regenerate it later?"]}
                />
              </div>
            </>
          ) : null}
        </div>
      </BrowserFrame>
      {full ? (
        <p className="mt-2 text-xs text-neutral-400">
          Title, working widget, CTA to your product, FAQ. Ships as a PR after a
          real-browser test.
        </p>
      ) : null}
    </div>
  );
}
