import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { humanize, money, unitLabel } from "@/lib/format";
import { Constants } from "@/lib/database.types";
import { updateVersionStatus } from "./actions";
import { AddButtons } from "./add-buttons";
import { effectiveCatalogue } from "@/lib/catalogue";
import { LineTable, type Group, type Line } from "./line-table";
import type { RoomInfo, Template } from "./add-room-form";

export default async function VersionPage({ params, searchParams }: PageProps<"/projects/[id]/versions/[versionId]">) {
  const { id: projectId, versionId } = await params;
  const sp = await searchParams;
  const groupBy = sp.group === "room" ? "room" : "chapter";
  const audit = sp.audit === "1";
  const studio = await requireStudio();
  const supabase = await createClient();

  const [{ data: version }, { data: project }] = await Promise.all([
    supabase.from("versions").select("id, label, description, status, project_id, locked").eq("id", versionId).maybeSingle(),
    supabase.from("projects").select("id, code, name, room_height").eq("id", projectId).maybeSingle(),
  ]);
  if (!version || !project || version.project_id !== project.id) notFound();

  const [budgetRes, linesRes, partidasRes, pricesRes, templatesRes, roomsRes] = await Promise.all([
    supabase.rpc("version_budget", { p_version: versionId }),
    supabase
      .from("line_items")
      .select("id, quantity, unit_price, confidence, state, total, notes, room, room_id, source, overridden, updated_at, supplied_by, description, client_note, measurement_note, reference_price, reference_source, line_measurements(label, count, length, width, height, partial, sequence), partidas(id, code, short_description, long_description, unit, trades(id, code, name, sequence))")
      .eq("version_id", versionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("partidas")
      .select("id, code, short_description, unit, trade_id, organization_id, active, trades(code, name, sequence)")
      .order("code"),
    supabase.rpc("current_prices", { p_org: studio.id }),
    supabase
      .rpc("effective_room_templates", { p_org: studio.id })
      .select("id, code, name, size_label, description, sequence")
      .eq("active", true),
    supabase
      .from("rooms")
      .select("id, name, template_id, size, perimeter, height, openings, perimeter_estimated, height_assumed, source, created_at")
      .eq("version_id", versionId)
      .order("created_at"),
  ]);
  if (linesRes.error) throw linesRes.error;
  if (templatesRes.error) throw templatesRes.error;
  // PostgREST cannot order a function's rows here, so sort in code.
  const templateRows = [...(templatesRes.data ?? [])].sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name, "es"));
  // Which templates measure walls (perimeter or wall area): those ask for height and perimeter.
  const roomRows = roomsRes.data ?? [];
  const tplIds = [...new Set([...templateRows.map((t) => t.id), ...roomRows.map((r) => r.template_id).filter((x): x is string => !!x)])];
  const { data: wallLines } = tplIds.length
    ? await supabase.from("room_template_lines").select("template_id").in("template_id", tplIds).or("per_perimeter.neq.0,per_wall_area.neq.0")
    : { data: [] as { template_id: string }[] };
  const wallTemplates = new Set((wallLines ?? []).map((l) => l.template_id));
  const templates: Template[] = templateRows.map((t) => ({ id: t.id, code: t.code, name: t.name, size_label: t.size_label, description: t.description, walls: wallTemplates.has(t.id) }));
  const sizeLabelOf = new Map(templateRows.map((t) => [t.id, t.size_label]));
  const roomInfo = new Map<string, RoomInfo>(roomRows.map((r) => [r.id, {
    id: r.id, name: r.name, size: Number(r.size), sizeLabel: r.template_id ? (sizeLabelOf.get(r.template_id) ?? "m²") : "m²",
    perimeter: r.perimeter == null ? null : Number(r.perimeter), height: r.height == null ? null : Number(r.height), openings: Number(r.openings),
    perimeterEstimated: r.perimeter_estimated, heightAssumed: r.height_assumed, source: r.source, walls: !!r.template_id && wallTemplates.has(r.template_id),
  }]));
  const defaultHeight = Number(project.room_height ?? studio.defaultRoomHeight);
  if (partidasRes.error) throw partidasRes.error;

  const budget = budgetRes.data ?? [];
  const lines = linesRes.data;
  const priceByPartida = new Map((pricesRes.data ?? []).map((p) => [p.partida_id, Number(p.unit_price)]));

  const clientTotal = lines.filter((l) => l.supplied_by === "client").reduce((t, l) => t + Number(l.total ?? 0), 0);
  const totals = budget.reduce(
    (t, r) => ({ sub: t.sub + Number(r.subtotal), low: t.low + Number(r.budget_low), high: t.high + Number(r.budget_high) }),
    { sub: 0, low: 0, high: 0 },
  );

  // Lines for the table, grouped by chapter (site order) or by room (order first added).
  const rows: (Line & { sequence: number; chapterKey: string })[] = lines.map((l) => {
    const t = l.partidas?.trades;
    return {
      id: l.id,
      code: l.partidas?.code ?? "",
      description: l.partidas?.short_description ?? "",
      unit: unitLabel[l.partidas?.unit ?? ""] ?? "",
      quantity: Number(l.quantity),
      unitPrice: l.unit_price == null ? null : Number(l.unit_price),
      confidence: l.confidence,
      state: l.state,
      total: l.total == null ? null : Number(l.total),
      notes: l.notes,
      room: l.room,
      chapter: t ? (t.code ? `${t.code} · ${t.name}` : t.name) : "Other",
      suggested: l.partidas ? (priceByPartida.get(l.partidas.id) ?? null) : null,
      updatedAt: l.updated_at,
      source: l.source,
      overridden: l.overridden,
      roomId: l.room_id,
      supplied: l.supplied_by,
      jobDescription: l.description,
      longDescription: l.partidas?.long_description ?? null,
      clientNote: l.client_note,
      measurementNote: l.measurement_note,
      referencePrice: l.reference_price == null ? null : Number(l.reference_price),
      referenceSource: l.reference_source,
      measurements: [...(l.line_measurements ?? [])].sort((a, b) => a.sequence - b.sequence).map((m) => ({
        label: m.label, count: m.count == null ? null : Number(m.count), length: m.length == null ? null : Number(m.length),
        width: m.width == null ? null : Number(m.width), height: m.height == null ? null : Number(m.height), partial: Number(m.partial),
      })),
      sequence: t?.sequence ?? 999,
      chapterKey: t?.id ?? "none",
    };
  });
  const rooms = [...new Set(rows.map((r) => r.room).filter((r): r is string => !!r))];
  const groupMap = new Map<string, Group & { order: number }>();
  for (const r of rows) {
    const key = groupBy === "room" ? (r.roomId ?? `name:${r.room ?? ""}`) : r.chapterKey;
    const name = groupBy === "room" ? (r.room ?? "No room") : r.chapter;
    const order = groupBy === "room" ? (r.room ? rooms.indexOf(r.room) : 9999) : r.sequence;
    if (!groupMap.has(key)) groupMap.set(key, { key, name, order, lines: [], room: groupBy === "room" && r.roomId ? roomInfo.get(r.roomId) : undefined });
    groupMap.get(key)!.lines.push(r);
  }
  const lineGroups: Group[] = [...groupMap.values()].sort((a, b) => a.order - b.order);
  if (groupBy === "room") for (const g of lineGroups) g.lines.sort((a, b) => (a as typeof rows[number]).sequence - (b as typeof rows[number]).sequence);

  // Partida picker, grouped by trade.
  const picker = new Map<string, { trade: string; sequence: number; partidas: { id: string; code: string; description: string; unit: string; price: number | null }[] }>();
  for (const p of effectiveCatalogue(partidasRes.data, studio.id)) {
    const trade = p.trades ? (p.trades.code ? `${p.trades.code} · ${p.trades.name}` : p.trades.name) : "Other";
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
  const tab = (g: "chapter" | "room", label: string) => (
    <Link
      href={`?group=${g}${audit ? "&audit=1" : ""}`}
      scroll={false}
      className={`rounded px-3 py-1 ${groupBy === g ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
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
            <PageIntro wiki="budgets">Add rooms from templates and single lines, check the gaps with Incomplete only, and read it by chapter or by room. The range comes from each price&apos;s confidence.</PageIntro>
            {version.locked && (
              <p className="mt-3 rounded-md border-l-4 border-accent bg-accent-soft px-3 py-2 text-sm">
                🔒 This is the signed contract: read-only, the baseline for cost control. Price changes as{" "}
                <Link href={`/projects/${projectId}#change-orders`} className="text-accent underline">change orders</Link>.
              </p>
            )}
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
          <p className="text-xs text-muted">Priced subtotal (contract)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(totals.sub)}</p>
          {clientTotal > 0 && <p className="mt-1 text-xs text-muted">+ {money(clientTotal)} bought by the client, not in the contract</p>}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold tracking-tight">Line items</h2>
            <div className="flex rounded-md border border-line bg-paper p-0.5 text-sm" role="group" aria-label="Group lines by">
              {tab("chapter", "By chapter")}
              {tab("room", "By room")}
            </div>
          </div>
          {studio.canWrite && !version.locked && (
            <div className="flex gap-2">
              <AddButtons projectId={projectId} versionId={versionId} templates={templates} groups={pickerGroups} rooms={rooms} defaultHeight={defaultHeight} />
            </div>
          )}
        </div>
        {lines.length === 0 && <p className="text-sm text-muted">No lines yet. Add a room to fill in its standard items, or add partidas one by one.</p>}
        <LineTable projectId={projectId} versionId={versionId} groups={lineGroups} groupBy={groupBy} rooms={rooms} canWrite={studio.canWrite && !version.locked} initialAudit={audit} />
      </section>
    </div>
  );
}
