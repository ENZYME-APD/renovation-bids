import { createClient } from "@/lib/supabase/server";
import { PageIntro } from "@/components/page-intro";
import { CatalogueTabs } from "@/components/catalogue-tabs";
import { requireStudio } from "@/lib/dal";
import { TemplateList, type TemplateRow } from "./template-list";

export default async function TemplatesPage() {
  const studio = await requireStudio();
  const supabase = await createClient();

  const [{ data: templates, error }, { data: standard }] = await Promise.all([
    supabase.rpc("effective_room_templates", { p_org: studio.id }),
    supabase.from("room_templates").select("code").is("organization_id", null).eq("region_id", studio.regionId),
  ]);
  if (error) throw error;
  // PostgREST cannot order a function's rows here, so sort in code.
  templates?.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name, "es"));
  const ids = (templates ?? []).map((t) => t.id);
  const { data: lines } = ids.length
    ? await supabase.from("room_template_lines").select("template_id").in("template_id", ids)
    : { data: [] as { template_id: string }[] };
  const count = new Map<string, number>();
  for (const l of lines ?? []) count.set(l.template_id, (count.get(l.template_id) ?? 0) + 1);
  const standardCodes = new Set((standard ?? []).map((s) => s.code));

  const rows: TemplateRow[] = (templates ?? []).map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    sizeLabel: t.size_label,
    description: t.description,
    matchTerms: t.match_terms,
    lines: count.get(t.id) ?? 0,
    kind: t.organization_id === null ? "standard" : standardCodes.has(t.code) ? "custom" : "own",
    hidden: !t.active,
  }));

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{studio.name}</p>
        <h1 className="text-2xl font-semibold">Catalogue</h1>
        <PageIntro wiki="rooms-and-models">
          A room template is a recipe: for each partida, quantity = a × floor area + b × perimeter + c × wall area + fixed. Rooms from a model, a drawing or an AI room
          list are matched to a template by name or zone category. Edit a standard template to make your studio&apos;s version.
        </PageIntro>
        <CatalogueTabs active="templates" />
      </header>
      <TemplateList rows={rows} canWrite={studio.canWrite} />
    </div>
  );
}
