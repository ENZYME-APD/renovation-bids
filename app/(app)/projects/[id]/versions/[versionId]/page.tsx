import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { humanize, money, money2, unitLabel } from "@/lib/format";
import { Constants } from "@/lib/database.types";
import { deleteLine, updateLine, updateVersionStatus } from "./actions";
import { AddLineForm } from "./add-line-form";

export default async function VersionPage({ params }: PageProps<"/projects/[id]/versions/[versionId]">) {
  const { id: projectId, versionId } = await params;
  const studio = await requireStudio();
  const supabase = await createClient();

  const [{ data: version }, { data: project }] = await Promise.all([
    supabase.from("versions").select("id, label, description, status, project_id").eq("id", versionId).maybeSingle(),
    supabase.from("projects").select("id, code, name").eq("id", projectId).maybeSingle(),
  ]);
  if (!version || !project || version.project_id !== project.id) notFound();

  const [budgetRes, linesRes, partidasRes, pricesRes] = await Promise.all([
    supabase.rpc("version_budget", { p_version: versionId }),
    supabase
      .from("line_items")
      .select("id, quantity, unit_price, confidence, state, total, updated_at, partidas(id, code, short_description, unit, trades(id, name, sequence))")
      .eq("version_id", versionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("partidas")
      .select("id, code, short_description, unit, trades(name, sequence)")
      .eq("active", true)
      .order("code"),
    supabase.rpc("current_prices", { p_org: studio.id }),
  ]);
  if (linesRes.error) throw linesRes.error;
  if (partidasRes.error) throw partidasRes.error;

  const budget = budgetRes.data ?? [];
  const lines = linesRes.data;
  const priceByPartida = new Map((pricesRes.data ?? []).map((p) => [p.partida_id, Number(p.unit_price)]));

  const totals = budget.reduce(
    (t, r) => ({ sub: t.sub + Number(r.subtotal), low: t.low + Number(r.budget_low), high: t.high + Number(r.budget_high) }),
    { sub: 0, low: 0, high: 0 },
  );

  // Group lines by trade, in site order.
  const groups = new Map<string, { name: string; sequence: number; lines: typeof lines }>();
  for (const l of lines) {
    const t = l.partidas?.trades;
    const key = t?.id ?? "none";
    if (!groups.has(key)) groups.set(key, { name: t?.name ?? "Other", sequence: t?.sequence ?? 999, lines: [] });
    groups.get(key)!.lines.push(l);
  }
  const lineGroups = [...groups.values()].sort((a, b) => a.sequence - b.sequence);

  // Partida picker, grouped by trade.
  const picker = new Map<string, { trade: string; sequence: number; partidas: { id: string; code: string; description: string; unit: string; price: number | null }[] }>();
  for (const p of partidasRes.data) {
    const trade = p.trades?.name ?? "Other";
    if (!picker.has(trade)) picker.set(trade, { trade, sequence: p.trades?.sequence ?? 999, partidas: [] });
    picker.get(trade)!.partidas.push({
      id: p.id, code: p.code, description: p.short_description, unit: unitLabel[p.unit] ?? p.unit, price: priceByPartida.get(p.id) ?? null,
    });
  }
  const pickerGroups = [...picker.values()].sort((a, b) => a.sequence - b.sequence);

  const hidden = (
    <>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="version_id" value={versionId} />
    </>
  );

  return (
    <div className="space-y-10">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-muted hover:text-ink">
          ← {project.code} · {project.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Version {version.label}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{version.description || "Budget"}</h1>
          </div>
          <form action={updateVersionStatus} className="flex items-end gap-2">
            {hidden}
            <div>
              <label htmlFor="vstatus" className="label">Version status</label>
              <select id="vstatus" name="status" defaultValue={version.status} className="input">
                {Constants.public.Enums.version_status.map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </select>
            </div>
            <button className="btn-quiet">Save</button>
          </form>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs text-muted">Works budget, range</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {totals.sub ? `${money(totals.low)} – ${money(totals.high)}` : "—"}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-muted">Priced subtotal</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(totals.sub)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-muted">Lines priced</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {lines.filter((l) => l.unit_price != null).length} / {lines.length}
          </p>
        </div>
      </section>

      {budget.length > 0 && (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Trade</th>
                <th className="px-4 py-2 text-right font-medium">Lines</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                <th className="px-4 py-2 text-right font-medium">Low</th>
                <th className="px-4 py-2 text-right font-medium">High</th>
              </tr>
            </thead>
            <tbody>
              {budget.map((r) => (
                <tr key={r.trade_id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{r.trade}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{r.priced_lines}/{r.lines}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.subtotal)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{money(r.budget_low)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{money(r.budget_high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Line items</h2>
        {lines.length === 0 && <p className="text-sm text-muted">No lines yet. Add the first partida below.</p>}
        {lineGroups.map((g) => (
          <div key={g.name} className="card overflow-x-auto">
            <div className="border-b border-line px-4 py-2 text-sm font-semibold">{g.name}</div>
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Partida</th>
                  <th className="w-28 px-2 py-2 font-medium">Qty</th>
                  <th className="w-28 px-2 py-2 font-medium">Unit price</th>
                  <th className="w-28 px-2 py-2 font-medium">Confidence</th>
                  <th className="w-32 px-2 py-2 font-medium">State</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                  <th className="w-36 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => {
                  const fid = `line-${l.id}`;
                  const suggested = l.partidas ? priceByPartida.get(l.partidas.id) : undefined;
                  return (
                    // Keyed by updated_at so inputs remount with saved values after each save.
                    <tr key={`${l.id}-${l.updated_at}`} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs text-muted">{l.partidas?.code}</span>
                        <div>{l.partidas?.short_description}</div>
                        {l.unit_price == null && suggested != null && (
                          <div className="text-xs text-ok">Current price: {money2(suggested)}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <input form={fid} name="quantity" defaultValue={l.quantity} inputMode="decimal" className="input px-2 py-1" />
                          <span className="text-xs text-muted">{unitLabel[l.partidas?.unit ?? ""] ?? ""}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input form={fid} name="unit_price" defaultValue={l.unit_price ?? ""} inputMode="decimal" className="input px-2 py-1" placeholder="—" />
                      </td>
                      <td className="px-2 py-2">
                        <select form={fid} name="confidence" defaultValue={l.confidence ?? ""} className="input px-2 py-1">
                          <option value="">—</option>
                          {Constants.public.Enums.confidence.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select form={fid} name="state" defaultValue={l.state} className="input px-2 py-1">
                          {Constants.public.Enums.line_state.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{money2(l.total)}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <form id={fid} action={updateLine}>
                            {hidden}
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="orig_price" value={l.unit_price ?? ""} />
                            <button className="btn-quiet">Save</button>
                          </form>
                          <form action={deleteLine}>
                            {hidden}
                            <input type="hidden" name="id" value={l.id} />
                            <button className="btn-quiet text-muted" aria-label="Delete line">Delete</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Add a line</h3>
          <AddLineForm projectId={projectId} versionId={versionId} groups={pickerGroups} />
        </div>
      </section>
    </div>
  );
}
