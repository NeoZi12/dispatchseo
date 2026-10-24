"use client";

// The Queue screen's board: this week's slots, the ideas waiting to fill
// them, and the ones set aside. Rendered on the server like any client
// component, so the whole thing reads without JS; drag, the arrows, Set
// aside, Put back and Add topic are what hydration adds.
//
// The one idea the screen rests on: the DATES belong to the slots, not to
// the ideas. Slot 1 starts on the first date, slot 2 on the second, and so
// on (queue.ts computes them from the plan's cadence); moving an idea moves
// it between dates. So reordering never asks the server for new dates - the
// list of dates is fixed and the cards trade places under it.
//
// Every change is optimistic and reversible: the list moves the instant you
// act, the server catches up behind it, and a refused write puts things
// back with one inline line saying so. Nothing here deletes - Set aside
// parks an idea (queue.ts removeQueuedIdea), Put back returns it to the end
// of the queue (restoreQueuedIdea). The MCP twins are reorder_queue and
// update_suggestion (parked / approved), over the same lib functions.

import Link from "next/link";
import { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { reorderQueue } from "@/app/actions";
import { removeQueuedTopicAction, restoreQueuedTopicAction } from "@/app/autopilot-actions";
import type { ParkedIdea, QueuedIdea } from "@/lib/autopilot/queue";
import type { KdZones } from "@/lib/kd-zones";
import { Button } from "@/components/ui/button";
import { SignalGlyph } from "@/components/ui/on-air";
import { Line } from "@/components/ui/skeleton";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { dayDate, fmtInt, shortDate } from "../article-status";

const DAY = 86_400_000;
const LINK = "font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** parkReason() of the reason removeQueuedIdea writes (queue.ts
 *  SET_ASIDE_REASON) - not imported, queue.ts is server-only. */
const OWNER_REASON = "you set it aside";
/** How long a set-aside card takes to slide out (globals.css .dispatch-leave). */
const LEAVE_MS = 180;

type Idea = { id: string; title: string; keyword: string | null; volume: number | null; kd: number | null };
type Status = "queued" | "aside";
type Drag = { index: number; over: number; dy: number };
type Focus = { id: string; control: "handle" | "up" | "down" };
type Trouble = { where: "queue" | "aside"; text: string };

