import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { dateShort, humanize, money, qty, unitLabel } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { addInvoice, addPayment, createPurchaseOrder, saveAsPrice, setPoStatus } from "./actions";

const PO_STATUS = ["draft", "sent", "confirmed", "delivered", "cancelled"] as const;

export default async function PurchasesPage({ params }: PageProps<"/projects/[id]/purchases">) {
  const { id } = await params;
  const studio = await requireStudio();
  const cur = studio.currency;
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("id, code, name, status").eq("id", id).maybeSingle();
  if (!project) notFound();
  const main = (await supabase.from("project_main_version").select("version_id, label").eq("project_id", id).maybeSingle()).data;

  const [money_, chapters, pos, invoices, payments, suppliers, budget] = await Promise.all([
    supabase.from("project_money").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("project_cost_by_trade").select("trade, budget, committed, remaining").eq("project_id", id).order("sequence"),
    supabase.from("purchase_orders").select("id, code, status, supplied_by, ordered_on, expected_on, delivered_on, notes, suppliers(name), purchase_order_lines(id, description, quantity, unit, unit_cost, received_quantity, total, partida_id)").eq("project_id", id).order("code", { ascending: false }),
    supabase.from("invoice_balances").select("id, number, supplier, category, issued_on, due_on, total, paid, outstanding").eq("project_id", id).order("issued_on", { ascending: false }),
    supabase.from("payments").select("id, direction, category, amount, paid_on, concept, method").eq("project_id", id).order("paid_on", { ascending: false }),
    supabase.from("suppliers").select("id, name").order("name"),
    main?.version_id
      ? supabase.from("line_items").select("id, quantity, unit_price, partidas(code, short_description, unit, trades(sequence))").eq("version_id", main.version_id).order("created_at")
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const m = money_.data;
  const lines = [...(budget.data ?? [])].sort((a, b) => (a.partidas?.trades?.sequence ?? 0) - (b.partidas?.trades?.sequence ?? 0) || (a.partidas?.code ?? "").localeCompare(b.partidas?.code ?? ""));
  const canWrite = studio.canWrite;

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-ink">← {project.code} {project.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Purchases and cost control</h1>
        <PageIntro wiki="purchases">Order from budget lines, record supplier invoices and payments, and watch committed cost against the budget per chapter. Delivered costs can be saved back as prices.</PageIntro>
        {project.status !== "won" && (
          <p className="mt-2 text-sm text-muted">This project isn’t won yet. Purchasing normally starts once the contract is signed.</p>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={`Budget (${main?.label ?? "—"})`} value={money(m?.budget, cur)} />
        <Stat label="Committed" value={money(m?.committed, cur)} />
        <Stat label="Invoiced" value={money(m?.invoiced, cur)} />
        <Stat label="Paid out" value={money(m?.paid_out, cur)} />
        <Stat label="Received from client" value={money(Number(m?.received_works ?? 0) + Number(m?.received_fees ?? 0), cur)} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Cost by chapter</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-2">Chapter</th><th className="text-right">Budget</th><th className="text-right">Committed</th><th className="text-right">Remaining</th></tr></thead>
          <tbody>
            {(chapters.data ?? []).map((c) => (
              <tr key={c.trade} className="border-t border-line">
                <td className="py-2">{c.trade}</td>
                <td className="text-right tabular-nums">{money(c.budget, cur)}</td>
                <td className="text-right tabular-nums">{money(c.committed, cur)}</td>
                <td className={`text-right tabular-nums ${Number(c.remaining) < 0 ? "text-accent" : ""}`}>{money(c.remaining, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Purchase orders</h2>
        {(pos.data ?? []).length === 0 && <p className="text-sm text-muted">None yet.</p>}
        {(pos.data ?? []).map((po) => {
          const total = po.purchase_order_lines.reduce((t, l) => t + Number(l.total ?? 0), 0);
          return (
            <div key={po.id} className="border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-mono text-sm">{po.code}</span>
                  <span className="ml-3">{po.suppliers?.name ?? "No supplier"}</span>
                  <span className="ml-3 text-sm text-muted">
                    {humanize(po.status)} · bought by {humanize(po.supplied_by)}
                    {po.expected_on && ` · expected ${dateShort(po.expected_on)}`}
                    {po.delivered_on && ` · delivered ${dateShort(po.delivered_on)}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">{money(total, cur)}</span>
                  {canWrite && (
                    <form action={setPoStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={po.id} />
                      <input type="hidden" name="project_id" value={id} />
                      <select name="status" defaultValue={po.status} className="input py-1">
                        {PO_STATUS.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                      </select>
                      <button className="btn-quiet">Set</button>
                    </form>
                  )}
                </div>
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {po.purchase_order_lines.map((l) => (
                    <tr key={l.id} className="text-muted">
                      <td className="py-1 text-ink">{l.description}</td>
                      <td className="text-right tabular-nums">{qty(l.quantity)} {unitLabel[l.unit]}</td>
                      <td className="text-right tabular-nums">× {money(l.unit_cost, cur)}</td>
                      <td className="text-right tabular-nums">received {qty(l.received_quantity)}</td>
                      <td className="w-40 text-right">
                        {canWrite && l.partida_id && po.status === "delivered" && (
                          <ActionForm action={saveAsPrice} submit="Save as price" quiet className="flex justify-end">
                            <input type="hidden" name="po_line_id" value={l.id} />
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {canWrite && (
          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-medium">New purchase order</summary>
            <ActionForm action={createPurchaseOrder.bind(null, id)} submit="Create draft" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <label><span className="label">Supplier</span>
                  <select name="supplier_id" className="input"><option value="">—</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                </label>
                <label><span className="label">Bought by</span>
                  <select name="supplied_by" className="input" defaultValue="enzyme"><option value="enzyme">Studio</option><option value="contractor">Contractor</option><option value="owner">Client</option></select>
                </label>
                <label><span className="label">Expected</span><input type="date" name="expected_on" className="input" /></label>
                <label><span className="label">Notes</span><input name="notes" className="input" /></label>
              </div>
              {lines.length > 0 && (
                <div className="max-h-80 overflow-y-auto rounded border border-line">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-left text-muted"><tr><th className="p-2" /><th>Budget line</th><th className="text-right">Quantity</th><th className="p-2 text-right">Unit cost</th></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-t border-line">
                          <td className="p-2"><input type="checkbox" name="line" value={l.id} aria-label={`Include ${l.partidas?.code}`} /></td>
                          <td><span className="font-mono text-xs text-muted">{l.partidas?.code}</span> {l.partidas?.short_description}</td>
                          <td className="text-right"><input name={`qty_${l.id}`} defaultValue={Number(l.quantity)} className="input w-24 py-1 text-right" inputMode="decimal" /> {unitLabel[l.partidas?.unit ?? "ud"]}</td>
                          <td className="p-2 text-right"><input name={`cost_${l.id}`} defaultValue={l.unit_price ?? ""} className="input w-24 py-1 text-right" inputMode="decimal" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-4">
                <label className="sm:col-span-2"><span className="label">Or a free line</span><input name="free_description" className="input" placeholder="e.g. Grifería termostática Hansgrohe" /></label>
                <label><span className="label">Quantity · unit</span>
                  <div className="flex gap-2"><input name="free_quantity" className="input" inputMode="decimal" defaultValue="1" />
                    <select name="free_unit" className="input w-20">{Object.entries(unitLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                </label>
                <label><span className="label">Unit cost</span><input name="free_cost" className="input" inputMode="decimal" /></label>
              </div>
            </ActionForm>
          </details>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4">
          <h2 className="font-semibold">Supplier invoices</h2>
          <ul className="divide-y divide-line text-sm">
            {(invoices.data ?? []).map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span>{i.supplier ?? "—"} {i.number && <span className="text-muted">· {i.number}</span>} <span className="text-muted">· {humanize(i.category ?? "")} · {dateShort(i.issued_on)}</span></span>
                <span className="text-right tabular-nums">{money(i.total, cur)}{Number(i.outstanding) > 0 && <span className="block text-xs text-accent">{money(i.outstanding, cur)} due{i.due_on ? ` ${dateShort(i.due_on)}` : ""}</span>}</span>
              </li>
            ))}
            {(invoices.data ?? []).length === 0 && <li className="py-2 text-muted">None yet.</li>}
          </ul>
          {canWrite && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Record an invoice</summary>
              <ActionForm action={addInvoice.bind(null, id)} submit="Record" className="mt-3 grid grid-cols-2 gap-3">
                <label><span className="label">Supplier</span><select name="supplier_id" className="input"><option value="">—</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label><span className="label">Purchase order</span><select name="purchase_order_id" className="input"><option value="">—</option>{(pos.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
                <label><span className="label">Number</span><input name="number" className="input" /></label>
                <label><span className="label">Category</span><select name="category" className="input"><option value="materials">Materials</option><option value="labour">Labour</option><option value="extra">Extra</option></select></label>
                <label><span className="label">Before VAT</span><input name="net_amount" className="input" inputMode="decimal" required /></label>
                <label><span className="label">VAT</span><input name="vat_amount" className="input" inputMode="decimal" /></label>
                <label><span className="label">Issued</span><input type="date" name="issued_on" className="input" /></label>
                <label><span className="label">Due</span><input type="date" name="due_on" className="input" /></label>
              </ActionForm>
            </details>
          )}
        </section>

        <section className="card space-y-4">
          <h2 className="font-semibold">Payments</h2>
          <ul className="divide-y divide-line text-sm">
            {(payments.data ?? []).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span>{p.direction === "in" ? "Received" : "Paid"} · {humanize(p.category)} {p.concept && <span className="text-muted">· {p.concept}</span>} <span className="text-muted">· {dateShort(p.paid_on)}</span></span>
                <span className={`tabular-nums ${p.direction === "in" ? "text-ok" : ""}`}>{p.direction === "in" ? "+" : "−"}{money(p.amount, cur)}</span>
              </li>
            ))}
            {(payments.data ?? []).length === 0 && <li className="py-2 text-muted">None yet.</li>}
          </ul>
          {canWrite && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Record a payment</summary>
              <ActionForm action={addPayment.bind(null, id)} submit="Record" className="mt-3 grid grid-cols-2 gap-3">
                <label><span className="label">Kind</span>
                  <select name="kind" className="input">
                    <option value="out:materials">Paid · materials</option><option value="out:labour">Paid · labour</option><option value="out:extra">Paid · extra</option>
                    <option value="in:client_works">Received · works</option><option value="in:client_fees">Received · fees</option>
                  </select>
                </label>
                <label><span className="label">Amount</span><input name="amount" className="input" inputMode="decimal" required /></label>
                <label><span className="label">Against invoice</span><select name="invoice_id" className="input"><option value="">—</option>{(invoices.data ?? []).filter((i) => Number(i.outstanding) > 0).map((i) => <option key={i.id!} value={i.id!}>{i.supplier ?? ""} {i.number ?? ""} ({money(i.outstanding, cur)})</option>)}</select></label>
                <label><span className="label">Date</span><input type="date" name="paid_on" className="input" /></label>
                <label className="col-span-2"><span className="label">Concept</span><input name="concept" className="input" /></label>
              </ActionForm>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
