import "server-only";
import ExcelJS from "exceljs";
import { evaluator } from "./formula";

// Budget files in, import rows out. Three formats:
//  - platform: our own export (Excel "Lines" + "Measurements" sheets, CSV of lines, or JSON)
//  - presupuesto: a studio Excel with a PRESUPUESTO sheet (Código, Título, Descripción, Cant., Precio,
//    Imp. Constructora, Imp. Propiedad, Notas, Medición) and a MEDICIONES sheet (Nº, Largo, Ancho, Alto)
//  - csv/json of the same columns as the platform export

export type Measurement = { label: string | null; count: number | null; length: number | null; width: number | null; height: number | null };
export type ImportLine = {
  id?: string;
  code: string;
  title?: string | null;
  long_description?: string | null;
  unit?: string | null;
  chapter?: string | null;
  room?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  confidence?: string | null;
  state?: string | null;
  supplied_by?: "contractor" | "client";
  description?: string | null;
  client_note?: string | null;
  measurement_note?: string | null;
  notes?: string | null;
  reference_price?: number | null;
  reference_source?: string | null;
  measurements?: Measurement[];
  // for the preview only
  sourceChapter?: string;
};
export type ParsedBudget = {
  format: "platform" | "presupuesto" | "json" | "csv";
  lines: ImportLine[];
  generalNotes: string | null;
  skipped: string[];
  warnings: string[];
  fileTotal: number | null;   // the file's own contractor total, when it has one
  fileChapters: { name: string; total: number }[];
};

export async function parseBudgetFile(file: File): Promise<ParsedBudget> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".json")) return fromJson(JSON.parse(buf.toString("utf8")));
  if (name.endsWith(".csv")) return fromRows("csv", parseCsv(buf.toString("utf8")), null, []);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if (wb.getWorksheet("PRESUPUESTO")) return fromPresupuesto(wb);
  const lines = wb.getWorksheet("Lines") ?? wb.worksheets[0];
  const meas = wb.getWorksheet("Measurements");
  const ev = evaluator(wb);
  return fromRows("platform", sheetRows(lines, ev), meas ? sheetRows(meas, ev) : null, []);
}

// ── Platform format ──────────────────────────────────────────────────────────

const H: Record<string, keyof ImportLine | "chapter_label"> = {
  id: "id", code: "code", title: "title", description: "description", room: "room", unit: "unit", quantity: "quantity",
  "unit price": "unit_price", "supplied by": "supplied_by", confidence: "confidence", state: "state",
  "client note": "client_note", "measurement note": "measurement_note", "internal note": "notes", notes: "notes",
  "reference price": "reference_price", "reference source": "reference_source", chapter: "chapter_label",
  "long description": "long_description", "full description": "long_description",
};

function fromRows(format: ParsedBudget["format"], rows: Record<string, unknown>[], measRows: Record<string, unknown>[] | null, warnings: string[]): ParsedBudget {
  const lines: ImportLine[] = [];
  const skipped: string[] = [];
  rows.forEach((r, i) => {
    const l: ImportLine = { code: "" };
    for (const [k, v] of Object.entries(r)) {
      const key = H[k.trim().toLowerCase()];
      if (!key) continue;
      if (key === "chapter_label") { l.chapter = chapterCode(String(v ?? "")); continue; }
      (l as Record<string, unknown>)[key] = normalise(key, v);
    }
    if (!l.code && !l.id) { if (Object.values(r).some((v) => v != null && v !== "")) skipped.push(`Row ${i + 2}: no code`); return; }
    if (l.supplied_by !== "client") l.supplied_by = "contractor";
    lines.push(l);
  });
  if (measRows) {
    const byLine = new Map<string, Measurement[]>();
    for (const m of measRows) {
      const key = String(m["Line ID"] ?? m["line id"] ?? "") || `code:${String(m["Code"] ?? "")}`;
      const x: Measurement = { label: str(m["Label"]), count: num(m["Count"] ?? m["Nº"]), length: num(m["Length"]), width: num(m["Width"]), height: num(m["Height"]) };
      if (x.count == null && x.length == null && x.width == null && x.height == null) continue;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(x);
    }
    for (const l of lines) {
      const ms = (l.id && byLine.get(l.id)) || byLine.get(`code:${l.code}`);
      if (ms) l.measurements = ms;
    }
  }
  return { format, lines, generalNotes: null, skipped, warnings, fileTotal: null, fileChapters: [] };
}

