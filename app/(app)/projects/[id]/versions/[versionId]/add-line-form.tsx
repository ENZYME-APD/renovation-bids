"use client";

import { useActionState } from "react";
import { addLine } from "./actions";

type Group = { trade: string; partidas: { id: string; code: string; description: string; unit: string; price: number | null }[] };

export function AddLineForm({ projectId, versionId, groups }: { projectId: string; versionId: string; groups: Group[] }) {
  // React resets the form after each submission.
  const [error, action, pending] = useActionState(addLine.bind(null, projectId, versionId), null);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_8rem_9rem_auto] md:items-end">
      <div>
        <label htmlFor="partida_id" className="label">Partida</label>
        <select id="partida_id" name="partida_id" required className="input" defaultValue="">
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
      <button type="submit" disabled={pending} className="btn">{pending ? "Adding…" : "Add line"}</button>
      {error && <p className="text-sm text-accent md:col-span-4">{error}</p>}
      <p className="text-xs text-muted md:col-span-4">
        Leave the price empty to use your best current price for that partida, if there is one.
      </p>
    </form>
  );
}
