"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser, getStudio } from "@/lib/dal";

export async function createStudio(_prev: string | null, formData: FormData): Promise<string | null> {
  await getUser();
  if (await getStudio()) redirect("/dashboard");

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return "Enter your studio’s name.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: name, p_region_id: "es" });
  if (error) return error.message;
  redirect("/dashboard");
}

export async function joinStudio(_prev: string | null, formData: FormData): Promise<string | null> {
  await getUser();
  if (await getStudio()) redirect("/dashboard");
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_studio_by_domain", { p_org: String(formData.get("org_id")) });
  if (error) return error.message;
  redirect("/dashboard");
}