function fromJson(j: unknown): ParsedBudget {
  const obj = (Array.isArray(j) ? { lines: j } : j) as { lines?: Record<string, unknown>[]; general_notes?: string };
  if (!Array.isArray(obj.lines)) throw new Error("JSON must be a list of lines, or { lines: [...] }.");
  const lines = obj.lines.map((r) => {
    const l = { ...r } as ImportLine & Record<string, unknown>;
    for (const k of Object.keys(l)) (l as Record<string, unknown>)[k] = normalise(k as keyof ImportLine, l[k]);
    if (typeof r.chapter === "string") l.chapter = chapterCode(r.chapter);
    l.code = String(r.code ?? "");
    if (Array.isArray(r.measurements)) l.measurements = (r.measurements as Record<string, unknown>[]).map((m) => ({
      label: str(m.label), count: num(m.count), length: num(m.length), width: num(m.width), height: num(m.height),
    }));
    delete (l as Record<string, unknown>).total;
    return l as ImportLine;
  });
  return { format: "json", lines, generalNotes: obj.general_notes ?? null, skipped: [], warnings: [], fileTotal: null, fileChapters: [] };
}

// ── PRESUPUESTO / MEDICIONES format ──────────────────────────────────────────

const ROOM_CHAPTER = /^(DORMITORIO|PASILLO|SAL[ÓO]N|HALL|LAVANDER[ÍI]A|BA[ÑN]O|COCINA|ASEO|VESTIDOR|DISTRIBUIDOR|TERRAZA|ESTUDIO|DESPACHO)/i;
// Chapter names → catalogue chapters (CYPE codes); titles refine some lines.
const CHAPTER_MAP: [RegExp, string][] = [
  [/TAREAS PREVIAS|AYUDAS/i, "AYU"], [/DEMOLICI/i, "DEM"], [/ALBA[ÑN]ILER|TABIQUER/i, "TAB"], [/CARPINTER[ÍI]A EXTERIOR/i, "CEX"],
  [/CARPINTER/i, "CIN"], [/PAVIMENT|SOLAD/i, "PAV"], [/REVESTIM|ALICAT/i, "REV"], [/FONTANER|SANEAMIENTO/i, "FON"],
  [/ELECTRICIDAD|TELECOM/i, "ELE"], [/ILUMINACI|LUMINARIA/i, "ILU"], [/PINTURA/i, "PIN"], [/CLIMATIZ|CALEFACC|VENTILAC/i, "CLI"],
  [/COCINA/i, "COC"], [/RESIDUO/i, "RES"], [/SEGURIDAD/i, "SYS"], [/LIMPIEZA/i, "LIM"], [/AISLAM|IMPERMEAB/i, "IMP"],
];
const TITLE_MAP: [RegExp, string][] = [
  [/limpieza/i, "LIM"], [/contenedor|residuo/i, "RES"], [/falso techo|candileja|techo de pladur/i, "TEC"],
  [/carpinter[íi]as? (de )?(aluminio|pvc)|ventana|balconera|corredera hierro/i, "CEX"], [/mobiliario de cocina|electrodom|encimera/i, "COC"],
  [/recrecido|autonivelante|tarima|suelo|solado|rodapi/i, "PAV"], [/alicatad|revestimiento/i, "REV"],
  [/inodoro|lavabo|grifer|mampara|plato de ducha|bañera|mueble de baño|sanitari|toallero|espejo/i, "SAN"],
  [/impermeabiliz/i, "IMP"],
];
// Mixed chapters (tareas previas, otros, albañilería, pavimentos, fontanería) are split by title;
// single-trade chapters (demoliciones, electricidad…) keep their lines.
const MIXED = new Set(["AYU", "TAB", "PAV", "FON"]);
function refineTrade(trade: string, title: string) {
  if (!MIXED.has(trade)) return trade;
  return TITLE_MAP.find(([re]) => re.test(title))?.[1] ?? trade;
}
const SKIP_CHAPTER = /SERVICIOS (DE )?ARQUITECTURA|PROJECT MANAGEMENT|HONORARIOS|DIRECCI[ÓO]N (DE )?OBRA/i;

