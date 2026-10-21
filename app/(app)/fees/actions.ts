"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type Basis = Database["public"]["Enums"]["fee_basis"];
type Phase = Database["public"]["Enums"]["project_phase"];
const BASES: Basis[] = ["lump_sum", "percent", "monthly"];
const PHASES: Phase[] = ["bid", "design", "construction", "closed"];

function refresh(projectId: string | null) {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  else revalidatePath("/settings");
}

/** Add or edit a fee item. project_id empty = a studio default (admins only). */
export async function saveFee(_prev: string | null, fd: FormData): Promise<string | null> {
  const studio = await requireWriter();
  const supabase = await createClient();
  const id = String(fd.get("id") ?? "") || null;
  const projectId = String(fd.get("project_id") ?? "") || null;
  if (!projectId && !studio.isAdmin) return "Only owners and admins can change the studio's default fees.";
  const label = String(fd.get("label") ?? "").trim();
  if (!label) return "Name the fee, e.g. Proyecto or Dirección de obra.";
  const basis = String(fd.get("basis")) as Basis;
  if (!BASES.includes(basis)) return "Choose how the fee is charged.";
  const amount = toNumber(fd.get("amount"));
  const percent = toNumber(fd.get("percent"));
  const months = toNumber(fd.get("months"));
  if (basis === "percent" && (percent == null || percent <= 0 || percent > 100)) return "Enter a percentage between 0 and 100.";
  if (basis !== "percent" && (amount == null || amount < 0)) return basis === "monthly" ? "Enter the monthly amount." : "Enter the amount.";
  const phaseRaw = String(fd.get("phase") ?? "");
  const row = {
    label,
    basis,
    amount: basis === "percent" ? null : amount,
    percent: basis === "percent" ? percent : null,
    months: basis === "monthly" ? months : null,
    phase: PHASES.includes(phaseRaw as Phase) ? (phaseRaw as Phase) : null,
    notes: String(fd.get("notes") ?? "").trim() || null,
  };
  const { error } = id
    ? await supabase.from("fee_items").update(row).eq("id", id)
    : await supabase.from("fee_items").insert({ ...row, organization_id: studio.id, project_id: projectId, sequence: Number(fd.get("sequence") ?? 0) });
  if (error) return error.message;
  refresh(projectId);
  return null;
}

export async function deleteFee(id: string, projectId: string | null) {
  const studio = await requireWriter();
  if (!projectId && !studio.isAdmin) throw new Error("Only owners and admins can change the studio's default fees.");
  const supabase = await createClient();
  const { error } = await supabase.from("fee_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh(projectId);
}

/** Add the studio's default fees the project doesn't have yet. */
export async function applyDefaultFees(projectId: string) {
  await requireWriter();
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_default_fees", { p_project: projectId });
  if (error) throw new Error(error.message);
  refresh(projectId);
}
