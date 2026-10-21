"use client";

import { useActionState, useState } from "react";
import { saveLineDetails } from "./actions";
import { useCloseOnSuccess } from "./add-line-form";
import type { Line } from "./line-table";

type Row = { label: string; count: string; length: string; width: string; height: string };
const s = (n: number | null | undefined) => (n == null ? "" : String(n));
const n = (v: string) => { const x = Number(v.replace(",", ".")); return v.trim() && Number.isFinite(x) ? x : null; };
const partial = (r: Row) => {
  const vals = [r.count, r.length, r.width, r.height].map(n);
  return vals.every((v) => v == null) ? null : vals.reduce<number>((p, v) => p * (v ?? 1), 1);
};
const fmt = (v: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(v);

/** Everything about one line that the inline row has no room for: offer texts, supplier, reference, measurements. */
export function LineDetailsForm({ projectId, versionId, line, onDone }: { projectId: string; versionId: string; line: Line; onDone: () => void }) {
  const [error, action, pending] = useActionState(saveLineDetails.bind(null, projectId, versionId), null);
  useCloseOnSuccess(pending, error, onDone);
  const [rows, setRows] = useState<Row[]>(
    line.measurements.length
      ? line.measurements.map((m) => ({ label: m.label ?? "", count: s(m.count), length: s(m.length), width: s(m.width), height: s(m.height) }))
      : [],
  );
  const total = rows.reduce((t, r) => t + (partial(r) ?? 0), 0);
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <form action={action} className="space-y-5 text-sm">
      <input type="hidden" name="id" value={line.id} />
      <input type="hidden" name="measurements" value={JSON.stringify(rows)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="label">Supplied by</span>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2"><input type="radio" name="supplied_by" value="contractor" defaultChecked={line.supplied !== "client"} /> Contractor (in the contract)</label>
            <label className="flex items-center gap-2"><input type="radio" name="supplied_by" value="client" defaultChecked={line.supplied === "client"} /> Client buys it</label>
          </div>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <div>
            <label className="label" htmlFor="ld-ref">Reference price</label>
            <input id="ld-ref" name="reference_price" inputMode="decimal" defaultValue={s(line.referencePrice)} className="input" placeholder="—" />
          </div>
          <div>
            <label className="label" htmlFor="ld-refsrc">From</label>
            <input id="ld-refsrc" name="reference_source" defaultValue={line.referenceSource ?? ""} className="input" placeholder="Client's other quote, web price…" />
          </div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ld-desc">Description in the offer</label>
        <textarea id="ld-desc" name="description" rows={3} defaultValue={line.jobDescription ?? ""} className="input"
          placeholder={line.longDescription ?? "The partida's description from the catalogue"} />
        <p className="mt-1 text-xs text-muted">Empty: the catalogue description is used. Write here only what is specific to this job.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="ld-cn">Note for the client</label>
          <textarea id="ld-cn" name="client_note" rows={2} defaultValue={line.clientNote ?? ""} className="input" placeholder="Medición a confirmar en obra" />
        </div>
        <div>
          <label className="label" htmlFor="ld-mn">How it was measured</label>
          <textarea id="ld-mn" name="measurement_note" rows={2} defaultValue={line.measurementNote ?? ""} className="input" placeholder="13,44 ml × 2,50 m" />
        </div>
        <div>
          <label className="label" htmlFor="ld-in">Internal note (never printed)</label>
          <textarea id="ld-in" name="notes" rows={2} defaultValue={line.notes ?? ""} className="input" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="label">Measurement lines</span>
          <span className="text-xs text-muted">{rows.length ? `Quantity = ${fmt(Math.round(total * 100) / 100)} ${line.unit}` : `None: the quantity is typed in (${fmt(line.quantity)} ${line.unit})`}</span>
        </div>
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1 pr-2">Where / what</th><th className="w-16 px-1">Nº</th><th className="w-20 px-1">Length</th><th className="w-20 px-1">Width</th><th className="w-20 px-1">Height</th><th className="w-20 px-1 text-right">Partial</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2"><input value={r.label} onChange={(e) => set(i, "label", e.target.value)} className="input py-1" placeholder="Cocina – hall" /></td>
                  {(["count", "length", "width", "height"] as const).map((k) => (
                    <td key={k} className="px-1"><input value={r[k]} onChange={(e) => set(i, k, e.target.value)} inputMode="decimal" className="input px-2 py-1 text-right" /></td>
                  ))}
                  <td className="px-1 text-right tabular-nums">{partial(r) == null ? "—" : fmt(Math.round(partial(r)! * 1000) / 1000)}</td>
                  <td className="pl-1"><button type="button" className="text-muted hover:text-accent" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="btn-quiet py-1" onClick={() => setRows((rs) => [...rs, { label: "", count: "1", length: "", width: "", height: "" }])}>+ Measurement line</button>
        <p className="text-xs text-muted">Partial = Nº × length × width × height (blanks count as 1; a negative Nº deducts, e.g. a door opening).</p>
      </div>

      {error && <p className="text-accent">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
