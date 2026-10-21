"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";

export type State = { ok?: string; error?: string } | null;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

async function writer() {
  try {
    const st = await requireWriter();
    return { orgId: st.id, regionId: st.regionId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const done = (ok: string, id?: string | null): State => {
  revalidatePath("/catalogue/templates");
  if (id) revalidatePath(`/catalogue/templates/${id}`);
  return { ok };
};

const terms = (v: string | null) =>
  [...new Set((v ?? "").split(/[,;\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];

/** Make the studio's own copy of a template (standard or studio) and open it for editing. */
export async function customiseTemplate(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_room_template", {
    p_org: w.orgId, p_template: String(fd.get("id")), p_code: s(fd, "code") ?? undefined, p_name: s(fd, "name") ?? undefined,
  });
  if (error) return { error: error.code === "23505" ? "Your studio already has a template with that code." : error.message };
  revalidatePath("/catalogue/templates");
  redirect(`/catalogue/templates/${data}`);
}

export async function createTemplate(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const code = s(fd, "code")?.toUpperCase();
  const name = s(fd, "name");
  if (!code || !name) return { error: "Code and name are required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_templates")
    .insert({ region_id: w.regionId, organization_id: w.orgId, code, name, size_label: s(fd, "size_label") ?? "m² de suelo", match_terms: terms(s(fd, "match_terms")), sequence: 500 })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? `Your studio already has a template ${code}.` : error.message };
  revalidatePath("/catalogue/templates");
  redirect(`/catalogue/templates/${data.id}`);
}

export async function saveTemplate(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const id = String(fd.get("id"));
  const name = s(fd, "name");
  if (!name) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("room_templates")
    .update({ name, size_label: s(fd, "size_label") ?? "m² de suelo", description: s(fd, "description"), match_terms: terms(s(fd, "match_terms")) })
    .eq("id", id)
    .eq("organization_id", w.orgId);
  if (error) return { error: error.message };
  return done("Saved.", id);
}

/** Hide (or show again) a template for the studio. A standard one is hidden through an inactive studio copy. */
export async function setTemplateActive(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  let id = String(fd.get("id"));
  const active = fd.get("active") === "true";
  const { data: t } = await supabase.from("room_templates").select("id, organization_id").eq("id", id).maybeSingle();
  if (!t) return { error: "Template not found." };
  if (t.organization_id === null) {
    const { data, error } = await supabase.rpc("copy_room_template", { p_org: w.orgId, p_template: id });
    if (error) return { error: error.message };
    id = data;
  }
  const { error } = await supabase.from("room_templates").update({ active }).eq("id", id).eq("organization_id", w.orgId);
  if (error) return { error: error.message };
  return done(active ? "Shown again." : "Hidden.", id);
}

/** Delete a studio template. If it replaced a standard one, the standard one comes back. */
export async function deleteTemplate(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { error } = await supabase.from("room_templates").delete().eq("id", String(fd.get("id"))).eq("organization_id", w.orgId);
  if (error) return { error: error.code === "23503" ? "Still used somewhere; hide it instead." : error.message };
  revalidatePath("/catalogue/templates");
  redirect("/catalogue/templates");
}

export async function addTemplateLine(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const templateId = String(fd.get("template_id"));
  const partidaId = s(fd, "partida_id");
  if (!partidaId) return { error: "Choose a partida." };
  const factor = toNumber(fd.get("factor")) ?? 0;
  const perPerimeter = toNumber(fd.get("per_perimeter")) ?? 0;
  const perWallArea = toNumber(fd.get("per_wall_area")) ?? 0;
  const fixed = toNumber(fd.get("fixed")) ?? 0;
  if (factor === 0 && perPerimeter === 0 && perWallArea === 0 && fixed === 0) return { error: "Give at least one of: per size, per perimeter, per wall area, fixed." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("room_template_lines").select("sequence").eq("template_id", templateId).order("sequence", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase
    .from("room_template_lines")
    .insert({ template_id: templateId, partida_id: partidaId, factor, per_perimeter: perPerimeter, per_wall_area: perWallArea, fixed, note: s(fd, "note"), sequence: (last?.sequence ?? 0) + 1 });
  if (error) return { error: error.code === "23505" ? "That partida is already in the template." : error.message };
  return done("Line added.", templateId);
}

export async function updateTemplateLine(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_template_lines")
    .update({
      factor: toNumber(fd.get("factor")) ?? 0, per_perimeter: toNumber(fd.get("per_perimeter")) ?? 0,
      per_wall_area: toNumber(fd.get("per_wall_area")) ?? 0, fixed: toNumber(fd.get("fixed")) ?? 0, note: s(fd, "note"),
    })
    .eq("id", id)
    .select("template_id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Only your studio's templates can be edited." };
  return done("Saved.", data.template_id);
}

export async function deleteTemplateLine(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { data, error } = await supabase.from("room_template_lines").delete().eq("id", String(fd.get("id"))).select("template_id").maybeSingle();
  if (error) return { error: error.message };
  return done("Removed.", data?.template_id);
}
