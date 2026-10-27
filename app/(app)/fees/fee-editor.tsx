"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { applyDefaultFees, deleteFee, saveFee } from "./actions";

export type Fee = {
  id: string;
  label: string;
  basis: "lump_sum" | "percent" | "monthly";
  amount: number | null;
  percent: number | null;
  months: number | null;
  phase: string | null;
  notes: string | null;
  sequence: number;
  total?: number | null; // project fees only
};

const BASIS_LABEL = { lump_sum: "Fixed amount", percent: "% of construction", monthly: "Monthly" } as const;
const PHASE_LABEL: Record<string, string> = { bid: "Bid", design: "Design", construction: "Construction", closed: "Closed" };

/** How a fee is worked out, in words: "2000 €/month × 5 months", "8 % of construction". */
export function feeRule(f: Fee, fmt: Intl.NumberFormat) {
  if (f.basis === "lump_sum") return "Fixed amount";
  if (f.basis === "percent") return `${Number(f.percent).toLocaleString("es-ES")} % of construction`;
  return `${fmt.format(Number(f.amount ?? 0))}/month × ${f.months == null ? "? months" : `${Number(f.months).toLocaleString("es-ES")} months`}`;
}

/** List of fee items with add / edit / delete. Used for a project's fees and for the studio defaults. */
export function FeeEditor({ fees, projectId, canWrite, currency, hasDefaults }: {
  fees: Fee[];
  projectId: string | null;
  canWrite: boolean;
  currency: string;
  hasDefaults?: boolean;
}) {
  const [editing, setEditing] = useState<Fee | "new" | null>(null);
  const [pending, start] = useTransition();
  const fmt = new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 0 });
  const isProject = projectId != null;

  return (
    <div className="space-y-3">
      {fees.length === 0 ? (
        <p className="text-sm text-muted">
          {isProject ? "No fees yet." : "No default fees. Add your usual ones, e.g. a fixed project fee and monthly site supervision."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-medium">Fee</th>
                <th className="py-2 pr-4 font-medium">How it is charged</th>
                <th className="py-2 pr-4 font-medium">Phase</th>
                <th className="py-2 pr-4 text-right font-medium">{isProject ? "Amount" : "Rate"}</th>
                {canWrite && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{f.label}</div>
                    {f.notes && <div className="text-xs text-muted">{f.notes}</div>}
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {feeRule(f, fmt)}
                    {isProject && f.basis === "monthly" && f.months == null && <span className="ml-2 text-xs text-accent">set the months</span>}
                  </td>
                  <td className="py-2 pr-4 text-muted">{f.phase ? PHASE_LABEL[f.phase] : "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {isProject
                      ? fmt.format(Number(f.total ?? 0))
                      : f.basis === "percent" ? `${Number(f.percent).toLocaleString("es-ES")} %` : `${fmt.format(Number(f.amount ?? 0))}${f.basis === "monthly" ? "/month" : ""}`}
                  </td>
                  {canWrite && (
                    <td className="whitespace-nowrap py-2 text-right">
                      <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setEditing(f)}>Edit</button>
                      <button
                        type="button"
                        className="ml-3 text-xs text-muted hover:text-accent"
                        disabled={pending}
                        onClick={() => { if (confirm(`Remove “${f.label}”?`)) start(() => deleteFee(f.id, projectId)); }}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-quiet" onClick={() => setEditing("new")}>+ Add fee</button>
          {isProject && hasDefaults && (
            <button type="button" className="btn-quiet" disabled={pending} onClick={() => start(() => applyDefaultFees(projectId))}>
              Add studio default fees
            </button>
          )}
        </div>
      )}
      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing === "new" ? "Add fee" : "Edit fee"}>
        {editing != null && (
          <FeeForm
            key={editing === "new" ? "new" : editing.id}
            fee={editing === "new" ? null : editing}
            projectId={projectId}
            sequence={fees.length + 1}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function FeeForm({ fee, projectId, sequence, onDone }: { fee: Fee | null; projectId: string | null; sequence: number; onDone: () => void }) {
  const [basis, setBasis] = useState<Fee["basis"]>(fee?.basis ?? "lump_sum");
  const [error, action, pending] = useActionState(saveFee, null);
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current && !pending && error == null) onDone();
    if (pending) submitted.current = true;
  }, [pending, error, onDone]);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={fee?.id ?? ""} />
      <input type="hidden" name="project_id" value={projectId ?? ""} />
      <input type="hidden" name="sequence" value={fee?.sequence ?? sequence} />
      <div className="sm:col-span-2">
        <label htmlFor="fee-label" className="label">Fee</label>
        <input id="fee-label" name="label" required autoFocus className="input" defaultValue={fee?.label ?? ""} placeholder="Proyecto básico y de ejecución" />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">How it is charged</legend>
        <div className="flex flex-wrap gap-1 rounded-lg border border-line p-0.5 text-sm">
          {(Object.keys(BASIS_LABEL) as Fee["basis"][]).map((b) => (
            <label key={b} className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center ${basis === b ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"}`}>
              <input type="radio" name="basis" value={b} checked={basis === b} onChange={() => setBasis(b)} className="sr-only" />
              {BASIS_LABEL[b]}
            </label>
          ))}
        </div>
      </fieldset>
      {basis === "percent" ? (
        <div>
          <label htmlFor="fee-percent" className="label">% of the construction budget</label>
          <input id="fee-percent" name="percent" inputMode="decimal" required className="input" defaultValue={fee?.percent ?? ""} placeholder="8" />
          <p className="mt-1 text-xs text-muted">Applied to the contract (or main version) plus approved changes, before VAT.</p>
        </div>
      ) : (
        <div>
          <label htmlFor="fee-amount" className="label">{basis === "monthly" ? "Amount per month (€)" : "Amount (€)"}</label>
          <input id="fee-amount" name="amount" inputMode="decimal" required className="input" defaultValue={fee?.amount ?? ""} placeholder={basis === "monthly" ? "2000" : "4000"} />
        </div>
      )}
      {basis === "monthly" && (
        <div>
          <label htmlFor="fee-months" className="label">Months</label>
          <input id="fee-months" name="months" inputMode="decimal" className="input" defaultValue={fee?.months ?? ""} placeholder={projectId ? "Expected duration" : "Leave empty: set per project"} />
        </div>
      )}
      <div>
        <label htmlFor="fee-phase" className="label">Earned in</label>
        <select id="fee-phase" name="phase" className="input" defaultValue={fee?.phase ?? ""}>
          <option value="">—</option>
          <option value="design">Design</option>
          <option value="construction">Construction</option>
          <option value="bid">Bid</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="fee-notes" className="label">Notes</label>
        <input id="fee-notes" name="notes" className="input" defaultValue={fee?.notes ?? ""} placeholder="Hitos de pago, qué incluye…" />
      </div>
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button type="submit" disabled={pending} className="btn">{pending ? "Saving…" : "Save fee"}</button>
      </div>
    </form>
  );
}
