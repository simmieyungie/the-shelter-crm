"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const fmtNum = (n: number) => n.toLocaleString("en-NG");

/** 8-week Sunday attendance. One series, so no legend; the latest bar is emphasised. */
export function TrendChart({ data }: { data: { date: string; total: number }[] }) {
  const last = data.length - 1;
  return (
    <figure className="rounded-2xl border border-line bg-surface p-4">
      <figcaption className="mb-3">
        <span className="block font-semibold">Sunday attendance · last 8 weeks</span>
        <span className="block text-xs text-subtle">Verified reports only. Latest Sunday in dark.</span>
      </figcaption>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap={6}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={{ stroke: "var(--line)" }} tick={{ fill: "var(--subtle)", fontSize: 11 }} interval={0} />
            <YAxis tickFormatter={fmtNum} tickLine={false} axisLine={false} tick={{ fill: "var(--subtle)", fontSize: 11 }} width={48} />
            <Tooltip
              cursor={{ fill: "var(--brand-soft)" }}
              formatter={(v) => [fmtNum(Number(v)), "Attendance"]}
              labelFormatter={(l) => `Sun ${fmtDay(String(l))}`}
              contentStyle={{ borderRadius: 12, border: "1px solid var(--line)", fontSize: 12, color: "var(--ink)" }}
            />
            <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.date} fill={i === last ? "var(--brand)" : "#8B84C4"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Sunday attendance for the last 8 weeks</caption>
        <thead>
          <tr>
            <th>Sunday</th>
            <th>Attendance</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{fmtDay(d.date)}</td>
              <td>{d.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
