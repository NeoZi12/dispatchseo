import { notFound } from "next/navigation";

import { requireDashboard } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import { isCloudMode } from "@/lib/cloud";
import { customerDetail } from "@/lib/owner-customer";
import { CustomerDetailView } from "../../../customers/[id]/customer-view";
import { Modal } from "../../../modal";

// The customer page as a pop-up: what a row click anywhere under /owner
// opens (layout.tsx). Same gate, same data, same view as the full page.
export const dynamic = "force-dynamic";

export default async function CustomerModalPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboard();
  if (isCloudMode() && !isOperator(auth.user?.id)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const now = Date.now();
  const d = await customerDetail(id, now);
  if (!d) notFound();
  return (
    <Modal label={d.email}>
      <CustomerDetailView d={d} now={now} inModal />
    </Modal>
  );
}
