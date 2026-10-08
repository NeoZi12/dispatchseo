"use client";

import { useState } from "react";
import type { SetupStep } from "@/lib/setup-path-core";
import { SetupStepCard } from "@/components/setup-path";
import type { SiteQualifier } from "@/components/setup-path";
import type { WordPressStatus } from "@/components/wordpress-connect";
import { DispatchMark } from "@/components/logo";

// The design-review surface for /onboarding/preview. Server-computed steps
// in, the real <SetupStepCard> out, with `preview` on so nothing is saved.

export type PreviewGroup =
  | "github_coding" | "github_chat" | "wordpress_coding" | "wordpress_chat"
  | "manual_coding" | "manual_chat" | "variants" | "deferral" | "legacy";

export type PreviewFrame = {
  name: string;
  group: PreviewGroup;
  label: string;
  expect: string | null;
  note: string | null;
  step: SetupStep;
  props: {
    slug: string | null;
    origin: string;
    agentId: string;
    token: string | null;
    wp: WordPressStatus;
    repos: string[];
    gscSites: string[];
    gscSiteUrl: string | null;
    qualifier: SiteQualifier;
    serverNow: number;
  };
};

type Mode = "screen" | "hero";

function modeFor(frame: PreviewFrame, forced: Mode | null): Mode {
  if (forced) return forced;
  return frame.step.phase === "connect" ? "screen" : "hero";
}

function href(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `/onboarding/preview${s ? `?${s}` : ""}`;
}

