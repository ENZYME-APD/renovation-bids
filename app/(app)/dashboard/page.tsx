import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { dateShort, dateTime, humanize, money } from "@/lib/format";
import { describe, groupChanges, sourceLabel, type ActivityRow } from "@/lib/activity";
import { CountBars, DonutWithLegend, EurPerM2Bars, FeeScatter, MoneyBars, type FeePoint } from "@/components/charts";
import { OPEN_STATUSES, STATUS_COLOR, STATUS_ORDER } from "@/lib/status";

const ACTION_LABEL: Record<string, string> = {
  change_pending: "Change order",
  rfq_reminder: "Chase supplier", quote_review: "Review quote", unpriced_lines: "Price lines", offer_expiring: "Offer expiring",
  open_decision: "Client request", invoice_due: "Invoice due", delivery_late: "Late delivery",
};
const OPEN: readonly string[] = OPEN_STATUSES;

export default async function DashboardPage() {
  const studio = await requireStudio();
  const supabase = await createClient();
  const [stats, actions, money_, invoices, log] = await Promise.all([
    supabase.from("project_stats").select("project_id, code, name, status, created_at, subtotal, budget_low, budget_high, eur_per_m2, contract_value, bid_hours, lines, priced_lines, phase, area_m2"),
    supabase.from("action_items").select("*").order("priority").order("due_on", { nullsFirst: false }).limit(12),
    supabase.from("project_money").select("project_id, code, name, status, budget, committed, paid_out, received_works, received_fees, contract_value"),
    supabase.from("invoice_balances").select("outstanding, due_on"),
    supabase.from("activity_log").select("*").order("occurred_at", { ascending: false }).limit(60),
  ]);
  const { data: feeData } = await supabase.from("project_fee_summary").select("project_id, construction_base, fees_total, items, items_missing_months, received_fees, fees_outstanding, fees_pct");
  const projects = stats.data ?? [];
  const cur = studio.currency;

  // KPIs
  const open = projects.filter((p) => OPEN.includes(p.status ?? ""));
  const won = projects.filter((p) => p.status === "won");
  const lost = projects.filter((p) => p.status === "lost");
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
  const priced = projects.filter((p) => p.eur_per_m2 != null);
  const avgM2 = priced.length ? priced.reduce((t, p) => t + Number(p.eur_per_m2), 0) / priced.length : null;
  const outstanding = (invoices.data ?? []).reduce((t, i) => t + Number(i.outstanding ?? 0), 0);
  const bidHours = projects.reduce((t, p) => t + Number(p.bid_hours ?? 0), 0);

  // Charts
  const byStatus = STATUS_ORDER.map((s) => ({ key: s, label: humanize(s), color: STATUS_COLOR[s], value: projects.filter((p) => p.status === s).length })).filter((d) => d.value > 0);
  const months: { label: string; key: string; value: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }), value: 0 });
  }
  for (const p of projects) {
    const d = new Date(p.created_at ?? "");
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.value++;
  }
  const m2 = priced
    .sort((a, b) => Number(b.eur_per_m2) - Number(a.eur_per_m2))
    .slice(0, 12)
    .map((p) => ({ label: p.code ?? "", name: p.name ?? "", value: Math.round(Number(p.eur_per_m2)) }));
  const moneyRows = (money_.data ?? [])
    .filter((m) => m.status === "won")
    .map((m) => ({ label: m.code ?? "", budget: Number(m.budget ?? 0), committed: Number(m.committed ?? 0), paid: Number(m.paid_out ?? 0) }));
  // Fees across projects
  const feeRows = (feeData ?? [])
    .filter((f) => Number(f.items) > 0)
    .map((f) => {
      const p = projects.find((x) => x.project_id === f.project_id);
      const area = p?.area_m2 ? Number(p.area_m2) : null;
      const fees = Number(f.fees_total ?? 0);
      const construction = Number(f.construction_base ?? 0);
      return {
        id: f.project_id!, code: p?.code ?? "", name: p?.name ?? "", status: p?.status ?? "lead", area, construction, fees,
        pct: f.fees_pct == null ? null : Number(f.fees_pct), perM2: area ? fees / area : null,
        received: Number(f.received_fees ?? 0), outstanding: Number(f.fees_outstanding ?? 0), missingMonths: Number(f.items_missing_months ?? 0),
      };
    })
    .sort((a, b) => b.fees - a.fees);
  const feeTotal = feeRows.reduce((t, r) => t + r.fees, 0);
  const feeWon = feeRows.filter((r) => r.status === "won").reduce((t, r) => t + r.fees, 0);
  const feeReceived = feeRows.reduce((t, r) => t + r.received, 0);
  const withPct = feeRows.filter((r) => r.pct != null && r.construction > 0);
  // Weighted: total fees over total construction, so big projects count for what they are.
  const avgPct = withPct.length ? (withPct.reduce((t, r) => t + r.fees, 0) / withPct.reduce((t, r) => t + r.construction, 0)) * 100 : null;
  const withArea = feeRows.filter((r) => r.perM2 != null);
  const avgPerM2 = withArea.length ? withArea.reduce((t, r) => t + r.fees, 0) / withArea.reduce((t, r) => t + (r.area ?? 0), 0) : null;
  const missingMonths = feeRows.filter((r) => r.missingMonths > 0).length;
  const feePoints: FeePoint[] = feeRows.filter((r) => r.construction > 0).map((r) => ({
    code: r.code, name: r.name, construction: r.construction, fees: r.fees, area: r.area, pct: r.pct, color: STATUS_COLOR[r.status], status: r.status,
  }));

  const changes = groupChanges((log.data ?? []) as ActivityRow[]).slice(0, 6);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{studio.name}</p>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <PageIntro wiki="dashboard">What needs doing today and how the pipeline is going. Click an action item to go straight to the work.</PageIntro>
        </div>
        {studio.canWrite && <Link href="/projects?new=1" className="btn">+ New project</Link>}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Bids in progress" value={String(open.length)} sub={money(open.reduce((t, p) => t + Number(p.subtotal ?? 0), 0), cur)} />
        <Stat label="Won" value={String(won.length)} sub={`${money(won.reduce((t, p) => t + Number(p.contract_value ?? p.subtotal ?? 0), 0), cur)} · ${projects.filter((p) => p.phase === "design").length} in design, ${projects.filter((p) => p.phase === "construction").length} on site`} />
        <Stat label="Win rate" value={winRate == null ? "—" : `${winRate}%`} sub={`${won.length} won · ${lost.length} lost`} />
        <Stat label="Average €/m²" value={avgM2 == null ? "—" : money(avgM2, cur)} sub={`${priced.length} priced projects`} />
        <Stat label="Unpaid invoices" value={money(outstanding, cur)} sub="supplier invoices outstanding" />
        <Stat label="Bid hours" value={String(Math.round(bidHours))} sub="unpaid pre-contract time" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Action items</h2>
          {actions.data?.length ? (
            <ul className="divide-y divide-line">
              {actions.data.map((a, i) => (
                <li key={`${a.kind}-${a.ref_id}-${i}`} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="mr-2 rounded-full border border-line px-2 py-0.5 text-xs text-muted">{ACTION_LABEL[a.kind ?? ""] ?? humanize(a.kind ?? "")}</span>
                    <Link href={actionHref(a)} className="hover:underline">{a.title}</Link>
                    <span className="ml-2 text-muted">{a.project_code}</span>
                  </div>
                  {a.due_on && <span className={`shrink-0 text-xs ${new Date(a.due_on) < new Date() ? "text-accent" : "text-muted"}`}>{dateShort(a.due_on)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing pending.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Projects by status</h2>
          {byStatus.length ? (
            <DonutWithLegend data={byStatus} kind="count" centre={String(projects.length)} sub={projects.length === 1 ? "project" : "projects"} size={160} />
          ) : <Empty />}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">New bids per month</h2>
          <p className="mb-3 text-xs text-muted">Projects opened, last 12 months</p>
          <CountBars data={months} />
        </section>
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Budget per m²</h2>
          <p className="mb-3 text-xs text-muted">Main version, before VAT. Hover a bar for the project.</p>
          {m2.length ? <EurPerM2Bars data={m2} currency={cur} /> : <Empty text="Projects need an area and priced lines." />}
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">Won projects: budget, committed and paid</h2>
        <p className="mb-3 text-xs text-muted">Committed = purchase orders not cancelled. Paid out = payments to suppliers and contractors.</p>
        {moneyRows.length ? <MoneyBars data={moneyRows} currency={cur} /> : <Empty text="Appears once a project is won and purchasing starts." />}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Architect&apos;s fees</h2>
          <p className="text-sm text-muted">Fees across projects against construction budget and area, before VAT.</p>
        </div>
        {feeRows.length === 0 ? (
          <Empty text="Add fees to projects (or default fees in Settings → Studio) to see them here." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <Stat label="Fees in all projects" value={money(feeTotal, cur)} sub={`${feeRows.length} projects`} />
              <Stat label="Fees in won projects" value={money(feeWon, cur)} sub={`${feeRows.filter((r) => r.status === "won").length} won`} />
              <Stat label="Average share of construction" value={avgPct == null ? "—" : `${avgPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`} sub="Total fees ÷ total construction" />
              <Stat label="Average fee per m²" value={avgPerM2 == null ? "—" : `${money(avgPerM2, cur)}/m²`} sub={`${withArea.length} projects with area`} />
              <Stat label="Received" value={money(feeReceived, cur)} sub={`${money(feeTotal - feeReceived, cur)} still to collect`} />
            </div>
            {missingMonths > 0 && (
              <p className="text-xs text-accent">
                {missingMonths} {missingMonths === 1 ? "project has" : "projects have"} monthly fees without months: their supervision isn&apos;t counted yet.
              </p>
            )}
            <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
              <section className="card p-5">
                <h3 className="mb-1 font-semibold">Fees vs construction budget</h3>
                <p className="mb-3 text-xs text-muted">One dot per project, coloured by status. Dashed lines: 5 % and 10 % of construction.</p>
                <FeeScatter data={feePoints} currency={cur} />
              </section>
              <section className="card p-5">
                <h3 className="mb-1 font-semibold">Fee per m²</h3>
                <p className="mb-3 text-xs text-muted">Total fees ÷ project area.</p>
                {withArea.length ? (
                  <EurPerM2Bars data={withArea.map((r) => ({ label: r.code, name: r.name, value: Math.round(r.perM2!) }))} currency={cur} />
                ) : <Empty text="Projects need an area." />}
              </section>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 text-right font-medium">Area</th>
                    <th className="px-4 py-2 text-right font-medium">Construction</th>
                    <th className="px-4 py-2 text-right font-medium">Fees</th>
                    <th className="px-4 py-2 text-right font-medium">% of construction</th>
                    <th className="px-4 py-2 text-right font-medium">€/m²</th>
                    <th className="px-4 py-2 text-right font-medium">Received</th>
                    <th className="px-4 py-2 text-right font-medium">To collect</th>
                  </tr>
                </thead>
                <tbody>
                  {feeRows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: STATUS_COLOR[r.status] }} />
                        <Link href={`/projects/${r.id}#fees`} className="hover:text-accent"><span className="font-mono text-xs text-muted">{r.code}</span> {r.name}</Link>
                        {r.missingMonths > 0 && <span className="ml-2 text-xs text-accent">months missing</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.area ? `${r.area} m²` : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(r.construction, cur)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{money(r.fees, cur)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.pct == null ? "—" : `${r.pct.toLocaleString("es-ES")} %`}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.perM2 == null ? "—" : money(r.perM2, cur)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(r.received, cur)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(r.outstanding, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Recent activity</h2>
          <Link href="/settings?tab=activity" className="text-sm text-muted hover:text-ink">All activity</Link>
        </div>
        {changes.length ? (
          <ul className="divide-y divide-line text-sm">
            {changes.map((c) => (
              <li key={c.changeId} className="py-2">
                <span className="text-muted">{dateTime(c.at)} · {c.actor ?? "System"} · {sourceLabel(c)}</span>
                <div className={`truncate ${c.undone ? "line-through opacity-60" : ""}`}>
                  {describe(c.items[0])}{c.items.length > 1 ? ` and ${c.items.length - 1} more` : ""}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

const Empty = ({ text = "Nothing yet." }: { text?: string }) => <p className="text-sm text-muted">{text}</p>;

/** Where an action item's work happens. */
function actionHref(a: { kind: string | null; project_id: string | null; ref_id: string | null }) {
  const project = `/projects/${a.project_id}`;
  switch (a.kind) {
    case "unpriced_lines":
      return a.ref_id ? `${project}/versions/${a.ref_id}?audit=1` : project;
    case "change_pending":
      return a.ref_id ? `${project}/changes/${a.ref_id}` : project;
    case "invoice_due":
    case "delivery_late":
      return `${project}/purchases`;
    default:
      return project;
  }
}
