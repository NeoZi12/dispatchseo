import { redirect } from "next/navigation";

// Visitors moved to Home (owner, 2026-11-09); keep the old address alive.
export default async function OwnerVisitorsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  redirect(range ? `/owner?range=${encodeURIComponent(range)}` : "/owner");
}
