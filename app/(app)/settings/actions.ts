"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser, requireAdmin, requireWriter, type Role } from "@/lib/dal";
import { toNumber } from "@/lib/format";

export type FormState = { ok?: string; error?: string } | null;

const done = (msg: string): FormState => {
  revalidatePath("/settings");
  return { ok: msg };
};

export async function saveProfile(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await getUser();
  const supabase = await createClient();
  const language = String(fd.get("language") ?? "") || null;
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: String(fd.get("display_name") ?? "").trim() || null, language: language as "es" | "en" | null })
    .eq("user_id", user.id);
  return error ? { error: error.message } : done("Profile saved.");
}

export async function saveStudio(_p: FormState, fd: FormData): Promise<FormState> {
  const studio = await requireAdmin();
  const supabase = await createClient();
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter the studio name." };
  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      currency: String(fd.get("currency") ?? "EUR"),
      language: String(fd.get("language") ?? "es") as "es" | "en",
      default_contingency_pct: toNumber(fd.get("contingency")) ?? 7,
      default_vat_pct: toNumber(fd.get("vat")) ?? 10,
    })
    .eq("id", studio.id);
  return error ? { error: error.message } : done("Studio settings saved.");
}

export async function saveAiRules(_p: FormState, fd: FormData): Promise<FormState> {
  const studio = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ ai_connect: String(fd.get("ai_connect")), ai_changes: String(fd.get("ai_changes")) })
    .eq("id", studio.id);
  return error ? { error: error.message } : done("AI access rules saved. They apply straight away.");
}

export async function invite(_p: FormState, fd: FormData): Promise<FormState> {
  const studio = await requireAdmin();
  const user = await getUser();
  const supabase = await createClient();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email." };
  const role = String(fd.get("role") ?? "member") as Role;
  const { error } = await supabase
    .from("invitations")
    .insert({ organization_id: studio.id, email, role, invited_by: user.id });
  return error ? { error: error.message } : done(`Invitation created for ${email}. Copy its link below and send it.`);
}

export async function revokeInvitation(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", String(fd.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function changeRole(fd: FormData) {
  const studio = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ role: String(fd.get("role")) as Role })
    .eq("organization_id", studio.id)
    .eq("user_id", String(fd.get("user_id")));
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function removeMember(fd: FormData) {
  const studio = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("organization_id", studio.id)
    .eq("user_id", String(fd.get("user_id")));
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function undoChange(_p: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireWriter();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_change", { p_change_id: String(fd.get("change_id")) });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: `Undone (${data} ${data === 1 ? "row" : "rows"}).` };
}

/** Disconnect an AI app the user approved (revokes its tokens). */
export async function revokeAppAccess(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: String(fd.get("client_id")) });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function setPassword(_p: FormState, fd: FormData): Promise<FormState> {
  await getUser();
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don’t match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { error: error.message } : { ok: "Password saved. You can now sign in with it." };
}
