// Match an imported line to a catalogue partida by its words, unit and chapter.
// Deterministic and explainable: shared meaningful words (accents and plurals folded), with the
// unit as a strong signal (a wrong unit means a different thing being measured).

export type CataloguePartida = { id: string; code: string; title: string; long: string | null; unit: string; trade: string };
export type Suggestion = { id: string; code: string; title: string; unit: string; trade: string; score: number };

const STOP = new Set(
  ("de del la las el los y e o u a en con sin por para al un una unos unas su sus que se segun tipo incluso incluye incluido " +
    "suministro colocacion instalacion medicion partida total ud uds m2 m ml metro metros cuadrado lineal existente nuevo nueva " +
    "estimacion estimado similar cada mismo misma todo toda").split(" "),
);
// Words that name the same thing
const SYN: Record<string, string> = {
  pladur: "pyl", yeso: "pyl", laminado: "pyl", tabiqueria: "tabique", tabiques: "tabique", fabrica: "ladrillo",
  levantado: "desmontaje", desmontar: "desmontaje", retirada: "desmontaje", picado: "demolicion", demoler: "demolicion",
  baldosa: "gres", porcelanico: "gres", ceramico: "gres", azulejo: "alicatado", alicatados: "alicatado",
  tarima: "madera", parquet: "madera", vinilico: "vinilo", spc: "vinilo",
  lampara: "luz", luminaria: "luz", foco: "downlight", empotrado: "downlight", candileja: "foseado",
  enchufe: "toma", enchufes: "toma", mecanismo: "mecanismos", interruptor: "luz",
  inodoro: "inodoro", wc: "inodoro", lavabo: "lavabo", ducha: "ducha", banera: "banera",
  aluminio: "aluminio", pvc: "pvc", carpinteria: "carpinteria", ventana: "ventana", balconera: "ventana",
  contenedor: "contenedor", contenedores: "contenedor", escombro: "residuos", rcd: "residuos",
  radiador: "radiador", radiadores: "radiador", calefaccion: "calefaccion", caldera: "calefaccion",
  conductos: "conducto", splits: "split", aire: "climatizacion", acondicionado: "climatizacion",
  autonivelante: "autonivelante", recrecido: "recrecido",
  vertical: "pared", verticales: "pared", paramento: "pintura", paramentos: "pintura", horizontal: "techo", horizontales: "techo",
  electrodomesticos: "electrodomestico", acs: "calefaccion", interacumulador: "calefaccion",
};

export function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  const words = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words.map((w) => SYN[w] ?? stem(w)))];
}
function stem(w: string) {
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

export function suggest(
  line: { title?: string | null; long_description?: string | null; unit?: string | null; chapter?: string | null },
  catalogue: CataloguePartida[],
  limit = 3,
): Suggestion[] {
  const t = tokens(line.title);
  const d = tokens(line.long_description).slice(0, 25);
  if (!t.length) return [];
  const scored = catalogue.map((p) => {
    const pt = tokens(p.title);
    const pl = new Set(tokens(p.long));
    const shared = t.filter((w) => pt.includes(w)).length;
    // Title overlap carries the score; description words add a little; unit and chapter confirm.
    let score = (2 * shared) / (t.length + pt.length);
    score += 0.15 * (d.filter((w) => pt.includes(w) || pl.has(w)).length / Math.max(d.length, 1));
    if (line.unit && p.unit === line.unit) score += 0.15;
    else if (line.unit && p.unit !== line.unit) score -= 0.25;
    if (line.chapter && p.trade === line.chapter) score += 0.1;
    return { id: p.id, code: p.code, title: p.title, unit: p.unit, trade: p.trade, score: Math.round(score * 100) / 100 };
  });
  return scored.filter((s) => s.score > 0.2).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Good enough to accept without asking: clear score, same unit, and a margin over the runner-up. */
export function isConfident(s: Suggestion[], unit: string | null | undefined) {
  const [a, b] = s;
  return !!a && a.score >= 0.6 && (!unit || a.unit === unit) && (!b || a.score - b.score >= 0.1);
}

/** What the review starts with: a plausible catalogue partida (same unit) rather than a new one. */
export function defaultChoice(s: Suggestion[], unit: string | null | undefined): string {
  const [a] = s;
  if (a && (isConfident(s, unit) || (a.score >= 0.5 && (!unit || a.unit === unit)))) return a.id;
  return "new";
}
