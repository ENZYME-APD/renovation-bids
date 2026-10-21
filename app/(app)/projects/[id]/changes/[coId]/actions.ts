"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
export type State = { ok?: string; error?: string } | null;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const today = () => new Date().toISOString().slice(0, 10);
const path = (p: string, c: string) => `/projects/${p}/changes/${c}`;

async function writer(): Promise<{ orgId: string } | { error: string }> {
  try {
    return { orgId: (await requireWriter()).id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Add a line: a catalogue partida (price defaults to the studio's best) or a free line. Negative quantity takes work out. */
export async function addLine(projectId: string, coId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const quantity = toNumber(fd.get("quantity"));
  if (quantity == null || quantity === 0) return { error: "Enter a quantity (negative to take work out)." };
  const supabase = await createClient();
  const partidaId = s(fd, "partida_id");
  let description = s(fd, "description");
  let unit = (s(fd, "unit") ?? "ud") as Enums["unit"];
  let unitPrice = toNumber(fd.get("unit_price"));
  if (partidaId) {
    const { data: p } = await supabase.from("partidas").select("short_description, unit").eq("id", partidaId).single();
    if (!p) return { error: "Partida not found." };
    description = description ?? p.short_description;
    unit = p.unit;
    if (unitPrice == null) {
      const { data: prices } = await supabase.rpc("current_prices", { p_org: w.orgId });
      const best = prices?.find((x) => x.partida_id === partidaId);
      unitPrice = best ? Number(best.unit_price) : null;
    }
  }
  if (!description) return { error: "Choose a partida or describe the work." };
  if (unitPrice == null || unitPrice < 0) return { error: "Enter a unit price (no current price for this partida)." };
  const { error } = await supabase.from("change_order_lines").insert({
    organization_id: w.orgId, change_order_id: coId, partida_id: partidaId, description, unit, quantity, unit_price: unitPrice, room: s(fd, "room"),
  });
  if (error) return { error: error.message };
  revalidatePath(path(projectId, coId));
  return { ok: "Line added." };
}

export async function deleteLine(projectId: string, coId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { error } = await supabase.from("change_order_lines").delete().eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  revalidatePath(path(projectId, coId));
  return { ok: "Line removed." };
}

/** Move a change order through its states: send, approve (client name), reject, back to draft, cancel. */
export async function setStatus(projectId: string, coId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const status = String(fd.get("status")) as Enums["change_order_status"];
  const patch: Database["public"]["Tables"]["change_orders"]["Update"] = { status };
  if (status === "sent") patch.sent_on = s(fd, "date") ?? today();
  if (status === "approved" || status === "rejected") {
    patch.decided_on = s(fd, "date") ?? today();
    if (status === "approved") {
      const by = s(fd, "approved_by");
      if (!by) return { error: "Who approved it on the client side?" };
      patch.approved_by = by;
    }
  }
  if (status === "draft") { patch.sent_on = null; }
  const supabase = await createClient();
  const { error } = await supabase.from("change_orders").update(patch).eq("id", coId);
  if (error) return { error: error.message };
  revalidatePath(path(projectId, coId));
  revalidatePath(`/projects/${projectId}`);
  return { ok: status === "approved" ? "Approved: the current budget now includes it." : "Updated." };
}

export async function saveDetails(projectId: string, coId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const title = s(fd, "title");
  if (!title) return { error: "Give it a title." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("change_orders")
    .update({ title, description: s(fd, "description"), reason: (s(fd, "reason") ?? "other") as Enums["change_reason"], notes: s(fd, "notes") })
    .eq("id", coId);
  if (error) return { error: error.message };
  revalidatePath(path(projectId, coId));
  return { ok: "Saved." };
}
