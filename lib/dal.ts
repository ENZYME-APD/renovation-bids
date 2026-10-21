import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Role = Database["public"]["Enums"]["member_role"];

/** The signed-in user, verified from the JWT. Redirects to /login if absent. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return { id: claims.sub as string, email: (claims.email as string | undefined) ?? "" };
});

/** The user's studio (first membership) with settings and role, or null if none yet. */
export const getStudio = cache(async () => {
  await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select(
      "role, organization_id, organizations(id, name, region_id, currency, language, default_contingency_pct, default_vat_pct, ai_connect, ai_changes, allow_bid_options, default_room_height)",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const o = data?.organizations;
  if (!data || !o) return null;
  const role = data.role as Role;
  return {
    id: o.id,
    name: o.name,
    regionId: o.region_id,
    currency: o.currency,
    language: o.language,
    contingencyPct: Number(o.default_contingency_pct),
    vatPct: Number(o.default_vat_pct),
    aiConnect: o.ai_connect,
    aiChanges: o.ai_changes,
    allowBidOptions: o.allow_bid_options,
    defaultRoomHeight: Number(o.default_room_height),
    role,
    isAdmin: role === "owner" || role === "admin",
    canWrite: role !== "viewer",
  };
});
export type Studio = NonNullable<Awaited<ReturnType<typeof getStudio>>>;

/** Like getStudio, but sends users without a studio to onboarding. */
export async function requireStudio() {
  const studio = await getStudio();
  if (!studio) redirect("/onboarding");
  return studio;
}

/** For server actions that change data: viewers are refused. */
export async function requireWriter() {
  const studio = await requireStudio();
  if (!studio.canWrite) throw new Error("Your role is viewer: you can see everything but not change it.");
  return studio;
}

/** For admin-only actions (studio settings, team). */
export async function requireAdmin() {
  const studio = await requireStudio();
  if (!studio.isAdmin) throw new Error("Only owners and admins can do this.");
  return studio;
}
