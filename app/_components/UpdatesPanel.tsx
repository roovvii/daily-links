"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventSession, EventType } from "@/lib/types";
import { ROLE_LABEL, type Role } from "@/lib/auth";

const EVENT_VERB: Record<EventType, (count: number) => string> = {
  added: (n) => `added ${n} link${n === 1 ? "" : "s"}`,
  applied: (n) => `applied to ${n} link${n === 1 ? "" : "s"}`,
  rejected: (n) => `marked ${n} as rejected`,
  interview: (n) => `moved ${n} to Interview`,
  offer: (n) => `got an offer on ${n} link${n === 1 ? "" : "s"}`,
  flagged: (n) => `flagged ${n} for review`,
  reviewed: (n) => `reviewed ${n} link${n === 1 ? "" : "s"}`,
  deleted: (n) => `deleted ${n} link${n === 1 ? "" : "s"}`,
};

function relativeTime(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function roleLabel(roleStr: string): string {
  if (roleStr === "ravi" || roleStr === "sreeya") return ROLE_LABEL[roleStr as Role];
  return roleStr;
}

export function UpdatesCard({ role }: { role: Role }) {
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSessions((data.sessions as EventSession[]) ?? []);
        setLastSeen((data.lastSeen as string | null) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = useMemo(() => {
    if (!sessions.length) return 0;
    const cutoff = lastSeen ? new Date(lastSeen).getTime() : 0;
    let count = 0;
    for (const s of sessions) {
      if (s.role === role) continue;
      if (new Date(s.end_at).getTime() > cutoff) count++;
    }
    return count;
  }, [sessions, lastSeen, role]);

  // Mark seen a few seconds after load so the user has time to register the unread dots.
  useEffect(() => {
    if (loading || unreadCount === 0) return;
    const id = setTimeout(async () => {
      try {
        await fetch("/api/events", { method: "POST" });
      } catch {
        // ignore
      }
    }, 4000);
    return () => clearTimeout(id);
  }, [loading, unreadCount]);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <span className="text-sm font-medium">Recent updates</span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {unreadCount} new
          </span>
        )}
      </div>

      {loading ? (
        <p className="px-3 py-4 text-xs text-neutral-500">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-neutral-500">
          No activity yet. Add or apply to a link and it&apos;ll show up here.
        </p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-neutral-100 overflow-y-auto text-sm dark:divide-neutral-800">
          {sessions.map((s, i) => {
            const cutoff = lastSeen ? new Date(lastSeen).getTime() : 0;
            const isNew = s.role !== role && new Date(s.end_at).getTime() > cutoff;
            const verb = EVENT_VERB[s.type as EventType];
            if (!verb) return null;
            return (
              <li
                key={`${s.role}-${s.type}-${s.end_at}-${i}`}
                className="flex items-start justify-between gap-2 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-start gap-2">
                  {isNew && (
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"
                      aria-label="new"
                    />
                  )}
                  <div className="min-w-0">
                    <span className="text-sm">
                      <span className="font-medium">{roleLabel(s.role)}</span>{" "}
                      <span className="text-neutral-600 dark:text-neutral-300">
                        {verb(s.count)}
                      </span>
                    </span>
                  </div>
                </div>
                <time
                  dateTime={s.end_at}
                  title={new Date(s.end_at).toLocaleString()}
                  className="shrink-0 text-[11px] text-neutral-400"
                  suppressHydrationWarning
                >
                  {relativeTime(s.end_at, now)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
