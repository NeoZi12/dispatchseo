import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { getSubscription, isActive } from "@/lib/billing";
import { DispatchMark } from "@/components/logo";
import { QualifyForm } from "./qualify-form";

export const dynamic = "force-dynamic";

// The screen that stands between a fresh cloud account and the checkout page.
//
// It exists because of four real trials, all lost, none of which ever saw a
// published article: two WordPress owners who could never pass "Connect
// GitHub", one owner with no coding agent who stopped at "Connect your coding
// agent", and one whose agent was dead. Every one of those was knowable before
// the card was charged. Asking here costs a signup we could not have served
// anyway; not asking cost four people money and an afternoon.
//
// Deliberately NOT a marketing page: no pricing, no reassurance, no email
// capture when the answer is no. Two questions, one honest answer.

export default async function QualifyPage() {
  const auth = await requireDashboard();
  // Self-host has no checkout to gate, so this page is cloud-only.
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  // Already paying? Nothing to qualify - go run the product.
  const sub = await getSubscription(auth.user.id);
  if (isActive(sub)) redirect("/onboarding?new=1");

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-5 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,92,246,0.16),transparent_70%)]"
      />
      <div className="relative mx-auto w-full max-w-xl">
        <div className="mb-8 flex items-center gap-2.5">
          <DispatchMark className="h-7 w-7" />
          <span className="text-sm font-semibold tracking-tight text-neutral-200">DispatchSEO</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">
          One question before you pay
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-400">
          What your site is built with. DispatchSEO writes the articles and publishes them for you,
          and it can publish to two kinds of site - easier to check now than to discover after
          you&apos;ve been charged.
        </p>

        <QualifyForm />
      </div>
    </main>
  );
}
