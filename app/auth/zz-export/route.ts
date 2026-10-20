import { exportResponse, type Sheet } from "@/lib/export";
type R = { code: string; d: string; q: number; p: number | null };
const rows: R[] = [{ code: "REV-010", d: "Alicatado de gres porcelánico, \"60×120\"", q: 27.75, p: 90 }, { code: "IMP-010", d: "Impermeabilización", q: 7.5, p: null }];
export async function GET(req: Request) {
  const sheet: Sheet<R> = { name: "Lines", rows, columns: [
    { header: "Code", value: (r) => r.code }, { header: "Description", value: (r) => r.d, width: 40 },
    { header: "Quantity", value: (r) => r.q, number: true }, { header: "Unit price", value: (r) => r.p, money: true },
  ] };
  return exportResponse(new URL(req.url).searchParams.get("format"), "PRJ-0001 Santa Hortensia vA", [sheet, { ...sheet, name: "Copy" }]);
}