function fromPresupuesto(wb: ExcelJS.Workbook): ParsedBudget {
  const ev = evaluator(wb);
  const ws = wb.getWorksheet("PRESUPUESTO")!;
  const warnings: string[] = [];
  const skipped: string[] = [];

  // Header row and columns
  let headerRow = 0;
  const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(15, ws.rowCount) && !headerRow; r++) {
    ws.getRow(r).eachCell((c, n) => {
      const t = String(ev.cell("PRESUPUESTO", c.address) ?? "").trim().toLowerCase();
      if (t === "código" || t === "codigo") headerRow = r;
      if (t) col[t] = n;
    });
  }
  if (!headerRow) throw new Error("PRESUPUESTO sheet without a 'Código' header row.");
  const find = (...names: RegExp[]) => {
    for (const [k, n] of Object.entries(col)) if (names.some((re) => re.test(k))) return n;
    return 0;
  };
  const C = {
    code: find(/^c[óo]digo$/), title: find(/^t[íi]tulo$/), desc: find(/^descripci/), qty: find(/^cant/), price: find(/^precio$/),
    contractor: find(/constructora|contratista/), owner: find(/propiedad|cliente/), notes: find(/^notas?$/), meas: find(/^medici/),
    ref: find(/precio est|referencia/),
  };
  const refSource = C.ref ? String(ev.cell("PRESUPUESTO", cellAddr(C.ref, headerRow)) ?? "").trim() : null;
  const at = (c: number, r: number) => (c ? ev.cell("PRESUPUESTO", cellAddr(c, r)) : null);

  // Measurement blocks: header row (code in A) → its rows
  const blocks = measurementBlocks(wb, ev);

  const lines: ImportLine[] = [];
  const fileChapters: { name: string; total: number }[] = [];
  let chapter = "", trade = "", room: string | null = null, skipping = false;
  let fileTotal: number | null = null;
  const generalNotes: string[] = [];
  let inNotes = false;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const code = str(at(C.code, r));
    const title = str(at(C.title, r));
    if (!code && !title) continue;
    if (code && (!title || title === code)) {
      // Chapter, sub-chapter (a room), total or notes
      if (/^TOTAL/i.test(code)) { const t = num(at(C.contractor, r)); if (t != null) fileTotal = round2(t); skipping = true; continue; }
      if (/^notas generales/i.test(code)) { inNotes = true; continue; }
      if (inNotes) { generalNotes.push(code.replace(/^\*\s*/, "")); continue; }
      if (SKIP_CHAPTER.test(code)) { skipping = true; skipped.push(`${code}: separate contract, not imported`); continue; }
      skipping = false;
      // A sub-chapter without its own amount inside a chapter is a room (Dormitorio, Despensa, Porche…)
      const noAmount = num(at(C.contractor, r)) == null && num(at(C.owner, r)) == null;
      if (trade && (noAmount || (ROOM_CHAPTER.test(code) && trade === "ELE"))) { room = titleCase(code); continue; }
      chapter = code;
      room = null;
      trade = CHAPTER_MAP.find(([re]) => re.test(code))?.[1] ?? "AYU";
      const t = num(at(C.contractor, r));
      fileChapters.push({ name: code, total: t == null ? 0 : round2(t) });
      continue;
    }
    if (skipping || !code) continue;

    const qtyCell = C.qty ? (ws.getCell(cellAddr(C.qty, r)).value as unknown) : null;
    const qtyFormula = typeof qtyCell === "object" && qtyCell && "formula" in qtyCell ? String((qtyCell as { formula: string }).formula) : null;
    const qty = num(at(C.qty, r));
    const price = num(at(C.price, r));
    const note = str(at(C.notes, r));
    const contractorAmt = C.contractor ? ws.getCell(cellAddr(C.contractor, r)).value : null;
    const ownerAmt = C.owner ? ws.getCell(cellAddr(C.owner, r)).value : null;
    const client = /^lo compra la propiedad/i.test(note ?? "") || (contractorAmt == null && ownerAmt != null);
    const ref = num(at(C.ref, r));
    const desc = str(at(C.desc, r));

    // Measurements: quantity = MEDICIONES!I<n> where row n starts a block
    let measurements: Measurement[] | undefined;
    const m = qtyFormula && /^MEDICIONES!\$?I\$?(\d+)$/i.exec(qtyFormula.replace(/^=/, ""));
    if (m && blocks.has(Number(m[1]))) {
      const b = blocks.get(Number(m[1]))!;
      measurements = b.rows;
      const sum = round2(b.rows.reduce((s, x) => s + partial(x), 0));
      if (qty != null && Math.abs(sum - qty) > 0.011) warnings.push(`${code}: measurements add up to ${sum}, the budget says ${qty}; the budget's quantity is kept.`);
      if (qty != null && Math.abs(sum - qty) > 0.011) measurements = undefined;
    }
    const unit = unitFrom(blocks.get(Number(m?.[1]))?.unit, desc, title!);

    lines.push({
      code,
      title,
      long_description: desc,
      description: desc,
      unit,
      chapter: refineTrade(trade, title!),
      room,
      quantity: qty ?? 0,
      unit_price: price,
      confidence: price == null ? null : /estimad|a confirmar|a definir|pendiente/i.test(note ?? "") ? "low" : "medium",
      supplied_by: client ? "client" : "contractor",
      client_note: note,
      measurement_note: str(at(C.meas, r)),
      reference_price: ref ? ref : null,
      reference_source: ref ? refSource : null,
      measurements,
      sourceChapter: chapter,
    });
  }
  return { format: "presupuesto", lines, generalNotes: generalNotes.length ? generalNotes.join("\n") : null, skipped, warnings, fileTotal, fileChapters };
}

