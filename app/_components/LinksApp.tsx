"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import type { LinkRow } from "@/lib/types";
import type { Role } from "@/lib/auth";
import { ClockCard } from "./ClockStrip";
import { UpdatesCard } from "./UpdatesPanel";
import { TrendChart } from "./TrendChart";
import { TodayStats } from "./TodayStats";
import { FaqCard } from "./Faq";

type Filter = "active" | "review" | "done" | "dropped" | "all";

const FILTER_LABEL: Record<Filter, string> = {
  active: "Active",
  review: "Needs review",
  done: "Done",
  dropped: "Dropped",
  all: "All",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function relativeDay(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const now = new Date(nowMs);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function fullDate(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Same-calendar-day links show a relative age ('2h ago', '3m ago') so
// freshness is obvious at a glance. Older links fall back to clock time;
// the date group header ('Yesterday', 'Mon Mar 3') already supplies the
// day context, so the clock time is enough there.
function timeAgoOrClock(iso: string, nowMs: number): string {
  const created = new Date(iso);
  const now = new Date(nowMs);
  if (!sameDay(created, now)) return formatTime(iso);
  const ms = Math.max(0, nowMs - created.getTime());
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

// A "batch" is one posting session: a burst of links added close together.
// Rows arrive newest-first. Start a new batch whenever the gap to the
// previous (newer) link exceeds 30 minutes or the calendar day changes, so
// two separate pastes on the same day render as two distinct groups. The
// 30-minute window matches the session threshold used by the updates feed.
const BATCH_GAP_MS = 30 * 60 * 1000;

function groupByBatch(rows: LinkRow[]): LinkRow[][] {
  const batches: LinkRow[][] = [];
  for (const row of rows) {
    const last = batches[batches.length - 1];
    if (last) {
      const prev = new Date(last[last.length - 1].created_at);
      const cur = new Date(row.created_at);
      if (
        sameDay(prev, cur) &&
        Math.abs(prev.getTime() - cur.getTime()) <= BATCH_GAP_MS
      ) {
        last.push(row);
        continue;
      }
    }
    batches.push([row]);
  }
  return batches;
}

export function LinksApp({
  initial,
  dbError,
  role,
}: {
  initial: LinkRow[];
  dbError: string | null;
  role: Role;
}) {
  const isAdmin = role === "ravi";
  const router = useRouter();
  const [links, setLinks] = useState<LinkRow[]>(initial);
  const [filter, setFilter] = useState<Filter>("active");
  const [text, setText] = useState("");
  const [adding, startAdd] = useTransition();
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const [statsVersion, setStatsVersion] = useState(0);
  function bumpStats() {
    setStatsVersion((v) => v + 1);
  }

  function isSnoozed(l: LinkRow): boolean {
    return !!l.snoozed_until && new Date(l.snoozed_until).getTime() > now;
  }

  const counts = useMemo(() => {
    let active = 0;
    let done = 0;
    let review = 0;
    let dropped = 0;
    for (const l of links) {
      if (l.needs_review) review++;
      else if (l.status === "todo" && !isSnoozed(l)) active++;
      else if (l.status === "applied") done++;
      else if (l.status === "dropped") dropped++;
    }
    return { active, done, review, dropped, total: links.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, now]);

  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    let filtered: LinkRow[];
    if (filter === "all") filtered = links;
    else if (filter === "review") filtered = links.filter((l) => l.needs_review);
    else if (filter === "done")
      filtered = links.filter((l) => !l.needs_review && l.status === "applied");
    else if (filter === "dropped")
      filtered = links.filter((l) => !l.needs_review && l.status === "dropped");
    else
      filtered = links.filter(
        (l) => !l.needs_review && l.status === "todo" && !isSnoozed(l)
      );

    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (l) =>
          (l.company ?? "").toLowerCase().includes(q) ||
          (l.title ?? "").toLowerCase().includes(q) ||
          (l.source ?? "").toLowerCase().includes(q) ||
          (l.notes ?? "").toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [links, filter, search]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAddMsg(null);
    startAdd(async () => {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddMsg(data.error ?? "Failed to add");
        return;
      }
      const added = (data.created as LinkRow[]) ?? [];
      const skipped = (data.skipped as number) ?? 0;
      setLinks((prev) => [...added, ...prev]);
      setText("");
      const parts: string[] = [];
      if (added.length) parts.push(`Added ${added.length}`);
      if (skipped) parts.push(`${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`);
      setAddMsg(parts.join(", ") || null);
      if (added.length) bumpStats();
      router.refresh();
    });
  }

  async function bulkDelete(days: number) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    // Mirror the Active tab: only unapplied todo links that aren't flagged
    // for review or snoozed, and only those older than the cutoff. Applied
    // and dropped links are never touched.
    const affected = links.filter(
      (l) =>
        new Date(l.created_at).getTime() < cutoff &&
        l.status === "todo" &&
        !l.needs_review &&
        !isSnoozed(l)
    );
    if (affected.length === 0) {
      setDeleteMsg(`No active links older than ${days} days.`);
      return;
    }
    if (
      !confirm(
        `Delete ${affected.length} active link${affected.length === 1 ? "" : "s"} older than ${days} days? These are unapplied postings from ${days}+ days ago. This cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    setDeleteMsg(null);
    const res = await fetch(`/api/links?days=${days}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      setDeleteMsg(data.error ?? "Failed to delete");
      return;
    }
    const deletedIds = new Set<number>((data.ids as number[]) ?? []);
    setLinks((prev) => prev.filter((l) => !deletedIds.has(l.id)));
    setDeleteMsg(`Deleted ${data.deleted ?? deletedIds.size}.`);
    bumpStats();
    router.refresh();
  }

  function replaceLink(updated: LinkRow) {
    setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  async function patchLink(id: number, body: Partial<LinkRow>) {
    const res = await fetch(`/api/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const data = await res.json();
    replaceLink(data.link as LinkRow);
    if (body.status) bumpStats();
  }

  async function saveReview(id: number, note: string, images: string[]) {
    const res = await fetch(`/api/links/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, images }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to save review");
      return false;
    }
    const data = await res.json();
    replaceLink(data.link as LinkRow);
    bumpStats();
    return true;
  }

  async function clearReview(id: number) {
    const res = await fetch(`/api/links/${id}/review`, { method: "DELETE" });
    if (!res.ok) return;
    const data = await res.json();
    replaceLink(data.link as LinkRow);
    bumpStats();
  }

  async function clearReviewAndApply(id: number) {
    const res = await fetch(`/api/links/${id}/review?apply=1`, { method: "DELETE" });
    if (!res.ok) return;
    const data = await res.json();
    replaceLink(data.link as LinkRow);
    bumpStats();
  }

  async function removeLink(id: number) {
    if (!confirm("Delete this link?")) return;
    const res = await fetch(`/api/links/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    bumpStats();
  }

  async function snoozeLink(id: number, untilIso: string) {
    const res = await fetch(`/api/links/${id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until: untilIso }),
    });
    if (!res.ok) return;
    const data = await res.json();
    replaceLink(data.link as LinkRow);
    bumpStats();
  }

  async function unsnoozeLink(id: number) {
    const res = await fetch(`/api/links/${id}/snooze`, { method: "DELETE" });
    if (!res.ok) return;
    const data = await res.json();
    replaceLink(data.link as LinkRow);
    bumpStats();
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Daily Links</h1>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          {isAdmin && (
            <a
              href="/api/export/csv"
              className="underline-offset-2 hover:underline"
              title="Download a CSV of all links"
            >
              Export CSV
            </a>
          )}
          <button onClick={signOut} className="underline-offset-2 hover:underline">
            Sign out
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <main className="min-w-0">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Active" value={counts.active} accent="neutral" />
            <StatTile label="Needs review" value={counts.review} accent="amber" />
            <StatTile label="Done" value={counts.done} accent="emerald" />
            <StatTile label="Total" value={counts.total} accent="muted" />
          </div>

      {dbError && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Database not connected: {dbError}.
        </div>
      )}

      <div className="mb-6 space-y-4">
        {isAdmin && (
        <form
          onSubmit={onAdd}
          className="space-y-2 rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <label className="block text-sm font-medium">Add links</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Each URL on its own line. Duplicates are skipped."
            rows={4}
            className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">{addMsg ?? " "}</p>
            <button
              type="submit"
              disabled={adding || !text.trim()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
        )}

        <FaqCard />
      </div>

      <div className="mb-3 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {(["active", "review", "done", "dropped", "all"] as const).map((f) => {
          const count =
            f === "active" ? counts.active
            : f === "review" ? counts.review
            : f === "done" ? counts.done
            : f === "dropped" ? counts.dropped
            : counts.total;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm ${
                filter === f
                  ? "border-b-2 border-neutral-900 font-medium dark:border-white"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
              } ${f === "review" && count > 0 && filter !== "review" ? "text-amber-600 dark:text-amber-400" : ""}`}
            >
              {FILTER_LABEL[f]} <span className="text-xs text-neutral-400">({count})</span>
            </button>
          );
        })}
      </div>

      {isAdmin && filter === "active" && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="text-neutral-500">Clear stale backlog:</span>
          <button
            type="button"
            onClick={() => bulkDelete(4)}
            disabled={deleting}
            title="Delete unapplied active links posted more than 4 days ago"
            className="rounded border border-neutral-300 px-2 py-1 font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-neutral-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            Older than 4 days
          </button>
          <button
            type="button"
            onClick={() => bulkDelete(7)}
            disabled={deleting}
            title="Delete unapplied active links posted more than 7 days ago"
            className="rounded border border-neutral-300 px-2 py-1 font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-neutral-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            Older than 7 days
          </button>
          {deleteMsg && <span className="text-neutral-500">{deleteMsg}</span>}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">
          {filter === "active"
            ? "No active links. Paste some above."
            : filter === "review"
            ? "No links flagged for review."
            : filter === "dropped"
            ? "No dropped links."
            : "Nothing here yet."}
        </p>
      ) : (
        <div className="space-y-6">
          {(mounted ? groupByBatch(visible) : [visible]).map((items, idx) => {
            const head = items[0];
            return (
              <section key={mounted ? head.id : `pre-${idx}`}>
                {mounted && (
                  <h2 className="mb-1.5 flex flex-wrap items-baseline gap-x-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {relativeDay(head.created_at, now)}
                    </span>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    <span>{fullDate(head.created_at, now)}</span>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    <span className="font-normal normal-case tracking-normal text-neutral-400">
                      {formatTime(head.created_at)}
                    </span>
                    <span className="ml-auto font-normal normal-case tracking-normal text-neutral-400">
                      {items.length} link{items.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                )}
                <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                  {items.map((l) => (
                    <LinkItem
                      key={l.id}
                      link={l}
                      mounted={mounted}
                      now={now}
                      filterIsReview={filter === "review"}
                      isAdmin={isAdmin}
                      onPatch={patchLink}
                      onDelete={removeLink}
                      onSaveReview={saveReview}
                      onClearReview={clearReview}
                      onClearReviewAndApply={clearReviewAndApply}
                      onSnooze={snoozeLink}
                      onUnsnooze={unsnoozeLink}
                      onActivity={bumpStats}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">

          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, title, URL, notes..."
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 pr-8 text-sm shadow-sm outline-none focus:border-neutral-500 dark:border-neutral-800 dark:bg-neutral-900"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <ClockCard />
          <UpdatesCard role={role} version={statsVersion} />
          <TodayStats version={statsVersion} />
          <TrendChart version={statsVersion} />
        </aside>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "neutral" | "amber" | "emerald" | "muted";
}) {
  const valueClass =
    accent === "amber"
      ? "text-amber-600 dark:text-amber-300"
      : accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "muted"
      ? "text-neutral-500 dark:text-neutral-400"
      : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="flex aspect-square flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:aspect-auto sm:min-h-[112px]">
      <div className={`font-mono text-4xl font-semibold tabular-nums leading-none ${valueClass}`}>
        {value}
      </div>
      <div className="mt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function LinkItem({
  link,
  mounted,
  now,
  filterIsReview,
  isAdmin,
  onPatch,
  onDelete,
  onSaveReview,
  onClearReview,
  onClearReviewAndApply,
  onSnooze,
  onUnsnooze,
  onActivity,
}: {
  link: LinkRow;
  mounted: boolean;
  now: number;
  filterIsReview: boolean;
  isAdmin: boolean;
  onPatch: (id: number, body: Partial<LinkRow>) => void;
  onDelete: (id: number) => void;
  onSaveReview: (id: number, note: string, images: string[]) => Promise<boolean>;
  onClearReview: (id: number) => void;
  onClearReviewAndApply: (id: number) => void;
  onSnooze: (id: number, untilIso: string) => void;
  onUnsnooze: (id: number) => void;
  onActivity: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [panelHiddenInReview, setPanelHiddenInReview] = useState(false);
  const [company, setCompany] = useState(link.company ?? "");
  const [title, setTitle] = useState(link.title ?? "");
  const [notes, setNotes] = useState(link.notes ?? "");
  const isApplied = link.status === "applied";
  const isDropped = link.status === "dropped";
  // Resolved states (applied / dropped) keep normal text. The filled
  // pill segment, the tab the row is in, and the Dropped badge already
  // convey the state without dimming the title.
  const snoozed =
    !!link.snoozed_until && new Date(link.snoozed_until).getTime() > Date.now();

  const showPanel = filterIsReview
    ? link.needs_review && !panelHiddenInReview
    : reviewOpen;

  function setStatusViaSegment(target: "applied" | "dropped") {
    // The pill only renders for todo links, so this is always a forward
    // transition into a terminal state. To revert later, the action row
    // shows a Restore button on resolved rows.
    onPatch(link.id, { status: target });
  }

  function saveEdits() {
    onPatch(link.id, {
      company: company.trim() || null,
      title: title.trim() || null,
      notes: notes.trim() || null,
    });
    setEditing(false);
  }

  const displayCompany = link.company || hostOf(link.url);
  const displayTitle = link.title || "(no title)";

  return (
    <li className={`px-4 py-3 ${link.needs_review ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Primary outcome selector. Only shown for links that are still in
            their active (todo) state - that's where the apply / drop
            decision happens. Once a link is in a terminal state (applied
            or dropped) the pill is hidden; if you need to revert by
            mistake, use the Restore button in the action row. */}
        {link.status === "todo" && (
          <div
            role="group"
            aria-label="Mark link as done or dropped"
            className="mt-0.5 flex shrink-0 overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700"
          >
            <button
              onClick={() => setStatusViaSegment("applied")}
              title="Mark as done"
              className="bg-white px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:bg-neutral-900 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
            >
              Done
            </button>
            <button
              onClick={() => setStatusViaSegment("dropped")}
              title="Mark as dropped"
              className="border-l border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-rose-400 dark:hover:bg-rose-950/60"
            >
              Drop
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-1.5">
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company"
                className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (resume version, follow-up date, etc.)"
                rows={2}
                className="w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveEdits}
                  className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-white dark:text-neutral-900"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setCompany(link.company ?? "");
                    setTitle(link.title ?? "");
                    setNotes(link.notes ?? "");
                    setEditing(false);
                  }}
                  className="rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium hover:underline"
                >
                  {displayCompany}
                </a>
                <span className="text-sm text-neutral-600 dark:text-neutral-300">
                  {displayTitle}
                </span>
                {link.needs_review && (
                  <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                    Review
                  </span>
                )}
                {isDropped && (
                  <span className="rounded-full bg-rose-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-900 dark:bg-rose-900 dark:text-rose-100">
                    Dropped
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                {link.source && <span>{link.source}</span>}
                {link.source && <span>·</span>}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:underline"
                  title={link.url}
                >
                  {hostOf(link.url)}
                </a>
                {mounted && (
                  <>
                    <span>·</span>
                    <time
                      dateTime={link.created_at}
                      title={new Date(link.created_at).toLocaleString()}
                    >
                      {timeAgoOrClock(link.created_at, now)}
                    </time>
                  </>
                )}
                {snoozed && mounted && link.snoozed_until && (
                  <>
                    <span>·</span>
                    <span
                      className="text-indigo-600 dark:text-indigo-400"
                      title={`Snoozed until ${new Date(link.snoozed_until).toLocaleString()}`}
                    >
                      snoozed until{" "}
                      {new Date(link.snoozed_until).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </>
                )}
              </div>
              {link.notes && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                  <span className="mr-1 text-neutral-400">▸</span>
                  {link.notes}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {filterIsReview && link.needs_review ? (
            isAdmin ? (
              <>
                <button
                  onClick={() => onClearReview(link.id)}
                  className="rounded border border-emerald-600 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  title="Clear the review flag (keeps current status)"
                >
                  Mark reviewed
                </button>
                <button
                  onClick={() => onClearReviewAndApply(link.id)}
                  className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700"
                  title="Clear flag and set status to Applied"
                >
                  Reviewed &amp; applied
                </button>
              </>
            ) : (
              <button
                onClick={() => setReviewOpen((v) => !v)}
                className="text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                title="Edit the review request"
              >
                Edit review
              </button>
            )
          ) : (
            <button
              onClick={() => setReviewOpen((v) => !v)}
              className={`text-xs ${
                link.needs_review
                  ? "text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                  : "text-neutral-400 hover:text-amber-700"
              }`}
              title={link.needs_review ? "View review request" : "Flag for review"}
            >
              {link.needs_review ? "Review" : "Flag"}
            </button>
          )}
          <button
            onClick={() => setSnoozeOpen((v) => !v)}
            className={`text-xs ${
              snoozed
                ? "text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200"
                : "text-neutral-400 hover:text-indigo-700"
            }`}
            title={snoozed ? "Manage snooze" : "Snooze this link"}
          >
            {snoozed ? "Snoozed" : "Snooze"}
          </button>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            title="Show activity history"
          >
            History
          </button>
          <button
            onClick={() => setCommentOpen((v) => !v)}
            className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            title="Add a comment"
          >
            Comment
          </button>
          {(isApplied || isDropped) && (
            <button
              onClick={() => onPatch(link.id, { status: "todo" })}
              className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              title="Send back to Active"
            >
              Restore
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Edit
          </button>
          {isAdmin && (
            <button
              onClick={() => onDelete(link.id)}
              className="text-xs text-neutral-400 hover:text-rose-600"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {showPanel && (
        <ReviewPanel
          link={link}
          isAdmin={isAdmin}
          onSave={onSaveReview}
          onClear={() => {
            onClearReview(link.id);
            setReviewOpen(false);
            setPanelHiddenInReview(true);
          }}
          onClose={() => {
            if (filterIsReview) setPanelHiddenInReview(true);
            else setReviewOpen(false);
          }}
        />
      )}

      {historyOpen && (
        <HistoryPanel linkId={link.id} onClose={() => setHistoryOpen(false)} />
      )}

      {snoozeOpen && (
        <SnoozePanel
          link={link}
          onSnooze={(iso) => {
            onSnooze(link.id, iso);
            setSnoozeOpen(false);
          }}
          onUnsnooze={() => {
            onUnsnooze(link.id);
            setSnoozeOpen(false);
          }}
          onClose={() => setSnoozeOpen(false)}
        />
      )}

      {commentOpen && (
        <CommentPanel
          linkId={link.id}
          onPosted={onActivity}
          onClose={() => setCommentOpen(false)}
        />
      )}
    </li>
  );
}

function CommentPanel({
  linkId,
  onPosted,
  onClose,
}: {
  linkId: number;
  onPosted: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/links/${linkId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to post comment");
        return;
      }
      setText("");
      onPosted();
      onClose();
    } finally {
      setPosting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Add comment
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Close
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment. It will appear in this link's history."
        rows={3}
        autoFocus
        className="w-full resize-y rounded border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-rose-600">{error}</span>
        <button
          type="submit"
          disabled={!text.trim() || posting}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {posting ? "Posting..." : "Comment"}
        </button>
      </div>
    </form>
  );
}

function SnoozePanel({
  link,
  onSnooze,
  onUnsnooze,
  onClose,
}: {
  link: LinkRow;
  onSnooze: (iso: string) => void;
  onUnsnooze: () => void;
  onClose: () => void;
}) {
  const snoozed =
    !!link.snoozed_until && new Date(link.snoozed_until).getTime() > Date.now();
  const [custom, setCustom] = useState("");

  function daysFromNow(days: number): string {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  const quick = [
    { label: "Tomorrow", iso: () => daysFromNow(1) },
    { label: "In 3 days", iso: () => daysFromNow(3) },
    { label: "In 1 week", iso: () => daysFromNow(7) },
    { label: "In 2 weeks", iso: () => daysFromNow(14) },
  ];

  function applyCustom() {
    if (!custom) return;
    const d = new Date(custom + "T09:00:00");
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return;
    onSnooze(d.toISOString());
  }

  return (
    <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          Snooze
        </span>
        <button
          onClick={onClose}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Close
        </button>
      </div>
      {snoozed && link.snoozed_until && (
        <p className="mb-2 text-xs text-indigo-700 dark:text-indigo-300">
          Currently snoozed until {new Date(link.snoozed_until).toLocaleString()}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            onClick={() => onSnooze(q.iso())}
            className="rounded bg-white px-2 py-1 text-xs text-neutral-900 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            {q.label}
          </button>
        ))}
        <span className="text-xs text-neutral-500">or</span>
        <input
          type="date"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          onClick={applyCustom}
          disabled={!custom}
          className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Snooze
        </button>
        {snoozed && (
          <button
            onClick={onUnsnooze}
            className="ml-auto rounded border border-emerald-600 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            Unsnooze
          </button>
        )}
      </div>
    </div>
  );
}

type LinkEvent = {
  role: string;
  type: string;
  created_at: string;
  note: string | null;
};

const EVENT_DESC: Record<string, string> = {
  added: "added",
  applied: "marked applied",
  flagged: "flagged for review",
  reviewed: "marked reviewed",
  snoozed: "snoozed",
  unsnoozed: "unsnoozed",
  commented: "commented",
  dropped: "dropped",
  restored: "restored to active",
  deleted: "deleted",
};

function HistoryPanel({ linkId, onClose }: { linkId: number; onClose: () => void }) {
  const [events, setEvents] = useState<LinkEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/links/${linkId}/events`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError("Failed to load history");
          return;
        }
        const data = await res.json();
        if (!cancelled) setEvents((data.events as LinkEvent[]) ?? []);
      } catch {
        if (!cancelled) setError("Failed to load history");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  return (
    <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Activity
        </span>
        <button
          onClick={onClose}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Close
        </button>
      </div>
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : events === null ? (
        <p className="text-xs text-neutral-500">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-neutral-500">No activity recorded yet.</p>
      ) : (
        <ol className="space-y-1.5 text-xs">
          {events.map((e, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="font-mono text-neutral-400 tabular-nums" suppressHydrationWarning>
                {new Date(e.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <div className="min-w-0">
                <span>
                  <span className="font-medium capitalize">{e.role}</span>{" "}
                  <span className="text-neutral-600 dark:text-neutral-300">
                    {EVENT_DESC[e.type] ?? e.type}
                  </span>
                </span>
                {e.type === "commented" && e.note && (
                  <p className="mt-0.5 whitespace-pre-wrap rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                    {e.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);

const DOC_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Map a MIME type to the file extension to use in the blob path. For docs
// the second half of the MIME type isn't a useful filename suffix
// (e.g. 'vnd.openxmlformats-officedocument.wordprocessingml.document'),
// so we map explicitly.
function extForMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/msword") return "doc";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime.startsWith("image/")) return mime.slice("image/".length);
  return "bin";
}

function isImageAttachment(url: string): boolean {
  const clean = url.split("?")[0].toLowerCase();
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTS.has(clean.slice(dot + 1));
}

function attachmentExtLabel(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot < 0 ? "FILE" : clean.slice(dot + 1).toUpperCase();
}

function ReviewPanel({
  link,
  isAdmin,
  onSave,
  onClear,
  onClose,
}: {
  link: LinkRow;
  isAdmin: boolean;
  onSave: (id: number, note: string, images: string[]) => Promise<boolean>;
  onClear: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(link.review_note ?? "");
  const [images, setImages] = useState<string[]>(link.review_images ?? []);
  const [uploading, setUploading] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The Lightbox navigates only through images. Non-image attachments
  // (resumes) live in the same array but open in a new tab on click.
  const imageUrls = useMemo(() => images.filter(isImageAttachment), [images]);

  async function uploadFiles(files: File[]) {
    const valid = files.filter(
      (f) => f.type.startsWith("image/") || DOC_MIME_TYPES.has(f.type)
    );
    if (valid.length === 0) return;
    setError(null);
    setUploading((n) => n + valid.length);
    const urls: string[] = [];
    for (const file of valid) {
      try {
        const ext = extForMime(file.type);
        const name = `reviews/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const blob = await upload(name, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          contentType: file.type,
        });
        urls.push(blob.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (urls.length) setImages((prev) => [...prev, ...urls]);
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      uploadFiles(files);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  }

  async function handleSave() {
    if (!note.trim() && images.length === 0) {
      setError("Add a note or at least one attachment.");
      return;
    }
    setSaving(true);
    const ok = await onSave(link.id, note, images);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onPaste={onPaste}
        placeholder="What do you need reviewed? You can also paste screenshots here (Ctrl+V)."
        rows={3}
        className="w-full resize-y rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-500 dark:border-amber-800 dark:bg-neutral-900"
      />

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="mt-2 rounded-md border border-dashed border-amber-300 bg-white/60 p-2 text-xs text-neutral-600 dark:border-amber-800 dark:bg-neutral-900/40 dark:text-neutral-300"
      >
        <div className="flex items-center justify-between">
          <span>Drop screenshots or resume (PDF/Word) here, paste with Ctrl+V, or</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded bg-white px-2 py-0.5 text-xs text-neutral-900 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            Choose file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) uploadFiles(files);
              e.target.value = "";
            }}
          />
        </div>

        {(images.length > 0 || uploading > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((url, i) => {
              const isImage = isImageAttachment(url);
              return (
                <div key={url + i} className="group relative">
                  {isImage ? (
                    <button
                      type="button"
                      onClick={() => setLightboxIdx(imageUrls.indexOf(url))}
                      className="block"
                      aria-label="Open image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 cursor-zoom-in rounded border border-neutral-300 object-cover dark:border-neutral-700"
                      />
                    </button>
                  ) : (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      title="Open file in new tab"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
                        <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" strokeLinejoin="round" />
                        <path d="M14 3v5h5" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[9px] font-semibold tracking-wider">
                        {attachmentExtLabel(url)}
                      </span>
                    </a>
                  )}
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white group-hover:flex"
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {Array.from({ length: uploading }).map((_, i) => (
              <div
                key={`up-${i}`}
                className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-neutral-300 text-[10px] text-neutral-500 dark:border-neutral-700"
              >
                uploading...
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || uploading > 0}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : link.needs_review ? "Update review" : "Flag for review"}
        </button>
        {link.needs_review && isAdmin && (
          <button
            onClick={onClear}
            className="rounded-md border border-emerald-600 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          >
            Mark reviewed
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Close
        </button>
        {link.review_flagged_at && (
          <span className="ml-auto text-[10px] text-neutral-500">
            flagged {new Date(link.review_flagged_at).toLocaleString()}
          </span>
        )}
      </div>
      {lightboxIdx !== null && lightboxIdx >= 0 && (
        <Lightbox
          images={imageUrls}
          index={lightboxIdx}
          onIndexChange={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const url = images[index];

  useEffect(() => {
    setZoomed(false);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < images.length - 1)
        onIndexChange(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, images.length, onClose, onIndexChange]);

  if (!url) return null;
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg text-white hover:bg-white/25"
        aria-label="Close (Esc)"
      >
        ×
      </button>

      {images.length > 1 && (
        <span className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
          {index + 1} / {images.length}
        </span>
      )}

      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index - 1);
          }}
          className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25"
          aria-label="Previous image"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index + 1);
          }}
          className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25"
          aria-label="Next image"
        >
          ›
        </button>
      )}

      <div
        className="h-full w-full overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-full min-w-full items-center justify-center p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            onClick={() => setZoomed((z) => !z)}
            className={
              zoomed
                ? "max-w-none cursor-zoom-out"
                : "max-h-[90vh] max-w-[90vw] cursor-zoom-in object-contain"
            }
          />
        </div>
      </div>

      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-white/70">
        click image to {zoomed ? "shrink" : "zoom"} · Esc to close
        {images.length > 1 ? " · ← → to navigate" : ""}
      </span>
    </div>
  );
}
