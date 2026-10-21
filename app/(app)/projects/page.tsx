import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { humanize, money } from "@/lib/format";
import { NewProjectButton } from "./new-project-form";

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const studio = await requireStudio();
  const openNew = (await searchParams).new === "1";
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, code, name, district, status, client_budget, updated_at, clients(name)")
    .eq("organization_id", studio.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{studio.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Projects</h1>
          <PageIntro wiki="bid-workflow">One project per job, from first call to won or lost. Open a project to build its budget; until it is won, a bid has one standard version.</PageIntro>
        </div>
        {studio.canWrite && <NewProjectButton initialOpen={openNew} />}
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted">No projects yet. Use + New project to create the first one.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">District</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Client budget</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-4 py-2 font-mono text-xs text-muted">{p.code}</td>
                  <td className="px-4 py-2">
                    <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-muted">{p.clients?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{p.district ?? "—"}</td>
                  <td className="px-4 py-2">{humanize(p.status)}</td>
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
