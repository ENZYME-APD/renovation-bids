import "server-only";
import ExcelJS from "exceljs";

export type Column<T> = { header: string; value: (row: T) => string | number | null; width?: number; money?: boolean; number?: boolean };
export type Sheet<T = never> = { name: string; columns: Column<T>[]; rows: T[] };

const csvCell = (v: string | number | null) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a UTF-8 BOM (so Excel keeps accents), comma separated, dot decimals. */
export function toCsv<T>(sheet: Sheet<T>): string {
  const lines = [sheet.columns.map((c) => csvCell(c.header)).join(",")];
  for (const r of sheet.rows) lines.push(sheet.columns.map((c) => csvCell(c.value(r))).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** One workbook, one worksheet per sheet; bold frozen header, euro format on money columns, filters on. */
export async function toXlsx(sheets: Sheet<any>[], currency = "EUR"): Promise<ArrayBuffer> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const wb = new ExcelJS.Workbook();
  wb.creator = "Renovation Bids";
  const moneyFmt = currency === "EUR" ? '#,##0.00 "€"' : `#,##0.00 "${currency}"`;
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = sh.columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(10, c.header.length + 2) }));
    for (const r of sh.rows) ws.addRow(sh.columns.map((c) => c.value(r)));
    ws.getRow(1).font = { bold: true };
    sh.columns.forEach((c, i) => {
      if (c.money) ws.getColumn(i + 1).numFmt = moneyFmt;
      else if (c.number) ws.getColumn(i + 1).numFmt = "#,##0.###";
    });
    if (sh.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columns.length } };
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Response for ?format=csv|xlsx. CSV exports the first sheet. */
export async function exportResponse(format: string | null, baseName: string, sheets: Sheet<any>[], currency?: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const name = slug(baseName) || "export";
  if (format === "csv") {
    return new Response(toCsv(sheets[0]), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }
  return new Response(await toXlsx(sheets, currency), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}

/** JSON download, same naming as the other formats. */
export function jsonResponse(baseName: string, body: unknown) {
  const name = slug(baseName) || "export";
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.json"` },
  });
}
