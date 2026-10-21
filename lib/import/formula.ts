import "server-only";
import type ExcelJS from "exceljs";

// A small evaluator for the formulas budget spreadsheets use when the file was saved without
// cached results: cell refs (Sheet!A1), ranges in SUM / PRODUCT / MIN / MAX, ROUND, + − × ÷.

type Val = number | string | null;

export function evaluator(wb: ExcelJS.Workbook) {
  const memo = new Map<string, Val>();

  function cellValue(sheet: string, addr: string, depth = 0): Val {
    const key = `${sheet}!${addr}`;
    if (memo.has(key)) return memo.get(key)!;
    if (depth > 50) return null;
    const ws = wb.getWorksheet(sheet);
    if (!ws) return null;
    const v = ws.getCell(addr).value as unknown;
    let out: Val = null;
    if (v == null) out = null;
    else if (typeof v === "number") out = v;
    else if (typeof v === "string") out = v;
    else if (typeof v === "boolean") out = v ? 1 : 0;
    else if (v instanceof Date) out = null;
    else if (typeof v === "object") {
      const o = v as { formula?: string; sharedFormula?: string; result?: unknown; richText?: { text: string }[]; text?: string };
      if (o.richText) out = o.richText.map((r) => r.text).join("");
      else if (o.formula || o.sharedFormula) {
        const f = o.formula ?? (ws.getCell(addr) as unknown as { formula?: string }).formula;
        out = typeof o.result === "number" ? o.result : f ? evaluate(f, sheet, depth + 1) : null;
      }
      else if (typeof o.result === "number") out = o.result;
      else if (typeof o.text === "string") out = o.text;
    }
    memo.set(key, out);
    return out;
  }

  function evaluate(formula: string, sheet: string, depth = 0): Val {
    const src = formula.replace(/^=/, "");
    let i = 0;
    const peek = () => src[i];
    const ws = () => { while (src[i] === " ") i++; };

    function ref(): { sheet: string; a: string; b?: string } | null {
      const m = /^(?:'([^']+)'|([A-Za-zÀ-ÿ_][\wÀ-ÿ .]*))?!?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/.exec(src.slice(i));
      if (!m) return null;
      const hasSheet = src.slice(i, i + m[0].length).includes("!");
      const sh = hasSheet ? (m[1] ?? m[2]) : sheet;
      if (!hasSheet && (m[1] || m[2])) return null;
      i += m[0].length;
      return { sheet: sh, a: `${m[3]}${m[4]}`, b: m[5] ? `${m[5]}${m[6]}` : undefined };
    }
    const range = (r: { sheet: string; a: string; b?: string }): Val[] => {
      if (!r.b) return [cellValue(r.sheet, r.a, depth)];
      const [c1, r1] = split(r.a), [c2, r2] = split(r.b);
      const out: Val[] = [];
      for (let row = Math.min(r1, r2); row <= Math.max(r1, r2); row++)
        for (let col = Math.min(c1, c2); col <= Math.max(c1, c2); col++) out.push(cellValue(r.sheet, `${colName(col)}${row}`, depth));
      return out;
    };
    const nums = (vs: Val[]) => vs.filter((v): v is number => typeof v === "number");

    function primary(): Val[] {
      ws();
      if (peek() === "(") { i++; const v = expr(); ws(); i++; return [v]; }
      if (peek() === "-") { i++; const v = num(primary()); return [v == null ? null : -v]; }
      const fn = /^([A-Z]+)\(/.exec(src.slice(i));
      if (fn) {
        i += fn[0].length;
        const args: Val[][] = [];
        ws();
        if (peek() !== ")") {
          for (;;) { args.push(argument()); ws(); if (peek() === ",") { i++; continue; } break; }
        }
        ws(); i++; // )
        const flat = args.flat();
        switch (fn[1]) {
          case "SUM": return [nums(flat).reduce((s, x) => s + x, 0)];
          case "PRODUCT": { const n = nums(flat); return [n.length ? n.reduce((s, x) => s * x, 1) : 0]; }
          case "MIN": return [Math.min(...nums(flat))];
          case "MAX": return [Math.max(...nums(flat))];
          case "ROUND": { const x = num(args[0]), d = num(args[1]) ?? 0; return [x == null ? null : Math.round(x * 10 ** d) / 10 ** d]; }
          case "ABS": { const x = num(args[0]); return [x == null ? null : Math.abs(x)]; }
          default: return [null];
        }
      }
      const n = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      if (n) { i += n[0].length; return [Number(n[0])]; }
      if (peek() === '"') { const e = src.indexOf('"', i + 1); const s = src.slice(i + 1, e); i = e + 1; return [s]; }
      const r = ref();
      if (r) return range(r);
      i = src.length;
      return [null];
    }
    function argument(): Val[] {
      const start = i;
      const r = ref();
      ws();
      if (r && (peek() === "," || peek() === ")")) return range(r);
      i = start;
      return [expr()];
    }
    const num = (vs: Val[] | undefined): number | null => {
      const v = vs?.[0];
      return typeof v === "number" ? v : v == null || v === "" ? 0 : Number.isFinite(Number(v)) ? Number(v) : null;
    };
    function term(): Val {
      let v = num(primary());
      for (;;) {
        ws();
        const op = peek();
        if (op !== "*" && op !== "/") return v;
        i++;
        const r = num(primary());
        v = v == null || r == null ? null : op === "*" ? v * r : r === 0 ? null : v / r;
      }
    }
    function expr(): Val {
      let v = term();
      for (;;) {
        ws();
        const op = peek();
        if (op !== "+" && op !== "-") return v;
        i++;
        const r = term();
        v = typeof v === "number" && typeof r === "number" ? (op === "+" ? v + r : v - r) : null;
      }
    }
    try {
      return expr();
    } catch {
      return null;
    }
  }

  return { cell: cellValue, evaluate };
}

function split(a: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(a)!;
  return [colNumber(m[1]), Number(m[2])];
}
function colNumber(s: string) {
  return s.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}
function colName(n: number) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
