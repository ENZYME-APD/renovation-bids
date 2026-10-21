"use client";

import { useState } from "react";
import { Donut } from "@/components/charts";
import { money, qty } from "@/lib/format";

export type CompareVersion = { id: string; label: string; note: string | null };
export type CompareLine = {
  v: string; chapterKey: string; chapter: string; chapterSeq: number; room: string | null;
  code: string; description: string; unit: string; qty: number; total: number | null;
};

const SLOTS = 8;
const color = (i: number) => (i < SLOTS ? `var(--series-${i + 1})` : "var(--series-other)");
const MAX_SELECTED = 4;

/** Side-by-side versions: totals, where the money goes (by chapter or room), and what quantities change. */
export function VersionCompare({ versions, lines, initial, currency }: {
  versions: CompareVersion[]; lines: CompareLine[]; initial: string[]; currency: string;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [by, setBy] = useState<"chapter" | "room">("chapter");
  const [onlyDiff, setOnlyDiff] = useState(true);
  const sel = versions.filter((v) => selected.includes(v.id));
  const first = sel[0]?.id;
  const last = sel[sel.length - 1]?.id;

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : s.length >= MAX_SELECTED ? s : [...s, id]));

  // Totals per version
  const totals = (() => {
    const m = new Map<string, { total: number; lines: number; unpriced: number }>();
    for (const v of versions) m.set(v.id, { total: 0, lines: 0, unpriced: 0 });
    for (const l of lines) {
      const t = m.get(l.v);
      if (!t) continue;
      t.lines++;
      if (l.total == null) t.unpriced++;
      else t.total += l.total;
    }
    return m;
  })();

  // Groups (chapter or room) × version amounts; colours fixed by overall size so they match across donuts
  const groups = (() => {
    const m = new Map<string, { key: string; name: string; order: number; values: Map<string, number> }>();
    for (const l of lines) {
      if (!selected.includes(l.v)) continue;
      const key = by === "chapter" ? l.chapterKey : (l.room ?? "");
      const name = by === "chapter" ? l.chapter : (l.room ?? "No room");
      if (!m.has(key)) m.set(key, { key, name, order: by === "chapter" ? l.chapterSeq : 0, values: new Map() });
      const g = m.get(key)!;
      g.values.set(l.v, (g.values.get(l.v) ?? 0) + (l.total ?? 0));
    }
    const all = [...m.values()];
    const size = (g: (typeof all)[number]) => [...g.values.values()].reduce((s, x) => s + x, 0);
    const ranked = [...all].sort((a, b) => size(b) - size(a));
    const colourOf = new Map(ranked.map((g, i) => [g.key, color(i)]));
    const rows = by === "chapter" ? all.sort((a, b) => a.order - b.order) : ranked;
    return { rows, colourOf, top: new Set(ranked.slice(0, SLOTS).map((g) => g.key)) };
  })();

  const donut = (vid: string) => {
    const slices: { key: string; label: string; value: number; color: string }[] = [];
    let other = 0;
    for (const g of groups.rows) {
      const v = g.values.get(vid) ?? 0;
      if (v <= 0) continue;
      if (groups.top.has(g.key)) slices.push({ key: g.key, label: g.name, value: v, color: groups.colourOf.get(g.key)! });
      else other += v;
    }
    slices.sort((a, b) => b.value - a.value);
    if (other > 0) slices.push({ key: "__other", label: "Other", value: other, color: "var(--series-other)" });
    return slices;
  };

  // Quantity groups: one row per partida, quantity per version
  const quantities = (() => {
    const m = new Map<string, { code: string; description: string; unit: string; q: Map<string, number>; a: Map<string, number> }>();
    for (const l of lines) {
      if (!selected.includes(l.v)) continue;
      if (!m.has(l.code)) m.set(l.code, { code: l.code, description: l.description, unit: l.unit, q: new Map(), a: new Map() });
      const r = m.get(l.code)!;
      r.q.set(l.v, (r.q.get(l.v) ?? 0) + l.qty);
      r.a.set(l.v, (r.a.get(l.v) ?? 0) + (l.total ?? 0));
    }
    const rows = [...m.values()].map((r) => ({
      ...r,
      dq: (r.q.get(last!) ?? 0) - (r.q.get(first!) ?? 0),
      da: (r.a.get(last!) ?? 0) - (r.a.get(first!) ?? 0),
    }));
    return rows.sort((a, b) => Math.abs(b.da) - Math.abs(a.da) || a.code.localeCompare(b.code, "es", { numeric: true }));
  })();
  const qRows = quantities.filter((r) => !onlyDiff || sel.length < 2 || Math.abs(r.dq) > 0.0005);

  const delta = (n: number) => (
    <span className={Math.abs(n) < 0.5 ? "text-muted" : n > 0 ? "text-accent" : "text-ok"}>
      {Math.abs(n) < 0.5 ? "=" : `${n > 0 ? "+" : "−"}${money(Math.abs(n), currency)}`}
    </span>
  );

  if (!versions.length) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Versions:</span>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => toggle(v.id)}
              className={`rounded-full border px-3 py-1 ${selected.includes(v.id) ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"}`}
              aria-pressed={selected.includes(v.id)}
            >
              {v.label}
            </button>
          ))}
          {versions.length > MAX_SELECTED && <span className="text-xs text-muted">up to {MAX_SELECTED}</span>}
        </div>
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          {(["chapter", "room"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setBy(k)} className={`rounded-md px-3 py-1 ${by === k ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"}`}>
              By {k}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-4 ${sel.length > 2 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"}`}>
        {sel.map((v) => {
          const t = totals.get(v.id)!;
          const base = totals.get(first!)!.total;
          return (
            <div key={v.id} className="card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{v.label}</span>
                <span className="text-xs text-muted">{v.note}</span>
              </div>
              <Donut data={donut(v.id)} currency={currency} centre={money(t.total, currency)} sub={v.id === first || sel.length < 2 ? `${t.lines} lines` : undefined} />
              {v.id !== first && (
                <p className="mt-2 text-center text-sm tabular-nums">
                  {delta(t.total - base)} vs {sel[0].label}
                  {base > 0 && Math.abs(t.total - base) >= 0.5 && <span className="text-muted"> ({((t.total - base) / base * 100).toFixed(1)} %)</span>}
                </p>
              )}
              {t.unpriced > 0 && <p className="mt-1 text-center text-xs text-muted">{t.unpriced} lines without price not counted</p>}
            </div>
          );
        })}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2">{by === "chapter" ? "Chapter" : "Room"}</th>
              {sel.map((v) => <th key={v.id} className="px-4 py-2 text-right">{v.label}</th>)}
              {sel.length > 1 && <th className="px-4 py-2 text-right">{sel[sel.length - 1].label} − {sel[0].label}</th>}
            </tr>
          </thead>
          <tbody>
            {groups.rows.map((g) => (
              <tr key={g.key} className="border-b border-line last:border-0">
                <td className="px-4 py-1.5">
                  <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: groups.top.has(g.key) ? groups.colourOf.get(g.key) : "var(--series-other)" }} />
                  {g.name}
                </td>
                {sel.map((v) => <td key={v.id} className="px-4 py-1.5 text-right tabular-nums">{g.values.get(v.id) ? money(g.values.get(v.id), currency) : "—"}</td>)}
                {sel.length > 1 && <td className="px-4 py-1.5 text-right tabular-nums">{delta((g.values.get(last!) ?? 0) - (g.values.get(first!) ?? 0))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Quantities by partida</h3>
          {sel.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only what changes ({quantities.filter((r) => Math.abs(r.dq) > 0.0005).length})
            </label>
          )}
        </div>
        <div className="card max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2">Partida</th>
                {sel.map((v) => <th key={v.id} className="px-4 py-2 text-right">{v.label}</th>)}
                {sel.length > 1 && <th className="px-4 py-2 text-right">Δ quantity</th>}
                {sel.length > 1 && <th className="px-4 py-2 text-right">Δ amount</th>}
              </tr>
            </thead>
            <tbody>
              {qRows.map((r) => (
                <tr key={r.code} className="border-b border-line last:border-0">
                  <td className="px-4 py-1.5"><span className="font-mono text-xs text-muted">{r.code}</span> {r.description}</td>
                  {sel.map((v) => <td key={v.id} className="px-4 py-1.5 text-right tabular-nums">{r.q.has(v.id) ? `${qty(r.q.get(v.id))} ${r.unit}` : "—"}</td>)}
                  {sel.length > 1 && <td className="px-4 py-1.5 text-right tabular-nums">{Math.abs(r.dq) < 0.0005 ? <span className="text-muted">=</span> : `${r.dq > 0 ? "+" : "−"}${qty(Math.abs(r.dq))} ${r.unit}`}</td>}
                  {sel.length > 1 && <td className="px-4 py-1.5 text-right tabular-nums">{delta(r.da)}</td>}
                </tr>
              ))}
              {qRows.length === 0 && <tr><td colSpan={sel.length + 3} className="px-4 py-6 text-center text-muted">Same quantities in every selected version.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
