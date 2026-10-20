import { LineTable, type Group } from "@/app/(app)/projects/[id]/versions/[versionId]/line-table";
const mk = (i: number, code: string, d: string, chapter: string, total: number) => ({
  id: `00000000-0000-0000-0000-00000000000${i}`, code, description: d, unit: "m²", quantity: 7.5, unitPrice: 32, confidence: "medium",
  state: "priced", total, notes: null, room: null, chapter, suggested: null, updatedAt: "x",
});
const groups: Group[] = [
  { key: "a", name: "Baño completo con ducha", lines: [mk(1, "TEC-020", "Falso techo continuo PYL hidrófugo", "TEC · Falsos techos y molduras", 240), mk(2, "IMP-010", "Impermeabilización de suelo en zona húmeda", "IMP · Aislamientos e impermeabilizaciones", 0)] },
  { key: "b", name: "Cocina", lines: [mk(3, "REV-010", "Alicatado de gres porcelánico", "REV · Revestimientos de paredes", 2498)] },
];
export default function Preview() {
  return <main className="mx-auto w-full max-w-6xl px-6 py-8"><LineTable projectId="p" versionId="v" groups={groups} groupBy="room" rooms={[]} canWrite /></main>;
}
