"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/dal";
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
  const studio = await requireStudio();
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
  await requireStudio();
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
  await requireStudio();
  const supabase = await createClient();
  const { error } = await supabase.from("line_items").delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath(pathFor(String(formData.get("project_id")), String(formData.get("version_id"))));
}

export async function updateVersionStatus(formData: FormData) {
  await requireStudio();
  const supabase = await createClient();
  const { error } = await supabase
    .from("versions")
    .update({ status: String(formData.get("status")) as Enums["version_status"] })
    .eq("id", String(formData.get("version_id")));
  if (error) throw new Error(error.message);
  revalidatePath(pathFor(String(formData.get("project_id")), String(formData.get("version_id"))));
}
