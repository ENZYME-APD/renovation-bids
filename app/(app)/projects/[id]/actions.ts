"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";

export async function createVersion(projectId: string, _prev: string | null, formData: FormData): Promise<string | null> {
  const studio = await requireWriter();
  const supabase = await createClient();

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return "Give the version a label, e.g. B.";
  const copyFrom = String(formData.get("copy_from") ?? "");

  const { data: version, error } = await supabase
    .from("versions")
    .insert({
      organization_id: studio.id,
      project_id: projectId,
      label,
      description: String(formData.get("description") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error) return error.code === "23505" ? `Version ${label} already exists.` : error.message;

  if (copyFrom) {
    const { data: lines, error: readError } = await supabase
      .from("line_items")
      .select("partida_id, quantity, unit_price, price_id, confidence, state, archicad_element_ids, notes")
      .eq("version_id", copyFrom);
    if (readError) return readError.message;
    if (lines.length) {
      const { error: copyError } = await supabase
        .from("line_items")
        .insert(lines.map((l) => ({ ...l, organization_id: studio.id, version_id: version.id })));
      if (copyError) return copyError.message;
    }
  }

  redirect(`/projects/${projectId}/versions/${version.id}`);
}
