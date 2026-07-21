import { redirect } from "next/navigation";

// The classic add-project form got replaced by the onboarding wizard; the old
// URL keeps working for bookmarks and the nav link. force-dynamic keeps the
// redirect out of build-time prerender - it would otherwise render the
// dashboard layout (which reads the DB) during `next build`, making CI
// builds fail without env (the pipeline's build-verify runs envless).
export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  // ?new=1 tells the wizard this is an ADD, so it must start fresh at step 1
  // instead of resuming the active project's saved screen.
  redirect("/onboarding?new=1");
}
