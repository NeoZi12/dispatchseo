import { requireDashboard } from "@/lib/auth-gate";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { browserCommand, resolveField, type PlaybookItem } from "@/lib/playbook";
import { loadSiteProfile, type SiteProfile } from "@/lib/site-profile";
import {
  DO_NOT_BUY,
  FREE_BACKLINKS,
  PAID_BACKLINKS,
  PLAYBOOK_RESEARCHED,
} from "@/lib/playbook-data";
import type { Prospect } from "@/lib/metrics";
import { CopyBlock, PlaybookDone, ProspectStatus } from "@/components/client";
import {
  EmptyState,
  Mono,
  PageHeader,
  ProgressMeter,
  SectionTitle,
  TableShell,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";

export const dynamic = "force-dynamic";

// One playbook item card, tuned for half-width columns: name + meta stacked,
// the submission page one click away without expanding, and the full guide
// (steps, prefilled copy, Claude for Chrome command) behind a quiet disclosure.
function ItemCard({
  item,
  status,
  profile,
}: {
  item: PlaybookItem;
  status: string;
  profile: SiteProfile;
}) {
  const done = status === "done";
  return (
    <div className={`space-y-2.5 rounded-xl bg-neutral-900 p-4 ${done ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={item.url}
            target="_blank"
            className="font-medium text-neutral-100 underline-offset-2 hover:underline"
          >
            {item.name}
          </a>
          <p className="mt-0.5 text-xs text-neutral-400">
            {item.price ? (
              <span className="text-amber-300">{item.price}</span>
            ) : (
              <span className="text-emerald-400">free</span>
            )}
            {" · "}
            {item.linkType === "unverified" ? "link type unverified" : item.linkType}
            {" · ~"}
            {item.effortMins} min
          </p>
        </div>
        <PlaybookDone slug={item.slug} status={status} />
      </div>

      <p className="text-sm text-neutral-400">{item.worth}</p>

      <div>
        <a
          href={item.submitUrl}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 hover:text-sky-300"
        >
          Open submission page <span aria-hidden="true">↗</span>
        </a>
      </div>

      <details>
        <summary className="cursor-pointer select-none text-sm text-neutral-400 hover:text-neutral-200">
          Step-by-step guide
        </summary>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-neutral-400">
            Start at{" "}
            <a
              href={item.submitUrl}
              target="_blank"
              className="break-all font-mono text-sky-400 underline-offset-2 hover:underline"
            >
              {item.submitUrl}
            </a>
          </p>

          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-400">
            {item.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>

          {item.fields.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-200">
                Copy-paste these into the form (click to copy):
              </p>
              {item.fields.map((f) => (
                <div key={f.label} className="space-y-1">
                  <p className="text-xs text-neutral-400">{f.label}</p>
                  <CopyBlock text={resolveField(profile, f)} />
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-300">
              Or let Claude fill the form for you - log in to {item.name} first, then paste this
              into Claude Code (VS Code prompt box):
            </p>
            <CopyBlock text={browserCommand(profile, item)} />
          </div>

          {item.notes ? <p className="text-xs text-amber-300/90">{item.notes}</p> : null}
        </div>
      </details>
    </div>
  );
}

export default async function BacklinksPage() {
  await requireDashboard();
  await requireOnboarded();

  // Playbook progress, the outreach prospects, and the profile the copy
  // personalizes from, together. If the playbook_status table hasn't been
  // created yet the select errors - render everything as "todo" and show the
  // migration nudge instead of crashing.
  const project = await getActiveProject();
  const [statusRes, blRes, { profile, fromDb }] = await Promise.all([
    db().from("playbook_status").select("slug, status").eq("project_id", project.id),
    db()
      .from("backlink_prospects")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    loadSiteProfile(project),
  ]);
  const tableMissing = statusRes.error != null;
  const statusOf = new Map<string, string>(
    (statusRes.data ?? []).map((r: { slug: string; status: string }) => [r.slug, r.status]),
  );
  const prospects = (blRes.data ?? []) as Prospect[];

  const all = [...FREE_BACKLINKS, ...PAID_BACKLINKS];
  const doneCount = all.filter((i) => statusOf.get(i.slug) === "done").length;

  return (
    <div className="space-y-10">
      {/* ---------- PLAYBOOK HEADER ---------- */}
      <header className="space-y-4">
        <PageHeader
          title="Backlink playbook"
          hint={`Every link worth getting for ${profile.name} - the exact copy to paste, the submission page one click away, and a Claude for Chrome command that fills each form.`}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ProgressMeter done={doneCount} total={all.length} className="w-44" />
          <p className="text-sm tabular-nums text-neutral-300">
            {doneCount} of {all.length} done
          </p>
          <span className="text-xs text-neutral-600">list researched {PLAYBOOK_RESEARCHED}</span>
        </div>
      </header>

      {tableMissing ? (
        <div className="rounded-xl bg-neutral-900 p-4 text-sm text-amber-300">
          Progress tracking needs a one-time migration: paste
          <code className="mx-1.5 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs">
            supabase/migrations/0002_playbook_status.sql
          </code>
          into the Supabase SQL editor. Until then, checkmarks will not save.
        </div>
      ) : null}

      {!fromDb && !tableMissing ? (
        <div className="rounded-xl bg-neutral-900 p-4 text-sm text-sky-300">
          The copy below uses default values. Paste <Mono>/seo-setup</Mono> in Claude Code - in
          your site&apos;s repo - to research your product and personalize every submission
          automatically.
        </div>
      ) : null}

      {/* ---------- FREE | PAID ---------- */}
      <div className="grid items-start gap-x-6 gap-y-10 lg:grid-cols-2">
        <section className="space-y-3">
          <SectionTitle sub="foundational links - free, do these once, roughly in this order">
            Best free backlinks
          </SectionTitle>
          {FREE_BACKLINKS.length === 0 ? (
            <EmptyState>The curated list is being researched - it lands here shortly.</EmptyState>
          ) : (
            <div className="space-y-3">
              {FREE_BACKLINKS.map((item) => (
                <ItemCard
                  key={item.slug}
                  item={item}
                  status={statusOf.get(item.slug) ?? "todo"}
                  profile={profile}
                />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-10">
          <section className="space-y-3">
            <SectionTitle sub="ranked by value for money - only legit placements, no link sellers">
              Best paid backlinks
            </SectionTitle>
            {PAID_BACKLINKS.length === 0 ? (
              <EmptyState>The paid shortlist is being researched - it lands here shortly.</EmptyState>
            ) : (
              <div className="space-y-3">
                {PAID_BACKLINKS.map((item) => (
                  <ItemCard
                    key={item.slug}
                    item={item}
                    status={statusOf.get(item.slug) ?? "todo"}
                    profile={profile}
                  />
                ))}
              </div>
            )}
          </section>

          {DO_NOT_BUY.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle sub="the traps that poison a backlink profile instead of growing it">
                Do not buy
              </SectionTitle>
              <div className="space-y-2 rounded-xl bg-neutral-900 p-4">
                {DO_NOT_BUY.map((t) => (
                  <p key={t.name} className="text-sm text-neutral-400">
                    <span className="font-medium text-red-400">{t.name}</span> - {t.reason}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* ---------- PROSPECTS (agent-researched outreach list) ---------- */}
      <section className="space-y-3 border-t border-neutral-800/70 pt-8">
        <SectionTitle sub="agent-researched outreach targets - update the status as you reach out">
          Backlink prospects
        </SectionTitle>

        {prospects.length === 0 ? (
          <EmptyState>
            None yet. Run <Mono>/seo-backlinks</Mono> in Claude Code to find prospects.
          </EmptyState>
        ) : (
          <TableShell>
            <THead>
              <Th>Domain</Th>
              <Th className="hidden sm:table-cell">Why</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {prospects.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <a
                      href={`https://${b.domain}`}
                      target="_blank"
                      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                    >
                      {b.domain}
                    </a>
                    {b.reason ? (
                      <span className="mt-0.5 block text-xs text-neutral-400 sm:hidden">{b.reason}</span>
                    ) : null}
                  </Td>
                  <Td className="hidden text-neutral-300 sm:table-cell">{b.reason}</Td>
                  <Td>
                    <ProspectStatus id={b.id} status={b.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </section>
    </div>
  );
}