const css = (v: Record<string, string | number>) => v as React.CSSProperties;
const dayOf = (t: number) => Math.floor(t / DAY) * DAY;
const dow = (t: number) => (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function toIdea(i: QueuedIdea | ParkedIdea): Idea {
  return { id: i.suggestion_id, title: i.title, keyword: i.keyword, volume: i.volume, kd: i.kd };
}

export function QueueBoard({
  slug,
  now,
  zones,
  upcoming,
  parked,
  nextStart,
  usedThisWeek,
  quota,
  paused,
  startedDays,
  addForm,
}: {
  slug: string;
  now: number;
  zones: KdZones;
  upcoming: QueuedIdea[];
  parked: ParkedIdea[];
  nextStart: string | null;
  usedThisWeek: number;
  quota: number;
  paused: boolean;
  /** UTC midnights this week's counted articles started on. */
  startedDays: number[];
  /** The Add topic form, rendered by the page (its limits live server-side).
   *  A new idea arrives through the server's next list and rises in. */
  addForm: React.ReactNode;
}) {
  // Every idea this session has seen, so one moved optimistically still has
  // its title and numbers before the server's list catches up.
  const store = useRef(new Map<string, Idea>());
  for (const i of upcoming) store.current.set(i.suggestion_id, toIdea(i));
  for (const i of parked) store.current.set(i.suggestion_id, toIdea(i));
  const reasons = new Map(parked.map((p) => [p.suggestion_id, p.reason]));

  const serverQueued = upcoming.map((i) => i.suggestion_id);
  const serverParked = parked.map((i) => i.suggestion_id);
  const inServerQueue = new Set(serverQueued);
  const inServerParked = new Set(serverParked);
  // The dates, by slot. Fixed while the ideas move (see the top comment).
  const slots = upcoming.map((i) => i.expected_start);

  // ---- local state: the owner's moves, ahead of the server ----
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [moved, setMoved] = useState<Map<string, Status>>(new Map());
  const [asideFirst, setAsideFirst] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [problem, setProblem] = useState<Trouble | null>(null);
  const [said, setSaid] = useState("");
  const saveSeq = useRef(0);

  // What was on screen at first paint arrives with the page's stagger;
  // anything that joins later (added, put back) rises in on its own.
  const firstQueued = useRef<Set<string> | null>(null);
  const firstParked = useRef<Set<string> | null>(null);
  if (!firstQueued.current) firstQueued.current = new Set(serverQueued);
  if (!firstParked.current) firstParked.current = new Set(serverParked);
  const [rejoined, setRejoined] = useState<Set<string>>(new Set());

  const statusOf = (id: string): Status | null => moved.get(id) ?? (inServerQueue.has(id) ? "queued" : inServerParked.has(id) ? "aside" : null);

  const base = localOrder ? [...localOrder, ...serverQueued.filter((id) => !localOrder.includes(id))] : serverQueued;
  const queued = [...new Set([...base, ...[...moved].filter(([, s]) => s === "queued").map(([id]) => id)])].filter(
    (id) => statusOf(id) === "queued" && store.current.has(id),
  );
  const aside = [...new Set([...asideFirst, ...serverParked])].filter((id) => statusOf(id) === "aside" && store.current.has(id));

  // Once the server agrees with a move (or has moved the idea on - the
  // writer took it), the override has done its job.
  useEffect(() => {
    setMoved((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, s] of prev) {
        const server: Status | null = inServerQueue.has(id) ? "queued" : inServerParked.has(id) ? "aside" : null;
        if (server === s || (server === null && !busyRef.current.has(id))) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming, parked]);

  // ---- FLIP: cards glide to their new places ----
  const nodes = useRef(new Map<string, HTMLElement>());
  const before = useRef<Map<string, DOMRect> | null>(null);
  const focusNext = useRef<Focus | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  function snapshot() {
    const m = new Map<string, DOMRect>();
    nodes.current.forEach((el, id) => m.set(id, el.getBoundingClientRect()));
    before.current = m;
  }

  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    if (prev && !reducedMotion()) {
      nodes.current.forEach((el, id) => {
        const was = prev.get(id);
        if (!was) return;
        const dy = was.top - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        void el.offsetHeight; // commit the start position before easing out of it
        el.style.transition = "transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1)";
        el.style.transform = "";
        window.setTimeout(() => {
          el.style.transition = "";
        }, 240);
      });
    }
    // Moving a focused node can drop its focus; put it back where the
    // keyboard was, or on the handle if that button just went disabled.
    const f = focusNext.current;
    if (f && listRef.current) {
      focusNext.current = null;
      const want = listRef.current.querySelector<HTMLButtonElement>(`[data-focus="${f.id}:${f.control}"]`);
      const target = want && !want.disabled ? want : listRef.current.querySelector<HTMLButtonElement>(`[data-focus="${f.id}:handle"]`);
      target?.focus();
    }
  });

  // The same sentence twice still re-announces (a trailing nbsp changes it).
  const say = (s: string) => setSaid((prev) => (prev === s ? `${s}\u00a0` : s));
  const dateWords = (slot: number) => {
    const d = slots[slot];
    return d ? `Expected to start ${dayDate(d, now)}.` : "";
  };
  const fd = (id: string) => {
    const f = new FormData();
    f.set("slug", slug);
    f.set("id", id);
    return f;
  };
  const setBusyFor = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // ---- reorder ----
  function commit(next: string[], focus?: Focus) {
    snapshot();
    if (focus) focusNext.current = focus;
    setLocalOrder(next);
    setProblem(null);
    const movedId = focus?.id;
    if (movedId) {
      const at = next.indexOf(movedId);
      say(`Moved to number ${at + 1} of ${next.length}. ${dateWords(at)}`);
    }
    // Only ideas the server already holds as queued: one still on its way
    // back from Set aside would fail the whole write ("the queue changed").
    const ids = next.filter((id) => !busyRef.current.has(id) && inServerQueue.has(id));
    const seq = ++saveSeq.current;
    startTransition(async () => {
      let failure: string | null = null;
      try {
        const r = await reorderQueue("guide", ids);
        if (!r.ok) failure = r.message.includes("changed") ? "The queue changed while you were moving it, so it's back how it was. Reload the page, then try again." : "The new order didn't save, so the list is back how it was. Try again in a moment.";
      } catch {
        failure = "The new order didn't save, so the list is back how it was. Try again in a moment.";
      }
      if (saveSeq.current !== seq) return; // a newer move superseded this save
      if (failure) {
        snapshot();
        setLocalOrder(null);
        setProblem({ where: "queue", text: failure });
        say(failure);
      }
    });
  }

  // ---- set aside / put back ----
  function setAside(id: string) {
    if (busyRef.current.has(id)) return;
    const idea = store.current.get(id);
    setBusyFor(id, true);
    setProblem(null);
    setLeaving((prev) => new Set(prev).add(id));
    const go = () => {
      snapshot();
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMoved((prev) => new Map(prev).set(id, "aside"));
      setAsideFirst((prev) => [id, ...prev.filter((x) => x !== id)]);
      say(`Set aside${idea ? `: ${idea.title}` : ""}. Put it back from the Set aside list.`);
      startTransition(async () => {
        const res = await removeQueuedTopicAction(null, fd(id)).catch(() => null);
        setBusyFor(id, false);
        if (res?.ok) return;
        snapshot();
        setMoved((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setAsideFirst((prev) => prev.filter((x) => x !== id));
        const text = res?.message ?? "We couldn't set it aside just now, so it's still in the queue. Try again in a moment.";
        setProblem({ where: "queue", text });
        say(text);
      });
    };
    if (reducedMotion()) go();
    else window.setTimeout(go, LEAVE_MS);
  }

  function putBack(id: string) {
    if (busyRef.current.has(id)) return;
    const idea = store.current.get(id);
    setBusyFor(id, true);
    setProblem(null);
    snapshot();
    setMoved((prev) => new Map(prev).set(id, "queued"));
    // It returns to the END (queue.ts restoreQueuedIdea), so it must not
    // reappear at a place a local order remembers for it.
    setLocalOrder((prev) => (prev ? prev.filter((x) => x !== id) : prev));
    setAsideFirst((prev) => prev.filter((x) => x !== id));
    setRejoined((prev) => new Set(prev).add(id));
    say(`Put back${idea ? `: ${idea.title}` : ""}, at the end of the queue.`);
    startTransition(async () => {
      const res = await restoreQueuedTopicAction(null, fd(id)).catch(() => null);
      setBusyFor(id, false);
      if (res?.ok) return;
      snapshot();
      setMoved((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      const text = res?.message ?? "We couldn't put it back just now, so it's still set aside. Try again in a moment.";
      setProblem({ where: "aside", text });
      say(text);
    });
  }

  // ---- drag (pointer; the arrows and arrow keys are the other ways) ----
  const [drag, setDrag] = useState<Drag | null>(null);
  const startY = useRef(0);
  const rects = useRef<{ top: number; height: number }[]>([]);
  const gap = useRef(0);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (drag || queued.length < 2) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    rects.current = queued.map((id) => {
      const r = nodes.current.get(id)?.getBoundingClientRect();
      return { top: r?.top ?? 0, height: r?.height ?? 0 };
    });
    const [a, b] = rects.current;
    gap.current = a && b ? Math.max(0, b.top - (a.top + a.height)) : 0;
    setDrag({ index, over: index, dy: 0 });
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const r = rects.current;
    const me = r[drag.index];
    const first = r[0];
    const last = r[r.length - 1];
    const dy = Math.max(first.top - me.top, Math.min(e.clientY - startY.current, last.top + last.height - (me.top + me.height)));
    const center = me.top + dy + me.height / 2;
    let over = 0;
    r.forEach((x, j) => {
      if (j !== drag.index && x.top + x.height / 2 < center) over += 1;
    });
    if (over !== drag.over || dy !== drag.dy) setDrag({ index: drag.index, over, dy });
  }

  function onPointerUp() {
    if (!drag) return;
    const { index, over } = drag;
    const id = queued[index];
    if (index === over) {
      snapshot(); // dropped where it was: glide home, don't snap
      setDrag(null);
      return;
    }
    // commit() measures before React re-renders, so the drag transforms are
    // still on: the dropped card glides from under the pointer into its slot.
    setDrag(null);
    commit(arrayMove(queued, index, over), { id, control: "handle" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const to = e.key === "ArrowUp" ? index - 1 : index + 1;
    if (to < 0 || to >= queued.length) return;
    commit(arrayMove(queued, index, to), { id: queued[index], control: "handle" });
  }

  function shift(index: number): number {
    if (!drag) return 0;
    const h = (rects.current[drag.index]?.height ?? 0) + gap.current;
    if (index === drag.index) return drag.dy;
    if (drag.index < drag.over && index > drag.index && index <= drag.over) return -h;
    if (drag.index > drag.over && index >= drag.over && index < drag.index) return h;
    return 0;
  }

  /** Where a card will land if dropped now (1-based). */
  function livePos(index: number): number {
    if (!drag) return index + 1;
    if (index === drag.index) return drag.over + 1;
    if (drag.index < drag.over && index > drag.index && index <= drag.over) return index;
    if (drag.index > drag.over && index >= drag.over && index < drag.index) return index + 2;
    return index + 1;
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>

      <WeekStrip
        now={now}
        startedDays={startedDays}
        slots={slots.slice(0, queued.length)}
        nextStart={nextStart}
        usedThisWeek={usedThisWeek}
        quota={quota}
        paused={paused}
      />

      {/* ---- the queue ---- */}
      <section aria-labelledby="queue-title" className="space-y-4">
        <div className="arrive-up flex flex-wrap items-end justify-between gap-x-6 gap-y-1" style={css({ "--at": "140ms" })}>
          <div>
            <h2 id="queue-title" className="text-xl font-semibold tracking-tight text-ink">
              Up next
            </h2>
            {queued.length > 1 ? <p className="mt-1 text-[14px] text-ink-muted">Drag a card by its number, or use the arrows, to change the order.</p> : null}
          </div>
          {queued.length ? (
            <p className="text-[13px] tabular-nums text-ink-faint">
              {queued.length} {queued.length === 1 ? "idea" : "ideas"}
            </p>
          ) : null}
        </div>

        {problem?.where === "queue" ? <Problem text={problem.text} /> : null}

        {queued.length ? (
          <>
            <ol ref={listRef} className={cx("space-y-3", drag && "select-none")} aria-label="Ideas in the order they will be written">
              {queued.map((id, index) => {
                const idea = store.current.get(id)!;
                const pos = livePos(index);
                const dy = shift(index);
                const isDragged = drag?.index === index;
                return (
                  <QueueCard
                    key={id}
                    idea={idea}
                    pos={pos}
                    total={queued.length}
                    date={slots[pos - 1] ?? null}
                    paused={paused}
                    noPlan={quota <= 0}
                    now={now}
                    zones={zones}
                    next={pos === 1}
                    leaving={leaving.has(id)}
                    busy={busy.has(id)}
                    dragging={isDragged}
                    settling={Boolean(drag) && !isDragged}
                    style={dy ? { transform: `translateY(${dy}px)` } : undefined}
                    arrive={firstQueued.current!.has(id) && !rejoined.has(id) ? Math.min(index, 8) : null}
                    nodeRef={(el) => {
                      if (el) nodes.current.set(id, el);
                      else nodes.current.delete(id);
                    }}
                    onUp={() => commit(arrayMove(queued, index, index - 1), { id, control: "up" })}
                    onDown={() => commit(arrayMove(queued, index, index + 1), { id, control: "down" })}
                    onAside={() => setAside(id)}
                    handle={{
                      onPointerDown: (e) => onPointerDown(e, index),
                      onPointerMove,
                      onPointerUp,
                      onPointerCancel: () => setDrag(null),
                      onKeyDown: (e) => onKeyDown(e, index),
                    }}
                  />
                );
              })}
            </ol>
            {/* The next empty slot, where a topic of your own goes in. */}
            <div className="arrive-up grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 rounded-xl border border-dashed border-line px-3 py-4 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-x-5 sm:px-4" style={css({ "--at": "200ms", "--i": Math.min(queued.length, 8) })}>
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center text-ink-faint sm:mt-[26px]">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-4 w-4">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </span>
              <div className="min-w-0 max-w-2xl">{addForm}</div>
            </div>
          </>
        ) : (
          <div className="arrive-up rounded-xl border border-dashed border-line px-5 py-8 sm:px-8 sm:py-10" style={css({ "--at": "200ms" })}>
            <p className="text-[17px] font-medium text-ink">Nothing queued yet.</p>
            <p className="mt-1.5 max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">Research runs weekly and fills this; or add a topic now.</p>
            <div className="mt-6 max-w-2xl">{addForm}</div>
          </div>
        )}
      </section>

      {/* ---- set aside ---- */}
      {aside.length ? (
        <section aria-labelledby="aside-title" className="space-y-4 border-t border-line-soft pt-8">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div>
              <h2 id="aside-title" className="text-[15px] font-semibold tracking-tight text-ink">
                Set aside
              </h2>
              <p className="mt-1 text-[13px] text-ink-muted">Not written unless you put them back. Put back adds one to the end of the queue.</p>
            </div>
            <p className="text-[13px] tabular-nums text-ink-faint">{aside.length}</p>
          </div>
          {problem?.where === "aside" ? <Problem text={problem.text} /> : null}
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft">
            {aside.map((id, i) => {
              const idea = store.current.get(id)!;
              const reason = moved.get(id) === "aside" ? OWNER_REASON : (reasons.get(id) ?? null);
              const mine = reason === OWNER_REASON;
              const fresh = !firstParked.current!.has(id) || asideFirst.includes(id);
              return (
                <li
                  key={id}
                  className={cx("flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5", fresh ? "dispatch-join" : "arrive-up")}
                  style={fresh ? undefined : css({ "--at": "260ms", "--i": Math.min(i, 8), "--step": "50ms" })}
                >
                  <div className="min-w-0">
                    <p className="text-[14px] leading-snug text-ink-muted">{idea.title}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">
                      {mine ? "You set this aside." : reason ? `The writer passed on it: ${reason}.` : "The writer passed on it."}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" pending={busy.has(id)} onClick={() => putBack(id)} className="self-start sm:self-center">
                    Put back
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------ the week */

function WeekStrip({
  now,
  startedDays,
  slots,
  nextStart,
  usedThisWeek,
  quota,
  paused,
}: {
  now: number;
  startedDays: number[];
  slots: Array<string | null>;
  nextStart: string | null;
  usedThisWeek: number;
  quota: number;
  paused: boolean;
}) {
  const today = dayOf(now);
  const monday = today - dow(today) * DAY;
  const days = Array.from({ length: 7 }, (_, i) => monday + i * DAY);
  const halted = paused || quota <= 0;

  // Which slot lands on which day (1-based), this week only.
  const slotOn = new Map<number, number>();
  if (!halted) {
    slots.forEach((d, i) => {
      if (!d) return;
      const t = Date.parse(d);
      if (t >= monday && t < monday + 7 * DAY && !slotOn.has(t)) slotOn.set(t, i + 1);
    });
  }
  // An empty queue still has a next slot: that morning researches first.
  const researchDay = !halted && slots.length === 0 && nextStart ? dayOf(Date.parse(nextStart)) : null;
  const started = new Map<number, number>();
  for (const t of startedDays) started.set(t, (started.get(t) ?? 0) + 1);

  const nextIso = slots[0] ?? nextStart;
  let caption: React.ReactNode;
  if (paused) {
    caption = (
      <>
        Paused, so nothing new starts.{" "}
        <Link href="/dashboard" className={LINK}>
          Resume on Home
        </Link>
      </>
    );
  } else if (quota <= 0) {
    caption = (
      <>
        Your plan includes no articles right now.{" "}
        <Link href="/billing" className={LINK}>
          Open billing
        </Link>
      </>
    );
  } else {
    const t = nextIso ? Date.parse(nextIso) : null;
    const when =
      t == null
        ? null
        : t <= today
          ? "today"
          : t === today + DAY
            ? "tomorrow"
            : t < monday + 7 * DAY
              ? WEEKDAYS[dow(t)]
              : `${WEEKDAYS[dow(t)]}, ${shortDate(nextIso)}`;
    caption = (
      <>
        <span className="font-medium text-ink tabular-nums">
          {Math.min(usedThisWeek, quota)} of {quota}
        </span>{" "}
        this week{when ? ` · next ${when}` : ""}
      </>
    );
  }

  return (
    <section aria-labelledby="week-title" className="arrive-up rounded-2xl border border-line-soft bg-surface px-4 py-5 sm:px-6 sm:py-6" style={css({ "--at": "60ms" })}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <h2 id="week-title" className="text-[15px] font-semibold tracking-tight text-ink">
          This week
        </h2>
        <p className="text-[13px] text-ink-muted">{caption}</p>
      </div>
      <ol className={cx("mt-4 grid grid-cols-7 gap-1.5 sm:mt-5 sm:gap-2.5", halted && "opacity-60")}>
        {days.map((t, i) => {
          const isToday = t === today;
          const past = t < today;
          const slot = slotOn.get(t);
          const did = started.get(t) ?? 0;
          const research = researchDay === t;
          const label = isToday ? "Today" : WEEKDAYS[i];
          const what = slot
            ? `number ${slot} in the queue starts`
            : research
              ? "fresh research picks the next topic"
              : did
                ? `${did === 1 ? "an article" : `${did} articles`} started`
                : "nothing";
          return (
            <li key={t} aria-current={isToday ? "date" : undefined} className="min-w-0">
              <p className={cx("mb-1.5 flex flex-col text-[11.5px] leading-tight sm:flex-row sm:gap-1 sm:text-[12px]", isToday ? "font-semibold text-ink" : "text-ink-faint")}>
                <span>{label}</span>
                <span className="tabular-nums opacity-80">{new Date(t).getUTCDate()}</span>
              </p>
              <div
                className={cx(
                  "flex h-11 items-center justify-center rounded-lg text-[15px] font-semibold tabular-nums sm:h-14 sm:text-[17px]",
                  slot === 1
                    ? "dispatch-breathe border border-accent/60 bg-accent-soft text-accent"
                    : slot
                      ? "border border-dashed border-line text-ink-muted"
                      : research
                        ? "dispatch-breathe border border-dashed border-accent/50 text-accent"
                        : did
                          ? "border border-ok/30 bg-ok-soft text-ok"
                          : past
                            ? "bg-surface-2/40"
                            : "bg-surface-2",
                  (Boolean(slot) || did > 0 || research) && "arrive-rise",
                )}
                style={css({ "--at": "180ms", "--i": i, "--step": "45ms" })}
              >
                <span className="sr-only">{`${label === "Today" ? "Today" : WEEKDAYS[i]} ${new Date(t).getUTCDate()}: ${what}.`}</span>
                {slot ? (
                  <span aria-hidden="true">{slot}</span>
                ) : research ? (
                  <SearchGlyph className="h-4 w-4" />
                ) : did ? (
                  <span aria-hidden="true" className="flex items-center gap-0.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 sm:h-[18px] sm:w-[18px]">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    {did > 1 ? <span className="text-[12px]">{did}</span> : null}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------ a card */

type HandleEvents = {
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
};

function QueueCard({
  idea,
  pos,
  total,
  date,
  paused,
  noPlan,
  now,
  zones,
  next,
  leaving,
  busy,
  dragging,
  settling,
  style,
  arrive,
  nodeRef,
  onUp,
  onDown,
  onAside,
  handle,
}: {
  idea: Idea;
  pos: number;
  total: number;
  date: string | null;
  paused: boolean;
  noPlan: boolean;
  now: number;
  zones: KdZones;
  next: boolean;
  leaving: boolean;
  busy: boolean;
  dragging: boolean;
  settling: boolean;
  style?: React.CSSProperties;
  /** Stagger index on first paint; null = it joined later and rises alone. */
  arrive: number | null;
  nodeRef: (el: HTMLLIElement | null) => void;
  onUp: () => void;
  onDown: () => void;
  onAside: () => void;
  handle: HandleEvents;
}) {
  const movable = total > 1;
  return (
    <li
      ref={nodeRef}
      style={{ ...(arrive != null ? css({ "--at": "200ms", "--i": arrive }) : {}), ...style }}
      className={cx(
        "relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-xl border bg-surface px-3 py-3.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-4 sm:py-4",
        next ? "border-accent/45" : "border-line-soft hover:border-line",
        dragging && "z-10 border-accent/60 bg-surface-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)]",
        settling && "transition-transform duration-200 ease-out motion-reduce:transition-none",
        leaving && "dispatch-leave",
        arrive != null ? "arrive-up" : "dispatch-join",
      )}
    >
      {/* The rail: up, the position (also the drag handle), down. */}
      <div className="row-span-2 flex flex-col items-center gap-0.5 sm:row-span-1 sm:self-center">
        {movable ? <MoveButton dir="up" id={idea.id} disabled={pos === 1 || busy} onClick={onUp} /> : null}
        <button
          type="button"
          data-focus={`${idea.id}:handle`}
          disabled={!movable || busy}
          aria-label={movable ? `${idea.title}: number ${pos} of ${total}. Press the up or down arrow key to move it.` : `${idea.title}: number ${pos}`}
          {...(movable ? handle : {})}
          className={cx(
            "flex h-9 w-9 touch-none items-center justify-center rounded-lg text-[18px] font-semibold tabular-nums transition-colors disabled:cursor-default",
            FOCUS_RING,
            next ? "text-accent" : "text-ink-muted",
            movable && "cursor-grab hover:bg-surface-2 hover:text-ink active:cursor-grabbing",
            dragging && "cursor-grabbing bg-surface-3 text-ink",
          )}
        >
          {pos}
        </button>
        {movable ? <MoveButton dir="down" id={idea.id} disabled={pos === total || busy} onClick={onDown} /> : null}
      </div>

      {/* What it is. */}
      <div className="min-w-0 self-center">
        {next ? (
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
            <SignalGlyph on className="h-3.5 w-3.5 shrink-0" />
            Next up
          </p>
        ) : null}
        <h3 className="text-pretty text-[16px] font-medium leading-snug text-ink sm:text-[17px]">{idea.title}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          {idea.keyword ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12.5px] text-ink-muted">
              <SearchGlyph className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <span className="sr-only">Keyword: </span>
              <span className="truncate">{idea.keyword}</span>
            </span>
          ) : null}
          {/* Research queues nothing without measured numbers; the unknown
              states are for older ideas and an owner's own unmeasurable topic. */}
          {idea.volume != null ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-[14px] font-semibold tabular-nums text-ink">{fmtInt(idea.volume)}</span>
              <span className="text-[12.5px] text-ink-faint">searches a month</span>
            </span>
          ) : (
            <span className="text-[12.5px] text-ink-faint">volume unknown</span>
          )}
          <Kd kd={idea.kd} zones={zones} />
        </div>
      </div>

      {/* When, and the way out. */}
      <div className="col-start-2 flex items-center justify-between gap-3 sm:col-start-3 sm:row-start-1 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
        <DateTile date={date} now={now} next={next} paused={paused} noPlan={noPlan} />
        <button
          type="button"
          onClick={onAside}
          disabled={busy || dragging}
          className="btn btn-ghost btn-sm text-ink-faint"
          aria-label={`Set aside: ${idea.title}`}
        >
          Set aside
        </button>
      </div>
    </li>
  );
}

function Kd({ kd, zones }: { kd: number | null; zones: KdZones }) {
  if (kd == null) {
    return <span className="text-[12.5px] text-ink-faint">KD unknown</span>;
  }
  const [tone, word] = kd < zones.autoApprove ? ["text-ok", "easy"] : kd < zones.pending ? ["text-warn", "a stretch"] : ["text-danger", "hard"];
  return (
    <span className={cx("flex items-center gap-2", tone)}>
      <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-sm bg-surface-3">
        <span className="absolute inset-y-0 left-0 rounded-sm bg-current" style={{ width: `${Math.max(4, Math.min(100, kd))}%` }} />
      </span>
      <span className="text-[14px] font-semibold tabular-nums">KD {kd}</span>
      <span className="text-[12.5px]">{word}</span>
      <span className="sr-only">for your site</span>
    </span>
  );
}

function DateTile({ date, now, next, paused, noPlan }: { date: string | null; now: number; next: boolean; paused: boolean; noPlan: boolean }) {
  let top: string;
  let bottom: React.ReactNode;
  let spoken: string;
  if (paused || noPlan) {
    top = paused ? "Paused" : "No plan";
    bottom = "No date";
    spoken = paused ? "No date while paused" : "No date: the plan includes no articles";
  } else if (!date) {
    // Just put back: its slot's date arrives with the server's next answer.
    top = "Scheduling";
    bottom = <Line className="mt-1 h-4 w-12" />;
    spoken = "Working out its date";
  } else {
    const words = dayDate(date, now);
    spoken = `Expected to start ${words}`;
    if (words === "today" || words === "tomorrow") {
      top = words === "today" ? "Today" : "Tomorrow";
      bottom = shortDate(date);
    } else {
      const [weekday, md] = words.split(", ");
      top = weekday;
      bottom = md;
    }
  }
  return (
    <div
      className={cx(
        "flex min-w-[5.75rem] flex-col rounded-lg border px-3 py-1.5 sm:items-center sm:text-center",
        next && !paused && !noPlan ? "border-accent/40 bg-accent-soft" : "border-line-soft bg-surface-2",
      )}
    >
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true" className={cx("text-[11.5px] font-medium", next && !paused && !noPlan ? "text-accent" : "text-ink-faint")}>
        {top}
      </span>
      <span aria-hidden="true" className="text-[16px] font-semibold leading-tight tabular-nums text-ink">
        {bottom}
      </span>
    </div>
  );
}

function MoveButton({ dir, id, disabled, onClick }: { dir: "up" | "down"; id: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-focus={`${id}:${dir}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "up" ? "Move up one" : "Move down one"}
      className={cx(
        "flex h-7 w-9 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-25",
        FOCUS_RING,
      )}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d={dir === "up" ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} />
      </svg>
    </button>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className="dispatch-fade-in flex items-start gap-2 rounded-lg border border-l-2 border-line-soft border-l-warn bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-muted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true">
        <path d="M12 7v6M12 17h.01" />
      </svg>
      {text}
    </p>
  );
}

function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2L13.5 13.5" />
    </svg>
  );
}
