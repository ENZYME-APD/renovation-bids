import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { effectiveCatalogue } from "@/lib/catalogue";
import { humanize, money, money2, qty, unitLabel } from "@/lib/format";
import { PageIntro } from "@/components/page-intro";
import { ChangeOrderEditor, DeleteLine } from "./editor";

export default async function ChangeOrderPage({ params }: PageProps<"/projects/[id]/changes/[coId]">) {
  const { id, coId } = await params;
  const studio = await requireStudio();
  const supabase = await createClient();

  const [{ data: project }, { data: co }] = await Promise.all([
    supabase.from("projects").select("id, code, name").eq("id", id).maybeSingle(),
    supabase.from("change_orders").select("*, decisions(request, requested_by)").eq("id", coId).eq("project_id", id).maybeSingle(),
  ]);
  if (!project || !co) notFound();

  const [{ data: lines }, { data: partidas }, { data: prices }, { data: summary }] = await Promise.all([
    supabase.from("change_order_lines").select("id, description, unit, quantity, unit_price, total, room, partidas(code)").eq("change_order_id", coId).order("created_at"),
    supabase.from("partidas").select("id, code, short_description, unit, trade_id, organization_id, active, trades(code, name, sequence)").order("code"),
    supabase.rpc("current_prices", { p_org: studio.id }),
    supabase.from("project_budget_summary").select("contract_budget, approved_changes, current_budget").eq("project_id", id).maybeSingle(),
  ]);
  const price = new Map((prices ?? []).map((p) => [p.partida_id, Number(p.unit_price)]));
  const catalogue = effectiveCatalogue(partidas ?? [], studio.id).map((p) => ({
    id: p.id, code: p.code, description: p.short_description, unit: unitLabel[p.unit] ?? p.unit,
    chapter: p.trades ? `${p.trades.code ?? ""} ${p.trades.name}`.trim() : "", sequence: p.trades?.sequence ?? 999, price: price.get(p.id) ?? null,
  })).sort((a, b) => a.sequence - b.sequence || a.code.localeCompare(b.code, "es", { numeric: true }));

  const total = (lines ?? []).reduce((t, l) => t + Number(l.total ?? 0), 0);
  const editable = studio.canWrite && (co.status === "draft" || co.status === "sent");
  const number = `CO-${String(co.number).padStart(2, "0")}`;
  const rooms = [...new Set((lines ?? []).map((l) => l.room).filter((r): r is string => !!r))];

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted hover:text-ink">← {project.code} · {project.name}</Link>
        <p className="eyebrow mt-3">{number} · {humanize(co.reason)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{co.title}</h1>
        <PageIntro wiki="contract-and-change-orders">
          Add the extra work (positive quantities) and the work taken out (negative), send it to the client, and record their decision.
          Once approved, it adds to the current budget and its lines are frozen.
        </PageIntro>
        {co.decisions && <p className="mt-2 text-sm">From client request: <span className="text-muted">“{co.decisions.request}”{co.decisions.requested_by ? ` · ${co.decisions.requested_by}` : ""}</span></p>}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="This change" value={`${total >= 0 ? "+" : ""}${money(total, studio.currency)}`} strong />
        <Figure label="Status" value={humanize(co.status)} sub={co.status === "approved" ? `by ${co.approved_by} · ${co.decided_on}` : co.status === "sent" ? `sent ${co.sent_on}` : co.status === "rejected" ? `on ${co.decided_on}` : undefined} />
        <Figure label="Contract" value={money(summary?.contract_budget, studio.currency)} />
        <Figure label="Current budget" value={money(summary?.current_budget, studio.currency)} sub={co.status === "approved" ? "includes this change" : `${money(Number(summary?.current_budget ?? 0) + total, studio.currency)} if approved`} />
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2">Work</th><th className="px-2 py-2">Room</th><th className="px-2 py-2 text-right">Quantity</th>
              <th className="px-2 py-2 text-right">Unit price</th><th className="px-2 py-2 text-right">Amount</th>{editable && <th className="w-24 px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  {l.partidas?.code && <span className="mr-2 font-mono text-xs text-accent">{l.partidas.code}</span>}
                  {l.description}
                  {Number(l.quantity) < 0 && <span className="ml-2 rounded-full border border-line px-1.5 text-[0.65rem] text-muted">taken out</span>}
                </td>
                <td className="px-2 py-2 text-muted">{l.room ?? "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{qty(l.quantity)} {unitLabel[l.unit] ?? l.unit}</td>
                <td className="px-2 py-2 text-right tabular-nums">{money2(l.unit_price)}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${Number(l.total) < 0 ? "text-ok" : ""}`}>{money2(l.total)}</td>
                {editable && <td className="px-4 py-2 text-right"><DeleteLine projectId={id} coId={coId} lineId={l.id} /></td>}
              </tr>
            ))}
            {(lines ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No lines yet.</td></tr>
            )}
          </tbody>
          {(lines ?? []).length > 0 && (
            <tfoot><tr className="border-t border-line font-semibold"><td colSpan={4} className="px-4 py-2 text-right">Total</td><td className="px-2 py-2 text-right tabular-nums">{money2(total)}</td>{editable && <td />}</tr></tfoot>
          )}
        </table>
      </section>

      <ChangeOrderEditor
        projectId={id}
        coId={coId}
        status={co.status}
        editable={editable}
        canWrite={studio.canWrite}
        catalogue={catalogue}
        rooms={rooms}
        details={{ title: co.title, description: co.description, reason: co.reason, notes: co.notes }}
      />
    </div>
  );
}

function Figure({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`card p-4 ${strong ? "border-accent" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
