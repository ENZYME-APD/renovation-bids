"use client";

import { useActionState, useEffect, useRef } from "react";
import { addLine } from "./actions";

type Group = { trade: string; partidas: { id: string; code: string; description: string; unit: string; price: number | null }[] };

export function AddLineForm({ projectId, versionId, groups, rooms, onDone }: { projectId: string; versionId: string; groups: Group[]; rooms: string[]; onDone: () => void }) {
  const [error, action, pending] = useActionState(addLine.bind(null, projectId, versionId), null);
  useCloseOnSuccess(pending, error, onDone);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="partida_id" className="label">Partida</label>
        <select id="partida_id" name="partida_id" required className="input" defaultValue="" autoFocus>
          <option value="" disabled>Choose…</option>
          {groups.map((g) => (
            <optgroup key={g.trade} label={g.trade}>
              {g.partidas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.description} ({p.unit}){p.price != null ? ` · ${p.price} €` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="quantity" className="label">Quantity</label>
        <input id="quantity" name="quantity" required inputMode="decimal" className="input" />
      </div>
      <div>
        <label htmlFor="unit_price" className="label">Unit price (€)</label>
        <input id="unit_price" name="unit_price" inputMode="decimal" className="input" placeholder="Auto" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="room" className="label">Room (optional)</label>
        <input id="room" name="room" list="add-line-rooms" className="input" placeholder="e.g. Cocina" />
        <datalist id="add-line-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
      </div>
      <p className="text-xs text-muted sm:col-span-2">Leave the price empty to use your best current price for that partida, if there is one.</p>
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button type="submit" disabled={pending} className="btn">{pending ? "Adding…" : "Add line"}</button>
      </div>
    </form>
  );
}

/** Closes the dialog once a submission finishes without an error. */
export function useCloseOnSuccess(pending: boolean, error: string | null, onDone: () => void) {
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending && !error) onDone();
    was.current = pending;
  }, [pending, error, onDone]);
}
