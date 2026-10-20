import { createClient } from "@/lib/supabase/server";
import { getStudio } from "@/lib/dal";
import { effectiveCatalogue } from "@/lib/catalogue";
import { exportResponse, type Sheet } from "@/lib/export";
import { unitLabel } from "@/lib/format";

// Catalogue export: the studio's effective catalogue with current prices.
export async function GET(req: Request) {
  const studio = await getStudio();
  if (!studio) return new Response("Not signed in", { status: 401 });
  const supabase = await createClient();
  const [{ data: trades }, { data: partidas }, { data: prices }] = await Promise.all([
    supabase.from("trades").select("id, code, name, sequence").eq("region_id", studio.regionId),
    supabase.from("partidas").select("id, code, short_description, long_description, unit, trade_id, organization_id, active, reference_code").eq("region_id", studio.regionId),
    supabase.rpc("current_prices", { p_org: studio.id }),
  ]);
  const t = new Map((trades ?? []).map((x) => [x.id, x]));
  const p = new Map((prices ?? []).map((x) => [x.partida_id, x]));
  const items = effectiveCatalogue(partidas ?? [], studio.id).sort(
    (a, b) => (t.get(a.trade_id)?.sequence ?? 999) - (t.get(b.trade_id)?.sequence ?? 999) || a.code.localeCompare(b.code, "es", { numeric: true }),
  );
  type I = (typeof items)[number];
  const sheet: Sheet<I> = {
    name: "Catalogue",
    rows: items,
    columns: [
      { header: "Chapter", value: (i) => { const x = t.get(i.trade_id); return x ? `${x.code ?? ""} ${x.name}`.trim() : ""; }, width: 34 },
      { header: "Code", value: (i) => i.code, width: 10 },
      { header: "Description", value: (i) => i.short_description, width: 48 },
      { header: "Full description", value: (i) => i.long_description, width: 60 },
      { header: "Unit", value: (i) => unitLabel[i.unit] ?? i.unit, width: 6 },
      { header: "Unit price", value: (i) => (p.get(i.id) ? Number(p.get(i.id)!.unit_price) : null), money: true, width: 12 },
      { header: "Price source", value: (i) => p.get(i.id)?.source ?? null },
      { header: "Confidence", value: (i) => p.get(i.id)?.confidence ?? null },
      { header: "Priced on", value: (i) => p.get(i.id)?.priced_on ?? null, width: 12 },
      { header: "Type", value: (i) => (i.kind === "standard" ? "Standard" : i.kind === "custom" ? "Customised" : "Studio") },
      { header: "Reference", value: (i) => i.reference_code },
    ],
  };
  return exportResponse(new URL(req.url).searchParams.get("format"), `${studio.name} catalogue`, [sheet], studio.currency);
}
