"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function accept(_p: { error?: string } | null, fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: String(fd.get("token")) });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
