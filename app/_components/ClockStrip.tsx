"use client";

import { useEffect, useState } from "react";

const ZONES: { label: string; tz: string }[] = [
  { label: "Ravi", tz: "America/Chicago" },
  { label: "Sreeya", tz: "Asia/Kolkata" },
];

function tzAbbr(date: Date, tz: string): string {
  const part = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

function formatTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function ClockCard() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="space-y-4">
        {ZONES.map((z, idx) => (
          <div key={z.tz}>
            <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              <span>{z.label}</span>
              <span suppressHydrationWarning>{mounted ? tzAbbr(now, z.tz) : ""}</span>
            </div>
            <div
              className="mt-0.5 font-mono text-3xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100"
              suppressHydrationWarning
            >
              {mounted ? formatTime(now, z.tz) : "--:--"}
            </div>
            <div
              className="mt-0.5 text-xs text-neutral-500"
              suppressHydrationWarning
            >
              {mounted ? formatDay(now, z.tz) : ""}
            </div>
            {idx < ZONES.length - 1 && (
              <div className="mt-4 h-px bg-neutral-200 dark:bg-neutral-800" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
