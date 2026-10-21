"use client";

import { useActionState, useMemo, useState } from "react";
import { money, qty, unitLabel } from "@/lib/format";
import {
  addTemplateLine, customiseTemplate, deleteTemplate, deleteTemplateLine, saveTemplate, setTemplateActive, updateTemplateLine, type State,
} from "../actions";

export type EditorLine = {
  id: string; code: string; description: string; unit: string; chapter: string;
  factor: number; perPerimeter: number; perWallArea: number; fixed: number; note: string | null; price: number | null;
};
export type PartidaOption = { id: string; code: string; description: string; unit: string; chapter: string; sequence: number };
type Template = {
  id: string; code: string; name: string; sizeLabel: string; description: string | null; matchTerms: string[];
  active: boolean; standard: boolean; replacesStandard: boolean;
};

export function TemplateEditor({ template, lines, options, editable, canWrite, currency, defaultHeight }: {
  template: Template; lines: EditorLine[]; options: PartidaOption[]; editable: boolean; canWrite: boolean; currency: string; defaultHeight: number;
}) {
  const [size, setSize] = useState(template.sizeLabel.startsWith("número") ? 1 : 10);
  const [height, setHeight] = useState(defaultHeight);
  const [perimeterIn, setPerimeterIn] = useState("");
  const walls = lines.some((l) => l.perPerimeter || l.perWallArea);
  const estimated = Math.round(5 * Math.sqrt(Math.max(size, 0) / 1.5) * 100) / 100;
  const perimeter = Number(perimeterIn.replace(",", ".")) || estimated;
  const wallArea = Math.max(perimeter * height, 0);
  const preview = useMemo(() => lines.map((l) => {
    const q = Math.round((l.factor * size + l.perPerimeter * perimeter + l.perWallArea * wallArea + l.fixed) * 1000) / 1000;
    return { ...l, q, total: l.price != null ? q * l.price : null };
  }), [lines, size, perimeter, wallArea]);
  const total = preview.reduce((s, l) => s + (l.total ?? 0), 0);
  const unpriced = preview.filter((l) => l.q > 0 && l.price == null).length;

  return (
    <div className="space-y-6">
      {template.standard ? (
        canWrite && (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted">Change factors, add or remove partidas, or set which room names it matches.</p>
            <Action action={customiseTemplate} fields={{ id: template.id }} label="Edit (make studio version)" primary />
          </div>
        )
      ) : (
        editable && <DetailsForm template={template} />
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Lines</h2>
          <div className="flex items-end gap-3 text-sm">
            <div>
              <label className="label" htmlFor="preview-size">Preview for a room of</label>
              <div className="flex items-center gap-2">
                <input id="preview-size" type="number" min={0} step="0.5" value={size} onChange={(e) => setSize(Number(e.target.value) || 0)} className="input w-24" />
                <span className="text-muted">{template.sizeLabel}</span>
              </div>
            </div>
            {walls && (
              <>
                <div>
                  <label className="label" htmlFor="preview-h">Height</label>
                  <input id="preview-h" type="number" min={1.8} step="0.05" value={height} onChange={(e) => setHeight(Number(e.target.value) || 0)} className="input w-20" />
                </div>
                <div>
                  <label className="label" htmlFor="preview-p">Perimeter</label>
                  <input id="preview-p" inputMode="decimal" value={perimeterIn} onChange={(e) => setPerimeterIn(e.target.value)} placeholder={`≈ ${estimated}`} className="input w-24" />
                </div>
              </>
            )}
            <div className="pb-2 text-right">
              <div className="text-lg font-semibold tabular-nums">{money(total, currency)}</div>
              <div className="text-xs text-muted">
                {size > 0 && !template.sizeLabel.startsWith("número") ? `${money(total / size, currency)} per unit of size` : ""}
                {unpriced ? ` · ${unpriced} without price` : ""}
              </div>
            </div>
          </div>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2">Partida</th>
                <th className="px-3 py-2 text-right" title="Quantity per unit of room size (m² of floor, or per window)">× size</th>
                <th className="px-3 py-2 text-right" title="Quantity per metre of perimeter">× perimeter</th>
                <th className="px-3 py-2 text-right" title="Quantity per m² of wall: perimeter × height − openings">× wall area</th>
                <th className="px-3 py-2 text-right">+ fixed</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Total</th>
                {editable && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {preview.map((l) => (
                <LineRow key={`${l.id}-${l.factor}-${l.perPerimeter}-${l.perWallArea}-${l.fixed}-${l.note ?? ""}`} line={l} editable={editable} currency={currency} />
              ))}
              {preview.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">No lines yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {editable && <AddLine templateId={template.id} options={options} />}
      </section>

      {editable && (
        <section className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Action action={setTemplateActive} fields={{ id: template.id, active: String(!template.active) }} label={template.active ? "Hide" : "Show again"} />
          <Action
            action={deleteTemplate}
            fields={{ id: template.id }}
            label={template.replacesStandard ? "Reset to standard" : "Delete template"}
            confirm={template.replacesStandard ? "Your changes are lost and the standard template is used again" : "Rooms already added keep their lines"}
          />
        </section>
      )}
    </div>
  );
}

function DetailsForm({ template }: { template: Template }) {
  const [state, run, pending] = useActionState(saveTemplate, null);
  return (
    <form action={run} className="card grid gap-4 p-5 md:grid-cols-2">
      <input type="hidden" name="id" value={template.id} />
      <div>
        <label className="label" htmlFor="d-name">Name</label>
        <input id="d-name" name="name" className="input" defaultValue={template.name} required />
      </div>
      <div>
        <label className="label" htmlFor="d-size">Size measured in</label>
        <input id="d-size" name="size_label" className="input" defaultValue={template.sizeLabel} />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="d-desc">Description (what the standard spec includes)</label>
        <textarea id="d-desc" name="description" rows={2} className="input" defaultValue={template.description ?? ""} />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="d-terms">Matches rooms named (comma-separated)</label>
        <input id="d-terms" name="match_terms" className="input" defaultValue={template.matchTerms.join(", ")} placeholder="baño, bathroom" />
        <p className="mt-1 text-xs text-muted">
          Zone categories or room names from Archicad, other software, a drawing or an AI room list. &quot;Baño 2&quot; matches &quot;baño&quot;.
        </p>
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state?.ok && <span className="text-sm text-ok">{state.ok}</span>}
        {state?.error && <span className="text-sm text-accent">{state.error}</span>}
      </div>
    </form>
  );
}

function LineRow({ line, editable, currency }: { line: EditorLine & { q: number; total: number | null }; editable: boolean; currency: string }) {
  const [state, run, pending] = useActionState(updateTemplateLine, null);
  const [dirty, setDirty] = useState(false);
  const formId = `line-${line.id}`;
  return (
    <tr className="border-b border-line last:border-0 align-top">
      <td className="px-3 py-2">
        <span className="font-mono text-xs text-muted">{line.code}</span> {line.description}
        <span className="ml-1 text-xs text-muted">({unitLabel[line.unit] ?? line.unit})</span>
      </td>
      {editable ? (
        <>
          <td className="px-3 py-1.5 text-right">
            <input form={formId} name="factor" defaultValue={line.factor} onChange={() => setDirty(true)} className="input w-20 py-1 text-right tabular-nums" inputMode="decimal" />
          </td>
          <td className="px-3 py-1.5 text-right">
            <input form={formId} name="per_perimeter" defaultValue={line.perPerimeter} onChange={() => setDirty(true)} className="input w-20 py-1 text-right tabular-nums" inputMode="decimal" />
          </td>
          <td className="px-3 py-1.5 text-right">
            <input form={formId} name="per_wall_area" defaultValue={line.perWallArea} onChange={() => setDirty(true)} className="input w-20 py-1 text-right tabular-nums" inputMode="decimal" />
          </td>
          <td className="px-3 py-1.5 text-right">
            <input form={formId} name="fixed" defaultValue={line.fixed} onChange={() => setDirty(true)} className="input w-20 py-1 text-right tabular-nums" inputMode="decimal" />
          </td>
          <td className="px-3 py-1.5">
            <input form={formId} name="note" defaultValue={line.note ?? ""} onChange={() => setDirty(true)} className="input min-w-40 py-1" />
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2 text-right tabular-nums">{line.factor ? qty(line.factor) : ""}</td>
          <td className="px-3 py-2 text-right tabular-nums">{line.perPerimeter ? qty(line.perPerimeter) : ""}</td>
          <td className="px-3 py-2 text-right tabular-nums">{line.perWallArea ? qty(line.perWallArea) : ""}</td>
          <td className="px-3 py-2 text-right tabular-nums">{line.fixed ? qty(line.fixed) : ""}</td>
          <td className="px-3 py-2 text-xs text-muted">{line.note}</td>
        </>
      )}
      <td className="px-3 py-2 text-right tabular-nums">{qty(line.q)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted">{line.price != null ? money(line.price, currency) : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">{line.total != null ? money(line.total, currency) : "—"}</td>
      {editable && (
        <td className="whitespace-nowrap px-3 py-1.5 text-right">
          <form id={formId} action={run} className="inline">
            <input type="hidden" name="id" value={line.id} />
            {dirty && <button className="btn py-1" disabled={pending}>{pending ? "…" : "Save"}</button>}
          </form>
          <Action action={deleteTemplateLine} fields={{ id: line.id }} label="×" title="Remove from template" />
          {state?.error && <div className="text-xs text-accent">{state.error}</div>}
        </td>
      )}
    </tr>
  );
}

function AddLine({ templateId, options }: { templateId: string; options: PartidaOption[] }) {
  const [state, run, pending] = useActionState(addTemplateLine, null);
  const chapters = [...new Set(options.map((o) => o.chapter))];
  return (
    <form action={run} className="card grid items-end gap-3 p-4 md:grid-cols-[1fr_5rem_5rem_5rem_5rem_1fr_auto]">
      <input type="hidden" name="template_id" value={templateId} />
      <div>
        <label className="label" htmlFor="a-partida">Add partida</label>
        <select id="a-partida" name="partida_id" className="input" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {chapters.map((c) => (
            <optgroup key={c} label={c}>
              {options.filter((o) => o.chapter === c).map((o) => (
                <option key={o.id} value={o.id}>{o.code} · {o.description} ({unitLabel[o.unit] ?? o.unit})</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="a-factor">× size</label>
        <input id="a-factor" name="factor" className="input text-right" defaultValue="0" inputMode="decimal" />
      </div>
      <div>
        <label className="label" htmlFor="a-perim">× perim.</label>
        <input id="a-perim" name="per_perimeter" className="input text-right" defaultValue="0" inputMode="decimal" />
      </div>
      <div>
        <label className="label" htmlFor="a-wall">× walls</label>
        <input id="a-wall" name="per_wall_area" className="input text-right" defaultValue="0" inputMode="decimal" />
      </div>
      <div>
        <label className="label" htmlFor="a-fixed">Fixed</label>
        <input id="a-fixed" name="fixed" className="input text-right" defaultValue="0" inputMode="decimal" />
      </div>
      <div>
        <label className="label" htmlFor="a-note">Note</label>
        <input id="a-note" name="note" className="input" placeholder="e.g. 2.6 m wall height" />
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={pending}>{pending ? "…" : "Add"}</button>
      </div>
      {state?.error && <p className="text-sm text-accent md:col-span-7">{state.error}</p>}
      <p className="text-xs text-muted md:col-span-7">
        Quantity = a × size + b × perimeter + c × wall area + fixed. Flooring: 1 × size. Skirting: 1 × perimeter. Tiling to the ceiling: 1 × wall area;
        to 1.2 m on a 2.6 m wall: 0.46 × wall area. A shower tray: fixed 1.
      </p>
    </form>
  );
}

function Action({ action, fields, label, title, confirm, primary }: {
  action: (p: State, fd: FormData) => Promise<State>; fields: Record<string, string>; label: string; title?: string; confirm?: string; primary?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  const [asking, setAsking] = useState(false);
  return (
    <form action={run} className="relative inline-flex items-center">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {confirm && !asking ? (
        <button type="button" className="btn-quiet py-1" onClick={() => setAsking(true)}>{label}</button>
      ) : (
        <button className={`py-1 ${primary || confirm ? "btn" : "btn-quiet"}`} disabled={pending} title={confirm ?? title} onBlur={() => setAsking(false)} autoFocus={!!confirm}>
          {pending ? "…" : confirm ? `${label}?` : label}
        </button>
      )}
      {confirm && asking && <span className="ml-2 text-xs text-muted">{confirm}</span>}
      {state?.error && <span className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-line bg-surface p-2 text-xs text-accent shadow">{state.error}</span>}
    </form>
  );
}
