import { CatalogueTable, type Item } from "@/app/(app)/catalogue/catalogue-table";
const chapters = [{ id: "t1", code: "REV", name: "Revestimientos de paredes" }, { id: "t2", code: "SAN", name: "Sanitarios, grifería y equipamiento de baño" }];
const it = (id: string, code: string, d: string, kind: Item["kind"], tradeId: string, price: number | null, hidden = false): Item => ({
  id, code, description: d, longDescription: kind === "standard" ? "Incluye material, colocación con adhesivo cementoso, rejuntado y limpieza." : null, unit: "m2", tradeId, referenceCode: null, kind, hidden,
  price: price == null ? null : { unitPrice: price, source: "history", confidence: "medium", pricedOn: "2026-09-01", own: true },
  history: price == null ? [] : [{ id: id + "h", unitPrice: price, source: "history", confidence: "medium", pricedOn: "2026-09-01", validUntil: null, notes: "OG47 PCA 40 + PS 45", own: true }],
});
const items = [it("a", "REV-010", "Alicatado de gres porcelánico", "custom", "t1", 90), it("b", "REV-020", "Alicatado cerámico", "standard", "t1", null), it("c", "REV-900", "Microcemento Enzyme", "own", "t1", 75), it("d", "SAN-010", "Plato de ducha resina", "standard", "t2", 640)];
export default function Preview() {
  return <main className="mx-auto w-full max-w-6xl px-6 py-8"><CatalogueTable items={items} chapters={chapters} currency="EUR" canWrite /></main>;
}
