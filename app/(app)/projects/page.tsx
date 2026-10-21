import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { humanize, money } from "@/lib/format";
import { NewProjectButton } from "./new-project-form";

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const studio = await requireStudio();
  const sp = await searchParams;
  const openNew = sp.new === "1";
  const PHASES = ["bid", "design", "construction", "closed"] as const;
  const phase = PHASES.find((p) => p === sp.phase) ?? null;
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, code, name, district, status, phase, client_budget, updated_at, clients(name)")
    .eq("organization_id", studio.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const shown = phase ? projects.filter((p) => p.phase === phase) : projects;
  const count = (ph: string) => projects.filter((p) => p.phase === ph).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{studio.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Projects</h1>
          <PageIntro wiki="project-lifecycle">One project per job, through its whole life: bid, design, construction, closed. Until it is won, a bid has one standard version.</PageIntro>
        </div>
        {studio.canWrite && <NewProjectButton initialOpen={openNew} />}
      </div>

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
                <th className="px-4 py-2 text-right font-medium">Client budget</th>
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
                  <td className="px-4 py-2 text-muted">{humanize(p.status)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(p.client_budget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
