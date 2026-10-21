import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { humanize, money } from "@/lib/format";
import { NewProjectButton } from "./new-project-form";
import { DonutWithLegend, MoneyRows } from "@/components/charts";
import { OPEN_STATUSES, PHASE_COLOR, PHASE_ORDER, STATUS_COLOR, STATUS_ORDER } from "@/lib/status";

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const studio = await requireStudio();
  const sp = await searchParams;
  const openNew = sp.new === "1";
  const PHASES = ["bid", "design", "construction", "closed"] as const;
  const phase = PHASES.find((p) => p === sp.phase) ?? null;
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, code, name, district, status, phase, updated_at, clients(name)")
    .eq("organization_id", studio.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const { data: stats } = await supabase
    .from("project_stats")
    .select("project_id, status, phase, subtotal, contract_value, eur_per_m2, area_m2")
    .eq("organization_id", studio.id);
  const st = stats ?? [];
  const cur = studio.currency;
  const areaOf = (pid: string) => {
    const a = st.find((x) => x.project_id === pid)?.area_m2;
    return a ? Number(a) : null;
  };
  const perM2Of = (pid: string) => {
    const b = budgetOf(pid), a = areaOf(pid);
    return b && a ? b / a : null;
  };
  const budgetOf = (pid: string) => {
    const r = st.find((x) => x.project_id === pid);
    return r ? Number(r.contract_value ?? r.subtotal ?? 0) : null;
  };
  const open: readonly string[] = OPEN_STATUSES;
  const sum = (rows: typeof st) => rows.reduce((t, r) => t + Number(r.contract_value ?? r.subtotal ?? 0), 0);
  const inBid = st.filter((r) => open.includes(r.status ?? ""));
  const won = st.filter((r) => r.status === "won");
  const priced = st.filter((r) => r.eur_per_m2 != null);
  const avgM2 = priced.length ? priced.reduce((t, r) => t + Number(r.eur_per_m2), 0) / priced.length : null;
  const area = st.reduce((t, r) => t + Number(r.area_m2 ?? 0), 0);
  const byPhase = PHASE_ORDER.map((ph) => ({ key: ph, label: humanize(ph), color: PHASE_COLOR[ph], value: projects.filter((p) => p.phase === ph).length })).filter((d) => d.value > 0);
  const byStatusValue = STATUS_ORDER.map((s) => {
    const rows = st.filter((r) => r.status === s);
    return { label: humanize(s), value: Math.round(sum(rows)), color: STATUS_COLOR[s], count: rows.length };
  }).filter((d) => d.count > 0);
  const shown = phase ? projects.filter((p) => p.phase === phase) : projects;
  const count = (ph: string) => projects.filter((p) => p.phase === ph).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{studio.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Projects</h1>
          <PageIntro wiki="project-lifecycle">One project per job, through its whole life: bid, design, construction, closed. Until it is won, a bid has one standard version.</PageIntro>
          {typeof sp.deleted === "string" && (
            <p className="mt-2 text-sm text-ok">{sp.deleted} deleted. Changed your mind? Settings → Activity → Undo.</p>
          )}
        </div>
        {studio.canWrite && <NewProjectButton initialOpen={openNew} />}
      </div>

      {projects.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Projects" value={String(projects.length)} sub={area ? `${Math.round(area).toLocaleString("es-ES")} m² in total` : undefined} />
            <Stat label="In the bid" value={money(sum(inBid), cur)} sub={`${inBid.length} open ${inBid.length === 1 ? "bid" : "bids"}`} />
            <Stat label="Won" value={money(sum(won), cur)} sub={`${won.length} ${won.length === 1 ? "project" : "projects"}`} />
            <Stat label="Average €/m²" value={avgM2 == null ? "—" : money(avgM2, cur)} sub={`${priced.length} priced with an area`} />
          </section>
          <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">By phase</h2>
              <DonutWithLegend data={byPhase} kind="count" centre={String(projects.length)} sub={projects.length === 1 ? "project" : "projects"} size={150} />
            </section>
            <section className="card p-5">
              <h2 className="mb-1 font-semibold">Budget by status</h2>
              <p className="mb-2 text-xs text-muted">Main version before VAT, or the contract value once signed.</p>
              <MoneyRows data={byStatusValue} currency={cur} />
            </section>
          </div>
        </>
      )}

      <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filter by phase">
        <Link href="/projects" className={`rounded-full border px-3 py-1 ${!phase ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink"}`}>All ({projects.length})</Link>
        {PHASES.map((ph) => (
          <Link key={ph} href={`/projects?phase=${ph}`} className={`rounded-full border px-3 py-1 ${phase === ph ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink"}`}>
            {humanize(ph)} ({count(ph)})
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{projects.length ? "No projects in this phase." : "No projects yet. Use + New project to create the first one."}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">District</th>
                <th className="px-4 py-2 font-medium">Phase</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Budget</th>
                <th className="px-4 py-2 text-right font-medium">Area</th>
                <th className="px-4 py-2 text-right font-medium">€/m²</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-4 py-2 font-mono text-xs text-muted">{p.code}</td>
                  <td className="px-4 py-2">
                    <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-muted">{p.clients?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{p.district ?? "—"}</td>
                  <td className="px-4 py-2">{humanize(p.phase)}</td>
                  <td className="px-4 py-2 text-muted">
                    <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: STATUS_COLOR[p.status] }} />
                    {humanize(p.status)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{budgetOf(p.id) ? money(budgetOf(p.id), cur) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{areaOf(p.id) ? `${areaOf(p.id)} m²` : "—"}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{perM2Of(p.id) ? money(perM2Of(p.id), cur) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
