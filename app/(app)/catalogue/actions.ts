"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
export type State = { ok?: string; error?: string } | null;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

async function writer(): Promise<{ orgId: string; regionId: string } | { error: string }> {
  try {
    const st = await requireWriter();
    return { orgId: st.id, regionId: st.regionId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const done = (ok: string): State => {
  revalidatePath("/catalogue");
  return { ok };
};

/** Create or edit one of the studio's own partidas. */
export async function savePartida(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const code = s(fd, "code")?.toUpperCase();
  const short = s(fd, "short_description");
  const tradeId = s(fd, "trade_id");
  if (!code || !short || !tradeId) return { error: "Code, description and chapter are required." };
  const row = {
    code,
    short_description: short,
    long_description: s(fd, "long_description"),
    unit: (s(fd, "unit") ?? "ud") as Enums["unit"],
    trade_id: tradeId,
    reference_code: s(fd, "reference_code"),
  };
  const supabase = await createClient();
  const id = s(fd, "id");
  const { error } = id
    ? await supabase.from("partidas").update(row).eq("id", id).eq("organization_id", w.orgId)
    : await supabase.from("partidas").insert({ ...row, organization_id: w.orgId, region_id: w.regionId });
  if (error) return { error: error.code === "23505" ? `Your studio already has a partida ${code}.` : error.message };
  return done(id ? `${code} saved.` : `${code} added.`);
}

/** Record a new price for a partida (keeps the history). */
export async function setPrice(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const price = toNumber(fd.get("unit_price"));
  if (price == null || price < 0) return { error: "Enter a unit price." };
  const supabase = await createClient();
  const { error } = await supabase.from("prices").insert({
    organization_id: w.orgId,
    region_id: w.regionId,
    partida_id: String(fd.get("partida_id")),
    unit_price: price,
    source: (s(fd, "source") ?? "manual") as Enums["price_source"],
    confidence: (s(fd, "confidence") ?? "medium") as Enums["confidence"],
    priced_on: s(fd, "priced_on") ?? new Date().toISOString().slice(0, 10),
    valid_until: s(fd, "valid_until"),
    notes: s(fd, "notes"),
  });
  if (error) return { error: error.message };
  return done("Price saved. New budget lines use it from now on.");
}

export async function deletePrice(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { data, error } = await supabase.from("prices").delete().eq("id", String(fd.get("id"))).eq("organization_id", w.orgId).select("id");
  if (error) return { error: error.message.includes("foreign key") ? "Budget lines still point at this price; change those lines first." : error.message };
  if (!data.length) return { error: "That price can't be removed." };
  return done("Price removed.");
}

/** Make a studio version of a standard partida (same code), carrying over the studio's latest price. */
export async function customise(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { data: std } = await supabase.from("partidas").select("*").eq("id", String(fd.get("id"))).is("organization_id", null).maybeSingle();
  if (!std) return { error: "Standard partida not found." };
  const { data: own, error } = await supabase
    .from("partidas")
    .insert({
      organization_id: w.orgId, region_id: std.region_id, code: std.code, short_description: std.short_description,
      long_description: std.long_description, unit: std.unit, trade_id: std.trade_id, reference_code: std.reference_code,
      archicad_classification: std.archicad_classification, archicad_filter: std.archicad_filter, active: fd.get("hide") !== "1",
    })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? `Your studio already has its own ${std.code}.` : error.message };
  const { data: last } = await supabase
    .from("prices")
    .select("unit_price, source, confidence, priced_on, valid_until, notes")
    .eq("partida_id", std.id)
    .eq("organization_id", w.orgId)
    .order("priced_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) await supabase.from("prices").insert({ ...last, organization_id: w.orgId, region_id: std.region_id, partida_id: own.id });
  return done(fd.get("hide") === "1" ? `${std.code} hidden.` : `${std.code} is now your studio's version. Edit it as you like.`);
}

/** Hide or show one of the studio's partidas (a hidden studio version also hides the standard one). */
export async function setActive(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const active = fd.get("active") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("partidas").update({ active }).eq("id", String(fd.get("id"))).eq("organization_id", w.orgId);
  if (error) return { error: error.message };
  return done(active ? "Shown again." : "Hidden from your pickers and room templates.");
}

/** Delete a studio partida (or remove a customisation, which brings back the standard one). */
export async function deletePartida(_p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const [{ count: lines }, { count: po }] = await Promise.all([
    supabase.from("line_items").select("id", { count: "exact", head: true }).eq("partida_id", id),
    supabase.from("purchase_order_lines").select("id", { count: "exact", head: true }).eq("partida_id", id),
  ]);
  const used = (lines ?? 0) + (po ?? 0);
  if (used) return { error: `Used in ${used} budget or purchase ${used === 1 ? "line" : "lines"}. Hide it instead, so past budgets stay intact.` };
  const { error: pErr } = await supabase.from("prices").delete().eq("partida_id", id).eq("organization_id", w.orgId);
  if (pErr) return { error: pErr.message };
  const { data, error } = await supabase.from("partidas").delete().eq("id", id).eq("organization_id", w.orgId).select("code");
  if (error) return { error: error.message };
  if (!data.length) return { error: "Only your studio's own partidas can be deleted." };
  return done(`${data[0].code} deleted.`);
}
