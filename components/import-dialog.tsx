"use client";

import { useActionState, useState, startTransition, type ReactNode } from "react";
import { Modal } from "@/components/modal";

type Base = { error: string } | { preview: unknown } | { done: unknown } | null;

/** Import button + dialog: pick a file, preview what will change, then import. The file is kept between steps. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function ImportDialog({
  action, title, intro, renderPreview, renderDone, options, applyLabel,
}: {
  action: (prev: any, fd: FormData) => Promise<any>;
  title: string;
  intro: ReactNode;
  renderPreview: (p: any) => ReactNode;
  renderDone: (d: any) => ReactNode;
  options?: (opts: Record<string, boolean>, set: (k: string, v: boolean) => void) => ReactNode;
  applyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<Record<string, boolean>>({});
  const [state, run, pending] = useActionState<Base, FormData>(action, null);
  const view = file ? state : null;

  const send = (mode: "preview" | "apply", o = opts, f = file) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    fd.set("mode", mode);
    for (const [k, v] of Object.entries(o)) if (v) fd.set(k, "on");
    startTransition(() => run(fd));
  };
  const close = () => { setOpen(false); setFile(null); };

  return (
    <>
      <button type="button" className="btn-quiet py-1 text-sm" onClick={() => setOpen(true)}>Import</button>
      <Modal open={open} onClose={close} title={title} wide>
        <div className="space-y-4 text-sm">
          <div className="text-muted">{intro}</div>
          <input
            type="file"
            accept=".xlsx,.csv,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) send("preview", opts, f);
            }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-ink"
          />
          {options?.(opts, (k, v) => { const o = { ...opts, [k]: v }; setOpts(o); if (file) send("preview", o); })}
          {pending && <p className="text-muted">Reading…</p>}
          {view && "error" in view && <p className="text-accent">{view.error}</p>}
          {view && "preview" in view && (
            <>
              {renderPreview(view.preview)}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-quiet" onClick={close}>Cancel</button>
                <button type="button" className="btn" disabled={pending} onClick={() => send("apply")}>{applyLabel}</button>
              </div>
            </>
          )}
          {view && "done" in view && (
            <>
              {renderDone(view.done)}
              <div className="flex justify-end"><button type="button" className="btn" onClick={close}>Close</button></div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
