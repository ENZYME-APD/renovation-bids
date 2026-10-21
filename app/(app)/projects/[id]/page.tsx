import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { humanize, money } from "@/lib/format";
import { NewVersionButton } from "./new-version-form";
import { ClientRequests, NewChangeOrderButton, SignContractButton } from "./lifecycle";
import { VersionCompare, type CompareLine } from "./version-compare";
import { DeleteProject } from "./delete-project";
import { modelToolLabel } from "@/lib/model-tools";
import { unitLabel } from "@/lib/format";
import { ProjectHeader } from "./project-header";
import { FeeEditor, type Fee } from "../../fees/fee-editor";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const studio = await requireStudio();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, code, name, address, district, area_m2, building_year, room_height, status, phase, client_budget, contract_value, contract_signed_on, contract_version_id, clients(name)")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const { data: versions, error } = await supabase
    .from("versions")
    .select("id, label, description, status, locked, created_at, model_tool, model_option")
    .eq("project_id", id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const totals = await Promise.all(
    versions.map(async (v) => {
      const { data } = await supabase.rpc("version_budget", { p_version: v.id });
      const rows = data ?? [];
      return {
        id: v.id,
        lines: rows.reduce((s, r) => s + Number(r.lines), 0),
        priced: rows.reduce((s, r) => s + Number(r.priced_lines), 0),
        low: rows.reduce((s, r) => s + Number(r.budget_low), 0),
        high: rows.reduce((s, r) => s + Number(r.budget_high), 0),
      };
    }),
  );
  const totalFor = (vid: string) => totals.find((t) => t.id === vid)!;

  const [{ data: summary }, { data: requests }, { data: changeOrders }] = await Promise.all([
    supabase.from("project_budget_summary").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("decisions").select("id, request, requested_by, source, status, decided_on").eq("project_id", id).order("decided_on", { ascending: false }),
    supabase.from("change_orders").select("id, number, title, reason, status, sent_on, decided_on, decision_id").eq("project_id", id).order("number"),
  ]);
  const { data: allLines } = versions.length
    ? await supabase
        .from("line_items")
        .select("version_id, quantity, total, room, partidas(code, short_description, unit, trades(id, code, name, sequence))")
        .eq("supplied_by", "contractor")
        .in("version_id", versions.map((v) => v.id))
        .limit(20000)
    : { data: [] };
  const compareLines: CompareLine[] = (allLines ?? []).map((l) => {
    const t = l.partidas?.trades;
    return {
      v: l.version_id,
      chapterKey: t?.id ?? "none",
      chapter: t ? (t.code ? `${t.code} · ${t.name}` : t.name) : "Other",
      chapterSeq: t?.sequence ?? 999,
      room: l.room,
      code: l.partidas?.code ?? "?",
      description: l.partidas?.short_description ?? "",
      unit: unitLabel[l.partidas?.unit ?? ""] ?? "",
      qty: Number(l.quantity),
      total: l.total == null ? null : Number(l.total),
    };
  });
  const others = versions.filter((v) => v.id !== project.contract_version_id);
  const initialCompare = project.contract_version_id && others.length
    ? [project.contract_version_id, others[others.length - 1].id]
    : versions.length > 1 ? [versions[0].id, versions[versions.length - 1].id] : versions.map((v) => v.id);
  const [{ data: feeRows }, { data: feeSummary }, { count: defaultFees }] = await Promise.all([
    supabase.from("project_fee_items").select("id, label, basis, amount, percent, months, phase, notes, sequence, total").eq("project_id", id).order("sequence"),
    supabase.from("project_fee_summary").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("fee_items").select("id", { count: "exact", head: true }).is("project_id", null),
  ]);
  const fees: Fee[] = (feeRows ?? []).map((f) => ({
    id: f.id!, label: f.label!, basis: f.basis!, amount: f.amount, percent: f.percent, months: f.months,
    phase: f.phase, notes: f.notes, sequence: f.sequence ?? 0, total: f.total,
  }));
  const coTotals = changeOrders?.length
    ? (await supabase.from("change_order_totals").select("change_order_id, total, lines").in("change_order_id", changeOrders.map((c) => c.id))).data ?? []
    : [];
  const coTotal = (cid: string) => Number(coTotals.find((t) => t.change_order_id === cid)?.total ?? 0);
  const contractSigned = !!project.contract_version_id;
  const cur = studio.currency;

  const facts = [
    ["Client", project.clients?.name],
    ["District", project.district],
    ["Address", project.address],
    ["Area", project.area_m2 ? `${project.area_m2} m²` : null],
    ["Year built", project.building_year],
    ["Client budget", project.client_budget != null ? money(project.client_budget) : null],
  ] as const;

  return (
    <div className="space-y-10">
      <ProjectHeader
        project={{ id: project.id, code: project.code, name: project.name, status: project.status, phase: project.phase, room_height: project.room_height }}
        facts={facts.map(([k, v]) => [k, v == null ? null : String(v)] as [string, string | null])}
        canWrite={studio.canWrite}
        defaultRoomHeight={studio.defaultRoomHeight}
        editable={{
          id: project.id, code: project.code, name: project.name, client: project.clients?.name ?? null, district: project.district,
          address: project.address, area: project.area_m2, year: project.building_year, budget: project.client_budget, roomHeight: project.room_height,
        }}
      />

      {contractSigned && summary ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label={`Contract · signed ${project.contract_signed_on ?? ""}`} value={money(summary.contract_budget, cur)} sub={project.contract_value != null && Math.abs(Number(project.contract_value) - Number(summary.contract_budget)) > 0.5 ? `Agreed value ${money(project.contract_value, cur)}` : "Locked baseline"} />
          <Figure label="Approved changes" value={`${Number(summary.approved_changes) >= 0 ? "+" : ""}${money(summary.approved_changes, cur)}`} sub={`${summary.approved_count} change ${summary.approved_count === 1 ? "order" : "orders"}`} />
          <Figure label="Pending changes" value={money(summary.pending_changes, cur)} sub={`${summary.pending_count} draft or sent`} />
          <Figure label="Current budget" value={money(summary.current_budget, cur)} sub="Contract + approved changes" strong />
        </section>
      ) : project.status === "won" && studio.canWrite && versions.length > 0 ? (
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Won: sign the contract</h2>
            <p className="text-sm text-muted">Lock the agreed budget as the baseline. Changes after that are priced as change orders.</p>
          </div>
          <SignContractButton projectId={project.id} currency={cur} versions={versions.filter((v) => !v.locked).map((v) => ({ id: v.id, label: v.label, total: (totalFor(v.id).low + totalFor(v.id).high) / 2 }))} />
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Versions</h2>
          {studio.canWrite && (project.status === "won" || project.phase !== "bid" || versions.length === 0 || studio.allowBidOptions) ? (
            <NewVersionButton projectId={id} versions={versions.map((v) => ({ id: v.id, label: v.label }))} />
          ) : studio.canWrite ? (
            <p className="max-w-md text-right text-xs text-muted">
              Bid stage: one standard version. Alternatives open once the project is Won (or allow options in the bid in Settings → Studio).
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {versions.map((v) => {
            const t = totalFor(v.id);
            return (
              <Link key={v.id} href={`/projects/${id}/versions/${v.id}`} className="card block p-5 hover:border-accent">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-semibold">{v.label}</span>
                  <span className="text-xs text-muted">{v.id === project.contract_version_id ? "🔒 Contract baseline" : humanize(v.status)}</span>
                </div>
                <p className="mt-1 min-h-5 text-sm text-muted">{v.description ?? ""}</p>
                {(v.model_tool || v.model_option) && (
                  <p className="mt-1 text-xs text-muted">{[modelToolLabel(v.model_tool), v.model_option].filter(Boolean).join(" · ")}</p>
                )}
                <p className="mt-4 text-lg tabular-nums">
                  {t.priced ? `${money(t.low)} – ${money(t.high)}` : "Not priced yet"}
                </p>
                <p className="mt-1 text-xs text-muted">{t.priced} of {t.lines} lines priced</p>
              </Link>
            );
          })}
        </div>
      </section>

      {versions.length > 0 && (
        <section id="compare" className="scroll-mt-20 space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{versions.length > 1 ? "Compare versions" : "Where the money goes"}</h2>
            <p className="text-sm text-muted">
              Line totals before VAT, by chapter or by room{versions.length > 1 ? ", with what each option adds or saves" : ""}. Pick up to four versions.
            </p>
          </div>
          <VersionCompare
            versions={versions.map((v) => ({ id: v.id, label: v.label, note: v.id === project.contract_version_id ? "🔒 contract" : (modelToolLabel(v.model_tool) ?? null) }))}
            lines={compareLines}
            initial={initialCompare}
            currency={cur}
          />
        </section>
      )}

      <section id="fees" className="scroll-mt-20 space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Architect&apos;s fees</h2>
          <p className="text-sm text-muted">Fixed amounts, a % of the construction budget, or monthly site supervision. Before VAT.</p>
        </div>
        {fees.length > 0 && feeSummary && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Figure label="Total fees" value={money(feeSummary.fees_total, cur)}
              sub={Number(feeSummary.items_missing_months) > 0 ? "Some monthly fees need their months" : `${fees.length} ${fees.length === 1 ? "item" : "items"}`} strong />
            <Figure label="Share of construction" value={feeSummary.fees_pct == null ? "—" : `${Number(feeSummary.fees_pct).toLocaleString("es-ES")} %`}
              sub={`of ${money(feeSummary.construction_base, cur)}`} />
            <Figure label="Received" value={money(feeSummary.received_fees, cur)} sub="Payments in · fees" />
            <Figure label="Still to invoice / collect" value={money(feeSummary.fees_outstanding, cur)} />
          </div>
        )}
        <div className="card p-5">
          <FeeEditor fees={fees} projectId={project.id} canWrite={studio.canWrite} currency={cur} hasDefaults={(defaultFees ?? 0) > 0} />
        </div>
      </section>

      <section id="change-orders" className="scroll-mt-20 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Change orders</h2>
          {contractSigned && studio.canWrite && <NewChangeOrderButton projectId={project.id} />}
        </div>
        {!contractSigned ? (
          <p className="text-sm text-muted">Change orders start once the contract is signed: they price changes against the locked baseline.</p>
        ) : (changeOrders ?? []).length === 0 ? (
          <p className="text-sm text-muted">No changes yet. Price a client request, or add a change found on site.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line"><th className="px-4 py-2">No.</th><th className="px-4 py-2">Change</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {(changeOrders ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-4 py-2 font-mono text-xs text-accent">CO-{String(c.number).padStart(2, "0")}</td>
                    <td className="px-4 py-2"><Link href={`/projects/${id}/changes/${c.id}`} className="font-medium hover:text-accent">{c.title}</Link></td>
                    <td className="px-4 py-2 text-muted">{humanize(c.reason)}</td>
                    <td className="px-4 py-2">{humanize(c.status)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{coTotal(c.id) >= 0 ? "+" : ""}{money(coTotal(c.id), cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ClientRequests
        projectId={project.id}
        canWrite={studio.canWrite}
        contractSigned={contractSigned}
        requests={(requests ?? []).map((r) => {
          const co = (changeOrders ?? []).find((c) => c.decision_id === r.id);
          return { ...r, changeOrder: co ? { id: co.id, number: co.number } : null };
        })}
      />
      {studio.isAdmin && (
        <section className="flex items-center justify-between border-t border-line pt-6 text-sm">
          <p className="text-muted">Owners and admins can delete a project; it can be undone from Settings → Activity.</p>
          <DeleteProject id={project.id} code={project.code} name={project.name} />
        </section>
      )}
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
