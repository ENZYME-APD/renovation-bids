"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type ProjectStatus = Database["public"]["Enums"]["project_status"];

export async function createProject(_prev: string | null, formData: FormData): Promise<string | null> {
  const studio = await requireWriter();
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

  const code = normaliseCode(formData.get("code"));
  if (code) {
    const err = checkCode(code);
    if (err) return err;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: studio.id,
      code, // empty = automatic PRJ-0001 numbering
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
  if (error) return error.code === "23505" ? `${code} is already used by another project.` : error.message;

  // Every project starts with option A, ready for line items.
  await supabase.from("versions").insert({ organization_id: studio.id, project_id: data.id, label: "A", description: "Initial scope" });

  redirect(`/projects/${data.id}`);
}

export async function updateProjectStatus(formData: FormData) {
  await requireWriter();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as ProjectStatus;
  const { error } = await supabase.from("projects").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${id}`);
}

/** Room height for this project's new rooms; empty = the studio default. */
export async function setProjectRoomHeight(formData: FormData) {
  await requireWriter();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const raw = String(formData.get("room_height") ?? "").trim().replace(",", ".");
  const h = raw === "" ? null : Number(raw);
  if (h != null && (!Number.isFinite(h) || h < 1.8 || h > 8)) throw new Error("Height should be between 1.8 and 8 m.");
  const { error } = await supabase.from("projects").update({ room_height: h }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${id}`);
}

/** Delete a project and everything in it (owners and admins). Undoable from Settings → Activity. */
export async function deleteProject(_prev: string | null, formData: FormData): Promise<string | null> {
  const studio = await requireWriter();
  if (!studio.isAdmin) return "Only owners and admins can delete a project.";
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("code").eq("id", id).maybeSingle();
  if (!p) return "Project not found.";
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== p.code.toUpperCase()) return `Type ${p.code} to confirm.`;
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data?.length) return "Not deleted: only owners and admins can delete a project.";
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect("/projects?deleted=" + encodeURIComponent(p.code));
}

/** A project's own code, e.g. from the company-wide numbering (T26021). Unique within the studio. */
export async function setProjectCode(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireWriter();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const code = normaliseCode(formData.get("code"));
  if (!code) return "Enter a code.";
  const err = checkCode(code);
  if (err) return err;
  const { error } = await supabase.from("projects").update({ code }).eq("id", id);
  if (error) return error.code === "23505" ? `${code} is already used by another project.` : error.message;
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return null;
}

function normaliseCode(v: FormDataEntryValue | null) {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}
function checkCode(code: string) {
  if (code.length > 32) return "Keep the code under 32 characters.";
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._\-/]*$/u.test(code)) return "Use letters, numbers, spaces and . _ - / only.";
  return null;
}
