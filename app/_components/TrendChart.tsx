"use client";

import { useEffect, useMemo, useState } from "react";

type DailyRow = { role: string; day: string; count: number };

const ROLE_COLORS: Record<string, { line: string; dot: string; label: string }> = {
  ravi: { line: "#2563eb", dot: "#2563eb", label: "Ravi" },
  sreeya: { line: "#db2777", dot: "#db2777", label: "Sreeya" },
};

const DAYS = 14;
const W = 280;
const H = 120;
const PAD_X = 16;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

function buildDayList(): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function TrendChart() {
  const [data, setData] = useState<DailyRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stats/daily", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData((json.daily as DailyRow[]) ?? []);
      } catch {
        // ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const { roles, series, maxVal, dayList } = useMemo(() => {
    const days = buildDayList();
    const byRole = new Map<string, Map<string, number>>();
    if (data) {
      for (const r of data) {
        if (!byRole.has(r.role)) byRole.set(r.role, new Map());
        byRole.get(r.role)!.set(r.day, r.count);
      }
    }
    const rolesArr = Array.from(byRole.keys());
    if (rolesArr.length === 0) {
      rolesArr.push("ravi", "sreeya");
    }
    let max = 1;
    const ser: Record<string, number[]> = {};
    for (const role of rolesArr) {
      const map = byRole.get(role) ?? new Map<string, number>();
      const points = days.map((d) => map.get(d) ?? 0);
      ser[role] = points;
      for (const p of points) if (p > max) max = p;
    }
    return { roles: rolesArr, series: ser, maxVal: max, dayList: days };
  }, [data]);

  function xFor(i: number): number {
    if (dayList.length <= 1) return W / 2;
    const span = W - PAD_X * 2;
    return PAD_X + (i * span) / (dayList.length - 1);
  }
  function yFor(value: number): number {
    const span = H - PAD_TOP - PAD_BOTTOM;
    return PAD_TOP + span - (value / maxVal) * span;
  }

  const todayIdx = dayList.length - 1;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <span className="text-sm font-medium">Applies · last 14 days</span>
        <div className="flex items-center gap-3 text-[11px] text-neutral-500">
          {roles.map((r) => {
            const c = ROLE_COLORS[r] ?? { line: "#666", dot: "#666", label: r };
            return (
              <span key={r} className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: c.dot }}
                />
                {c.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="p-3">
        {data === null ? (
          <p className="px-1 py-8 text-center text-xs text-neutral-500">Loading...</p>
        ) : data.length === 0 ? (
          <p className="px-1 py-8 text-center text-xs text-neutral-500">
            No applies recorded yet.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-32 w-full"
            preserveAspectRatio="none"
          >
            {/* baseline */}
            <line
              x1={PAD_X}
              y1={H - PAD_BOTTOM}
              x2={W - PAD_X}
              y2={H - PAD_BOTTOM}
              stroke="currentColor"
              className="text-neutral-200 dark:text-neutral-800"
              strokeWidth={1}
            />

            {/* date labels: start, mid, today */}
            {[0, Math.floor(dayList.length / 2), todayIdx].map((i) => (
              <text
                key={i}
                x={xFor(i)}
                y={H - 4}
                textAnchor={i === 0 ? "start" : i === todayIdx ? "end" : "middle"}
                className="fill-neutral-500"
                style={{ fontSize: 9 }}
              >
                {new Date(dayList[i]).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </text>
            ))}

            {roles.map((role) => {
              const points = series[role];
              const color = ROLE_COLORS[role]?.line ?? "#666";
              const pathD = points
                .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`)
                .join(" ");
              return (
                <g key={role}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                    strokeLinejoin="round"
                  />
                  {points.map((v, i) => (
                    <circle
                      key={i}
                      cx={xFor(i)}
                      cy={yFor(v)}
                      r={i === todayIdx ? 3 : 2}
                      fill={color}
                    >
                      <title>{`${ROLE_COLORS[role]?.label ?? role}: ${v} applies on ${new Date(dayList[i]).toLocaleDateString()}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
