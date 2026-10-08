import { notFound } from "next/navigation";
import { VerdictPreview } from "./preview-client";

// Dev-only design review for the /qualify answer screen. Fixtures only, no
// database, 404 in production (and proxy-gated there too).
export default function QualifyPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VerdictPreview />;
}
