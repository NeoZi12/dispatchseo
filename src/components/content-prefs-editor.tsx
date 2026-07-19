"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContentPrefs } from "@/app/actions";
import {
  ARCHETYPE_LABELS,
  GUIDE_ARCHETYPES,
  HOUSE_RULES_MAX,
  MIN_ENABLED_ARCHETYPES,
  renderGuidePrefsNote,
  renderToolPrefsNote,
  type ContentPrefs,
  type GuideArchetype,
  type GuideBlock,
} from "@/lib/content-prefs";
import {
  GuideTemplatePreview,
  type GuideBlocksState,
  type TemplatePalette,
} from "./template-previews";

// The Instructions page's template controls. The guide preview IS the control
// surface: every owner-toggleable block in the wireframe is a button, and the
// shape chips below it pick which article archetypes stay in rotation. Same
// optimistic-write idiom as AutomationToggle: the UI moves instantly, the
// server round-trip runs behind it, a failed write snaps back.

function blocksState(prefs: ContentPrefs): GuideBlocksState {
  return {
    tldr: !prefs.disabled_blocks.includes("tldr"),
    comparison_table: !prefs.disabled_blocks.includes("comparison_table"),
    visuals: !prefs.disabled_blocks.includes("visuals"),
    faq: !prefs.disabled_blocks.includes("faq"),
  };
}

export function ContentPrefsEditor({
  prefs: saved,
  palette,
  url,
  siteName,
}: {
  prefs: ContentPrefs;
  palette: TemplatePalette;
  url: string;
  siteName: string;
}) {
  const [, startTransition] = useTransition();
  const [prefs, setPrefs] = useState(saved);
  const router = useRouter();

  // Reconcile once fresh server props land (router.refresh, or the agent
  // changed prefs over MCP while the page was open).
  useEffect(() => {
    setPrefs(saved);
  }, [saved]);

  function persist(next: ContentPrefs, prev: ContentPrefs) {
    setPrefs(next); // move now
    startTransition(async () => {
      try {
        await setContentPrefs(next);
        router.refresh();
      } catch {
        setPrefs(prev); // write failed - put it back
      }
    });
  }

  function toggleBlock(block: GuideBlock) {
    const off = prefs.disabled_blocks.includes(block);
    persist(
      {
        ...prefs,
        disabled_blocks: off
          ? prefs.disabled_blocks.filter((b) => b !== block)
          : [...prefs.disabled_blocks, block],
      },
      prefs,
    );
  }

  const enabledShapes = GUIDE_ARCHETYPES.length - prefs.disabled_archetypes.length;

  function toggleArchetype(a: GuideArchetype) {
    const off = prefs.disabled_archetypes.includes(a);
    if (!off && enabledShapes <= MIN_ENABLED_ARCHETYPES) return; // keep rotation real
    persist(
      {
        ...prefs,
        disabled_archetypes: off
          ? prefs.disabled_archetypes.filter((x) => x !== a)
          : [...prefs.disabled_archetypes, a],
      },
      prefs,
    );
  }

  const droppedCount = prefs.disabled_blocks.length;

  return (
    <div className="space-y-3">
      <div>
        <GuideTemplatePreview
          palette={palette}
          url={url}
          siteName={siteName}
          blocks={blocksState(prefs)}
          onToggleBlock={toggleBlock}
        />
        <p className="mt-2 text-xs text-neutral-400">
          Click a block - TL;DR, table, visual, FAQ - to include or drop it from every
          guide.{" "}
          {droppedCount
            ? `${droppedCount} dropped; the next build already knows.`
            : "Ships as a PR - never straight to live."}
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">
          Shapes in rotation
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GUIDE_ARCHETYPES.map((a) => {
            const on = !prefs.disabled_archetypes.includes(a);
            const lastAllowed = on && enabledShapes <= MIN_ENABLED_ARCHETYPES;
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleArchetype(a)}
                aria-pressed={on}
                title={
                  lastAllowed
                    ? `At least ${MIN_ENABLED_ARCHETYPES} shapes must stay in rotation`
                    : on
                      ? "In rotation - click to remove"
                      : "Removed - click to restore"
                }
                className={`rounded-full px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
                  on
                    ? "bg-neutral-800 text-neutral-200"
                    : "bg-neutral-900 text-neutral-600 line-through"
                } ${lastAllowed ? "cursor-not-allowed" : ""}`}
              >
                {ARCHETYPE_LABELS[a]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-neutral-600">
          Each guide picks a different shape than the last few - remove the ones that
          don&apos;t fit your site.
        </p>
      </div>
    </div>
  );
}

// House rules apply to guides AND tools, so they live outside the guide card.
// Free text, saved explicitly (a half-typed rule must never hit the playbook).
// The preview below the box renders the EXACT markdown note the playbook
// injects ({{OWNER_PREFS_GUIDE}} / {{OWNER_PREFS_TOOL}}) - content-prefs.ts is
// pure, so the client runs the same renderer the backend does, live per
// keystroke, before anything is saved.
export function HouseRulesEditor({ prefs: saved }: { prefs: ContentPrefs }) {
  const [pending, startTransition] = useTransition();
  const [rules, setRules] = useState(saved.house_rules);
  const [error, setError] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<"guide" | "tool">("guide");
  const router = useRouter();

  useEffect(() => {
    setRules(saved.house_rules);
  }, [saved.house_rules]);

  const dirty = rules !== saved.house_rules;
  const livePrefs = { ...saved, house_rules: rules };
  const preview =
    previewFor === "guide" ? renderGuidePrefsNote(livePrefs) : renderToolPrefsNote(livePrefs);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setContentPrefs({ ...saved, house_rules: rules });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-xl bg-neutral-900/60 p-4 sm:p-5">
      <textarea
        value={rules}
        onChange={(e) => setRules(e.target.value.slice(0, HOUSE_RULES_MAX))}
        rows={4}
        placeholder={`One rule per line, plain English. For example:\nNever open with a definition.\nAlways mention we're open-source where it fits.\nNo emoji, ever.`}
        className="w-full resize-y rounded-lg bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline focus:outline-2 focus:outline-neutral-500"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">
          {error ?? "Injected verbatim into every guide and tool build - your rules beat the playbook's style defaults."}
        </p>
        {dirty ? (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save house rules"}
          </button>
        ) : null}
      </div>
      <div className="rounded-lg bg-neutral-950/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">
            What the agent reads{dirty ? " (unsaved)" : ""}
          </p>
          <div className="flex gap-1">
            {(["guide", "tool"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPreviewFor(t)}
                aria-pressed={previewFor === t}
                className={`rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
                  previewFor === t
                    ? "bg-neutral-800 text-neutral-200"
                    : "text-neutral-600 hover:text-neutral-400"
                }`}
              >
                {t === "guide" ? "Guides" : "Tools"}
              </button>
            ))}
          </div>
        </div>
        <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-400">
          {preview}
        </pre>
      </div>
    </div>
  );
}
