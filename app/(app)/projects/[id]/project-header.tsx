import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { humanize } from "@/lib/format";
import { Constants } from "@/lib/database.types";
import { STATUS_COLOR } from "@/lib/status";
import { setProjectRoomHeight, updateProjectStatus } from "../actions";
import { PhaseStepper } from "./lifecycle";
import { ProjectCode } from "./project-code";

type P = { id: string; code: string; name: string; status: string; phase: string; room_height: number | null };

/** Project header: what the project is on the left; phase, status and the way into purchasing on the right. */
export function ProjectHeader({ project, facts, canWrite, defaultRoomHeight }: {
  project: P; facts: [string, string | null][]; canWrite: boolean; defaultRoomHeight: number;
}) {
  return (
      <div className="space-y-3">
        <Link href="/projects" className="text-sm text-muted hover:text-ink">← Projects</Link>
        <section className="card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_21rem]">
          {/* Left: what the project is */}
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <ProjectCode id={project.id} code={project.code} canWrite={canWrite} />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs">
                <span className="inline-block size-2 rounded-full" style={{ background: STATUS_COLOR[project.status] }} />
                {humanize(project.status)}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
            <PageIntro wiki="project-lifecycle">
              Bid with one standard version; once won, sign the contract to lock the baseline and price client requests as change orders.
            </PageIntro>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className={k === "Address" ? "col-span-2 sm:col-span-1" : ""}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5">{v ?? "—"}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-muted">Room height</dt>
                <dd className="mt-0.5">
                  {canWrite ? (
                    <form action={setProjectRoomHeight} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={project.id} />
                      <input name="room_height" inputMode="decimal" defaultValue={project.room_height ?? ""} placeholder={defaultRoomHeight.toFixed(2)}
                        className="input w-20 px-2 py-0.5 text-sm" aria-label="Room height in metres" />
                      <span className="text-xs text-muted">m</span>
                      <button className="btn-quiet px-2 py-0.5 text-xs">Set</button>
                    </form>
                  ) : (
                    `${Number(project.room_height ?? defaultRoomHeight).toFixed(2)} m`
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Right: where it is and what to do next */}
          <aside className="flex flex-col gap-5 border-t border-line bg-paper/60 p-6 lg:border-l lg:border-t-0">
            <div>
              <h2 className="label">Phase</h2>
              <PhaseStepper projectId={project.id} phase={project.phase} canWrite={canWrite} vertical />
            </div>
            <form action={updateProjectStatus}>
              <input type="hidden" name="id" value={project.id} />
              <label htmlFor="status" className="label">Bid status</label>
              <div className="flex gap-2">
                <select id="status" name="status" defaultValue={project.status} className="input" disabled={!canWrite}>
                  {Constants.public.Enums.project_status.map((s) => (
                    <option key={s} value={s}>{humanize(s)}</option>
                  ))}
                </select>
                {canWrite && <button className="btn-quiet">Save</button>}
              </div>
            </form>
            <Link href={`/projects/${project.id}/purchases`} className="btn mt-auto w-full justify-between">
              <span>Purchases &amp; cost control</span><span aria-hidden>→</span>
            </Link>
          </aside>
        </section>
      </div>
  );
}
