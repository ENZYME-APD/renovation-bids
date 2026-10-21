"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { ExportMenu } from "@/components/export-menu";
import { humanize, unitLabel } from "@/lib/format";
import { customise, deletePartida, deletePrice, savePartida, setActive, setPrice, type State } from "./actions";

export type PriceEntry = {
  id: string; unitPrice: number; source: string; confidence: string; pricedOn: string; validUntil: string | null; notes: string | null; own: boolean;
};
export type Item = {
  id: string; code: string; description: string; longDescription: string | null; unit: string; tradeId: string; referenceCode: string | null;
  kind: "standard" | "custom" | "own"; hidden: boolean;
  price: { unitPrice: number; source: string; confidence: string; pricedOn: string; own: boolean } | null;
  history: PriceEntry[];
};
export type Chapter = { id: string; code: string | null; name: string };

const UNITS = ["m2", "m", "m3", "ud", "kg", "h", "pa"];
const KIND: Record<Item["kind"], string> = { standard: "Standard", custom: "Customised", own: "Studio" };

export function CatalogueTable({ items, chapters, currency, canWrite, spread }: { items: Item[]; chapters: Chapter[]; currency: string; canWrite: boolean; spread: Record<string, number> }) {
  const [q, setQ] = useState("");
  const [chapter, setChapter] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const hiddenCount = items.filter((i) => i.hidden).length;
  const unpricedCount = items.filter((i) => !i.hidden && !i.price).length;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ type: "price" | "edit" | "new"; item?: Item } | null>(null);
  const fmt = useMemo(() => new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: 2 }), [currency]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return chapters
      .filter((c) => !chapter || c.id === chapter)
      .map((c) => ({
        chapter: c,
        items: items.filter(
          (i) =>
            i.tradeId === c.id &&
            (showHidden || !i.hidden) &&
            (!unpricedOnly || !i.price) &&
            (!needle || i.code.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle)),
        ),
      }))
      .filter((g) => g.items.length);
  }, [items, chapters, q, chapter, showHidden, unpricedOnly]);

  const total = groups.reduce((t, g) => t + g.items.length, 0);
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.chapter.id));
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const current = modal?.item ? items.find((i) => i.id === modal.item!.id) ?? modal.item : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-64" placeholder="Search code or description" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="input w-auto" value={chapter} onChange={(e) => setChapter(e.target.value)} aria-label="Chapter">
          <option value="">All chapters</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ${c.name}` : c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted" title="Standard partidas your studio has hidden, and your own partidas you have hidden">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} disabled={!hiddenCount} />
          Show hidden ({hiddenCount})
        </label>
        <span className="text-sm text-muted">{total} partidas</span>
        <button
          type="button"
          onClick={() => setUnpricedOnly((v) => !v)}
          aria-pressed={unpricedOnly}
          className={`ml-auto text-sm ${unpricedOnly ? "font-medium text-accent" : "text-muted hover:text-ink"}`}
        >
          {unpricedOnly ? `Showing ${unpricedCount} without a price · Show all` : `Unpriced only (${unpricedCount})`}
        </button>
        <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.chapter.id)))}>
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
        <ExportMenu href="/catalogue/export" />
        {canWrite && <button className="btn" onClick={() => setModal({ type: "new" })}>+ New partida</button>}
      </div>

      {groups.map(({ chapter: c, items: rows }) => {
        const open = !collapsed.has(c.id);
        return (
          <div key={c.id} className="card overflow-x-auto">
            <button
              type="button"
              onClick={() => toggle(c.id)}
              aria-expanded={open}
              className={`flex w-full items-center gap-3 border-l-4 border-l-accent bg-accent-soft px-4 py-3 text-left text-base font-semibold tracking-tight hover:text-accent ${open ? "border-b border-b-line" : ""}`}
            >
              <Chevron open={open} />
              {c.code ? `${c.code} · ${c.name}` : c.name}
              <span className="text-sm font-normal text-muted">· {rows.length}</span>
            </button>
            {open && (
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 font-medium">Partida</th>
                    <th className="w-16 px-2 py-2 font-medium">Unit</th>
                    <th className="w-56 px-2 py-2 text-right font-medium">Current price</th>
                    <th className="w-[21rem] px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} className={`border-b border-line align-top last:border-0 ${i.hidden ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-accent">{i.code}</span>
                          <span className={`rounded-full border px-1.5 text-[0.65rem] ${i.kind === "standard" ? "border-line text-muted" : "border-accent text-accent"}`}>{KIND[i.kind]}</span>
                          {i.hidden && <span className="rounded-full border border-line px-1.5 text-[0.65rem] text-muted">Hidden</span>}
                        </div>
                        <div className="text-[0.95rem] font-medium leading-snug">{i.description}</div>
                        {i.longDescription && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{i.longDescription}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-muted">{unitLabel[i.unit] ?? i.unit}</td>
                      <td className="px-2 py-2.5 text-right">
                        {i.price ? (
                          <>
                            <div className="font-medium tabular-nums">{fmt.format(i.price.unitPrice)}</div>
                            <div className="whitespace-nowrap text-xs tabular-nums text-muted" title={`Budgets show ±${Math.round((spread[i.price.confidence] ?? 0.25) * 100)}% for ${i.price.confidence} confidence`}>
                              {fmt.format(i.price.unitPrice * (1 - (spread[i.price.confidence] ?? 0.25)))} – {fmt.format(i.price.unitPrice * (1 + (spread[i.price.confidence] ?? 0.25)))}
                            </div>
                            <div className="whitespace-nowrap text-xs text-muted">{humanize(i.price.source)} · {humanize(i.price.confidence)} · {i.price.pricedOn}</div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button className="btn-quiet py-1" onClick={() => setModal({ type: "price", item: i })}>{canWrite ? "Price" : "Prices"}</button>
                          {canWrite && i.kind !== "standard" && <button className="btn-quiet py-1" onClick={() => setModal({ type: "edit", item: i })}>Edit</button>}
                          {canWrite && i.kind === "standard" && (
                            <InlineAction action={customise} fields={{ id: i.id }} label="Customise" />
                          )}
                          {canWrite && i.kind === "standard" && <InlineAction action={customise} fields={{ id: i.id, hide: "1" }} label="Hide" />}
                          {canWrite && i.kind !== "standard" && (
                            <InlineAction action={setActive} fields={{ id: i.id, active: i.hidden ? "1" : "0" }} label={i.hidden ? "Show" : "Hide"} />
                          )}
                          {canWrite && i.kind !== "standard" && (
                            <InlineAction action={deletePartida} fields={{ id: i.id }} label={i.kind === "custom" ? "Revert" : "Delete"} confirm={i.kind === "custom" ? `Revert ${i.code} to the standard?` : `Delete ${i.code}?`} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {groups.length === 0 && <p className="text-sm text-muted">No partidas match.</p>}

      <Modal open={modal?.type === "price"} onClose={() => setModal(null)} title={current ? `Prices · ${current.code}` : "Prices"} wide>
        {current && <PricePanel item={current} fmt={fmt} canWrite={canWrite} />}
      </Modal>
      <Modal open={modal?.type === "edit" || modal?.type === "new"} onClose={() => setModal(null)} title={modal?.type === "new" ? "New partida" : `Edit ${current?.code ?? ""}`} wide>
        {modal && modal.type !== "price" && <PartidaForm item={modal.type === "edit" ? current : undefined} chapters={chapters} defaultChapter={chapter} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function PartidaForm({ item, chapters, defaultChapter, onDone }: { item?: Item; chapters: Chapter[]; defaultChapter: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(savePartida, null);
  useDone(pending, state, onDone);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[10rem_1fr]">
      {item && <input type="hidden" name="id" value={item.id} />}
      <label>
        <span className="label">Code</span>
        <input name="code" className="input font-mono uppercase" defaultValue={item?.code} required readOnly={item?.kind === "custom"} placeholder="REV-210" autoFocus={!item} />
      </label>
      <label>
        <span className="label">Short description</span>
        <input name="short_description" className="input" defaultValue={item?.description} required autoFocus={!!item} />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Full description (what&apos;s included)</span>
        <textarea name="long_description" className="input min-h-24" defaultValue={item?.longDescription ?? ""} />
      </label>
      <label>
        <span className="label">Unit</span>
        <select name="unit" className="input" defaultValue={item?.unit ?? "m2"}>
          {UNITS.map((u) => <option key={u} value={u}>{unitLabel[u] ?? u}</option>)}
        </select>
      </label>
      <label>
        <span className="label">Chapter</span>
        <select name="trade_id" className="input" defaultValue={item?.tradeId ?? defaultChapter} required>
          <option value="" disabled>Choose…</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ${c.name}` : c.name}</option>)}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="label">Reference code (optional, e.g. CYPE)</span>
        <input name="reference_code" className="input" defaultValue={item?.referenceCode ?? ""} />
      </label>
      {item?.kind === "custom" && <p className="text-xs text-muted sm:col-span-2">This is your studio&apos;s version of a standard code, so the code stays the same.</p>}
      {!item && <p className="text-xs text-muted sm:col-span-2">Using the code of a standard partida makes this your studio&apos;s version of it.</p>}
      {state?.error && <p className="text-sm text-accent sm:col-span-2">{state.error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button className="btn" disabled={pending}>{pending ? "Saving…" : item ? "Save" : "Add partida"}</button>
      </div>
    </form>
  );
}

function PricePanel({ item, fmt, canWrite }: { item: Item; fmt: Intl.NumberFormat; canWrite: boolean }) {
  const [state, action, pending] = useActionState(setPrice, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className="space-y-5">
      <p className="text-sm">
        {item.description} <span className="text-muted">· per {unitLabel[item.unit] ?? item.unit}</span>
      </p>
      {canWrite && (
        <form ref={formRef} action={action} className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-4">
          <input type="hidden" name="partida_id" value={item.id} />
          <label>
            <span className="label">Unit price</span>
            <input name="unit_price" className="input" inputMode="decimal" required autoFocus defaultValue={item.price?.unitPrice ?? ""} />
          </label>
          <label>
            <span className="label">Confidence</span>
            <select name="confidence" className="input" defaultValue="medium">
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </label>
          <label>
            <span className="label">Source</span>
            <select name="source" className="input" defaultValue="manual">
              <option value="manual">Manual</option><option value="history">Past project</option><option value="reference">Reference</option>
            </select>
          </label>
          <label>
            <span className="label">Valid until</span>
            <input name="valid_until" type="date" className="input" />
          </label>
          <label className="sm:col-span-3">
            <span className="label">Note</span>
            <input name="notes" className="input" placeholder="e.g. Ortega y Gasset 47, Sept 2026" />
          </label>
          <div className="flex items-end justify-end">
            <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : "Set price"}</button>
          </div>
          {state && <p className={`text-sm sm:col-span-4 ${state.error ? "text-accent" : "text-ok"}`}>{state.error ?? state.ok}</p>}
        </form>
      )}
      <div>
        <h3 className="mb-2 text-sm font-medium">History</h3>
        {item.history.length ? (
          <ul className="divide-y divide-line text-sm">
            {item.history.map((h, idx) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <span className="font-medium tabular-nums">{fmt.format(h.unitPrice)}</span>
                  <span className="ml-2 text-muted">{humanize(h.source)} · {humanize(h.confidence)} · {h.pricedOn}{h.validUntil ? ` → ${h.validUntil}` : ""}</span>
                  {!h.own && <span className="ml-2 text-xs text-muted">(shared reference)</span>}
                  {idx === 0 && item.price && Math.abs(item.price.unitPrice - h.unitPrice) < 0.005 && <span className="ml-2 text-xs text-ok">in use</span>}
                  {h.notes && <div className="text-xs text-muted">{h.notes}</div>}
                </div>
                {canWrite && h.own && <InlineAction action={deletePrice} fields={{ id: h.id }} label="Remove" confirm="Remove this price?" />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No prices yet.</p>
        )}
      </div>
    </div>
  );
}

/** A one-button form for a server action, with optional confirm step and inline result. */
function InlineAction({ action, fields, label, confirm }: { action: (p: State, fd: FormData) => Promise<State>; fields: Record<string, string>; label: string; confirm?: string }) {
  const [state, run, pending] = useActionState(action, null);
  const [asking, setAsking] = useState(false);
  return (
    <form action={run} className="relative inline-flex items-center">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {confirm && !asking ? (
        <button type="button" className="btn-quiet py-1" onClick={() => setAsking(true)}>{label}</button>
      ) : (
        <button className={`py-1 ${confirm ? "btn" : "btn-quiet"}`} disabled={pending} title={confirm} onBlur={() => setAsking(false)} autoFocus={!!confirm}>
          {pending ? "…" : confirm ? `${label}?` : label}
        </button>
      )}
      {state?.error && <span className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-line bg-surface p-2 text-xs text-accent shadow">{state.error}</span>}
    </form>
  );
}

function useDone(pending: boolean, state: State, onDone: () => void) {
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending && state?.ok) onDone();
    was.current = pending;
  }, [pending, state, onDone]);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}>
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
