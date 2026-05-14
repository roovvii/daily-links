"use client";

import { useEffect, useState } from "react";

const ZONES: { label: string; tz: string }[] = [
  { label: "Ravi", tz: "America/Chicago" },
  { label: "Sreeya", tz: "Asia/Kolkata" },
];

function format(date: Date, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function ClockStrip() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    return <div className="h-4" suppressHydrationWarning />;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
      {ZONES.map((z, i) => (
        <span key={z.tz} className="flex items-center gap-1.5">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{z.label}</span>
          <span suppressHydrationWarning>{format(now, z.tz)}</span>
          {i < ZONES.length - 1 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
        </span>
      ))}
    </div>
  );
}
