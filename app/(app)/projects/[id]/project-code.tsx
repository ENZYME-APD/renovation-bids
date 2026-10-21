"use client";

import { useActionState, useEffect, useState } from "react";
import { setProjectCode } from "../actions";

/** The project code, editable in place (automatic PRJ-0001 or the company's own numbering). */
export function ProjectCode({ id, code, canWrite }: { id: string; code: string; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, action, pending] = useActionState(async (prev: string | null, fd: FormData) => {
    const r = await setProjectCode(prev, fd);
    if (!r) setEditing(false);
    return r;
  }, null);
  useEffect(() => { if (!editing) return; document.getElementById("project-code")?.focus(); }, [editing]);

  if (!editing) {
    return (
      <p className="flex items-center gap-2 font-mono text-xs text-muted">
        {code}
        {canWrite && (
          <button type="button" onClick={() => setEditing(true)} className="font-sans text-xs underline-offset-2 hover:text-ink hover:underline">
            Edit code
          </button>
        )}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input id="project-code" name="code" defaultValue={code} maxLength={32} className="input w-40 py-0.5 font-mono text-xs" aria-label="Project code" />
      <button disabled={pending} className="btn px-2 py-0.5 text-xs">{pending ? "Saving…" : "Save"}</button>
      <button type="button" onClick={() => setEditing(false)} className="btn-quiet px-2 py-0.5 text-xs">Cancel</button>
      {error && <span className="text-xs text-accent">{error}</span>}
    </form>
  );
}
