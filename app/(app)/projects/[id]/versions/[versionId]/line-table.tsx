"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { humanize, money2 } from "@/lib/format";
import { Constants } from "@/lib/database.types";
import { ExportMenu } from "@/components/export-menu";
import { batchDeleteLines, batchUpdateLines, deleteLine, undoBatch, updateLine, type BatchPatch, type BatchState } from "./actions";

export type Line = {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number | null;
  confidence: string | null;
  state: string;
  total: number | null;
  notes: string | null;
  room: string | null;
  chapter: string;
  suggested: number | null;
  updatedAt: string;
  source: string;
  overridden: boolean;
};

const SOURCE: Record<string, string> = {
  template: "from template", model_zone: "from model zone", model_element: "from model", ai_assumption: "AI assumption", import: "imported",
};
export type Group = { key: string; name: string; lines: Line[] };

/** What's missing on a line, for the quick audit. Rooms only count once the budget uses them. */
function issuesOf(l: Line, usesRooms: boolean): string[] {
  const out: string[] = [];
  if (l.unitPrice == null) out.push("no price");
  if (!(l.quantity > 0)) out.push("no quantity");
  if (l.unitPrice != null && !l.confidence) out.push("no confidence");
  if (l.state === "needs_rfq") out.push("needs quote");
  if (usesRooms && !l.room) out.push("no room");
  return out;
}

