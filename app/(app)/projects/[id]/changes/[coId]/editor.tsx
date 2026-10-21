"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { addLine, deleteLine, saveDetails, setStatus, type State } from "./actions";

type Partida = { id: string; code: string; description: string; unit: string; chapter: string; price: number | null };
type Details = { title: string; description: string | null; reason: string; notes: string | null };

function useDone(pending: boolean, state: State, onDone: () => void) {
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending && state?.ok) onDone();
    was.current = pending;
  }, [pending, state, onDone]);
}

export function ChangeOrderEditor({
  projectId, coId, status, editable, canWrite, catalogue, rooms, details,
}: { projectId: string; coId: string; status: string; editable: boolean; canWrite: boolean; catalogue: Partida[]; rooms: string[]; details: Details }) {
  const [dialog, setDialog] = useState<"line" | "approve" | "reject" | "details" | null>(null);
  const close = () => setDialog(null);
  const [st, statusAction, statusPending] = useActionState(setStatus.bind(null, projectId, coId), null);
  useDone(statusPending, st, close);

  if (!canWrite) return null;
  return (
    <section className="flex flex-wrap items-center gap-2">
      {editable && <button className="btn" onClick={() => setDialog("line")}>+ Add line</button>}
      {editable && <button className="btn-quiet" onClick={() => setDialog("details")}>Edit details</button>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {status === "draft" && <StatusButton action={statusAction} status="sent" label="Mark as sent to client" pending={statusPending} primary />}
        {status === "sent" && (
          <>
            <button className="btn" onClick={() => setDialog("approve")}>Client approved…</button>
            <button className="btn-quiet" onClick={() => setDialog("reject")}>Client rejected…</button>
            <StatusButton action={statusAction} status="draft" label="Back to draft" pending={statusPending} />
          </>
        )}
        {(status === "draft" || status === "sent") && <StatusButton action={statusAction} status="cancelled" label="Cancel change" pending={statusPending} />}
        {status === "cancelled" && <StatusButton action={statusAction} status="draft" label="Reopen as draft" pending={statusPending} />}
      </div>
      {st?.error && <p className="w-full text-sm text-accent">{st.error}</p>}

      <Modal open={dialog === "line"} onClose={close} title="Add a line" wide>
        <LineForm projectId={projectId} coId={coId} catalogue={catalogue} rooms={rooms} onDone={close} />
      </Modal>
      <Modal open={dialog === "details"} onClose={close} title="Change order details">
        <DetailsForm projectId={projectId} coId={coId} details={details} onDone={close} />
      </Modal>
      <Modal open={dialog === "approve"} onClose={close} title="Client approved">
        <form action={statusAction} className="grid gap-4">
          <input type="hidden" name="status" value="approved" />
          <p className="text-sm text-muted">The change is added to the current budget and its lines are frozen. Approving a change that came from a client request marks the request applied.</p>
          <div className="grid grid-cols-2 gap-4">
            <label><span className="label">Approved by (client)</span><input name="approved_by" className="input" required autoFocus /></label>
            <label><span className="label">On</span><input name="date" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          </div>
          {st?.error && <p className="text-sm text-accent">{st.error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-quiet" onClick={close}>Cancel</button><button className="btn" disabled={statusPending}>Record approval</button></div>
        </form>
      </Modal>
      <Modal open={dialog === "reject"} onClose={close} title="Client rejected">
        <form action={statusAction} className="grid gap-4">
          <input type="hidden" name="status" value="rejected" />
          <label><span className="label">On</span><input name="date" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <div className="flex justify-end gap-2"><button type="button" className="btn-quiet" onClick={close}>Cancel</button><button className="btn" disabled={statusPending}>Record rejection</button></div>
        </form>
      </Modal>
    </section>
  );
}

function StatusButton({ action, status, label, pending, primary }: { action: (fd: FormData) => void; status: string; label: string; pending: boolean; primary?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="status" value={status} />
      <button className={primary ? "btn" : "btn-quiet"} disabled={pending}>{label}</button>
    </form>
  );
}

function LineForm({ projectId, coId, catalogue, rooms, onDone }: { projectId: string; coId: string; catalogue: Partida[]; rooms: string[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(addLine.bind(null, projectId, coId), null);
  const [partida, setPartida] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const chosen = catalogue.find((p) => p.id === partida);
  useDone(pending, state, onDone);
  const chapters = [...new Set(catalogue.map((p) => p.chapter))];
  return (
    <form
      action={(fd) => {
        // Taking work out stores a negative quantity.
        const q = String(fd.get("qty_abs") ?? "").replace(",", ".");
        fd.set("quantity", q ? String((direction === "remove" ? -1 : 1) * Math.abs(Number(q))) : "");
        action(fd);
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div className="flex gap-2 sm:col-span-2" role="group" aria-label="Kind of line">
        {(["add", "remove"] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDirection(d)} className={`rounded-full border px-3 py-1 text-sm ${direction === d ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}>
            {d === "add" ? "+ Extra work" : "− Work taken out"}
          </button>
        ))}
      </div>
      <label className="sm:col-span-2">
        <span className="label">Partida (or leave empty and describe below)</span>
        <select name="partida_id" className="input" value={partida} onChange={(e) => setPartida(e.target.value)} autoFocus>
          <option value="">— Free line —</option>
          {chapters.map((ch) => (
            <optgroup key={ch} label={ch}>
              {catalogue.filter((p) => p.chapter === ch).map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.description} ({p.unit}){p.price != null ? ` · ${p.price} €` : ""}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="label">Description {chosen ? "(optional, defaults to the partida)" : ""}</span>
        <input name="description" className="input" placeholder={chosen?.description ?? "e.g. Remove the existing mirror"} required={!chosen} />
      </label>
      <label>
        <span className="label">Quantity {chosen ? `(${chosen.unit})` : ""}</span>
        <div className="flex gap-2">
          <input name="qty_abs" className="input" inputMode="decimal" required />
          {!chosen && (
            <select name="unit" className="input w-24" defaultValue="ud">
              <option value="m2">m²</option><option value="m">m</option><option value="m3">m³</option><option value="ud">ud</option><option value="kg">kg</option><option value="h">h</option><option value="pa">PA</option>
            </select>
          )}
        </div>
      </label>
      <label>
        <span className="label">Unit price (€)</span>
        <input name="unit_price" className="input" inputMode="decimal" placeholder={chosen?.price != null ? `${chosen.price} (current price)` : "Required"} />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Room (optional)</span>
        <input name="room" className="input" list="co-rooms" />
        <datalist id="co-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
      </label>
      {state?.error && <p className="text-sm text-accent sm:col-span-2">{state.error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
        <button className="btn" disabled={pending}>{pending ? "Adding…" : "Add line"}</button>
      </div>
    </form>
  );
}

function DetailsForm({ projectId, coId, details, onDone }: { projectId: string; coId: string; details: Details; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveDetails.bind(null, projectId, coId), null);
  useDone(pending, state, onDone);
  return (
    <form action={action} className="grid gap-4">
      <label><span className="label">Title</span><input name="title" className="input" defaultValue={details.title} required /></label>
      <label>
        <span className="label">Reason</span>
        <select name="reason" className="input" defaultValue={details.reason}>
          <option value="client_request">Client request</option><option value="design_change">Design change</option>
          <option value="site_condition">Site condition</option><option value="omission">Omission in the contract budget</option><option value="other">Other</option>
        </select>
      </label>
      <label><span className="label">Description</span><textarea name="description" className="input min-h-20" defaultValue={details.description ?? ""} /></label>
      <label><span className="label">Internal notes</span><textarea name="notes" className="input min-h-16" defaultValue={details.notes ?? ""} /></label>
      {state?.error && <p className="text-sm text-accent">{state.error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn-quiet" onClick={onDone}>Cancel</button><button className="btn" disabled={pending}>Save</button></div>
    </form>
  );
}

export function DeleteLine({ projectId, coId, lineId }: { projectId: string; coId: string; lineId: string }) {
  const [state, action, pending] = useActionState(deleteLine.bind(null, projectId, coId), null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={lineId} />
      <button className="btn-quiet py-1 text-muted" disabled={pending} title={state?.error}>Remove</button>
    </form>
  );
}
