import { Dispatching } from "@/components/dispatching";

// Route-transition loading for onboarding: the dispatcher at work instead of
// a frozen screen while the server component resolves.
export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Dispatching label="Loading your setup" />
    </div>
  );
}
