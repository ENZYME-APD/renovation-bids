"use client";

import { useActionState } from "react";
import { createVersion } from "./actions";

export function NewVersionForm({ projectId, versions }: { projectId: string; versions: { id: string; label: string }[] }) {
  const [error, action, pending] = useActionState(createVersion.bind(null, projectId), null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[8rem_1fr_12rem_auto] sm:items-end">
      <div>
        <label htmlFor="label" className="label">Label</label>
        <input id="label" name="label" required className="input" placeholder="B" />
      </div>
      <div>
        <label htmlFor="description" className="label">What changes</label>
        <input id="description" name="description" className="input" placeholder="Open kitchen, keep bathroom" />
      </div>
      <div>
        <label htmlFor="copy_from" className="label">Start from</label>
        <select id="copy_from" name="copy_from" className="input" defaultValue={versions[0]?.id ?? ""}>
          <option value="">Empty</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>Copy of {v.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="btn">{pending ? "Creating…" : "Add version"}</button>
      {error && <p className="text-sm text-accent sm:col-span-4">{error}</p>}
    </form>
  );
}
