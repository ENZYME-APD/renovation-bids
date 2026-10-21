"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { createVersion } from "./actions";
import { MODEL_TOOLS } from "@/lib/model-tools";

type V = { id: string; label: string };

/** "+ New version" button; the form opens in a dialog. On success the action opens the new version. */
export function NewVersionButton({ projectId, versions }: { projectId: string; versions: V[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>+ New version</button>
      <Modal open={open} onClose={() => setOpen(false)} title="New version">
        <NewVersionForm projectId={projectId} versions={versions} onCancel={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Next free letter after the existing labels (A, B → C). */
function nextLabel(versions: V[]) {
  const used = new Set(versions.map((v) => v.label.trim().toUpperCase()));
  for (let c = 65; c <= 90; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
  return "";
}

function NewVersionForm({ projectId, versions, onCancel }: { projectId: string; versions: V[]; onCancel: () => void }) {
  const [error, action, pending] = useActionState(createVersion.bind(null, projectId), null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      <div>
        <label htmlFor="label" className="label">Label</label>
        <input id="label" name="label" required autoFocus className="input" defaultValue={nextLabel(versions)} />
      </div>
      <div>
        <label htmlFor="copy_from" className="label">Start from</label>
        <select id="copy_from" name="copy_from" className="input" defaultValue={versions[versions.length - 1]?.id ?? ""}>
          <option value="">Empty</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>Copy of {v.label}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="description" className="label">What changes</label>
        <input id="description" name="description" className="input" placeholder="Open kitchen, keep bathroom" />
      </div>
      <fieldset className="grid gap-4 border-t border-line pt-4 sm:col-span-2 sm:grid-cols-[12rem_1fr]">
        <legend className="mb-1 text-xs text-muted">Where this option lives (optional)</legend>
        <div>
          <label htmlFor="model_tool" className="label">Source</label>
          <select id="model_tool" name="model_tool" className="input" defaultValue="">
            <option value="">Not set</option>
            {MODEL_TOOLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="model_option" className="label">Design option / file / drawing set</label>
          <input id="model_option" name="model_option" className="input" placeholder="Archicad design option “Open kitchen”" />
        </div>
      </fieldset>
      {error && <p className="text-sm text-accent sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={pending} className="btn">{pending ? "Creating…" : "Create version"}</button>
      </div>
    </form>
  );
}
