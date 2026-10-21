"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";
import { requireWriter } from "@/lib/dal";
import { parseBudgetFile, partial } from "@/lib/import/budget";

export type ImportPreview = {
  format: string;
  lines: number;
  updates: number;
  additions: number;
  newCodes: string[];
  measured: number;
  contractorTotal: number;
  clientTotal: number;
  fileTotal: number | null;
  chapters: { name: string; file: number | null; imported: number }[];
  deleting: number;
  warnings: string[];
  skipped: string[];
  generalNotes: boolean;
};
export type ImportState =
  | { error: string }
  | { preview: ImportPreview }
  | { done: { added: number; updated: number; deleted: number; new_partidas: number; measurements: number } }
  | null;

const MAX_BYTES = 10 * 1024 * 1024;

export async function importBudget(projectId: string, versionId: string, _prev: ImportState, fd: FormData): Promise<ImportState> {
  try {
    await requireWriter();
  } catch (e) {
    unstable_rethrow(e);
    return { error: (e as Error).message };
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file: Excel, CSV or JSON." };
  if (file.size > MAX_BYTES) return { error: "File over 10 MB." };
  const deleteMissing = fd.get("delete_missing") === "on";

  let parsed;
  try {
    parsed = await parseBudgetFile(file);
  } catch (e) {
    return { error: `Could not read the file: ${(e as Error).message}` };
  }
  if (!parsed.lines.length) return { error: "No budget lines found in the file." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("line_items").select("id").eq("version_id", versionId);
  const ids = new Set((existing ?? []).map((l) => l.id));
  const updates = parsed.lines.filter((l) => l.id && ids.has(l.id)).length;

  if (fd.get("mode") !== "apply") {
    const codes = [...new Set(parsed.lines.filter((l) => !(l.id && ids.has(l.id))).map((l) => l.code.toUpperCase()))];
    const { data: known } = codes.length
      ? await supabase.from("partidas").select("code").in("code", codes)
      : { data: [] as { code: string }[] };
    const knownSet = new Set((known ?? []).map((k) => k.code.toUpperCase()));
    const amount = (l: (typeof parsed.lines)[number]) => {
      const q = l.measurements?.length ? Math.round(l.measurements.reduce((s, m) => s + partial(m), 0) * 100) / 100 : (l.quantity ?? 0);
      return Math.round(q * (l.unit_price ?? 0) * 100) / 100;
    };
    const byChapter = new Map<string, number>();
    for (const l of parsed.lines) {
      if (l.supplied_by === "client") continue;
      const k = l.sourceChapter ?? l.chapter ?? "—";
      byChapter.set(k, (byChapter.get(k) ?? 0) + amount(l));
    }
    const chapters = parsed.fileChapters.length
      ? parsed.fileChapters.map((c) => ({ name: c.name, file: c.total, imported: round2(byChapter.get(c.name) ?? 0) }))
      : [...byChapter].map(([name, v]) => ({ name, file: null, imported: round2(v) }));
    const keep = new Set(parsed.lines.map((l) => l.id).filter(Boolean));
    return {
      preview: {
        format: parsed.format,
        lines: parsed.lines.length,
        updates,
        additions: parsed.lines.length - updates,
        newCodes: codes.filter((c) => !knownSet.has(c)),
        measured: parsed.lines.filter((l) => l.measurements?.length).length,
        contractorTotal: round2(parsed.lines.filter((l) => l.supplied_by !== "client").reduce((s, l) => s + amount(l), 0)),
        clientTotal: round2(parsed.lines.filter((l) => l.supplied_by === "client").reduce((s, l) => s + amount(l), 0)),
        fileTotal: parsed.fileTotal,
        chapters,
        deleting: deleteMissing ? [...ids].filter((id) => !keep.has(id)).length : 0,
        warnings: parsed.warnings,
        skipped: parsed.skipped,
        generalNotes: !!parsed.generalNotes,
      },
    };
  }

  const payload = parsed.lines.map(({ sourceChapter: _c, ...l }) => l); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { data, error } = await supabase.rpc("import_budget", {
    p_version: versionId,
    p_lines: payload,
    p_delete_missing: deleteMissing,
    p_general_notes: parsed.generalNotes ?? undefined,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}/versions/${versionId}`);
  revalidatePath(`/projects/${projectId}`);
  return { done: data as { added: number; updated: number; deleted: number; new_partidas: number; measurements: number } };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
