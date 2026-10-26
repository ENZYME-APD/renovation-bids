"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { updateProjectDetails } from "../actions";
import { DeleteProjectForm } from "./delete-project";

export type EditableProject = {
  id: string; code: string; name: string; client: string | null; district: string | null; address: string | null;
  area: number | null; year: number | null; budget: number | null; roomHeight: number | null;
};

/** "Edit details" button: every project field in one dialog. */
export function EditProjectButton({ project, defaultRoomHeight, canDelete }: { project: EditableProject; defaultRoomHeight: number; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const close = () => { setOpen(false); setDeleting(false); };
  return (
    <>
      <button type="button" className="btn-quiet px-2.5 py-1 text-xs" onClick={() => setOpen(true)}>Edit details</button>
      <Modal open={open} onClose={close} title={deleting ? `Delete ${project.code}?` : "Project details"} wide={!deleting}>
        {open && (deleting
          ? <DeleteProjectForm id={project.id} code={project.code} name={project.name} onCancel={() => setDeleting(false)} />
          : <EditForm project={project} defaultRoomHeight={defaultRoomHeight} onDone={close} onDelete={canDelete ? () => setDeleting(true) : undefined} />)}
      </Modal>
    </>
  );
}

function EditForm({ project: p, defaultRoomHeight, onDone, onDelete }: {
  project: EditableProject; defaultRoomHeight: number; onDone: () => void; onDelete?: () => void;
}) {
  const [error, action, pending] = useActionState(updateProjectDetails, null);
  const sent = useRef(false);
  useEffect(() => {
    if (pending) sent.current = true;
    else if (sent.current && error == null) onDone();
  }, [pending, error, onDone]);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={p.id} />
      <div className="grid gap-4 sm:col-span-2 sm:grid-cols-[11rem_1fr]">
        <div>
          <label htmlFor="ep-code" className="label">Project code</label>
          <input id="ep-code" name="code" required maxLength={32} className="input font-mono" defaultValue={p.code} />
        </div>
        <div>
          <label htmlFor="ep-name" className="label">Project name</label>
          <input id="ep-name" name="name" required autoFocus className="input" defaultValue={p.name} />
        </div>
      </div>
      <div>
        <label htmlFor="ep-client" className="label">Client</label>
        <input id="ep-client" name="client" className="input" defaultValue={p.client ?? ""} />
      </div>
      <div>
        <label htmlFor="ep-district" className="label">District</label>
        <input id="ep-district" name="district" className="input" defaultValue={p.district ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="ep-address" className="label">Address</label>
        <input id="ep-address" name="address" className="input" defaultValue={p.address ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-4">
        <div>
          <label htmlFor="ep-area" className="label">Area (m²)</label>
          <input id="ep-area" name="area" inputMode="decimal" className="input" defaultValue={p.area ?? ""} />
        </div>
        <div>
          <label htmlFor="ep-year" className="label">Year built</label>
          <input id="ep-year" name="year" inputMode="numeric" className="input" defaultValue={p.year ?? ""} />
        </div>
        <div>
          <label htmlFor="ep-budget" className="label">Client budget (€)</label>
          <input id="ep-budget" name="budget" inputMode="decimal" className="input" defaultValue={p.budget ?? ""} />
        </div>
        <div>
          <label htmlFor="ep-height" className="label">Room height (m)</label>
          <input id="ep-height" name="room_height" inputMode="decimal" className="input" defaultValue={p.roomHeight ?? ""} placeholder={`${defaultRoomHeight.toFixed(2)} studio`} />
        </div>
      </div>
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        {onDelete && (
          <button type="button" className="mr-auto text-sm text-muted hover:text-accent" onClick={onDelete}>Delete project…</button>
        )}
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button type="submit" disabled={pending} className="btn">{pending ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  );
}
