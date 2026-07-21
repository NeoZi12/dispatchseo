import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidCookie } from "@/lib/dashboard-auth";
import { serviceAccountEmail } from "@/lib/gsc";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export const dynamic = "force-dynamic";

// The add-a-site wizard: site -> Search Console -> keyword data source ->
// Claude Code -> power-ups. /new redirects here; the classic form is retired.
export default async function OnboardingPage() {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");

  // The MCP connect command needs this deployment's public origin. Behind
  // Vercel the forwarded headers are trustworthy; localhost falls out naturally.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  return <OnboardingWizard saEmail={await serviceAccountEmail()} origin={origin} />;
}
