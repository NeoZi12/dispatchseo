import { redirect } from "next/navigation";

// The hosted screen is called Analytics now and lives on /analytics, which
// renders it for a hosted project (and the agent Analytics page otherwise).
// Old links and bookmarks land here, so this only forwards.
export default function ResultsPage() {
  redirect("/analytics");
}
