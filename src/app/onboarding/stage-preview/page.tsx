import { notFound } from "next/navigation";
import { StagePreview } from "./stage-preview";

// Dev-only design preview of the new setup stage (components/setup-stage):
// scripted scenes, fake data, no database, no GitHub, no Polar. Never in a
// production build (404s there, and src/proxy.ts only opens it in dev).
//   /onboarding/stage-preview

export const metadata = { title: "Setup stage preview" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StagePreview />;
}
