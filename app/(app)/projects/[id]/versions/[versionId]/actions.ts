"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
type LineState = Enums["line_state"];
type Confidence = Enums["confidence"];

const pathFor = (projectId: string, versionId: string) => `/projects/${projectId}/versions/${versionId}`;

function normalizeState(state: LineState, unitPrice: number | null): LineState {
  if (unitPrice == null && (state === "priced" || state === "quoted")) return "unpriced";
  if (unitPrice != null && state === "unpriced") return "priced";
  return state;
}

export async function addLine(projectId: string, versionId: string, _prev: string | null, formData: FormData): Promise<string | null> {
  const studio = await requireWriter();
  const supabase = await createClient();

  const partidaId = String(formData.get("partida_id") ?? "");
  const quantity = toNumber(formData.get("quantity"));
  if (!partidaId) return "Choose a partida.";
  if (quantity == null || quantity < 0) return "Enter a quantity.";

  let unitPrice = toNumber(formData.get("unit_price"));
  let priceId: string | null = null;
  let confidence: Confidence | null = unitPrice != null ? "medium" : null;

  // No price typed: use the best current price (own history first, then reference).
  if (unitPrice == null) {
    const { data: prices } = await supabase.rpc("current_prices", { p_org: studio.id });
    const best = prices?.find((p) => p.partida_id === partidaId);
    if (best) {
      unitPrice = Number(best.unit_price);
      priceId = best.price_id;
      confidence = best.confidence;
    }
  }

  const { error } = await supabase.from("line_items").insert({
    organization_id: studio.id,
    version_id: versionId,
    partida_id: partidaId,
    room: String(formData.get("room") ?? "").trim() || null,
    quantity,
    unit_price: unitPrice,
    price_id: priceId,
    confidence,
    state: unitPrice != null ? "priced" : "unpriced",
  });
  if (error) return error.message;
  revalidatePath(pathFor(projectId, versionId));
  return null;
}

