"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { deleteProject } from "../actions";

/** Danger zone: delete the project after typing its code. */
export function DeleteProject({ id, code, name }: { id: string; code: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, action, pending] = useActionState(deleteProject, null);
  return (
    <>
      <button type="button" className="btn-quiet text-muted hover:text-accent" onClick={() => setOpen(true)}>Delete project…</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Delete ${code}?`}>
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
            <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={pending}>{pending ? "Deleting…" : "Delete project"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
