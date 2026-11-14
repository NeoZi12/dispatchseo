import { notFound } from "next/navigation";
import { buildPlanMenu } from "@/lib/setup-flow";
import { StagePreview } from "./stage-preview";
import { CantPublish } from "@/components/setup-stage/cant-publish";
import type { PublishRouteReason } from "@/lib/publish-route-check";

// Dev-only design preview of the new setup stage (components/setup-stage):
// scripted scenes, fake data, no database, no GitHub, no Polar. Never in a
// production build (404s there, and src/proxy.ts only opens it in dev).
//   /onboarding/stage-preview
//   /onboarding/stage-preview?refused=lovable-legacy

export const metadata = { title: "Setup stage preview" };

const REFUSALS: PublishRouteReason[] = ["no-forwarding-rule", "static-export", "ambiguous-monorepo", "lovable-legacy"];

export default async function Page({ searchParams }: { searchParams: Promise<{ refused?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  // ?refused=<reason>: the "we can't publish to this site" screen the GitHub
  // step ends on (components/setup-stage/cant-publish.tsx), one per reason.
  const { refused } = await searchParams;
  const reason = REFUSALS.find((r) => r === refused);
  if (reason) return <CantPublish domain="leatherandco.com" reason={reason} />;
  // The plan step's cards from the real billing constants, yearly forced on
  // so the toggle can be reviewed on a dev box without the yearly products.
  return <StagePreview plans={{ open: buildPlanMenu(true, true), closed: buildPlanMenu(false, true) }} />;
}