function measurementBlocks(wb: ExcelJS.Workbook, ev: ReturnType<typeof evaluator>) {
  const blocks = new Map<number, { code: string; unit: string | null; rows: Measurement[] }>();
  const ws = wb.getWorksheet("MEDICIONES");
  if (!ws) return blocks;
  let cur: { code: string; unit: string | null; rows: Measurement[] } | null = null;
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = str(ev.cell("MEDICIONES", `A${r}`));
    const b = str(ev.cell("MEDICIONES", `B${r}`));
    if (a && a.toLowerCase() !== "código") {
      cur = { code: a, unit: str(ev.cell("MEDICIONES", `C${r}`)), rows: [] };
      blocks.set(r, cur);
      continue;
    }
    if (!cur) continue;
    const x: Measurement = {
      label: b, count: num(ev.cell("MEDICIONES", `D${r}`)), length: num(ev.cell("MEDICIONES", `E${r}`)),
      width: num(ev.cell("MEDICIONES", `F${r}`)), height: num(ev.cell("MEDICIONES", `G${r}`)),
    };
    if (x.count == null && x.length == null && x.width == null && x.height == null) { if (!b) cur = null; continue; }
    cur.rows.push(x);
  }
  return blocks;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const partial = (m: Measurement) => (m.count ?? 1) * (m.length ?? 1) * (m.width ?? 1) * (m.height ?? 1);
const round2 = (n: number) => Math.round(n * 100) / 100;
const cellAddr = (c: number, r: number) => `${colName(c)}${r}`;
function colName(n: number) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s|€/g, "");
  const t = /,\d{1,3}$/.test(s) && !/\.\d{3},/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function titleCase(s: string) {
  const small = new Set(["y", "e", "de", "del", "la", "el", "los", "las", "a", "con"]);
  return s.toLowerCase().split(/(\s+|-)/).map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");
}
export function unitCode(u: unknown): string | null {
  const s = String(u ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["m²", "m2", "m^2"].includes(s)) return "m2";
  if (["m³", "m3"].includes(s)) return "m3";
  if (["m", "ml", "m.l.", "mts"].includes(s)) return "m";
  if (["ud", "u", "uds", "ud.", "unidad", "pto", "punto"].includes(s)) return "ud";
  if (["pa", "p.a.", "pa.", "partida", "ta"].includes(s)) return "pa";
  if (["kg"].includes(s)) return "kg";
  if (["h", "hora"].includes(s)) return "h";
  return null;
}
function unitFrom(sheetUnit: string | null | undefined, desc: string | null, title: string) {
  const u = unitCode(sheetUnit);
  if (u) return u;
  const t = `${desc ?? ""} ${title}`.toLowerCase().replace(/\s+/g, " ");
  if (/medici[óo]n por m²|por m2|por metro cuadrado/.test(t)) return "m2";
  if (/por metro lineal|por ml|medici[óo]n por metro\b/.test(t)) return "m";
  if (/tanto alzado|\(total\)|partida alzada/.test(t)) return "pa";
  return "ud";
}
function chapterCode(label: string): string | null {
  const m = /^\s*([A-Z]{2,4})\b/.exec(label);
  return m ? m[1] : null;
}
function normalise(key: keyof ImportLine | string, v: unknown): unknown {
  if (["quantity", "unit_price", "reference_price"].includes(key as string)) return num(v);
  if (key === "unit") return unitCode(v) ?? str(v);
  if (key === "supplied_by") return /client|cliente|propiedad/i.test(String(v ?? "")) ? "client" : "contractor";
  if (key === "confidence") { const s = String(v ?? "").toLowerCase(); return ["high", "medium", "low"].includes(s) ? s : null; }
  if (key === "state") { const s = String(v ?? "").toLowerCase().replace(/\s+/g, "_"); return ["unpriced", "priced", "needs_rfq", "quoted"].includes(s) ? s : null; }
  if (key === "measurements") return v;
  return str(v);
}

function sheetRows(ws: ExcelJS.Worksheet, ev: ReturnType<typeof evaluator>): Record<string, unknown>[] {
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, n) => { headers[n] = String(ev.cell(ws.name, c.address) ?? "").trim(); });
  const out: Record<string, unknown>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row: Record<string, unknown> = {};
    let any = false;
    headers.forEach((h, n) => {
      if (!h) return;
      const v = ev.cell(ws.name, cellAddr(n, r));
      if (v != null && v !== "") any = true;
      row[h] = v;
    });
    if (any) out.push(row);
  }
  return out;
}

export function parseCsv(text: string): Record<string, unknown>[] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}
