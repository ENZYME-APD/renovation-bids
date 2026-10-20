"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { createProject } from "./actions";

/** "+ New project" button that opens the form in a dialog. On success the action opens the new project. */
export function NewProjectButton({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>+ New project</button>
      <Modal open={open} onClose={() => setOpen(false)} title="New project" wide>
        <NewProjectForm onCancel={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const [error, action, pending] = useActionState(createProject, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="name" className="label">Project name</label>
        <input id="name" name="name" required autoFocus className="input" placeholder="Piso Chamberí, 3º B" />
      </div>
      <div>
        <label htmlFor="client" className="label">Client</label>
        <input id="client" name="client" className="input" placeholder="Name of the owner" />
      </div>
      <div>
        <label htmlFor="district" className="label">District</label>
        <input id="district" name="district" className="input" placeholder="Chamberí" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="address" className="label">Address</label>
        <input id="address" name="address" className="input" />
      </div>
      <div>
        <label htmlFor="area" className="label">Area (m²)</label>
        <input id="area" name="area" inputMode="decimal" className="input" />
      </div>
      <div>
        <label htmlFor="year" className="label">Year built</label>
        <input id="year" name="year" inputMode="numeric" className="input" placeholder="1965" />
      </div>
      <div>
        <label htmlFor="budget" className="label">Client’s stated budget (€)</label>
        <input id="budget" name="budget" inputMode="decimal" className="input" />
      </div>
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={pending} className="btn">{pending ? "Creating…" : "Create project"}</button>
      </div>
    </form>
  );
}
