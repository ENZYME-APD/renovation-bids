// The catalogue a studio actually uses: the shared standard partidas, with the studio's own
// same-code partidas replacing them. An inactive studio version hides that code.

export type PartidaRow = {
  id: string;
  code: string;
  short_description: string;
  long_description?: string | null;
  unit: string;
  trade_id: string;
  organization_id: string | null;
  active: boolean;
};

export type CatalogueItem<T extends PartidaRow> = T & {
  kind: "standard" | "custom" | "own"; // standard = shared; custom = studio version of a standard code; own = studio-only code
  hidden: boolean;
  standardId: string | null; // the shared partida this one replaces, if any
};

export function effectiveCatalogue<T extends PartidaRow>(rows: T[], orgId: string, { includeHidden = false } = {}): CatalogueItem<T>[] {
  const standard = new Map<string, T>();
  const own = new Map<string, T>();
  for (const r of rows) (r.organization_id === orgId ? own : r.organization_id === null ? standard : null)?.set(r.code, r);
  const out: CatalogueItem<T>[] = [];
  for (const [code, s] of standard) {
    const o = own.get(code);
    if (o) out.push({ ...o, kind: "custom", hidden: !o.active, standardId: s.id });
    else if (s.active) out.push({ ...s, kind: "standard", hidden: false, standardId: null });
  }
  for (const [code, o] of own) if (!standard.has(code)) out.push({ ...o, kind: "own", hidden: !o.active, standardId: null });
  return out.filter((i) => includeHidden || !i.hidden).sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
}
