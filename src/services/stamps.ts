import { newStampId } from "@/lib/ids";
import { currentWeekKey, KV_KEYS } from "@/lib/kv-keys";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type {
  Env,
  SignedStampRecord,
  StampRecord,
  StampVariant,
} from "@/types";

/**
 * Free visit stamps: dated, ed25519-signed, one design per ISO week.
 * Visitor stamps come from POST /api/stamp; contributor stamps are minted
 * when the keeper publishes a Gazette issue. Verifiable at /api/verify.
 */

/** Deterministic JSON so a stamp signature always covers the same bytes. */
export function canonicalizeStamp(stamp: StampRecord): string {
  const ordered: Record<string, string> = {
    stamp_id: stamp.stamp_id,
    variant: stamp.variant,
    week: stamp.week,
    date: stamp.date,
  };
  if (stamp.name !== undefined) {
    ordered["name"] = stamp.name;
  }
  return JSON.stringify(ordered);
}

export interface IssuedStamp {
  record: SignedStampRecord;
  verifyUrl: string;
  svgUrl: string;
}

export async function issueStamp(
  env: Env,
  variant: StampVariant,
  name?: string,
): Promise<IssuedStamp> {
  const stamp: StampRecord = {
    stamp_id: newStampId(),
    variant,
    week: currentWeekKey(),
    date: new Date().toISOString(),
  };
  if (name) {
    stamp.name = name;
  }
  const { signature, publicKey } = await signMessage(
    canonicalizeStamp(stamp),
    env.SIGNING_KEY,
  );
  const record: SignedStampRecord = {
    stamp,
    signature,
    public_key: publicKey,
  };
  await env.PATRONS.put(KV_KEYS.stamp(stamp.stamp_id), JSON.stringify(record));
  return {
    record,
    verifyUrl: `${env.STORE_BASE_URL}/api/verify/${stamp.stamp_id}`,
    svgUrl: `${env.STORE_BASE_URL}/badges/stamps/${stamp.stamp_id}.svg`,
  };
}

export async function getStamp(
  env: Env,
  stampId: string,
): Promise<SignedStampRecord | null> {
  return env.PATRONS.get<SignedStampRecord>(KV_KEYS.stamp(stampId), "json");
}

export async function verifyStampSignature(
  record: SignedStampRecord,
): Promise<boolean> {
  return verifyMessageSignature(
    canonicalizeStamp(record.stamp),
    record.signature,
    record.public_key,
  );
}
