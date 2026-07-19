import { redirect } from "next/navigation";

// The playbook now lives on the Backlinks tab - keep old bookmarks working.
export default function PlaybookPage() {
  redirect("/backlinks");
}
