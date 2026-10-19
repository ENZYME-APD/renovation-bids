"use client";

import { useActionState, useState } from "react";
import { addRoom } from "./actions";

type Template = { id: string; code: string; name: string; size_label: string; description: string | null };

export function AddRoomForm({ projectId, versionId, templates }: { projectId: string; versionId: string; templates: Template[] }) {
  const [error, action, pending] = useActionState(addRoom.bind(null, projectId, versionId), null);
  const [selected, setSelected] = useState<string>("");
  const tpl = templates.find((t) => t.id === selected);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_1fr_9rem_auto] md:items-end">
      <div>
        <label htmlFor="template_id" className="label">Room type</label>
        <select id="template_id" name="template_id" required className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
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
      <div>
        <label htmlFor="size" className="label">{tpl ? cap(tpl.size_label) : "Size"}</label>
        <input id="size" name="size" required inputMode="decimal" className="input" />
      </div>
      <button type="submit" disabled={pending} className="btn">{pending ? "Adding…" : "Add room"}</button>
      {tpl?.description && <p className="text-xs text-muted md:col-span-4">{tpl.description}</p>}
      {error && <p className="text-sm text-accent md:col-span-4">{error}</p>}
    </form>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
