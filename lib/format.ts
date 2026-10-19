const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 });

export const money = (v: number | null | undefined, currency = "EUR") =>
  v == null ? "—" : currency === "EUR" ? eur.format(Number(v))
    : new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(v));
export const money2 = (v: number | null | undefined) => (v == null ? "—" : eur2.format(Number(v)));
export const qty = (v: number | null | undefined) => (v == null ? "—" : num.format(Number(v)));

export const unitLabel: Record<string, string> = {
  m2: "m²", m: "m", m3: "m³", ud: "ud", kg: "kg", h: "h", pa: "PA",
};

export function humanize(s: string) {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function toNumber(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const pct = (v: number | null | undefined, digits = 0) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)} %`;

export function dateShort(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
