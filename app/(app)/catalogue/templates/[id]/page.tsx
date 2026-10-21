import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { effectiveCatalogue } from "@/lib/catalogue";
import { TemplateEditor, type EditorLine, type PartidaOption } from "./editor";

export default async function TemplatePage({ params }: PageProps<"/catalogue/templates/[id]">) {
  const { id } = await params;
  const studio = await requireStudio();
  const supabase = await createClient();

  const { data: t } = await supabase
    .from("room_templates")
    .select("id, code, name, size_label, description, match_terms, active, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const [linesRes, partidasRes, pricesRes, standardRes] = await Promise.all([
    supabase
      .from("room_template_lines")
      .select("id, factor, fixed, note, sequence, partidas(id, code, short_description, unit, trades(code, name, sequence))")
      .eq("template_id", id)
      .order("sequence"),
    supabase
      .from("partidas")
      .select("id, code, short_description, unit, trade_id, organization_id, active, trades(code, name, sequence)")
      .eq("region_id", studio.regionId),
    supabase.rpc("current_prices", { p_org: studio.id }),
    t.organization_id
      ? supabase.from("room_templates").select("id").is("organization_id", null).eq("region_id", studio.regionId).eq("code", t.code).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (linesRes.error) throw linesRes.error;

  const catalogue = effectiveCatalogue(partidasRes.data ?? [], studio.id);
  const priceById = new Map((pricesRes.data ?? []).map((p) => [p.partida_id, Number(p.unit_price)]));
  const priceByCode = new Map(catalogue.map((p) => [p.code, priceById.get(p.id) ?? null]));

  const lines: EditorLine[] = linesRes.data.map((l) => ({
    id: l.id,
    code: l.partidas?.code ?? "?",
    description: l.partidas?.short_description ?? "",
    unit: l.partidas?.unit ?? "",
    chapter: l.partidas?.trades?.code ?? "",
    factor: Number(l.factor),
    fixed: Number(l.fixed),
    note: l.note,
    price: priceByCode.get(l.partidas?.code ?? "") ?? null,
  }));
  const used = new Set(lines.map((l) => l.code));
  const options: PartidaOption[] = catalogue
    .filter((p) => !used.has(p.code))
    .map((p) => ({ id: p.id, code: p.code, description: p.short_description, unit: p.unit, chapter: `${p.trades?.code ?? ""} ${p.trades?.name ?? ""}`.trim(), sequence: p.trades?.sequence ?? 0 }))
    .sort((a, b) => a.sequence - b.sequence || a.code.localeCompare(b.code, "es", { numeric: true }));

  const editable = studio.canWrite && t.organization_id === studio.id;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/catalogue/templates" className="text-sm text-muted hover:text-ink">← Room templates</Link>
        <p className="mt-3 font-mono text-xs text-muted">{t.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.organization_id === null
            ? "Standard template, shared by every studio. Edit it to make your studio's version: your budgets then use yours."
            : standardRes.data
              ? "Your studio's version of a standard template."
              : "Your studio's own template."}
          {!t.active && " Hidden: not offered when adding rooms or matching zones."}
        </p>
      </div>
      <TemplateEditor
        template={{ id: t.id, code: t.code, name: t.name, sizeLabel: t.size_label, description: t.description, matchTerms: t.match_terms, active: t.active, standard: t.organization_id === null, replacesStandard: !!standardRes.data }}
        lines={lines}
        options={options}
        editable={editable}
        canWrite={studio.canWrite}
        currency={studio.currency}
      />
    </div>
  );
}
