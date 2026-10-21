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
      model_tool: String(formData.get("model_tool") ?? "") || null,
      model_option: String(formData.get("model_option") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error) return error.code === "23505" ? `Version ${label} already exists.` : error.message;

  if (copyFrom) {
    const { error: copyError } = await supabase.rpc("copy_version_contents", { p_from: copyFrom, p_to: version.id });
    if (copyError) return copyError.message;
  }

  redirect(`/projects/${projectId}/versions/${version.id}`);
}
