import { markBlockedSetup } from "./draft-status";

// A dry-run article (WRITER_DRY_RUN=1: canned research, canned prose) is a
// test fixture. It must never reach a customer's site, even if the draft
// outlives the deploy that wrote it - a smoke test run against the production
// database, a flag flipped off with jobs still queued. The writer marks such
// drafts (validation.writer.dry, stages.ts handoff) and every finish/publish
// handler asks here first.
//
// On a deploy that is itself in dry-run mode the draft goes through, so the
// end-to-end smoke test still exercises finish -> publish -> verify locally.
// Anywhere else it is PARKED, not thrown: a fixture is not a fault worth five
// retries and an alert.

export const DRY_BLOCK_REASON =
  "This is a dry-run test article (written with WRITER_DRY_RUN=1). It is never published outside a dry-run deploy; discard it.";

export function isDryDraft(validation: unknown): boolean {
  const v = validation as { writer?: { dry?: unknown } } | null | undefined;
  return v?.writer?.dry === true;
}

/** True when this draft must not go further on this deploy. */
export function dryDraftBlocked(validation: unknown): boolean {
  return isDryDraft(validation) && process.env.WRITER_DRY_RUN?.trim() !== "1";
}

/** Park the draft with the reason written onto it. */
export async function parkDryDraft(draftId: string, validation: unknown): Promise<void> {
  const v = validation && typeof validation === "object" ? (validation as Record<string, unknown>) : {};
  console.warn(`[publish] dry-run draft ${draftId} parked - not publishing a test article`);
  await markBlockedSetup(draftId, { validation: { ...v, blocked_reason: DRY_BLOCK_REASON } });
}
