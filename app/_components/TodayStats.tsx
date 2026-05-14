"use client";

import { useEffect, useState } from "react";

type Counts = { ravi: number; sreeya: number };

export function TodayStats() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stats/today", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const c = (json.counts as Counts) ?? { ravi: 0, sreeya: 0 };
        if (!cancelled) setCounts(c);
      } catch {
        // ignore
      }
    }
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <span className="text-sm font-medium">Applied today</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-3">
        <Tile label="Ravi" value={counts?.ravi ?? null} accent="#2563eb" />
        <Tile label="Sreeya" value={counts?.sreeya ?? null} accent="#db2777" />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div
        className="font-mono text-3xl font-semibold tabular-nums leading-none"
        style={{ color: accent }}
      >
        {value ?? "—"}
      </div>
      <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
}
