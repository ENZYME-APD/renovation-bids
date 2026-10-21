"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { addClientRequest, createChangeOrder, dropClientRequest, setPhase, signContract, type State } from "./lifecycle-actions";

const PHASES = [
  { key: "bid", label: "Bid", hint: "Pre-contract, pre-design: one standard option" },
  { key: "design", label: "Design", hint: "Options, client choices, change orders" },
  { key: "construction", label: "Construction", hint: "Purchasing, works, cost control" },
  { key: "closed", label: "Closed", hint: "Handed over, lost or dropped" },
] as const;

function useDone(pending: boolean, state: State, onDone: () => void) {
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending && state?.ok) onDone();
    was.current = pending;
  }, [pending, state, onDone]);
}

export function PhaseStepper({ projectId, phase, canWrite }: { projectId: string; phase: string; canWrite: boolean }) {
  const [state, action, pending] = useActionState(setPhase.bind(null, projectId), null);
  const idx = PHASES.findIndex((p) => p.key === phase);
  return (
    <div>
      <ol className="flex flex-wrap items-stretch gap-1 text-sm" aria-label="Project phase">
        {PHASES.map((p, i) => {
          const current = i === idx;
          const done = i < idx;
          return (
            <li key={p.key} className="flex items-center gap-1">
              <form action={action}>
                <input type="hidden" name="phase" value={p.key} />
                <button
                  disabled={!canWrite || current || pending}
                  title={p.hint}
                  className={`rounded-full border px-3 py-1 ${current ? "border-accent bg-accent text-accent-ink" : done ? "border-accent/40 text-ink" : "border-line text-muted hover:text-ink"} disabled:cursor-default`}
                >
                  {done ? "✓ " : ""}{p.label}
                </button>
              </form>
              {i < PHASES.length - 1 && <span className="text-muted">→</span>}
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-xs text-muted">{PHASES[idx]?.hint}{state?.error && <span className="ml-2 text-accent">{state.error}</span>}</p>
    </div>
  );
}

export function SignContractButton({
  projectId, versions, currency,
}: { projectId: string; versions: { id: string; label: string; total: number }[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(signContract.bind(null, projectId), null);
  const [version, setVersion] = useState(versions[0]?.id ?? "");
  const fmt = new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 0 });
  const chosen = versions.find((v) => v.id === version);
  useDone(pending, state, () => setOpen(false));
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Sign contract…</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Sign contract">
        <form action={action} className="grid gap-4">
          <p className="text-sm text-muted">
            The chosen budget is copied as a locked <strong>Contract</strong> version: the baseline everything after is measured against.
            From then on, changes to scope go through change orders. The project moves to the Design phase.
          </p>
          <label>
            <span className="label">Version signed</span>
            <select name="version_id" className="input" value={version} onChange={(e) => setVersion(e.target.value)} required>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.label} · {fmt.format(v.total)}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="label">Contract value (before VAT)</span>
              <input name="value" className="input" inputMode="decimal" placeholder={chosen ? String(Math.round(chosen.total)) : ""} />
            </label>
            <label>
              <span className="label">Signed on</span>
              <input name="signed_on" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
          </div>
          <p className="text-xs text-muted">Leave the value empty to use the budget total. Undo is available in Settings → Activity.</p>
          {state?.error && <p className="text-sm text-accent">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={pending}>{pending ? "Signing…" : "Sign contract"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

type Request = { id: string; request: string; requested_by: string | null; source: string; status: string; decided_on: string; changeOrder: { id: string; number: number } | null };

export function ClientRequests({ projectId, requests, canWrite, contractSigned }: { projectId: string; requests: Request[]; canWrite: boolean; contractSigned: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addClientRequest.bind(null, projectId), null);
  useDone(pending, state, () => setOpen(false));
  const [coState, coAction, coPending] = useActionState(createChangeOrder.bind(null, projectId), null);
  const [dropState, dropAction] = useActionState(dropClientRequest.bind(null, projectId), null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Client requests</h2>
        {canWrite && <button className="btn-quiet" onClick={() => setOpen(true)}>+ Record request</button>}
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-muted">Nothing recorded. Log what the client asks for here; {contractSigned ? "turn each into a change order to price it." : "they get priced as change orders once the contract is signed."}</p>
      ) : (
        <ul className="card divide-y divide-line">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div>{r.request}</div>
                <div className="text-xs text-muted">{r.requested_by ?? "Client"} · {r.source} · {r.decided_on}</div>
              </div>
              <div className="flex items-center gap-2">
                {r.changeOrder ? (
                  <Link href={`/projects/${projectId}/changes/${r.changeOrder.id}`} className="text-sm text-accent hover:underline">CO-{String(r.changeOrder.number).padStart(2, "0")}</Link>
                ) : null}
                <span className={`rounded-full border px-2 py-0.5 text-xs ${r.status === "open" ? "border-accent text-accent" : "border-line text-muted"}`}>{r.status}</span>
                {canWrite && r.status === "open" && contractSigned && !r.changeOrder && (
                  <form action={coAction}>
                    <input type="hidden" name="decision_id" value={r.id} />
                    <button className="btn-quiet py-1" disabled={coPending}>Price as change order</button>
                  </form>
                )}
                {canWrite && r.status === "open" && (
                  <form action={dropAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-quiet py-1 text-muted">Drop</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(coState?.error || dropState?.error) && <p className="text-sm text-accent">{coState?.error ?? dropState?.error}</p>}
      <Modal open={open} onClose={() => setOpen(false)} title="Record a client request">
        <form action={action} className="grid gap-4">
          <label>
            <span className="label">What they asked for</span>
            <textarea name="request" className="input min-h-20" required autoFocus placeholder="e.g. Bathtub instead of the shower in the main bathroom" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className="label">Asked by</span>
              <input name="requested_by" className="input" placeholder="Ana" />
            </label>
            <label>
              <span className="label">How</span>
              <select name="source" className="input" defaultValue="meeting">
                <option value="meeting">Meeting</option><option value="email">Email</option><option value="call">Call</option><option value="site">On site</option><option value="other">Other</option>
              </select>
            </label>
          </div>
          <label>
            <span className="label">Expected impact (optional)</span>
            <input name="impact" className="input" placeholder="+2 weeks, plumbing changes" />
          </label>
          {state?.error && <p className="text-sm text-accent">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={pending}>{pending ? "Saving…" : "Record"}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

export function NewChangeOrderButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createChangeOrder.bind(null, projectId), null);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>+ New change order</button>
      <Modal open={open} onClose={() => setOpen(false)} title="New change order">
        <form action={action} className="grid gap-4">
          <label>
            <span className="label">Title</span>
            <input name="title" className="input" required autoFocus placeholder="Hall in porcelain tile instead of laminate" />
          </label>
          <label>
            <span className="label">Reason</span>
            <select name="reason" className="input" defaultValue="design_change">
              <option value="client_request">Client request</option>
              <option value="design_change">Design change</option>
              <option value="site_condition">Site condition (found on site)</option>
              <option value="omission">Omission in the contract budget</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span className="label">Description (optional)</span>
            <textarea name="description" className="input min-h-20" />
          </label>
          <p className="text-xs text-muted">It opens as a draft; add the lines (extra work, and work taken out) on the next page.</p>
          {state?.error && <p className="text-sm text-accent">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={pending}>{pending ? "Creating…" : "Create draft"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
