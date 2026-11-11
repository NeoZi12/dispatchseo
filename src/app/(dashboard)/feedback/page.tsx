import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { isFeedbackAdmin, listFeedback, type FeedbackItem } from "@/lib/feedback";
import { FeedbackBoard, FeedbackSoloForm } from "@/components/feedback-board";
import { PageHeader } from "@/components/ui";
import { BackToSettings } from "../settings/more-links";

export const dynamic = "force-dynamic";

// Deliberately no requireOnboarded() gate, unlike the per-site screens. This is
// the one place someone can tell us the product is missing something, and an
// account that has not finished adding a site is exactly the account most
// likely to have something to say about it.

export default async function FeedbackPage() {
  const auth = await requireDashboard();

  // Self-host is one person, so there is no board to show - see lib/feedback.
  if (!isCloudMode()) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BackToSettings />
        <PageHeader
          title="Feedback"
          hint="Missing something? Tell the people who build DispatchSEO - it goes straight to them."
        />
        <FeedbackSoloForm />
      </div>
    );
  }

  const isAdmin = isFeedbackAdmin(auth.user?.email);
  let items: FeedbackItem[] = [];
  let loadError: string | null = null;
  try {
    // The owner sees what they hid; everyone else sees the board without it.
    items = await listFeedback({ userId: auth.user?.id ?? null, includeHidden: isAdmin });
  } catch (e) {
    // Same tolerance the rest of the app shows an unapplied migration: the
    // screen still renders and says what to do, rather than 500-ing.
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToSettings />
      <PageHeader
        title="Feedback"
        hint="Ask for what's missing, and vote on what everyone else asked for. The most wanted things get built first."
      />
      {loadError ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          The board could not be loaded. If this deployment was just updated, migration{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">0046_feedback</code>{" "}
          has not been applied yet.
          <span className="mt-1 block text-amber-200/70">{loadError}</span>
        </div>
      ) : (
        <FeedbackBoard items={items} isAdmin={isAdmin} />
      )}
    </div>
  );
}
