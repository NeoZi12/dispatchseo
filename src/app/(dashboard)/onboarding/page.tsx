import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidCookie } from "@/lib/dashboard-auth";
import { serviceAccountEmail } from "@/lib/gsc";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/active-project";
import { fetchProjectToken } from "@/lib/projects";
import { OnboardingWizard, WIZARD_SCREENS, type WizardResume } from "@/components/onboarding-wizard";

export const dynamic = "force-dynamic";

// The add-a-site wizard: site -> Search Console -> keyword data source ->
// publish mode -> one-tap merge -> timeline -> live finale. /new redirects
// here with ?new=1; the classic form is retired.
//
// Resume: if the active project is already configured (repo connected) and
// this is not an explicit "add a new site" visit, rebuild the wizard's
// client state server-side - saved screen (0030), the created-project box,
// the keyword-source choice - so a closed tab or stuck terminal continues
// exactly where it stood instead of restarting at step 1.
async function buildResume(): Promise<WizardResume | null> {
  const project = await getActiveProject();
  if (!project?.github_repo) return null;
  const mcpToken = await fetchProjectToken(project.id);
  if (!mcpToken) return null;
  // Tolerant read: pre-0030 databases lack the column; resume is a nicety.
  let savedScreen: string | null = null;
  try {
    const { data } = await db()
      .from("projects")
      .select("onboarding_screen")
      .eq("id", project.id)
      .maybeSingle();
    savedScreen = (data as { onboarding_screen?: string | null } | null)?.onboarding_screen ?? null;
  } catch {
    savedScreen = null;
  }
  const screen =
    savedScreen && (WIZARD_SCREENS as readonly string[]).includes(savedScreen)
      ? (savedScreen as WizardResume["screen"])
      : "s5";
  return {
    // Never resume INTO step 1 - the project exists; land on the next step.
    screen: screen === "s0" ? "s1" : screen,
    created: {
      slug: project.slug,
      name: project.name,
      domain: project.domain,
      mcpToken,
    },
    choice: project.keyword_source === "dataforseo" ? "paid" : "free",
    serpConnected: project.keyword_source === "serpapi",
    playbookSkipped: project.powerups_skipped.includes("playbook"),
  };
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");

  // The MCP connect command needs this deployment's public origin. Behind
  // Vercel the forwarded headers are trustworthy; localhost falls out naturally.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const { new: isNew } = await searchParams;
  const resume = isNew === "1" ? null : await buildResume();

  return (
    <OnboardingWizard saEmail={await serviceAccountEmail()} origin={origin} resume={resume} />
  );
}
