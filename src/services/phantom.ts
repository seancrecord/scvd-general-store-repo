import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * phantom_check: one GET from the store's counter, five seconds of
 * patience, and a signed record of what was seen. The observation is
 * the product — unreachable is a finding, not a failure.
 */

const LOOK_TIMEOUT_MS = 5000;

export interface PhantomObservation {
  target: string;
  checked_at: string;
  reachable: boolean;
  status?: number;
  latency_ms?: number;
  note: string;
}

export interface SignedObservation {
  observation: PhantomObservation;
  signature: string;
  public_key: string;
}

async function lookOnce(target: string): Promise<PhantomObservation> {
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
      target,
      checked_at: checkedAt,
      reachable: true,
      status: response.status,
      latency_ms: latency,
      note: `Answered ${response.status} in ${latency}ms. It's there.`,
    };
  } catch {
    return {
      target,
      checked_at: checkedAt,
      reachable: false,
      note: "No answer within five seconds. Whatever you remember being there didn't come to the door.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Look, then sign what was seen so the record outlives the moment. */
export async function performPhantomCheck(
  env: Env,
  target: string,
): Promise<SignedObservation> {
  const observation = await lookOnce(target);
  const { signature, publicKey } = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return { observation, signature, public_key: publicKey };
}
