"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LinkRow, LinkStatus } from "@/lib/types";
import { STATUS_LABEL, STATUS_OPTIONS } from "@/lib/types";

type Filter = "active" | "done" | "all";

const STATUS_COLORS: Record<LinkStatus, string> = {
  todo: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  applied: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  interview: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  offer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
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

function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
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

function groupByDate(rows: LinkRow[]): { label: string; items: LinkRow[] }[] {
  const groups: { label: string; items: LinkRow[] }[] = [];
  for (const row of rows) {
    const label = dateGroupLabel(row.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  }
  return groups;
}

export function LinksApp({ initial, dbError }: { initial: LinkRow[]; dbError: string | null }) {
  const router = useRouter();
  const [links, setLinks] = useState<LinkRow[]>(initial);
  const [filter, setFilter] = useState<Filter>("active");
  const [text, setText] = useState("");
  const [adding, startAdd] = useTransition();
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const counts = useMemo(() => {
    let active = 0;
    let done = 0;
    for (const l of links) {
      if (l.status === "todo") active++;
      else done++;
    }
    return { active, done, total: links.length };
  }, [links]);

  const visible = useMemo(() => {
    if (filter === "all") return links;
    if (filter === "done") return links.filter((l) => l.status !== "todo");
    return links.filter((l) => l.status === "todo");
  }, [links, filter]);

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
      router.refresh();
    });
  }

  async function patchLink(id: number, body: Partial<LinkRow>) {
    const res = await fetch(`/api/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const data = await res.json();
    setLinks((prev) => prev.map((l) => (l.id === id ? (data.link as LinkRow) : l)));
  }

  async function removeLink(id: number) {
    if (!confirm("Delete this link?")) return;
    const res = await fetch(`/api/links/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Daily Links</h1>
          <p className="text-sm text-neutral-500">
            {counts.active} active, {counts.done} done, {counts.total} total
          </p>
        </div>
        <button
          onClick={signOut}
          className="text-xs text-neutral-500 underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </header>

      {dbError && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Database not connected: {dbError}. Run <code>npm run db:init</code> after setting up
          Postgres.
        </div>
      )}

      <form onSubmit={onAdd} className="mb-6 space-y-2">
        <label className="block text-sm font-medium">Add links</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Paste one URL per line:\nhttps://boards.greenhouse.io/acme/jobs/123\nhttps://jobs.lever.co/acme/abc"}
          rows={4}
          className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            {addMsg ?? "Each URL on its own line. Duplicates are skipped."}
          </p>
          <button
            type="submit"
            disabled={adding || !text.trim()}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      </form>

      <div className="mb-3 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {(["active", "done", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm capitalize ${
              filter === f
                ? "border-b-2 border-neutral-900 font-medium dark:border-white"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {f}{" "}
            <span className="text-xs text-neutral-400">
              ({f === "active" ? counts.active : f === "done" ? counts.done : counts.total})
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">
          {filter === "active" ? "No active links. Paste some above." : "Nothing here yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {groupByDate(visible).map((group) => (
            <section key={group.label}>
              <h2 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                {group.label}
                <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
                  {group.items.length} link{group.items.length === 1 ? "" : "s"}
                </span>
              </h2>
              <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                {group.items.map((l) => (
                  <LinkItem key={l.id} link={l} onPatch={patchLink} onDelete={removeLink} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function LinkItem({
  link,
  onPatch,
  onDelete,
}: {
  link: LinkRow;
  onPatch: (id: number, body: Partial<LinkRow>) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState(link.company ?? "");
  const [title, setTitle] = useState(link.title ?? "");
  const checked = link.status !== "todo";

  function toggleChecked() {
    onPatch(link.id, { status: checked ? "todo" : "applied" });
  }

  function saveEdits() {
    onPatch(link.id, { company: company.trim() || null, title: title.trim() || null });
    setEditing(false);
  }

  const displayCompany = link.company || hostOf(link.url);
  const displayTitle = link.title || "(no title)";

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <button
        onClick={toggleChecked}
        aria-label={checked ? "Mark as todo" : "Mark as applied"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
          checked
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-neutral-400 bg-white dark:bg-neutral-950"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

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
            <div className="flex gap-2">
              <button
                onClick={saveEdits}
                className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-white dark:text-neutral-900"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
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
                className={`text-sm font-medium hover:underline ${
                  checked ? "text-neutral-400 line-through" : ""
                }`}
              >
                {displayCompany}
              </a>
              <span className={`text-sm ${checked ? "text-neutral-400 line-through" : "text-neutral-600 dark:text-neutral-300"}`}>
                {displayTitle}
              </span>
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
              <span>·</span>
              <time dateTime={link.created_at} title={new Date(link.created_at).toLocaleString()}>
                {formatTime(link.created_at)}
              </time>
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <select
          value={link.status}
          onChange={(e) => onPatch(link.id, { status: e.target.value as LinkStatus })}
          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[link.status]} border-0 outline-none`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(link.id)}
          className="text-xs text-neutral-400 hover:text-rose-600"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
