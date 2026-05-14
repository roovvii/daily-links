"use client";

import { useEffect, useMemo, useState } from "react";

type DailyRow = { role: string; day: string; count: number };

const ROLE_COLORS: Record<string, { line: string; dot: string; label: string }> = {
  ravi: { line: "#2563eb", dot: "#2563eb", label: "Ravi" },
  sreeya: { line: "#db2777", dot: "#db2777", label: "Sreeya" },
};

type RangePreset = "7d" | "14d" | "week" | "month" | "30d" | "90d";

const PRESET_LABEL: Record<RangePreset, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  week: "This week",
  month: "This month",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function daysForPreset(preset: RangePreset): number {
  const now = new Date();
  switch (preset) {
    case "7d":
      return 7;
    case "14d":
      return 14;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "week": {
      // Monday-start week. Sunday = 0, so map to 7.
      const day = now.getDay() === 0 ? 7 : now.getDay();
      return day;
    }
    case "month":
      return now.getDate();
  }
}

const W = 280;
const H = 120;
const PAD_X = 16;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

function buildDayList(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function TrendChart() {
  const [preset, setPreset] = useState<RangePreset>("14d");
  const [data, setData] = useState<DailyRow[] | null>(null);

  const days = useMemo(() => daysForPreset(preset), [preset]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    async function load() {
      try {
        const res = await fetch(`/api/stats/daily?days=${days}`, { cache: "no-store" });
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
  }, [days]);

  const { roles, series, maxVal, dayList } = useMemo(() => {
    const list = buildDayList(days);
    const byRole = new Map<string, Map<string, number>>();
    if (data) {
      for (const r of data) {
        if (!byRole.has(r.role)) byRole.set(r.role, new Map());
        byRole.get(r.role)!.set(r.day, r.count);
      }
    }
    const rolesArr = Array.from(byRole.keys());
    if (rolesArr.length === 0) rolesArr.push("ravi", "sreeya");
    let max = 1;
    const ser: Record<string, number[]> = {};
    for (const role of rolesArr) {
      const map = byRole.get(role) ?? new Map<string, number>();
      const points = list.map((d) => map.get(d) ?? 0);
      ser[role] = points;
      for (const p of points) if (p > max) max = p;
    }
    return { roles: rolesArr, series: ser, maxVal: max, dayList: list };
  }, [data, days]);

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
  const midIdx = Math.floor(dayList.length / 2);
  const labelIdxs = dayList.length <= 1 ? [0] : [0, midIdx, todayIdx];
  const dotRadius = dayList.length > 30 ? 1.5 : 2;
  const todayDotRadius = dayList.length > 30 ? 2.5 : 3;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
        <span className="text-sm font-medium">Applies</span>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as RangePreset)}
          className="ml-auto rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs text-neutral-700 outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
        >
          {(Object.keys(PRESET_LABEL) as RangePreset[]).map((p) => (
            <option key={p} value={p}>
              {PRESET_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end gap-3 border-b border-neutral-100 px-3 py-1.5 text-[11px] text-neutral-500 dark:border-neutral-800">
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

      <div className="p-3">
        {data === null ? (
          <p className="px-1 py-8 text-center text-xs text-neutral-500">Loading...</p>
        ) : data.length === 0 ? (
          <p className="px-1 py-8 text-center text-xs text-neutral-500">
            No applies recorded in this range.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-32 w-full"
            preserveAspectRatio="none"
          >
            <line
              x1={PAD_X}
              y1={H - PAD_BOTTOM}
              x2={W - PAD_X}
              y2={H - PAD_BOTTOM}
              stroke="currentColor"
              className="text-neutral-200 dark:text-neutral-800"
              strokeWidth={1}
            />

            {labelIdxs.map((i, n) => (
              <text
                key={i}
                x={xFor(i)}
                y={H - 4}
                textAnchor={
                  n === 0 ? "start" : n === labelIdxs.length - 1 ? "end" : "middle"
                }
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
                      r={i === todayIdx ? todayDotRadius : dotRadius}
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
