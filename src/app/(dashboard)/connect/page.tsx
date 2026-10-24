import { headers } from "next/headers";
import { redirectIfHosted } from "../mode";
import { requireDashboard } from "@/lib/auth-gate";
import { db } from "@/lib/db";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { fetchProjectToken } from "@/lib/projects";
import { requestOrigin } from "@/lib/request-origin";
import { aiKind } from "@/lib/wizard-branch";
import { EmptyState, PageHeader } from "@/components/ui";
import { ConnectPanels } from "./connect-client";

export const dynamic = "force-dynamic";

// The screen that answers "how do I actually use this".
//
// Not behind requireOnboarded, on purpose: connecting an AI is one of the
// first things a new owner does, and bouncing them into the wizard from the
// page that explains the product would be exactly backwards.

export default async function ConnectPage() {
  await requireDashboard();
  // Hosted writer: this screen belongs to the agent workflow; the hosted
  // dashboard covers it on /dashboard.
  await redirectIfHosted("/dashboard");
  const project = await getActiveProjectOrNull();

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader title="Connect your AI" hint="Add a site first, then connect an AI to it." />
        <EmptyState>No site yet.</EmptyState>
      </div>
    );
  }

  const hdrs = await headers();
  const [token, chat, agent] = await Promise.all([
    fetchProjectToken(project.id),
    // Evidence rather than a self-report: an "I have connected" button records
    // what the owner believes, and the thing worth knowing is whether an
    // article ever actually arrived.
    countFrom(project.id, "chat"),
    countFrom(project.id, "agent"),
  ]);

  // No key means the project row has none - a state only a broken write can
  // produce, and one where every command on this page would be wrong. Say so
  // rather than rendering a paste that silently cannot connect.
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader title="Connect your AI" hint="Something is wrong with this site's key." />
        <EmptyState>
          This site has no connection key, so there is nothing to paste yet. Open Settings and
          reconnect, or get in touch if it stays that way.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Connect your AI"
        hint="Your AI writes the articles on your own subscription. We check them, finish them, and put them on your site."
      />
      <ConnectPanels
        slug={project.slug}
        origin={requestOrigin(hdrs)}
        token={token}
        status={{ fromChat: chat, fromAgent: agent }}
        // Open on the tab this owner's AI actually is. They told us during
        // signup; landing a chat-app customer on "one command in a terminal"
        // is how the wrong half of this page becomes the first thing they read.
        defaultTab={aiKind(project.ai_choice) === "chat" ? "claude" : "agents"}
        // The other half of the evidence below: an article handed in proves
        // the connector works, but the FIRST thing that happens is the app
        // reaching our MCP door, often days earlier.
        chatSeen={Boolean(project.chat_last_seen_at)}
      />
    </div>
  );
}

/** Articles this project has taken from one kind of client. Rows written
 *  before client_kind existed count as neither, which is honest: we genuinely
 *  do not know what submitted them. */
async function countFrom(projectId: string, kind: "chat" | "agent"): Promise<number> {
  const { count } = await db()
    .from("article_drafts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("client_kind", kind)
    .neq("status", "rejected");
  return count ?? 0;
}
