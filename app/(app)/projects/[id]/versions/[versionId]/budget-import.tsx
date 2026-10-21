"use client";

import { ImportDialog } from "@/components/import-dialog";
import { importBudget, type ImportPreview } from "./import-actions";

const eur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);

export function BudgetImport({ projectId, versionId }: { projectId: string; versionId: string }) {
  return (
    <ImportDialog
      action={importBudget.bind(null, projectId, versionId)}
      title="Import budget lines"
      applyLabel="Import"
      intro={
        <>
          <p>
            Accepts this budget&apos;s own <b>Export</b> (Excel, CSV or JSON) edited elsewhere: rows with an ID update their line, rows without
            add lines. Also reads a studio <b>PRESUPUESTO / MEDICIONES</b> workbook (Código, Título, Descripción, Cant., Precio, Imp. Constructora,
            Imp. Propiedad, Notas, Medición).
          </p>
          <p className="mt-1">Codes not in the catalogue become studio partidas. Nothing changes until you press Import, and the whole import undoes as one change.</p>
        </>
      }
      options={(o, set) => (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!o.delete_missing} onChange={(e) => set("delete_missing", e.target.checked)} />
          Delete lines of this version that are not in the file
        </label>
      )}
      renderPreview={(p: ImportPreview) => <BudgetImportPreview p={p} />}
      renderDone={(d: { added: number; updated: number; deleted: number; new_partidas: number; measurements: number }) => (
        <p className="text-ok">
          Done: {d.added} added, {d.updated} updated{d.deleted ? `, ${d.deleted} deleted` : ""}, {d.new_partidas} new partidas, {d.measurements} measurement lines.
          Undo it in Settings → Activity if needed.
        </p>
      )}
    />
  );
}

export function BudgetImportPreview({ p }: { p: ImportPreview }) {
  return (

        <div className="space-y-3">
          <p>
            <b>{p.lines}</b> lines ({p.format === "presupuesto" ? "PRESUPUESTO workbook" : p.format}): {p.additions} new, {p.updates} updated
            {p.deleting ? <>, <b className="text-accent">{p.deleting} deleted</b></> : null}. {p.measured} with measurement lines.
            {p.newCodes.length > 0 && <> {p.newCodes.length} new partidas for the studio catalogue.</>}
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line"><th className="px-3 py-1.5">Chapter (file)</th><th className="px-3 py-1.5 text-right">In the file</th><th className="px-3 py-1.5 text-right">Imported</th><th className="px-3 py-1.5" /></tr>
              </thead>
              <tbody>
                {p.chapters.map((c) => (
                  <tr key={c.name} className="border-b border-line last:border-0">
                    <td className="px-3 py-1">{c.name}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{c.file == null ? "—" : eur(c.file)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{eur(c.imported)}</td>
                    <td className="px-3 py-1">{c.file == null ? "" : Math.abs(c.file - c.imported) < 0.01 ? <span className="text-ok">✓</span> : <span className="text-accent">≠</span>}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-3 py-1.5">Contractor total</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.fileTotal == null ? "—" : eur(p.fileTotal)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{eur(p.contractorTotal)}</td>
                  <td className="px-3 py-1.5">{p.fileTotal == null ? "" : Math.abs(p.fileTotal - p.contractorTotal) < 0.01 ? <span className="text-ok">✓</span> : <span className="text-accent">≠</span>}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {p.clientTotal > 0 && <p className="text-muted">Bought by the client (not in the contract): {eur(p.clientTotal)}.</p>}
          {p.generalNotes && <p className="text-muted">General notes found: saved with the version.</p>}
          {p.newCodes.length > 0 && <p className="text-xs text-muted">New codes: {p.newCodes.slice(0, 40).join(", ")}{p.newCodes.length > 40 ? "…" : ""}</p>}
          {p.warnings.map((w) => <p key={w} className="text-warn">{w}</p>)}
          {p.skipped.map((w) => <p key={w} className="text-muted">Skipped: {w}</p>)}
        </div>
  );
}
