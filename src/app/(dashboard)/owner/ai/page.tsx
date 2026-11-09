import { aiReport, productProjectId } from "@/lib/owner-insights";
import { EmptyState } from "@/components/ui/empty-state";
import { ownerGate, settle } from "../data";
import { AiSection } from "../insights-view";
import { OwnerShell } from "../shell";

export const dynamic = "force-dynamic";

export default async function OwnerAiPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range, now } = await ownerGate(searchParams);
  const productId = await productProjectId().catch(() => null);
  const a = await settle(aiReport(range, productId, now));
  return (
    <OwnerShell section="ai" range={range} now={now}>
      {a.value ? <AiSection a={a.value} now={now} /> : <EmptyState title="AI visibility could not be read">{a.error ?? "unknown error"}</EmptyState>}
    </OwnerShell>
  );
}
