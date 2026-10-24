"use server";

import { saveBlockedTopics, saveTone } from "@/app/autopilot-actions";
import type { ActionState } from "@/components/ui/action-state";

// "How articles sound" is one card with one Save: the house rules and the
// topics to avoid go through their own existing actions (each re-checks the
// project and refreshes), in turn. The first refusal stops it and is what
// the toast says, so a failed topic list never reads as a saved one.
export async function saveVoice(prev: ActionState, fd: FormData): Promise<ActionState> {
  const tone = await saveTone(prev, fd);
  if (!tone?.ok) return tone;
  const topics = await saveBlockedTopics(prev, fd);
  if (!topics?.ok) return topics;
  return { ok: true, message: "Saved. New articles follow it from the next one.", at: Date.now() };
}