export function LineTable({
  projectId, versionId, groups, groupBy, rooms, canWrite, initialAudit = false,
}: { projectId: string; versionId: string; groups: Group[]; groupBy: "chapter" | "room"; rooms: string[]; canWrite: boolean; initialAudit?: boolean }) {
  const allIds = useMemo(() => groups.flatMap((g) => g.lines.map((l) => l.id)), [groups]);
  const [picked, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<BatchState>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [auditOnly, setAuditOnly] = useState(initialAudit);
  const usesRooms = useMemo(() => groups.some((g) => g.lines.some((l) => l.room)), [groups]);
  const issueCount = useMemo(() => groups.reduce((t, g) => t + g.lines.filter((l) => issuesOf(l, usesRooms).length).length, 0), [groups, usesRooms]);
  const shown = useMemo(
    () => (auditOnly ? groups.map((g) => ({ ...g, lines: g.lines.filter((l) => issuesOf(l, usesRooms).length) })).filter((g) => g.lines.length) : groups),
    [groups, auditOnly, usesRooms],
  );
  const allCollapsed = shown.length > 0 && shown.every((g) => collapsed.has(g.key));
  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [pending, start] = useTransition();
  // Only ids still on the page count (lines can disappear after a delete or an undo).
  const selected = useMemo(() => new Set(allIds.filter((id) => picked.has(id))), [allIds, picked]);

  const toggle = (ids: string[], on: boolean) =>
    setSelected(() => {
      const next = new Set(selected);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const run = (fn: () => Promise<BatchState>, clear = false) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r?.ok && clear) setSelected(new Set());
    });
  const ids = [...selected];
  const apply = (patch: BatchPatch) => run(() => batchUpdateLines(projectId, versionId, ids, patch));

  const hidden = (
    <>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="version_id" value={versionId} />
    </>
  );

  return (
    <div className="space-y-4">
      {allIds.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-muted">
          {canWrite && (
            <>
              <Check
                checked={selected.size === allIds.length}
                indeterminate={selected.size > 0 && selected.size < allIds.length}
                onChange={(on) => toggle(allIds, on)}
                label="Select all lines"
              />
              <span>{selected.size ? `${selected.size} of ${allIds.length} selected` : "Select lines to edit them together"}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              onClick={() => setAuditOnly((v) => !v)}
              aria-pressed={auditOnly}
              className={auditOnly ? "font-medium text-accent" : "hover:text-ink"}
              title="Lines without a price, quantity or confidence, needing a quote, or without a room"
            >
              {auditOnly ? `Showing ${issueCount} incomplete · Show all` : `Incomplete only (${issueCount})`}
            </button>
            <button type="button" className="hover:text-ink" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(shown.map((g) => g.key)))}>
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
            <ExportMenu href={`/projects/${projectId}/versions/${versionId}/export`} />
          </div>
        </div>
      )}
      {auditOnly && issueCount === 0 && <p className="text-sm text-ok">Nothing missing: every line has a quantity, price and confidence.</p>}

      {shown.map((g) => {
        const gIds = g.lines.map((l) => l.id);
        const nSel = gIds.filter((id) => selected.has(id)).length;
        const subtotal = g.lines.reduce((t, l) => t + Number(l.total ?? 0), 0);
        const open = !collapsed.has(g.key);
        return (
          <div key={g.key} className="card overflow-x-auto">
            <div className={`flex items-center justify-between gap-3 border-l-4 border-l-accent bg-accent-soft px-4 py-3 ${open ? "border-b border-b-line" : ""}`}>
              <div className="flex items-center gap-3 text-base font-semibold tracking-tight">
                {canWrite && (
                  <Check checked={nSel === gIds.length} indeterminate={nSel > 0 && nSel < gIds.length} onChange={(on) => toggle(gIds, on)} label={`Select all in ${g.name}`} />
                )}
                <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={open} className="flex items-center gap-2 text-left hover:text-accent">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>
                    <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {g.name}
                </button>
                <span className="text-sm font-normal text-muted">
                  · {g.lines.length} {g.lines.length === 1 ? "line" : "lines"}
                  {nSel > 0 && !open && ` · ${nSel} selected`}
                </span>
              </div>
              <span className="text-base font-semibold tabular-nums">{money2(subtotal)}</span>
            </div>
            {open && (
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  {canWrite && <th className="w-10 px-4 py-2" />}
                  <th className="px-2 py-2 font-medium">Partida</th>
                  <th className="w-28 px-2 py-2 font-medium">Qty</th>
                  <th className="w-28 px-2 py-2 font-medium">Unit price</th>
                  <th className="w-28 px-2 py-2 font-medium">Confidence</th>
                  <th className="w-32 px-2 py-2 font-medium">State</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                  {canWrite && <th className="w-36 px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => {
                  const fid = `line-${l.id}`;
                  const sel = selected.has(l.id);
                  const context = groupBy === "room" ? l.chapter : l.room;
                  return (
                    // Keyed by updatedAt so inputs remount with saved values after each save.
                    <tr key={`${l.id}-${l.updatedAt}`} className={`border-b border-line align-top last:border-0 ${sel ? "bg-accent-soft/60" : ""}`}>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <Check checked={sel} onChange={(on) => toggle([l.id], on)} label={`Select ${l.code}`} />
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <span className="font-mono text-xs text-accent">{l.code}</span>
                        {l.source !== "manual" && (
                          <span
                            className="ml-2 text-[0.65rem] text-muted"
                            title={l.overridden ? "Edited by hand: model or template syncs leave this line alone" : "Generated: a re-sync can update its quantity"}
                          >
                            {SOURCE[l.source] ?? l.source}{l.overridden ? " · edited" : ""}
                          </span>
                        )}
                        <div className="text-[0.95rem] font-medium leading-snug">{l.description}</div>
                        {context && <div className="text-xs text-muted">{context}</div>}
                        {auditOnly && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {issuesOf(l, usesRooms).map((x) => <span key={x} className="rounded-full border border-accent px-1.5 text-[0.65rem] text-accent">{x}</span>)}
                          </div>
                        )}
                        {l.notes && <div className="text-xs text-muted italic">{l.notes}</div>}
                        {l.unitPrice == null && l.suggested != null && <div className="text-xs text-ok">Current price: {money2(l.suggested)}</div>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <input form={fid} name="quantity" defaultValue={l.quantity} inputMode="decimal" className="input px-2 py-1" disabled={!canWrite} />
                          <span className="text-xs text-muted">{l.unit}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input form={fid} name="unit_price" defaultValue={l.unitPrice ?? ""} inputMode="decimal" className="input px-2 py-1" placeholder="—" disabled={!canWrite} />
                      </td>
                      <td className="px-2 py-2">
                        <select form={fid} name="confidence" defaultValue={l.confidence ?? ""} className="input px-2 py-1" disabled={!canWrite}>
                          <option value="">—</option>
                          {Constants.public.Enums.confidence.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select form={fid} name="state" defaultValue={l.state} className="input px-2 py-1" disabled={!canWrite}>
                          {Constants.public.Enums.line_state.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{money2(l.total)}</td>
                      {canWrite && (
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2">
                            <form id={fid} action={updateLine}>
                              {hidden}
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="orig_price" value={l.unitPrice ?? ""} />
                              <button className="btn-quiet">Save</button>
                            </form>
                            <form action={deleteLine}>
                              {hidden}
                              <input type="hidden" name="id" value={l.id} />
                              <button className="btn-quiet text-muted" aria-label={`Delete ${l.code}`}>Delete</button>
                            </form>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
        );
      })}

      {canWrite && (selected.size > 0 || result) && (
        <BatchBar
          count={selected.size}
          rooms={rooms}
          pending={pending}
          result={result}
          onDismiss={() => setResult(null)}
          onClear={() => setSelected(new Set())}
          onApply={apply}
          onDelete={() => run(() => batchDeleteLines(projectId, versionId, ids), true)}
          onUndo={(changeId) => run(() => undoBatch(projectId, versionId, changeId))}
        />
      )}
    </div>
  );
}

function BatchBar({
  count, rooms, pending, result, onDismiss, onClear, onApply, onDelete, onUndo,
}: {
  count: number; rooms: string[]; pending: boolean; result: BatchState;
  onDismiss: () => void; onClear: () => void; onApply: (p: BatchPatch) => void; onDelete: () => void; onUndo: (changeId: string) => void;
}) {
  const [room, setRoom] = useState("");
  const [price, setPrice] = useState("");
  const [factor, setFactor] = useState("");
  // Asking to confirm applies to the current selection only.
  const [confirmFor, setConfirmFor] = useState<number | null>(null);
  const confirmDelete = confirmFor === count;
  const setConfirmDelete = (on: boolean) => setConfirmFor(on ? count : null);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  return (
    <div className="sticky bottom-4 z-10">
      <div className="card space-y-3 p-3 shadow-lg">
        {result && (
          <div className="flex items-center gap-3 text-sm">
            <span className={result.error ? "text-accent" : "text-ok"}>{result.error ?? result.ok}</span>
            {result.changeId && (
              <button className="btn-quiet py-1" disabled={pending} onClick={() => onUndo(result.changeId!)}>Undo</button>
            )}
            <button className="ml-auto text-muted hover:text-ink" onClick={onDismiss} aria-label="Dismiss">×</button>
          </div>
        )}
        {count > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 font-medium">{count} selected</span>
            <select className="input w-auto py-1" value="" disabled={pending} onChange={(e) => e.target.value && onApply({ state: e.target.value as BatchPatch["state"] })} aria-label="Set state">
              <option value="">State…</option>
              {Constants.public.Enums.line_state.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
            <select className="input w-auto py-1" value="-" disabled={pending} onChange={(e) => e.target.value !== "-" && onApply({ confidence: e.target.value as BatchPatch["confidence"] })} aria-label="Set confidence">
              <option value="-">Confidence…</option>
              <option value="">None</option>
              {Constants.public.Enums.confidence.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
            <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onApply({ room }); }}>
              <input className="input w-36 py-1" list="batch-rooms" placeholder="Room" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room" />
              <datalist id="batch-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
              <button className="btn-quiet py-1" disabled={pending}>{room.trim() ? "Move" : "Clear room"}</button>
            </form>
            <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = num(price); if (v === null || v >= 0) onApply({ unitPrice: v }); }}>
              <input className="input w-24 py-1" inputMode="decimal" placeholder="Unit price" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Unit price" />
              <button className="btn-quiet py-1" disabled={pending}>{price.trim() ? "Set price" : "Clear price"}</button>
            </form>
            <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = num(factor); if (v && v > 0) onApply({ quantityFactor: v }); }}>
              <input className="input w-20 py-1" inputMode="decimal" placeholder="× 1.1" value={factor} onChange={(e) => setFactor(e.target.value)} aria-label="Multiply quantities by" />
              <button className="btn-quiet py-1" disabled={pending || !factor.trim()}>Multiply qty</button>
            </form>
            <div className="ml-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <button className="btn py-1" disabled={pending} onClick={onDelete}>Delete {count}</button>
                  <button className="btn-quiet py-1" onClick={() => setConfirmDelete(false)}>Keep</button>
                </>
              ) : (
                <button className="btn-quiet py-1 text-accent" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete…</button>
              )}
              <button className="btn-quiet py-1" onClick={onClear}>Clear selection</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Check({ checked, indeterminate = false, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="size-4 cursor-pointer accent-[var(--accent)]"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
    />
  );
}
