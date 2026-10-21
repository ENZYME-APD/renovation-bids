"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWriter } from "@/lib/dal";
import { toNumber } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
export type State = { ok?: string; error?: string } | null;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const today = () => new Date().toISOString().slice(0, 10);

async function writer(): Promise<{ orgId: string } | { error: string }> {
  try {
    return { orgId: (await requireWriter()).id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setPhase(projectId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ phase: String(fd.get("phase")) as Enums["project_phase"] }).eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Phase updated." };
}

export async function signContract(projectId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const versionId = s(fd, "version_id");
  if (!versionId) return { error: "Choose the version that was signed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_contract", {
    p_project: projectId,
    p_version: versionId,
    p_value: toNumber(fd.get("value")) ?? undefined,
    p_signed_on: s(fd, "signed_on") ?? today(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Contract signed. Its budget is now the locked baseline." };
}

export async function addClientRequest(projectId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const request = s(fd, "request");
  if (!request) return { error: "Describe the request." };
  const supabase = await createClient();
  const { error } = await supabase.from("decisions").insert({
    organization_id: w.orgId, project_id: projectId, request, requested_by: s(fd, "requested_by"),
    source: (s(fd, "source") ?? "other") as Enums["decision_source"], impact: s(fd, "impact"),
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Request recorded." };
}

export async function dropClientRequest(projectId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const { error } = await supabase.from("decisions").update({ status: "dropped" }).eq("id", String(fd.get("id")));
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Request dropped." };
}

/** New draft change order (optionally from a client request); opens it. */
export async function createChangeOrder(projectId: string, _p: State, fd: FormData): Promise<State> {
  const w = await writer();
  if ("error" in w) return w;
  const supabase = await createClient();
  const decisionId = s(fd, "decision_id");
  let title = s(fd, "title");
  if (!title && decisionId) title = (await supabase.from("decisions").select("request").eq("id", decisionId).single()).data?.request?.slice(0, 120) ?? null;
  if (!title) return { error: "Give the change a title." };
  const { data, error } = await supabase
    .from("change_orders")
    .insert({
      organization_id: w.orgId, project_id: projectId, title, description: s(fd, "description"),
      reason: (s(fd, "reason") ?? (decisionId ? "client_request" : "other")) as Enums["change_reason"], decision_id: decisionId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  redirect(`/projects/${projectId}/changes/${data.id}`);
}
