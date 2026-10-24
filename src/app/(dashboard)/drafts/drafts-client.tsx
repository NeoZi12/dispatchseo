"use client";

import { useState, useTransition } from "react";
import { approveDraft, discardDraft, type DraftActionState } from "@/app/actions";
import { CardList, DataCard, TableShell, Td, Th, THead, Tr } from "@/components/ui";
import { CopyButton } from "@/components/client";

// One article's row on the review screen, on both surfaces (a table on
// desktop, stacked cards below sm - the repo's dense-table grammar).
//
// The preview renders inside an <iframe srcDoc>. The HTML is already built by
// our own finisher, which escapes the whole source once and only emits tags it
// wrote itself, so there is nothing dangerous in it - but it is still an
// entire page's markup with its own headings and links, and dropping that into
// the dashboard's own DOM would let it inherit and fight the dashboard's
// styles. The iframe is about keeping the two documents apart, and it happens
// to also mean a future change to the renderer can never reach this page.

/** The three routes this screen can be looking at. Mirrors publishRoute in
 *  draft-status.ts - "blocked" never reaches here as a distinct case, because
 *  a blocked project simply cannot publish. */
export type PublishRoute = "wordpress" | "repo" | "hosted" | "manual" | "blocked";

export type DraftRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  score: number | null;
  published_url: string | null;
  cover_url: string | null;
  rendered_html: string | null;
  /** Repo route only: the pull request this article was committed into. */
  pr_url: string | null;
  pr_merged_at: string | null;
  created_at: string;
  /** Blocking checks that failed, straight from the stored validation report. */
  problems: { id: string; title: string; fix: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Checking",
  rejected: "Sent back",
  accepted: "Ready to publish",
  blocked_setup: "Waiting on setup",
  finished: "Posted",
  published: "Live",
  discarded: "Discarded",
};

const STATUS_COLOR: Record<string, string> = {
  submitted: "text-neutral-400",
  rejected: "text-amber-300",
  accepted: "text-sky-300",
  blocked_setup: "text-amber-300",
  finished: "text-emerald-300/80",
  published: "text-emerald-400",
  discarded: "text-neutral-600",
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusBadge({
  draft,
  manual,
  route,
}: {
  draft: DraftRow;
  manual: boolean;
  route: PublishRoute;
}) {
  const status = draft.status;
  // On the manual route nothing publishes this - the owner places it himself -
  // so "Ready to publish" would describe work that is never going to happen.
  if (manual && status === "accepted") {
    return <span className={STATUS_COLOR[status] ?? "text-neutral-400"}>Ready for you</span>;
  }
  // "Posted" is a WordPress word. On the repo route the same status means the
  // article is sitting in a pull request - either waiting for someone to merge
  // it, or merged and waiting for the site to rebuild. Those are two different
  // answers to "so where is my article", and both are somebody else's move.
  if (route === "repo" && status === "finished" && draft.pr_url) {
    return draft.pr_merged_at ? (
      <span className="text-emerald-300/80">Merged - waiting to go live</span>
    ) : (
      <span className="text-sky-300">Pull request open</span>
    );
  }
  return (
    <span className={STATUS_COLOR[status] ?? "text-neutral-400"}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** The way to the article while it is still a pull request. Shown until the
 *  page is confirmed live, because until then GitHub is the only place the
 *  owner can actually see it. */
function PrLink({ draft, route }: { draft: DraftRow; route: PublishRoute }) {
  if (route !== "repo" || !draft.pr_url || draft.status === "published") return null;
  return (
    <a
      href={draft.pr_url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block truncate text-[12px] text-sky-400 underline underline-offset-2"
    >
      Review on GitHub
    </a>
  );
}

function Actions({
  draft,
  canPublish,
  manual,
  route,
  onMessage,
}: {
  draft: DraftRow;
  canPublish: boolean;
  /** This site publishes nowhere by choice - the owner asked us to finish the
   *  article and hand it over. There is nothing to press but "give it to me". */
  manual: boolean;
  route: PublishRoute;
  onMessage: (m: DraftActionState) => void;
}) {
  const [pending, start] = useTransition();
  const showApprove = canPublish && (draft.status === "accepted" || draft.status === "blocked_setup");
  // Not offered once the article is on their site. "finished" means WordPress
  // already has it and only the live check is outstanding - discarding here
  // would change our records and leave the post up, which is a button that
  // lies. Taking it down is a WordPress job, so it is said rather than faked.
  const showDiscard =
    draft.status !== "published" && draft.status !== "discarded" && draft.status !== "finished";
  const showCopy = manual && draft.status === "accepted" && Boolean(draft.rendered_html);
  if (!showApprove && !showDiscard && !showCopy) return null;
  return (
    <div className="flex items-center gap-3">
      {showCopy ? <CopyButton text={draft.rendered_html ?? ""} label="Copy article HTML" subtle /> : null}
      {showApprove ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () =>
              onMessage(
                // One button for both publishers: approveDraft routes through
                // the shared publishDraftNow, and on the repo route that means
                // "open the pull request now" rather than at the usual hour.
                await approveDraft(draft.id),
              ),
            )
          }
          className="cursor-pointer rounded-lg bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Working" : "Publish now"}
        </button>
      ) : null}
      {showDiscard ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => onMessage(await discardDraft(draft.id)))}
          className="cursor-pointer text-[12px] text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-300 disabled:opacity-50"
        >
          Discard
        </button>
      ) : null}
    </div>
  );
}

