// Mirrors onboarding/page.tsx: the OnboardingWizard's header row, progress
// rail, and the first step's form card.
export default function OnboardingLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse">
      <div className="flex items-center justify-between pb-4 pt-1">
        <div className="h-4 w-40 rounded-lg bg-neutral-900" />
        <div className="h-3 w-32 rounded-lg bg-neutral-900" />
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="h-[3px] flex-1 rounded-full bg-neutral-800" />
        ))}
      </div>
      <div className="mb-5 mt-2 h-3 w-48 rounded-lg bg-neutral-900" />
      <div className="space-y-3">
        <div className="h-6 w-56 rounded-lg bg-neutral-900" />
        <div className="h-4 w-72 rounded-lg bg-neutral-900" />
        <div className="space-y-3 rounded-xl bg-neutral-900 p-4">
          <div className="h-10 rounded-lg bg-neutral-800" />
          <div className="h-10 rounded-lg bg-neutral-800" />
          <div className="h-10 rounded-lg bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}
