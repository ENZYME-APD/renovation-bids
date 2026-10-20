import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { dateShort, dateTime, humanize, money } from "@/lib/format";
import { describe, groupChanges, sourceLabel, type ActivityRow } from "@/lib/activity";
import { CountBars, EurPerM2Bars, MoneyBars } from "@/components/charts";

const ACTION_LABEL: Record<string, string> = {
  rfq_reminder: "Chase supplier", quote_review: "Review quote", unpriced_lines: "Price lines", offer_expiring: "Offer expiring",
  open_decision: "Client request", invoice_due: "Invoice due", delivery_late: "Late delivery",
};
const STATUS_ORDER = ["lead", "qualifying", "site_visit", "design", "pricing", "offer_sent", "won", "lost", "no_go", "on_hold"];
const OPEN = ["lead", "qualifying", "site_visit", "design", "pricing", "offer_sent"];

export default async function DashboardPage() {
  const studio = await requireStudio();
  const supabase = await createClient();
  const [stats, actions, money_, invoices, log] = await Promise.all([
    supabase.from("project_stats").select("project_id, code, name, status, created_at, subtotal, budget_low, budget_high, eur_per_m2, contract_value, bid_hours, lines, priced_lines"),
    supabase.from("action_items").select("*").order("priority").order("due_on", { nullsFirst: false }).limit(12),
    supabase.from("project_money").select("project_id, code, name, status, budget, committed, paid_out, received_works, received_fees, contract_value"),
    supabase.from("invoice_balances").select("outstanding, due_on"),
    supabase.from("activity_log").select("*").order("occurred_at", { ascending: false }).limit(60),
  ]);
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
  const byStatus = STATUS_ORDER.map((s) => ({ label: humanize(s), value: projects.filter((p) => p.status === s).length })).filter((d) => d.value > 0);
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
  const changes = groupChanges((log.data ?? []) as ActivityRow[]).slice(0, 6);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{studio.name}</p>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
        </div>
        {studio.canWrite && <Link href="/projects" className="btn">Projects</Link>}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Bids in progress" value={String(open.length)} sub={money(open.reduce((t, p) => t + Number(p.subtotal ?? 0), 0), cur)} />
        <Stat label="Won" value={String(won.length)} sub={money(won.reduce((t, p) => t + Number(p.contract_value ?? p.subtotal ?? 0), 0), cur)} />
        <Stat label="Win rate" value={winRate == null ? "—" : `${winRate}%`} sub={`${won.length} won · ${lost.length} lost`} />
        <Stat label="Average €/m²" value={avgM2 == null ? "—" : money(avgM2, cur)} sub={`${priced.length} priced projects`} />
        <Stat label="Unpaid invoices" value={money(outstanding, cur)} sub="supplier invoices outstanding" />
        <Stat label="Bid hours" value={String(Math.round(bidHours))} sub="unpaid pre-contract time" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Action items</h2>
          {actions.data?.length ? (
            <ul className="divide-y divide-line">
              {actions.data.map((a, i) => (
                <li key={`${a.kind}-${a.ref_id}-${i}`} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="mr-2 rounded-full border border-line px-2 py-0.5 text-xs text-muted">{ACTION_LABEL[a.kind ?? ""] ?? humanize(a.kind ?? "")}</span>
                    <Link href={`/projects/${a.project_id}`} className="hover:underline">{a.title}</Link>
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
        <section className="card">
          <h2 className="mb-3 font-semibold">Projects by status</h2>
          {byStatus.length ? <CountBars data={byStatus} horizontal height={Math.max(140, byStatus.length * 28 + 30)} /> : <Empty />}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-1 font-semibold">New bids per month</h2>
          <p className="mb-3 text-xs text-muted">Projects opened, last 12 months</p>
          <CountBars data={months} />
        </section>
        <section className="card">
          <h2 className="mb-1 font-semibold">Budget per m²</h2>
          <p className="mb-3 text-xs text-muted">Main version, before VAT. Hover a bar for the project.</p>
          {m2.length ? <EurPerM2Bars data={m2} currency={cur} /> : <Empty text="Projects need an area and priced lines." />}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-1 font-semibold">Won projects: budget, committed and paid</h2>
        <p className="mb-3 text-xs text-muted">Committed = purchase orders not cancelled. Paid out = payments to suppliers and contractors.</p>
        {moneyRows.length ? <MoneyBars data={moneyRows} currency={cur} /> : <Empty text="Appears once a project is won and purchasing starts." />}
      </section>

      <section className="card">
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
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

const Empty = ({ text = "Nothing yet." }: { text?: string }) => <p className="text-sm text-muted">{text}</p>;
