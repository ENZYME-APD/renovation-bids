"use client";

import { useMemo, useState } from "react";
import type { ImportPreview, ReviewRow } from "./import-actions";

const UNIT: Record<string, string> = { m2: "m²", m3: "m³", m: "m", ud: "ud", pa: "PA", kg: "kg", h: "h" };
const eur = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n));

/** Match each line from another format to a catalogue partida, or confirm it as a new one. */
export function ImportReview({ p, onChange }: { p: ImportPreview; onChange: (mapping: Record<string, string>) => void }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"review" | "auto" | "all">(p.review.some((r) => !r.confident) ? "review" : "all");
  const byId = useMemo(() => new Map(p.catalogue.map((c) => [c.id, c])), [p.catalogue]);
  const trades = useMemo(() => [...new Set(p.catalogue.map((c) => c.trade))], [p.catalogue]);
  const choiceOf = (r: ReviewRow) => choices[String(r.i)] ?? r.choice;

  const set = (r: ReviewRow, v: string) => {
    const next = { ...choices, [String(r.i)]: v };
    setChoices(next);
    onChange(next);
  };
  const rows = p.review.filter((r) => (tab === "all" ? true : tab === "auto" ? r.confident : !r.confident));
  const matched = p.review.filter((r) => !choiceOf(r).startsWith("new")).length;
  const created = p.review.length - matched;

  if (!p.review.length) return null;
  return (
    <div className="space-y-2">
      <p>
        <b>{p.review.length}</b> lines use codes that are not in the catalogue: <b>{matched}</b> will use a catalogue partida, <b>{created}</b> will
        become new studio partidas with standard codes. The file&apos;s code stays on each line as a reference.
      </p>
      <div className="flex gap-1 text-xs">
        {([
          ["review", `To check (${p.review.filter((r) => !r.confident).length})`],
          ["auto", `Matched automatically (${p.review.filter((r) => r.confident).length})`],
          ["all", `All (${p.review.length})`],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full border px-2.5 py-1 ${tab === k ? "border-accent bg-accent-soft" : "border-line text-muted"}`}>{l}</button>
        ))}
      </div>
      <div className="card max-h-[26rem] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface text-left text-muted">
            <tr className="border-b border-line"><th className="px-2 py-1.5">In the file</th><th className="px-2 py-1.5 text-right">Qty × price</th><th className="px-2 py-1.5">In the catalogue</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = choiceOf(r);
              const chosen = byId.get(c);
              const unitClash = chosen && r.unit && chosen.unit !== r.unit;
              return (
                <tr key={r.i} className="border-b border-line align-top last:border-0">
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-muted">{r.code}</span> {r.title}
                    {r.room && <span className="text-muted"> · {r.room}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{r.quantity ?? "—"} {UNIT[r.unit ?? ""] ?? r.unit} × {eur(r.unitPrice)}</td>
                  <td className="w-[22rem] px-2 py-1">
                    <select value={c} onChange={(e) => set(r, e.target.value)} className={`input py-1 text-xs ${unitClash ? "border-accent" : ""}`}>
                      {r.suggestions.length > 0 && (
                        <optgroup label="Suggested">
                          {r.suggestions.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.title} ({UNIT[s.unit] ?? s.unit}) — {Math.round(Math.min(s.score, 1) * 100)}%</option>)}
                        </optgroup>
                      )}
                      <optgroup label="New studio partida">
                        <option value="new">New partida in {r.chapter ?? "its chapter"} (standard code)</option>
                        {trades.filter((t) => t !== r.chapter).map((t) => <option key={t} value={`new:${t}`}>New partida in {t}</option>)}
                      </optgroup>
                      {trades.map((t) => (
                        <optgroup key={t} label={t}>
                          {p.catalogue.filter((x) => x.trade === t).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.title} ({UNIT[x.unit] ?? x.unit})</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {unitClash && <p className="mt-0.5 text-accent">Unit differs: {UNIT[r.unit!] ?? r.unit} in the file, {UNIT[chosen.unit] ?? chosen.unit} in the catalogue.</p>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={3} className="px-2 py-4 text-center text-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
