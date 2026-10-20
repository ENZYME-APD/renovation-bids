import { LineTable, type Group } from "@/app/(app)/projects/[id]/versions/[versionId]/line-table";
const mk = (i: number, code: string, d: string, price: number | null, conf: string | null, state: string, room: string | null) => ({
  id: `00000000-0000-0000-0000-00000000000${i}`, code, description: d, unit: "m²", quantity: 7.5, unitPrice: price, confidence: conf,
  state, total: price == null ? null : price * 7.5, notes: null, room, chapter: "TEC", suggested: null, updatedAt: "x",
});
const groups: Group[] = [{ key: "a", name: "Baño completo con ducha", lines: [mk(1, "TEC-020", "Falso techo PYL hidrófugo", 32, "medium", "priced", "Baño"), mk(2, "IMP-010", "Impermeabilización de suelo", null, null, "unpriced", "Baño"), mk(3, "SAN-020", "Inodoro suspendido", 850, null, "needs_rfq", null)] }];
export default function Preview() {
  return <main className="mx-auto w-full max-w-6xl px-6 py-8"><LineTable projectId="p" versionId="v" groups={groups} groupBy="room" rooms={[]} canWrite /></main>;
}