const KIND_CHIP: Record<string, string> = {
  do: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  wait: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  done: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

export function PreviewGallery({
  groups,
  group,
  frames,
  mode,
  counts,
  single,
}: {
  groups: { id: PreviewGroup; label: string }[];
  group: PreviewGroup;
  frames: PreviewFrame[];
  mode: Mode | null;
  counts?: Record<string, number>;
  single?: boolean;
}) {
  if (single && frames[0]) return <SingleView frame={frames[0]} mode={mode} />;

  return (
    <div className="min-h-screen bg-neutral-950">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-neutral-800/80 bg-neutral-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <DispatchMark className="h-6 w-auto" />
              <span className="text-[15px] font-semibold text-neutral-100">Setup path</span>
              <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                design review
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-0.5 text-xs font-medium" role="group" aria-label="Card mode">
              {([
                [null, "Auto"],
                ["screen", "Screen"],
                ["hero", "Hero"],
              ] as const).map(([m, label]) => (
                <a
                  key={label}
                  href={href({ branch: group, mode: m })}
                  aria-current={mode === m ? "true" : undefined}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    mode === m ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
          <nav aria-label="Branch" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
            {groups.map((g, i) => (
              <a
                key={g.id}
                href={href({ branch: g.id, mode })}
                aria-current={g.id === group ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  g.id === group
                    ? "bg-violet-500/15 text-violet-100 ring-1 ring-inset ring-violet-500/30"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                } ${i === 6 ? "ml-3" : ""}`}
              >
                {g.label}
                {counts?.[g.id] ? <span className="text-[11px] tabular-nums text-neutral-500">{counts[g.id]}</span> : null}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
            {groups.find((g) => g.id === group)?.label}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
            Every state this branch walks, in order, rendered by the real engine and card from synthetic
            fixtures. Connect steps show full-screen; launch and first-article steps show as the Home hero.
            Nothing here is saved. <span className="text-neutral-500">Press &ldquo;Play next&rdquo; on a frame to watch the done beat and the transition into the following state.</span>
          </p>
        </div>
        <ol className="space-y-10">
          {frames.map((f, i) => (
            <li key={f.name}>
              <Frame frame={f} next={isBranch(group) ? frames[i + 1] ?? null : null} index={i + 1} forced={mode} />
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

function isBranch(g: PreviewGroup): boolean {
  return g !== "variants" && g !== "deferral" && g !== "legacy";
}

function Frame({
  frame,
  next,
  index,
  forced,
}: {
  frame: PreviewFrame;
  next: PreviewFrame | null;
  index: number;
  forced: Mode | null;
}) {
  const [shown, setShown] = useState<PreviewFrame>(frame);
  const [replay, setReplay] = useState(0);
  const m = modeFor(frame, forced);
  const s = frame.step;
  const mismatch = frame.expect != null && frame.expect !== s.id;
  const advanced = shown !== frame;

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800 bg-neutral-900/70 px-4 py-2.5">
        <span className="font-mono text-xs tabular-nums text-neutral-600">{String(index).padStart(2, "0")}</span>
        <span className="font-mono text-[13px] font-medium text-neutral-100">{frame.label}</span>
        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND_CHIP[s.kind]}`}>
          {s.kind}
        </span>
        <span className="rounded-md border border-neutral-700 px-1.5 py-0.5 text-[11px] font-medium text-neutral-400">{s.phase}</span>
        {s.id !== frame.label.split("__")[0] ? (
          <span className="rounded-md border border-neutral-700 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400">→ {s.id}</span>
        ) : null}
        <span className="rounded-md border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-500">{m}</span>
        {s.polls ? <span className="text-[11px] text-neutral-500">polls</span> : null}
        {s.primary.kind === "action" && s.primary.autoFire ? (
          <span className="text-[11px] text-amber-300/80">auto-fires on mount</span>
        ) : null}
        {mismatch ? (
          <span className="rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-300">
            expected {frame.expect}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-3 text-xs">
          {next && !advanced ? (
            <button
              type="button"
              onClick={() => setShown(next)}
              className="cursor-pointer rounded-md bg-violet-500/15 px-2 py-1 font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30 transition-colors hover:bg-violet-500/25"
            >
              Play next ▸
            </button>
          ) : null}
          {advanced ? (
            <button
              type="button"
              onClick={() => {
                setShown(frame);
                setReplay((n) => n + 1);
              }}
              className="cursor-pointer rounded-md px-2 py-1 font-medium text-neutral-400 hover:text-neutral-200"
            >
              Reset
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setReplay((n) => n + 1)}
              className="cursor-pointer rounded-md px-2 py-1 font-medium text-neutral-500 hover:text-neutral-300"
            >
              Replay
            </button>
          )}
          <a href={href({ step: frame.name, mode: forced })} className="text-neutral-500 hover:text-neutral-300">
            Open alone ↗
          </a>
        </span>
      </div>
      {frame.note ? <p className="border-b border-neutral-800/70 px-4 py-2 text-xs text-neutral-500">{frame.note}</p> : null}
      <Stage mode={m}>
        <SetupStepCard
          key={replay}
          step={shown.step}
          mode={m}
          preview
          {...shown.props}
        />
      </Stage>
    </section>
  );
}

/** The backdrop a card sits on: the onboarding page's bare canvas for
 *  screen mode, a sliver of Home for hero mode. */
function Stage({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  if (mode === "hero") {
    return (
      <div className="bg-neutral-950 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {children}
          {/* Where the briefing sits under the hero on Home - greyed so the
              hero reads in context without competing with it. */}
          <div className="mt-4 space-y-2 rounded-xl border border-neutral-900 p-4" aria-hidden>
            <div className="h-3 w-40 rounded bg-neutral-900" />
            <div className="h-2.5 w-full rounded bg-neutral-900/70" />
            <div className="h-2.5 w-4/5 rounded bg-neutral-900/70" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.07),transparent_60%)] bg-neutral-950 px-4 py-10 sm:px-8 sm:py-14">
      {children}
    </div>
  );
}

function SingleView({ frame, mode }: { frame: PreviewFrame; mode: Mode | null }) {
  const m = modeFor(frame, mode);
  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-8 sm:px-6 sm:py-10">
      <div className={`mx-auto w-full ${m === "hero" ? "max-w-5xl" : "max-w-3xl"}`}>
        <div className="mb-8 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5 text-lg font-semibold text-white">
            <DispatchMark className="h-7 w-auto" />
            DispatchSEO
          </span>
          <a
            href={href({ branch: frame.group, mode })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
          >
            <span aria-hidden>←</span> Gallery
          </a>
        </div>
        <SetupStepCard step={frame.step} mode={m} preview {...frame.props} />
      </div>
      <p className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] left-1/2 -translate-x-1/2 rounded-full border border-neutral-800 bg-neutral-900/90 px-3 py-1 font-mono text-[11px] text-neutral-500 backdrop-blur">
        {frame.name} · {frame.step.kind} · {frame.step.phase}
      </p>
    </main>
  );
}
