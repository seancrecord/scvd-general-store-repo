import { newCheckId } from "@/lib/ids";
import { KV_KEYS } from "@/lib/kv-keys";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import type { Env, PhantomCheckRecord } from "@/types";

/**
 * phantom_check, per the store ledger: an out-of-band probe ~6 hours
 * after purchase, long after the buyer's own smoke has cleared, and
 * a signed health attestation. The hourly cron sweeps due checks; the
 * pickup route also resolves a due check on read, so the promise holds
 * even if a cron tick goes missing. Unreachable is a finding.
 */

const PROBE_DELAY_MS = 6 * 60 * 60 * 1000;
const LOOK_TIMEOUT_MS = 5000;

export async function schedulePhantomCheck(
  env: Env,
  target: string,
): Promise<{ record: PhantomCheckRecord; pickupUrl: string }> {
  const now = new Date();
  const record: PhantomCheckRecord = {
    check_id: newCheckId(),
    target,
    purchased_at: now.toISOString(),
    due_at: new Date(now.getTime() + PROBE_DELAY_MS).toISOString(),
    status: "scheduled",
  };
  await env.ORDERS.put(
    KV_KEYS.phantomCheck(record.check_id),
    JSON.stringify(record),
  );
  return {
    record,
    pickupUrl: `${env.STORE_BASE_URL}/api/phantom/${record.check_id}`,
  };
}

async function lookOnce(
  target: string,
): Promise<NonNullable<PhantomCheckRecord["observation"]>> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOK_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const latency = Date.now() - started;
    return {
      checked_at: checkedAt,
      reachable: true,
      status: response.status,
      latency_ms: latency,
      note: `Answered ${response.status} in ${latency}ms. Still standing.`,
    };
  } catch {
    return {
      checked_at: checkedAt,
      reachable: false,
      note: "No answer within five seconds. Whatever was supposed to be there didn't come to the door.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Walk past, look, sign what was seen, file it. */
export async function observePhantomCheck(
  env: Env,
  record: PhantomCheckRecord,
): Promise<PhantomCheckRecord> {
  const observation = await lookOnce(record.target);
  const observed: PhantomCheckRecord = {
    ...record,
    status: "observed",
    observation,
  };
  const { signature, publicKey } = await signMessage(
    JSON.stringify({ check_id: record.check_id, target: record.target, observation }),
    env.SIGNING_KEY,
  );
  observed.signature = signature;
  observed.public_key = publicKey;
  await env.ORDERS.put(
    KV_KEYS.phantomCheck(record.check_id),
    JSON.stringify(observed),
  );
  return observed;
}

/** Fetch a check; if it has come due and nobody's looked yet, look now. */
export async function getPhantomCheck(
  env: Env,
  checkId: string,
): Promise<PhantomCheckRecord | null> {
  const record = await env.ORDERS.get<PhantomCheckRecord>(
    KV_KEYS.phantomCheck(checkId),
    "json",
  );
  if (!record) {
    return null;
  }
  if (record.status === "scheduled" && Date.parse(record.due_at) <= Date.now()) {
    return observePhantomCheck(env, record);
  }
  return record;
}

/** Passive read for verification, never triggers the walk itself. */
export async function readPhantomCheck(
  env: Env,
  checkId: string,
): Promise<PhantomCheckRecord | null> {
  return env.ORDERS.get<PhantomCheckRecord>(
    KV_KEYS.phantomCheck(checkId),
    "json",
  );
}

/** Re-verify an observed check's signature. Free, forever. */
export async function verifyPhantomSignature(
  record: PhantomCheckRecord,
): Promise<boolean> {
  if (!record.observation || !record.signature || !record.public_key) {
    return false;
  }
  return verifyMessageSignature(
    JSON.stringify({
      check_id: record.check_id,
      target: record.target,
      observation: record.observation,
    }),
    record.signature,
    record.public_key,
  );
}

/** The hourly walk: resolve every check that has come due. */
export async function sweepPhantomChecks(env: Env): Promise<number> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.phantomPrefix });
  let observed = 0;
  for (const key of listed.keys) {
    const record = await env.ORDERS.get<PhantomCheckRecord>(key.name, "json");
    if (
      record &&
      record.status === "scheduled" &&
      Date.parse(record.due_at) <= Date.now()
    ) {
      await observePhantomCheck(env, record);
      observed += 1;
    }
  }
  return observed;
}
