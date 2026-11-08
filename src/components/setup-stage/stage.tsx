"use client";

import type { ReactNode } from "react";
import { Companion, Rail, SCENES, type SceneId, type SceneStep } from "./primitives";

// The stage: one page, one column, centred. The dispatcher at the top of
// the page with its one line, the rail under it, the scene under that
// (owner, 2026-11-05: "the dispatcher above the top of the timeline,
// instructions clearer and more centred"). Scenes swap in place - no page
// loads between steps, no "back" to lose, nothing to scroll past.

export function SetupStageShell({ scene, done, say, hop, children, steps = SCENES }: { scene: SceneId; done: number; say: ReactNode; hop?: boolean; children: ReactNode; steps?: SceneStep[] }) {
  const index = steps.findIndex((x) => x.id === scene);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col items-center">
        <Companion say={say} hop={hop} />
        <Rail current={index} done={done} steps={steps} className="mt-8" />
      </header>
      <div className="mt-8">{children}</div>
    </div>
  );
}
