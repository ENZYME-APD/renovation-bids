"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";
import { requireWriter } from "@/lib/dal";
import { parseCatalogueFile } from "@/lib/import/catalogue";

export type CatalogueImportState =
  | { error: string }
  | { preview: { rows: number; known: number; newCodes: string[]; withPrice: number } }
  | { done: { created: number; updated: number; unchanged: number; prices: number } }
  | null;

export async function importCatalogue(_prev: CatalogueImportState, fd: FormData): Promise<CatalogueImportState> {
  let studio;
  try {
    studio = await requireWriter();
  } catch (e) {
    unstable_rethrow(e);
    return { error: (e as Error).message };
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file: Excel, CSV or JSON." };
  if (file.size > 10 * 1024 * 1024) return { error: "File over 10 MB." };
  let rows;
  try {
    rows = await parseCatalogueFile(file);
  } catch (e) {
    return { error: `Could not read the file: ${(e as Error).message}` };
  }
  if (!rows.length) return { error: "No partidas found: the file needs a Code column." };
  const supabase = await createClient();
  if (fd.get("mode") !== "apply") {
    const codes = [...new Set(rows.map((r) => r.code))];
    const { data: known } = await supabase.from("partidas").select("code").eq("region_id", studio.regionId).in("code", codes);
    const k = new Set((known ?? []).map((x) => x.code.toUpperCase()));
    return { preview: { rows: rows.length, known: codes.filter((c) => k.has(c)).length, newCodes: codes.filter((c) => !k.has(c)), withPrice: rows.filter((r) => r.price != null).length } };
  }
  const { data, error } = await supabase.rpc("import_catalogue", { p_org: studio.id, p_rows: rows });
  if (error) return { error: error.message };
  revalidatePath("/catalogue");
  return { done: data as { created: number; updated: number; unchanged: number; prices: number } };
}
