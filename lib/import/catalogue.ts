import "server-only";
import ExcelJS from "exceljs";
import { evaluator } from "./formula";
import { parseCsv, unitCode } from "./budget";

// Catalogue files in (our export round-tripped, CSV or JSON): one row per partida.
export type CatalogueRow = {
  code: string; chapter?: string | null; title?: string | null; long_description?: string | null; unit?: string | null;
  reference_code?: string | null; price?: number | null; confidence?: string | null; price_note?: string | null; hidden?: boolean;
};

const H: Record<string, keyof CatalogueRow> = {
  code: "code", chapter: "chapter", title: "title", description: "title", "short description": "title",
  "long description": "long_description", "full description": "long_description", unit: "unit", reference: "reference_code",
  "reference code": "reference_code", "unit price": "price", price: "price", confidence: "confidence", "price note": "price_note", hidden: "hidden",
};

export async function parseCatalogueFile(file: File): Promise<CatalogueRow[]> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  let rows: Record<string, unknown>[];
  if (name.endsWith(".json")) {
    const j = JSON.parse(buf.toString("utf8"));
    rows = Array.isArray(j) ? j : j.partidas;
    if (!Array.isArray(rows)) throw new Error("JSON must be a list of partidas, or { partidas: [...] }.");
  } else if (name.endsWith(".csv")) {
    rows = parseCsv(buf.toString("utf8"));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Catalogue") ?? wb.worksheets[0];
    const ev = evaluator(wb);
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, n) => { headers[n] = String(ev.cell(ws.name, c.address) ?? "").trim(); });
    rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row: Record<string, unknown> = {};
      headers.forEach((h, n) => { if (h) row[h] = ev.cell(ws.name, ws.getCell(r, n).address); });
      rows.push(row);
    }
  }
  const out: CatalogueRow[] = [];
  for (const r of rows) {
    const x: CatalogueRow = { code: "" };
    for (const [k, v] of Object.entries(r)) {
      const key = H[k.trim().toLowerCase()] ?? (H[k] as keyof CatalogueRow | undefined) ?? (["code", "chapter", "title", "long_description", "unit", "reference_code", "price", "confidence", "price_note", "hidden"].includes(k) ? (k as keyof CatalogueRow) : undefined);
      if (!key) continue;
      const s = v == null ? "" : String(v).trim();
      if (key === "price") x.price = s === "" ? null : Number(s.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      else if (key === "unit") x.unit = unitCode(s) ?? (s || null);
      else if (key === "chapter") x.chapter = (/^\s*([A-Z]{2,4})\b/.exec(s)?.[1]) ?? (s || null);
      else if (key === "hidden") x.hidden = /^(true|yes|sí|si|1|x)$/i.test(s);
      else if (key === "confidence") x.confidence = ["high", "medium", "low"].includes(s.toLowerCase()) ? s.toLowerCase() : null;
      else (x as Record<string, unknown>)[key] = s || null;
    }
    if (x.code) { x.code = x.code.toUpperCase(); out.push(x); }
  }
  return out;
}
