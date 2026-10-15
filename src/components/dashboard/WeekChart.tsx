"use client";
import Link from "next/link";
import { useState } from "react";

type Day = { key: string; label: string; count: number; high: number };

// Bar per day: total tasks due, with the high-priority share drawn darker. Table view for screen readers and exact numbers.
export function WeekChart({ days }: { days: Day[] }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const W = 560, H = 170, pad = 24, bw = (W - pad * 2) / days.length;
  const total = days.reduce((s, d) => s + d.count, 0);
  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="text-ink-2">{total} task{total === 1 ? "" : "s"} due · <span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal-strong align-middle" /> P1–P2 <span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal/45 align-middle ms-2" /> other</span>
        <button className="text-teal font-semibold" onClick={() => setTable((t) => !t)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Day</th><th className="font-medium text-right">Due</th><th className="font-medium text-right">P1–P2</th></tr></thead>
          <tbody>{days.map((d) => <tr key={d.key} className="border-t border-line"><td className="py-1">{d.label}</td><td className="text-right tabular-nums">{d.count}</td><td className="text-right tabular-nums">{d.high}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full h-auto" role="img" aria-label={`Tasks due per day: ${days.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
            {[0.5, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - (H - 20) * f} y2={H - (H - 20) * f} stroke="var(--border)" strokeDasharray="3 4" />)}
            <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="var(--border)" />
            {days.map((d, i) => {
              const x = pad + i * bw + bw * 0.22, w = bw * 0.56;
              const h = ((H - 20) * d.count) / max, hh = ((H - 20) * d.high) / max;
              return (
                <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={pad + i * bw} y={0} width={bw} height={H + 22} fill="transparent" />
                  {d.count > 0 && <rect x={x} y={H - h} width={w} height={h - hh} rx={4} fill="var(--teal)" fillOpacity={0.45} />}
                  {d.high > 0 && <rect x={x} y={H - hh} width={w} height={hh} rx={hh === h ? 4 : 0} fill="var(--teal-strong)" />}
                  <text x={x + w / 2} y={H + 16} textAnchor="middle" fontSize="12" fill="var(--muted)">{i === 0 ? "Today" : d.label.split(" ")[0]}</text>
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="absolute top-0 card px-2.5 py-1.5 text-xs pointer-events-none" style={{ left: `${((pad + hover * bw + bw / 2) / W) * 100}%`, transform: "translateX(-50%)" }}>
              <div className="font-semibold">{days[hover].label}</div>{days[hover].count} due · {days[hover].high} high priority
            </div>
          )}
        </div>
      )}
      <Link href="/tasks" className="text-sm text-teal font-semibold">Open tasks</Link>
    </div>
  );
}
