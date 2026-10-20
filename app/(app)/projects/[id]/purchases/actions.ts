"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
type State = { ok?: string; error?: string } | null;
const path = (id: string) => `/projects/${id}/purchases`;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const today = () => new Date().toISOString().slice(0, 10);

async function guard(): Promise<{ orgId: string } | { error: string }> {
  try {
    return { orgId: (await requireWriter()).id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createPurchaseOrder(projectId: string, _p: State, fd: FormData): Promise<State> {
  const g = await guard();
  if ("error" in g) return g;
  const supabase = await createClient();

  // Budget lines ticked in the form, each with its quantity and supplier unit cost.
  const picked = fd.getAll("line").map(String);
  const { data: budget } = picked.length
    ? await supabase.from("line_items").select("id, partida_id, partidas(short_description, unit)").in("id", picked)
    : { data: [] };
  const lines: Database["public"]["Tables"]["purchase_order_lines"]["Insert"][] = (budget ?? []).map((l) => ({
    organization_id: g.orgId,
    purchase_order_id: "",
    line_item_id: l.id,
    partida_id: l.partida_id,
    description: l.partidas?.short_description ?? "",
    unit: (l.partidas?.unit ?? "ud") as Enums["unit"],
    quantity: toNumber(fd.get(`qty_${l.id}`)) ?? 0,
    unit_cost: toNumber(fd.get(`cost_${l.id}`)) ?? 0,
  }));
  const freeDesc = s(fd, "free_description");
  if (freeDesc) {
    lines.push({
      organization_id: g.orgId, purchase_order_id: "", description: freeDesc, unit: (s(fd, "free_unit") ?? "ud") as Enums["unit"],
      quantity: toNumber(fd.get("free_quantity")) ?? 1, unit_cost: toNumber(fd.get("free_cost")) ?? 0,
    });
  }
  if (!lines.length) return { error: "Tick at least one budget line or add a free line." };

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: g.orgId, project_id: projectId, supplier_id: s(fd, "supplier_id"),
      supplied_by: (s(fd, "supplied_by") ?? "enzyme") as Enums["supply_by"], expected_on: s(fd, "expected_on"), notes: s(fd, "notes"),
    })
    .select("id, code")
    .single();
  if (error) return { error: error.message };
  const { error: lErr } = await supabase.from("purchase_order_lines").insert(lines.map((l) => ({ ...l, purchase_order_id: po.id })));
  if (lErr) return { error: lErr.message };
  revalidatePath(path(projectId));
  return { ok: `${po.code} created as a draft.` };
}

export async function setPoStatus(fd: FormData) {
  await requireWriter();
  const supabase = await createClient();
  const id = String(fd.get("id"));
  const status = String(fd.get("status")) as Enums["po_status"];
  const { data: po } = await supabase.from("purchase_orders").select("ordered_on").eq("id", id).single();
  const patch: Database["public"]["Tables"]["purchase_orders"]["Update"] = { status };
  if (!["draft", "cancelled"].includes(status) && !po?.ordered_on) patch.ordered_on = today();
  if (status === "delivered") patch.delivered_on = today();
  const { error } = await supabase.from("purchase_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  if (status === "delivered") {
    const { data: lines } = await supabase.from("purchase_order_lines").select("id, quantity").eq("purchase_order_id", id);
    for (const l of lines ?? []) await supabase.from("purchase_order_lines").update({ received_quantity: l.quantity }).eq("id", l.id);
  }
  revalidatePath(path(String(fd.get("project_id"))));
}

export async function saveAsPrice(_p: State, fd: FormData): Promise<State> {
  const g = await guard();
  if ("error" in g) return g;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_actual_price", { p_po_line: String(fd.get("po_line_id")) });
  if (error) return { error: error.message };
  return { ok: "Saved to your prices." };
}

export async function addInvoice(projectId: string, _p: State, fd: FormData): Promise<State> {
  const g = await guard();
  if ("error" in g) return g;
  const net = toNumber(fd.get("net_amount"));
  if (net == null) return { error: "Enter the amount before VAT." };
  const supabase = await createClient();
  const { error } = await supabase.from("supplier_invoices").insert({
    organization_id: g.orgId, project_id: projectId, supplier_id: s(fd, "supplier_id"), purchase_order_id: s(fd, "purchase_order_id"),
    number: s(fd, "number"), issued_on: s(fd, "issued_on") ?? today(), due_on: s(fd, "due_on"), net_amount: net,
    vat_amount: toNumber(fd.get("vat_amount")) ?? 0, category: (s(fd, "category") ?? "materials") as Enums["money_category"],
  });
  if (error) return { error: error.message };
  revalidatePath(path(projectId));
  return { ok: "Invoice recorded." };
}

export async function addPayment(projectId: string, _p: State, fd: FormData): Promise<State> {
  const g = await guard();
  if ("error" in g) return g;
  const amount = toNumber(fd.get("amount"));
  if (!amount || amount <= 0) return { error: "Enter the amount." };
  const [direction, category] = String(fd.get("kind") ?? "out:materials").split(":") as [Enums["money_direction"], Enums["money_category"]];
  const supabase = await createClient();
  const invoiceId = s(fd, "invoice_id");
  let supplierId: string | null = null;
  if (invoiceId) supplierId = (await supabase.from("supplier_invoices").select("supplier_id").eq("id", invoiceId).single()).data?.supplier_id ?? null;
  const { error } = await supabase.from("payments").insert({
    organization_id: g.orgId, project_id: projectId, direction, category, amount, paid_on: s(fd, "paid_on") ?? today(),
    concept: s(fd, "concept"), invoice_id: invoiceId, supplier_id: supplierId, method: s(fd, "method"),
  });
  if (error) return { error: error.message };
  revalidatePath(path(projectId));
  return { ok: "Payment recorded." };
}
