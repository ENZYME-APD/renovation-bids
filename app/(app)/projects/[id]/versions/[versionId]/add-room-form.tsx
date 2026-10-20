"use client";

import { useActionState, useState } from "react";
import { addRoom } from "./actions";
import { useCloseOnSuccess } from "./add-line-form";

type Template = { id: string; code: string; name: string; size_label: string; description: string | null };

export function AddRoomForm({ projectId, versionId, templates, onDone }: { projectId: string; versionId: string; templates: Template[]; onDone: () => void }) {
  const [error, action, pending] = useActionState(addRoom.bind(null, projectId, versionId), null);
  useCloseOnSuccess(pending, error, onDone);
  const [selected, setSelected] = useState<string>("");
  const tpl = templates.find((t) => t.id === selected);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <p className="text-sm text-muted sm:col-span-2">Fills in the standard items for that room type, sized by its area. Layout and design items (partitions, wardrobes, heating, air conditioning) are added as single lines.</p>
      <div>
        <label htmlFor="template_id" className="label">Room type</label>
        <select id="template_id" name="template_id" required autoFocus className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="" disabled>Choose…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="label" className="label">Name in the budget</label>
        <input id="label" name="label" className="input" placeholder={tpl?.name ?? "e.g. Bedroom 2"} />
      </div>
      <div className="sm:col-span-2 sm:w-1/2">
        <label htmlFor="size" className="label">{tpl ? cap(tpl.size_label) : "Size"}</label>
        <input id="size" name="size" required inputMode="decimal" className="input" />
      </div>
      {tpl?.description && <p className="text-xs text-muted sm:col-span-2">{tpl.description}</p>}
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button type="submit" disabled={pending} className="btn">{pending ? "Adding…" : "Add room"}</button>
      </div>
    </form>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
