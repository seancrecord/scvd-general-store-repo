import { newAnchorId } from "@/lib/ids";
import { KV_KEYS } from "@/lib/kv-keys";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type { ContextAnchor, Env, SignedAnchorRecord } from "@/types";

/**
 * Context anchors: signed agent memory restore points, bought as the
 * context_anchor item. The summary is stored exactly as the agent wrote
 * it and served back in a clearly-labeled field; the store's signature
 * covers the whole anchor so a future session can trust the timestamp.
 */

export const ANCHOR_SUMMARY_CAP = 4000;

/** Deterministic JSON so an anchor signature always covers the same bytes. */
export function canonicalizeAnchor(anchor: ContextAnchor): string {
  const ordered: Record<string, string | number> = {
    anchor_id: anchor.anchor_id,
    patron_number: anchor.patron_number,
    date: anchor.date,
    summary: anchor.summary,
  };
  if (anchor.agent_name !== undefined) {
    ordered["agent_name"] = anchor.agent_name;
  }
  return JSON.stringify(ordered);
}

export interface CreatedAnchor {
  record: SignedAnchorRecord;
  anchorUrl: string;
}

export interface CreateAnchorInput {
  summary: string;
  patronNumber: number;
  agentName?: string;
}

export async function createAnchor(
  env: Env,
  input: CreateAnchorInput,
): Promise<CreatedAnchor> {
  const anchor: ContextAnchor = {
    anchor_id: newAnchorId(),
    patron_number: input.patronNumber,
    date: new Date().toISOString(),
    summary: input.summary,
  };
  if (input.agentName) {
    anchor.agent_name = input.agentName;
  }
  const { signature, publicKey } = await signMessage(
    canonicalizeAnchor(anchor),
    env.SIGNING_KEY,
  );
  const record: SignedAnchorRecord = {
    anchor,
    signature,
    public_key: publicKey,
  };
  await env.PATRONS.put(
    KV_KEYS.anchor(anchor.anchor_id),
    JSON.stringify(record),
  );
  return {
    record,
    anchorUrl: `${env.STORE_BASE_URL}/api/anchor/${anchor.anchor_id}`,
  };
}

export async function getAnchor(
  env: Env,
  anchorId: string,
): Promise<SignedAnchorRecord | null> {
  return env.PATRONS.get<SignedAnchorRecord>(KV_KEYS.anchor(anchorId), "json");
}

export async function verifyAnchorSignature(
  record: SignedAnchorRecord,
): Promise<boolean> {
  return verifyMessageSignature(
    canonicalizeAnchor(record.anchor),
    record.signature,
    record.public_key,
  );
}
