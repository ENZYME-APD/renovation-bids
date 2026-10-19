const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 });

export const money = (v: number | null | undefined) => (v == null ? "—" : eur.format(Number(v)));
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
