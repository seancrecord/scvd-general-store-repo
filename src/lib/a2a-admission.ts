import { repairRows } from "@/store/a2a-repair";
import { authorize, readCard, target } from "@/lib/a2a-instrument";
import type { Env } from "@/types";
export async function takeA2ABudget(env: Env): Promise<boolean> {
  if (!env.A2A_KITS) return false;
  const budget = env.A2A_KITS.get(env.A2A_KITS.idFromName("a2a-free-budget"));
  return budget.takeBudget();
}
export async function a2aAdmission(env: Env, raw: unknown): Promise<string | null> {
  let url: string;
  try { url = target(raw, new URL(env.STORE_BASE_URL).host); } catch { return "target_refused"; }
  if (!await takeA2ABudget(env)) return "budget_exhausted";
  try { await authorize(await readCard(url)); } catch (error) {
    return error instanceof Error && ["unsupported_version", "unsupported_transport", "endpoint_refused", "invalid_fixture"].includes(error.message) ? error.message : "authorization_required";
  }
  return null;
}

export async function freeA2ACheck(env: Env, raw: unknown): Promise<{ status: 200 | 400 | 429; body: Record<string, unknown> }> {
  let url: string;
  try { url = target(raw, new URL(env.STORE_BASE_URL).host); } catch { return { status: 400, body: { error: "target_refused", documentation: "/a2a-desk.json" } }; }
  if (!await takeA2ABudget(env)) return { status: 429, body: { error: "budget_exhausted", retry_after_seconds: 60 } };
  const reading = await readCard(url);
  return { status: 200, body: { reading, repairs: repairRows(reading), signed: false, next: "/a2a-desk" } };
}
