"use client";

import { useActionState } from "react";
import { deleteProject } from "../actions";

/** Delete confirmation: the project goes only after its code is typed. Shown inside the Edit details dialog. */
export function DeleteProjectForm({ id, code, name, onCancel }: { id: string; code: string; name: string; onCancel: () => void }) {
  const [error, action, pending] = useActionState(deleteProject, null);
  return (
    <form action={action} className="space-y-4 text-sm">
      <input type="hidden" name="id" value={id} />
      <p>
        This deletes <b>{name}</b> with all its versions, rooms, lines, change orders, client requests, purchases, invoices and payments.
        You can bring it back from <b>Settings → Activity</b> (Undo).
      </p>
      <div>
        <label className="label" htmlFor="confirm-code">Type <span className="font-mono">{code}</span> to confirm</label>
        <input id="confirm-code" name="confirm" className="input font-mono" autoComplete="off" autoFocus />
      </div>
      {error && <p className="text-accent">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>Back</button>
        <button className="btn" disabled={pending}>{pending ? "Deleting…" : "Delete project"}</button>
      </div>
    </form>
  );
}
