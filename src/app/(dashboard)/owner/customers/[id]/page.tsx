import { notFound } from "next/navigation";

import { requireDashboard } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import { isCloudMode } from "@/lib/cloud";
import { customerDetail } from "@/lib/owner-customer";
import { CustomerDetailView } from "./customer-view";

// One customer, the full page (a reload or a shared link). From a list the
// same view opens as a pop-up through ../../@modal. Operators only.
//
// Operator-only telemetry with no MCP counterpart, on purpose: an MCP token
// is one tenant, and nothing here is one tenant's to read.
export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboard();
  if (isCloudMode() && !isOperator(auth.user?.id)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const now = Date.now();
  const d = await customerDetail(id, now);
  if (!d) notFound();
  return <CustomerDetailView d={d} now={now} />;
}
