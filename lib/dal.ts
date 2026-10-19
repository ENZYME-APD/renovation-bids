import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user, verified from the JWT. Redirects to /login if absent. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return { id: claims.sub as string, email: (claims.email as string | undefined) ?? "" };
});

/** The user's studio (first membership), or null if they have none yet. */
export const getStudio = cache(async () => {
  await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("role, organization_id, organizations(id, name, region_id)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.organizations) return null;
  return { id: data.organizations.id, name: data.organizations.name, regionId: data.organizations.region_id, role: data.role };
});

/** Like getStudio, but sends users without a studio to onboarding. */
export async function requireStudio() {
  const studio = await getStudio();
  if (!studio) redirect("/onboarding");
  return studio;
}
