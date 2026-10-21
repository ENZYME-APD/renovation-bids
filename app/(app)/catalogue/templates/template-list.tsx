"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Modal } from "@/components/modal";
import { createTemplate, customiseTemplate, setTemplateActive, type State } from "./actions";

export type TemplateRow = {
  id: string;
  code: string;
  name: string;
  sizeLabel: string;
  description: string | null;
  matchTerms: string[];
  lines: number;
  kind: "standard" | "custom" | "own";
  hidden: boolean;
};

const KIND = { standard: "Standard", custom: "Studio version", own: "Studio" } as const;

export function TemplateList({ rows, canWrite }: { rows: TemplateRow[]; canWrite: boolean }) {
  const [showHidden, setShowHidden] = useState(false);
  const [creating, setCreating] = useState(false);
  const hiddenCount = rows.filter((r) => r.hidden).length;
  const visible = rows.filter((r) => showHidden || !r.hidden);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          {hiddenCount > 0 && (
            <label className="flex items-center gap-2 text-muted">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden ({hiddenCount})
            </label>
          )}
        </div>
        {canWrite && <button className="btn" onClick={() => setCreating(true)}>+ New template</button>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Template</th>
              <th className="px-4 py-2">Size measured in</th>
              <th className="px-4 py-2 text-right">Lines</th>
              <th className="px-4 py-2">Matches rooms named</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className={`border-b border-line last:border-0 hover:bg-paper ${r.hidden ? "opacity-50" : ""}`}>
                <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2">
                  <Link href={`/catalogue/templates/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>
                  <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-muted">{r.hidden ? "Hidden" : KIND[r.kind]}</span>
                  {r.description && <p className="mt-0.5 max-w-xl text-xs text-muted">{r.description}</p>}
                </td>
                <td className="px-4 py-2 text-muted">{r.sizeLabel}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.lines}</td>
                <td className="px-4 py-2 text-xs text-muted">{r.matchTerms.length ? r.matchTerms.join(", ") : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {canWrite && (
                    <span className="inline-flex gap-1">
                      {r.kind === "standard" ? (
                        <RowAction action={customiseTemplate} fields={{ id: r.id }} label="Edit" title="Makes your studio's version of this template" />
                      ) : (
                        <Link href={`/catalogue/templates/${r.id}`} className="btn-quiet py-1">Edit</Link>
                      )}
                      <RowAction action={setTemplateActive} fields={{ id: r.id, active: String(r.hidden) }} label={r.hidden ? "Show" : "Hide"} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New room template">
        <NewTemplateForm />
      </Modal>
    </div>
  );
}

function RowAction({ action, fields, label, title }: { action: (p: State, fd: FormData) => Promise<State>; fields: Record<string, string>; label: string; title?: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="relative inline-flex">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className="btn-quiet py-1" disabled={pending} title={title}>{pending ? "…" : label}</button>
      {state?.error && <span className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-line bg-surface p-2 text-xs text-accent shadow">{state.error}</span>}
    </form>
  );
}

function NewTemplateForm() {
  const [state, run, pending] = useActionState(createTemplate, null);
  return (
    <form action={run} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="t-code">Code</label>
          <input id="t-code" name="code" className="input font-mono uppercase" placeholder="TER" required maxLength={12} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="t-name">Name</label>
          <input id="t-name" name="name" className="input" placeholder="Terraza" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="t-size">Size measured in</label>
        <input id="t-size" name="size_label" className="input" defaultValue="m² de suelo" />
      </div>
      <div>
        <label className="label" htmlFor="t-terms">Matches rooms named (comma-separated)</label>
        <input id="t-terms" name="match_terms" className="input" placeholder="terraza, balcón, terrace" />
        <p className="mt-1 text-xs text-muted">Zone categories or room names from Archicad, other software, a drawing or an AI room list.</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Creating…" : "Create and add lines"}</button>
        {state?.error && <span className="text-sm text-accent">{state.error}</span>}
      </div>
    </form>
  );
}
