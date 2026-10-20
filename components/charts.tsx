"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Thin bars with rounded data ends, recessive axes and grid, a tooltip on every mark.
// Text uses ink tokens; colour only marks identity.

const AXIS = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false };
const TIP = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)", fontSize: 12 },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink)" },
  cursor: { fill: "var(--line)", opacity: 0.35 },
};

const fmt = (currency: string, compact = true) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 0, notation: compact ? "compact" : "standard" });

export function CountBars({ data, horizontal = false, height = 220 }: { data: { label: string; value: number }[]; horizontal?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : -16 }}>
        <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" allowDecimals={false} {...AXIS} />
            <YAxis type="category" dataKey="label" width={92} {...AXIS} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...AXIS} />
            <YAxis allowDecimals={false} {...AXIS} />
          </>
        )}
        <Tooltip {...TIP} formatter={(v) => [v as number, "Projects"]} />
        <Bar dataKey="value" fill="var(--series-1)" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EurPerM2Bars({ data, currency }: { data: { label: string; value: number; name: string }[]; currency: string }) {
  const f = fmt(currency, false);
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 30 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={(v) => f.format(v)} />
        <YAxis type="category" dataKey="label" width={80} {...AXIS} />
        <Tooltip {...TIP} labelFormatter={(_l, p) => (p?.[0]?.payload as { name?: string })?.name ?? ""} formatter={(v) => [`${f.format(v as number)}/m²`, "Budget"]} />
        <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MoneyBars({ data, currency }: { data: { label: string; budget: number; committed: number; paid: number }[]; currency: string }) {
  const f = fmt(currency);
  const full = fmt(currency, false);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v) => f.format(v)} width={56} />
        <Tooltip {...TIP} formatter={(v, n) => [full.format(v as number), n]} />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} iconType="circle" iconSize={8} />
        <Bar dataKey="budget" name="Budget" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar dataKey="committed" name="Committed" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar dataKey="paid" name="Paid out" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
