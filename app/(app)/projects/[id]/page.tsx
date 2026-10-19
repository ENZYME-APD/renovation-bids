import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { humanize, money } from "@/lib/format";
import { Constants } from "@/lib/database.types";
import { updateProjectStatus } from "../actions";
import { NewVersionForm } from "./new-version-form";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  await requireStudio();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, code, name, address, district, area_m2, building_year, status, client_budget, clients(name)")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const { data: versions, error } = await supabase
    .from("versions")
    .select("id, label, description, status, created_at")
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
      <div>
        <Link href="/projects" className="text-sm text-muted hover:text-ink">← Projects</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted">{project.code}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          </div>
          <form action={updateProjectStatus} className="flex items-end gap-2">
            <input type="hidden" name="id" value={project.id} />
            <div>
              <label htmlFor="status" className="label">Status</label>
              <select id="status" name="status" defaultValue={project.status} className="input">
                {Constants.public.Enums.project_status.map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </select>
            </div>
            <button className="btn-quiet">Save</button>
          </form>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Versions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {versions.map((v) => {
            const t = totalFor(v.id);
            return (
              <Link key={v.id} href={`/projects/${id}/versions/${v.id}`} className="card block p-5 hover:border-accent">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-semibold">{v.label}</span>
                  <span className="text-xs text-muted">{humanize(v.status)}</span>
                </div>
                <p className="mt-1 min-h-5 text-sm text-muted">{v.description ?? ""}</p>
                <p className="mt-4 text-lg tabular-nums">
                  {t.priced ? `${money(t.low)} – ${money(t.high)}` : "Not priced yet"}
                </p>
                <p className="mt-1 text-xs text-muted">{t.priced} of {t.lines} lines priced</p>
              </Link>
            );
          })}
        </div>
        <div className="card p-5">
          <NewVersionForm projectId={id} versions={versions.map((v) => ({ id: v.id, label: v.label }))} />
        </div>
      </section>
    </div>
  );
}
