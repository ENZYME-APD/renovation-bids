"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type ProjectStatus = Database["public"]["Enums"]["project_status"];

export async function createProject(_prev: string | null, formData: FormData): Promise<string | null> {
  const studio = await requireStudio();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return "Give the project a name.";
  const clientName = String(formData.get("client") ?? "").trim();

  let clientId: string | null = null;
  if (clientName) {
    const { data, error } = await supabase
      .from("clients")
      .insert({ organization_id: studio.id, name: clientName })
      .select("id")
      .single();
    if (error) return error.message;
    clientId = data.id;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: studio.id,
      name,
      client_id: clientId,
      address: String(formData.get("address") ?? "").trim() || null,
      district: String(formData.get("district") ?? "").trim() || null,
      area_m2: toNumber(formData.get("area")),
      building_year: toNumber(formData.get("year")),
      client_budget: toNumber(formData.get("budget")),
    })
    .select("id")
    .single();
  if (error) return error.message;

  // Every project starts with option A, ready for line items.
  await supabase.from("versions").insert({ organization_id: studio.id, project_id: data.id, label: "A", description: "Initial scope" });

  redirect(`/projects/${data.id}`);
}

export async function updateProjectStatus(formData: FormData) {
  await requireStudio();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as ProjectStatus;
  const { error } = await supabase.from("projects").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${id}`);
}
