import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { effectiveCatalogue } from "@/lib/catalogue";
import { CatalogueTable, type Chapter, type Item, type PriceEntry } from "./catalogue-table";

export default async function CataloguePage() {
  const studio = await requireStudio();
  const supabase = await createClient();

  const [tradesRes, partidasRes, currentRes, historyRes, regionRes] = await Promise.all([
    supabase.from("trades").select("id, code, name, sequence, organization_id").eq("region_id", studio.regionId).eq("active", true).order("sequence"),
    supabase
      .from("partidas")
      .select("id, code, short_description, long_description, unit, trade_id, organization_id, active, reference_code")
      .eq("region_id", studio.regionId),
    supabase.rpc("current_prices", { p_org: studio.id }),
    supabase
      .from("prices")
      .select("id, partida_id, unit_price, source, confidence, priced_on, valid_until, notes, organization_id")
      .order("priced_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("regions").select("settings").eq("id", studio.regionId).maybeSingle(),
  ]);
  // Budget ranges: each line's total ± this share, by price confidence (region settings).
  const raw = ((regionRes.data?.settings ?? {}) as { confidence_spread?: Record<string, number> }).confidence_spread ?? {};
  const spread = { high: Number(raw.high ?? 0.05), medium: Number(raw.medium ?? 0.12), low: Number(raw.low ?? 0.25) };
  if (partidasRes.error) throw partidasRes.error;

  const current = new Map((currentRes.data ?? []).map((p) => [p.partida_id, p]));
  const history = new Map<string, PriceEntry[]>();
  for (const p of historyRes.data ?? []) {
    if (!history.has(p.partida_id)) history.set(p.partida_id, []);
    history.get(p.partida_id)!.push({
      id: p.id, unitPrice: Number(p.unit_price), source: p.source, confidence: p.confidence, pricedOn: p.priced_on,
      validUntil: p.valid_until, notes: p.notes, own: p.organization_id === studio.id,
    });
  }

  const items: Item[] = effectiveCatalogue(partidasRes.data, studio.id, { includeHidden: true }).map((p) => {
    const c = current.get(p.id);
    return {
      id: p.id,
      code: p.code,
      description: p.short_description,
      longDescription: p.long_description,
      unit: p.unit,
      tradeId: p.trade_id,
      referenceCode: p.reference_code,
      kind: p.kind,
      hidden: p.hidden,
      price: c ? { unitPrice: Number(c.unit_price), source: c.source, confidence: c.confidence, pricedOn: c.priced_on, own: c.is_own } : null,
      history: history.get(p.id) ?? [],
    };
  });

  const chapters: Chapter[] = (tradesRes.data ?? []).map((t) => ({ id: t.id, code: t.code, name: t.name }));

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{studio.name}</p>
        <h1 className="text-2xl font-semibold">Catalogue</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The partidas you price with, by chapter. Standard partidas are shared; customise one to make your studio&apos;s own version of
          that code, which then replaces it in budgets and room templates. Hide the standard ones you never use. Prices keep their history;
          the newest, most reliable one is used, and its confidence sets the low–high range budgets show.
        </p>
      </header>
      <CatalogueTable items={items} chapters={chapters} currency={studio.currency} canWrite={studio.canWrite} spread={spread} />
    </div>
  );
}