export async function updateLine(formData: FormData) {
  await requireWriter();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const unitPrice = toNumber(formData.get("unit_price"));
  const confidenceRaw = String(formData.get("confidence") ?? "");
  const state = normalizeState(String(formData.get("state")) as LineState, unitPrice);

  const { error } = await supabase
    .from("line_items")
    .update({
      quantity: toNumber(formData.get("quantity")) ?? 0,
      unit_price: unitPrice,
      confidence: confidenceRaw ? (confidenceRaw as Confidence) : null,
      state,
      // A hand-typed price is no longer linked to a stored price record.
      ...(unitPrice !== toNumber(formData.get("orig_price")) ? { price_id: null } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(pathFor(String(formData.get("project_id")), String(formData.get("version_id"))));
}

export async function deleteLine(formData: FormData) {
  await requireWriter();
  const supabase = await createClient();
  const { error } = await supabase.from("line_items").delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath(pathFor(String(formData.get("project_id")), String(formData.get("version_id"))));
}

export async function updateVersionStatus(formData: FormData) {
  await requireWriter();
  const supabase = await createClient();
  const { error } = await supabase
    .from("versions")
    .update({ status: String(formData.get("status")) as Enums["version_status"] })
    .eq("id", String(formData.get("version_id")));
  if (error) throw new Error(error.message);
  revalidatePath(pathFor(String(formData.get("project_id")), String(formData.get("version_id"))));
}

export async function addRoom(projectId: string, versionId: string, _prev: string | null, formData: FormData): Promise<string | null> {
  await requireWriter();
  const supabase = await createClient();
  const templateId = String(formData.get("template_id") ?? "");
  const size = toNumber(formData.get("size"));
  if (!templateId) return "Choose a room type.";
  if (size == null || size <= 0) return "Enter the room size.";
  const height = toNumber(formData.get("height"));
  const perimeter = toNumber(formData.get("perimeter"));
  const openings = toNumber(formData.get("openings"));
  if (height != null && (height < 1.8 || height > 8)) return "Height should be between 1.8 and 8 m.";
  if (perimeter != null && perimeter <= 0) return "Perimeter must be positive, or leave it empty to estimate it.";

  const { data: roomId, error } = await supabase.rpc("add_room", {
    p_version: versionId,
    p_template: templateId,
    p_size: size,
    p_name: String(formData.get("label") ?? "").trim() || undefined,
    p_height: height ?? undefined,
    p_perimeter: perimeter ?? undefined,
    p_openings: openings ?? 0,
  });
  if (error) return error.message;
  const { count } = await supabase.from("line_items").select("id", { count: "exact", head: true }).eq("room_id", roomId);
  if (!count) {
    await supabase.from("rooms").delete().eq("id", roomId);
    return "Nothing added: the template has no items for that size.";
  }
  revalidatePath(pathFor(projectId, versionId));
  return null;
}

/** Change a room's name or measurements; its template lines are recalculated unless edited by hand. */
export async function updateRoom(projectId: string, versionId: string, _prev: string | null, formData: FormData): Promise<string | null> {
  await requireWriter();
  const supabase = await createClient();
  const size = toNumber(formData.get("size"));
  const height = toNumber(formData.get("height"));
  const perimeter = toNumber(formData.get("perimeter"));
  const openings = toNumber(formData.get("openings"));
  if (size != null && size < 0) return "Size cannot be negative.";
  if (height != null && (height < 1.8 || height > 8)) return "Height should be between 1.8 and 8 m.";
  const { error } = await supabase.rpc("update_room", {
    p_room: String(formData.get("room_id")),
    p_name: String(formData.get("name") ?? "").trim() || undefined,
    p_size: size ?? undefined,
    p_height: height ?? undefined,
    p_perimeter: perimeter ?? undefined,
    p_openings: openings ?? undefined,
    p_estimate_perimeter: perimeter == null && formData.get("estimate") === "on",
  });
  if (error) return error.message;
  revalidatePath(pathFor(projectId, versionId));
  return null;
}

/** Remove a room and every line in it. */
export async function deleteRoom(projectId: string, versionId: string, _prev: string | null, formData: FormData): Promise<string | null> {
  await requireWriter();
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", String(formData.get("room_id")));
  if (error) return error.message;
  revalidatePath(pathFor(projectId, versionId));
  return null;
}

// ── Batch editing ────────────────────────────────────────────────────────────
// One request = one change in the activity log, so a whole batch undoes in one step.

export type BatchState = { ok?: string; error?: string; changeId?: string } | null;

export type BatchPatch = {
  state?: LineState;
  confidence?: Confidence | "";
  room?: string; // "" clears the room
  unitPrice?: number | null;
  quantityFactor?: number;
};

export async function batchUpdateLines(projectId: string, versionId: string, ids: string[], patch: BatchPatch): Promise<BatchState> {
  try {
    await requireWriter();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!ids.length) return { error: "Select at least one line." };
  const changeId = `app:${crypto.randomUUID()}`;
  const supabase = await createClient(changeId);

  const set: Database["public"]["Tables"]["line_items"]["Update"] = {};
  if (patch.state) set.state = patch.state;
  if (patch.confidence !== undefined) set.confidence = patch.confidence || null;
  if (patch.room !== undefined) set.room = patch.room.trim() || null;
  if (patch.unitPrice !== undefined) {
    set.unit_price = patch.unitPrice;
    set.price_id = null;
    set.state = patch.unitPrice == null ? "unpriced" : "priced";
    set.confidence = patch.unitPrice == null ? null : (set.confidence ?? "medium");
  }

  if (Object.keys(set).length) {
    const { error } = await supabase.from("line_items").update(set).in("id", ids).eq("version_id", versionId);
    if (error) return { error: error.message };
  }
  if (patch.quantityFactor !== undefined) {
    if (!(patch.quantityFactor > 0)) return { error: "The factor must be more than 0." };
    const { data: rows, error } = await supabase.from("line_items").select("id, quantity").in("id", ids).eq("version_id", versionId);
    if (error) return { error: error.message };
    for (const r of rows) {
      const { error: e } = await supabase
        .from("line_items")
        .update({ quantity: Math.round(Number(r.quantity) * patch.quantityFactor * 1000) / 1000 })
        .eq("id", r.id);
      if (e) return { error: e.message };
    }
  }
  revalidatePath(pathFor(projectId, versionId));
  return { ok: `${ids.length} ${ids.length === 1 ? "line" : "lines"} updated.`, changeId };
}

export async function batchDeleteLines(projectId: string, versionId: string, ids: string[]): Promise<BatchState> {
  try {
    await requireWriter();
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!ids.length) return { error: "Select at least one line." };
  const changeId = `app:${crypto.randomUUID()}`;
  const supabase = await createClient(changeId);
  const { data, error } = await supabase.from("line_items").delete().in("id", ids).eq("version_id", versionId).select("id");
  if (error) return { error: error.message };
  revalidatePath(pathFor(projectId, versionId));
  return { ok: `${data.length} ${data.length === 1 ? "line" : "lines"} deleted.`, changeId };
}

export async function undoBatch(projectId: string, versionId: string, changeId: string): Promise<BatchState> {
  try {
    await requireWriter();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_change", { p_change_id: changeId });
  if (error) return { error: error.message };
  revalidatePath(pathFor(projectId, versionId));
  return { ok: "Undone." };
}
