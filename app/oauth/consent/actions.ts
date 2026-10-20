"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function decide(fd: FormData) {
  const id = String(fd.get("authorization_id"));
  const supabase = await createClient();
  const { data, error } =
    fd.get("decision") === "approve"
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=${encodeURIComponent(error?.message ?? "Something went wrong.")}`);
  redirect(data.redirect_url);
}
