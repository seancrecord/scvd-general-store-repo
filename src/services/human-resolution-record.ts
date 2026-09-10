import { canonicalAddress } from "@/lib/addresses";
import type { Env } from "@/types";

// The original human-resolution names and coordinator keys are retained so
// historical refund claims share one reuse guard across every paid product.
export type HumanResolutionOutcome = "fulfilled_by_hand" | "refunded" | "house_absorbed";
export interface HumanResolutionRecord {
  statement: {
    version: 1; revision: number; path: string; transaction: string; network: string;
    payer: string; paid_usdc: number; outcome: HumanResolutionOutcome; recorded_at: string;
    evidence: Record<string, unknown>;
    previous_signature?: string;
  };
  signed_payload: string;
  signature: string;
  public_key: string;
  request_digest: string;
  intent: { path: string; transaction?: string; payer?: string; paid_usdc: number; settled_at: string; query?: string };
  previous?: HumanResolutionRecord;
  legacy_resolution?: unknown;
}

export function humanResolutionKey(network: string, transaction: string): string {
  return `${network}:${network.startsWith("eip155:") ? transaction.toLowerCase() : transaction}`;
}

export function humanResolutionStore(env: Env) {
  const ns = env.PAID_RECOVERIES;
  if (!ns) throw new Error("Resolution storage unavailable");
  // A keeper's bounded workload. One coordinator makes refund reuse and the
  // resolution record one atomic decision, even across different purchases.
  return ns.get(ns.idFromName("human-delivery-resolutions"));
}

export async function readHumanResolution(env: Env, identity: {
  path: string; transaction: string; network: string; payer: string | undefined;
}): Promise<HumanResolutionRecord | null> {
  if (!identity.payer) return null;
  const record = await loadHumanResolution(env, identity.network, identity.transaction);
  const statement = record?.statement;
  return statement && statement.path === identity.path && statement.network === identity.network &&
    humanResolutionKey(statement.network, statement.transaction) === humanResolutionKey(identity.network, identity.transaction) &&
    canonicalAddress(statement.payer) === canonicalAddress(identity.payer) ? record : null;
}

/** A resolution is a terminal answer about this purchase, not a new offer. */
export function humanResolutionBody(record: HumanResolutionRecord): Record<string, unknown> & { error: string } {
  const { statement, signed_payload, signature, public_key } = record;
  return {
    code: "purchase_resolved", charged: true, charged_again: false, settlement_attempted: false,
    terminal: true, outcome: statement.outcome, transaction: statement.transaction, network: statement.network,
    paid_usdc: statement.paid_usdc, refunded: statement.outcome === "refunded",
    error: "This purchase has a recorded resolution. Keep the signed resolution and its work or refund evidence; do not pay again to recover this purchase.",
    resolution: { statement, signed_payload, signature, public_key, algorithm: "ed25519" },
  };
}

export async function loadHumanResolution(env: Env, network: string, transaction: string): Promise<HumanResolutionRecord | null> {
  const raw = await humanResolutionStore(env).readHumanResolution(humanResolutionKey(network, transaction));
  return raw ? JSON.parse(raw) as HumanResolutionRecord : null;
}
export async function saveHumanResolution(env: Env, proposal: HumanResolutionRecord, revision: number): Promise<{
  ok: boolean; record?: HumanResolutionRecord; refusal?: string;
}> {
  return JSON.parse(await humanResolutionStore(env).saveHumanResolution(JSON.stringify(proposal), revision));
}