function Problems({ problems }: { problems: DraftRow["problems"] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {problems.map((p) => (
        <li key={p.id} className="text-[13px] leading-relaxed text-neutral-400">
          <span className="text-neutral-200">{p.title}.</span> {p.fix}
        </li>
      ))}
    </ul>
  );
}

function Preview({ draft }: { draft: DraftRow }) {
  const [open, setOpen] = useState(false);
  if (!draft.rendered_html) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer text-[12px] text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-300"
      >
        {open ? "Hide preview" : "Preview"}
      </button>
      {open ? (
        <div className="mt-3 overflow-hidden rounded-lg bg-white">
          {draft.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.cover_url} alt="" className="block w-full" />
          ) : null}
          <iframe
            title={`Preview of ${draft.title}`}
            srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui,sans-serif;color:#111;margin:0;padding:24px}img{max-width:100%}h2{margin-top:1.6em}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px}</style>${draft.rendered_html}`}
            sandbox=""
            className="block h-[28rem] w-full border-0"
          />
        </div>
      ) : null}
    </>
  );
}

export function DraftsList({
  drafts,
  canPublish,
  manual = false,
  route,
  blockedNote,
}: {
  drafts: DraftRow[];
  /** False when this project has nowhere to publish yet - the Publish button
   *  would only queue a job that parks itself, so it is not offered. */
  canPublish: boolean;
  /** True when the owner chose to place articles himself. */
  manual?: boolean;
  /** Which publisher this project uses - it changes what the same status
   *  MEANS, not just what button is offered. */
  route: PublishRoute;
  blockedNote: string;
}) {
  const [message, setMessage] = useState<DraftActionState>(null);

  return (
    <div className="space-y-3">
      {message?.error ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">
          {message.error}
        </p>
      ) : null}
      {message?.ok ? (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-200">
          {message.ok}
        </p>
      ) : null}

      <CardList>
        {drafts.map((d) => (
          <DataCard
            key={d.id}
            title={d.title}
            meta={`/${d.slug} - ${shortDate(d.created_at)}`}
            right={<StatusBadge draft={d} manual={manual} route={route} />}
          >
            {d.status === "blocked_setup" ? (
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">{blockedNote}</p>
            ) : null}
            {manual && d.status === "accepted" ? (
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
                Finished and yours to place: copy the HTML into your site wherever articles go.
              </p>
            ) : null}
            <Problems problems={d.problems} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <Preview draft={d} />
              <Actions
                draft={d}
                canPublish={canPublish}
                manual={manual}
                route={route}
                onMessage={setMessage}
              />
            </div>
            <PrLink draft={d} route={route} />
            {d.published_url ? (
              <a
                href={d.published_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block truncate text-[12px] text-sky-400 underline underline-offset-2"
              >
                {d.published_url}
              </a>
            ) : null}
          </DataCard>
        ))}
      </CardList>

      <TableShell className="hidden sm:block">
        <THead>
          <Th className="w-[46%]">Article</Th>
          <Th>Status</Th>
          <Th className="text-right">Score</Th>
          <Th>Added</Th>
          <Th className="text-right">Actions</Th>
        </THead>
        <tbody>
          {drafts.map((d) => (
            <Tr key={d.id}>
              <Td>
                <div className="text-neutral-100">{d.title}</div>
                <div className="mt-0.5 text-xs text-neutral-500">/{d.slug}</div>
                {d.status === "blocked_setup" ? (
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-neutral-400">
                    {blockedNote}
                  </p>
                ) : null}
                <Problems problems={d.problems} />
                {d.published_url ? (
                  <a
                    href={d.published_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 block max-w-xl truncate text-[12px] text-sky-400 underline underline-offset-2"
                  >
                    {d.published_url}
                  </a>
                ) : null}
                <PrLink draft={d} route={route} />
                <div className="mt-2">
                  <Preview draft={d} />
                </div>
              </Td>
              <Td className="align-top text-xs">
                <StatusBadge draft={d} manual={manual} route={route} />
              </Td>
              <Td className="align-top text-right tabular-nums text-neutral-300">
                {d.score ?? "-"}
              </Td>
              <Td className="align-top text-xs text-neutral-500">{shortDate(d.created_at)}</Td>
              <Td className="align-top">
                <div className="flex justify-end">
                  <Actions
                    draft={d}
                    canPublish={canPublish}
                    manual={manual}
                    route={route}
                    onMessage={setMessage}
                  />
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
