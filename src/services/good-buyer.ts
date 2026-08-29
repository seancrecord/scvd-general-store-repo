import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { signMessage } from "@/lib/signing";
import { ProbeTargetRefused } from "@/lib/probe-target";
import { probeOnce, runChecks } from "@/services/preflight";
import {
  SIMULATED_CAP_LABEL,
  simulatePayment,
  type ClientProfile,
  type SimulatedPayment,
} from "@/lib/client-simulator";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE GOOD BUYER — the payment dry run, signed (#96, 2026-08-28).
 *
 * WHAT THE FIVE-DOLLAR AUDIT SELLS is an artifact about somebody
 * else's DOOR. This sells the artifact about the transaction that was
 * about to happen: at this dated moment that door offered exactly
 * these accepts, and a client configured this way would have signed
 * THIS one — or refused, on the buyer's own machine, before any
 * signature existed.
 *
 * WHY IT IS WORTH SIGNING, given the reading is free. The free door
 * answers the agent. This answers the HUMAN BEHIND THE AGENT, later,
 * when they ask why their money went where it went — or why it did
 * not go at all. That question is asked after the fact, by someone
 * who was not there, about a door whose terms may have changed since.
 * A dated signature over the accepts as served is the only form of
 * that answer a stranger can check.
 *
 * WHAT IS SIGNED IS THE OBSERVATION, NOT THE ADVICE. The accepts are
 * a fact about the door at a moment. The simulation is a fact about a
 * named library at a named version, replayed over those accepts. The
 * buyer's declared profile is recorded as THEIRS — a parameter they
 * supplied, printed as such, never as something this store verified.
 * Signing "your client is configured this way" would be putting our
 * key under a stranger's claim about their own machine, which is the
 * exact move the mandate receipt exists to refuse.
 *
 * THE PRICE IS FORCED, NOT CHOSEN, and this is the whole argument for
 * $0.99. This door's audience is stock clients that have not raised
 * their ceiling — that is the condition it exists to diagnose. Priced
 * anywhere above @x402/core's imported ceiling it would refuse
 * exactly the buyers it was built for, silently, on their own
 * machines, while telling them about the problem it was refusing them
 * over. A door that teaches you to raise your cap must be payable
 * before you have raised it.
 *
 * NO FREE-TIER BUDGET TAKEN, the audit's rule: the preflight's
 * per-minute buckets meter a free, no-auth endpoint, and here the
 * price is the meter. The probe runs post-settle, where a 429 would
 * be money taken for a reading never made.
 */

/** The library this reading replays, and the version we replay. */
export const GOOD_BUYER_CRITERIA_VERSION = "good-buyer-v1";

export function goodBuyerCriteriaNote(base: string): string {
  return `${GOOD_BUYER_CRITERIA_VERSION}: the accepts this door served at the dated moment below, plus @x402/core's own selectPaymentRequirements replayed over them — default-asset filter, then the ${SIMULATED_CAP_LABEL} per-payment ceiling, then prefer-authorization, then the first survivor. The method is documented and free to run at ${base}/api/before-you-pay/v1 (GET), and the reading is free to reproduce there. What this buys is the dated signature.`;
}

const GOOD_BUYER_SCOPE =
  "One GET at one moment, and a replay of a named client library over what came back. This reports which accept a client of the stated configuration WOULD have signed — not that a payment was made, not that it would have succeeded, and not that anything is delivered afterwards. Nothing was signed and no wallet was touched. The client configuration is the buyer's own declaration, recorded as theirs and never verified by this store. An unreachable verdict is a fact about the network path between this store and that host at that moment; it does not prove the endpoint is down. Produced automatically; no human looked, and that is the point: a reading commissioned by anyone reads the same.";

export interface GoodBuyerObservation {
  reading_id: string;
  /** The door read, exactly as the buyer named it. */
  url: string;
  observed_at: string;
  criteria: string;
  /**
   * `refused` is a statement about US: the target failed this store's
   * published probe-target law and no request was made. In the union
   * so a paid, signed reading can never call our own refusal a fact
   * about the buyer's target.
   */
  verdict: SimulatedPayment["outcome"] | "unreachable" | "refused";
  /**
   * THE ACCEPTS AS SERVED, verbatim and in order. This is the half a
   * stranger can check independently — everything else in the reading
   * is derived from it, so publishing it is what makes the rest
   * falsifiable rather than trusted.
   */
  accepts_as_served: Record<string, unknown>[];
  /**
   * The buyer's declared client configuration, recorded as a claim
   * they made. Empty object means they declared nothing, which is the
   * unconfigured-client reading.
   */
  client_profile_as_declared: ClientProfile;
  /** The replay. Absent when no probe completed. */
  simulation?: SimulatedPayment;
  /** Why the probe produced nothing, when it produced nothing. */
  could_not_read?: string;
  evidence_hash: string;
  scope: string;
}

export interface SignedGoodBuyerReading extends GoodBuyerObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

/** The KV envelope: the signed reading plus what the purchase minted. */
export interface GoodBuyerRecord {
  reading: SignedGoodBuyerReading;
  cert_id: string;
  created_at: string;
}

export interface GoodBuyerOptions {
  fetch?: typeof fetch;
  now?: Date;
}

/** Digest of the facts, computed before scope joins the artifact. */
async function readingEvidenceHash(
  core: Omit<GoodBuyerObservation, "evidence_hash" | "scope">,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(core)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * One probe, one replay, one signature. The URL was validated before
 * the payment gate; a network failure here becomes a signed
 * `unreachable` rather than a throw, because "did not answer when we
 * knocked, at this dated moment" is itself an observation the buyer
 * paid for — framed on the artifact as exactly that and no more.
 */
export async function performGoodBuyerReading(
  env: Env,
  url: string,
  profile: ClientProfile = {},
  options: GoodBuyerOptions = {},
): Promise<SignedGoodBuyerReading> {
  let verdict: GoodBuyerObservation["verdict"];
  let accepts: Record<string, unknown>[] = [];
  let simulation: SimulatedPayment | undefined;
  let couldNotRead: string | undefined;

  try {
    const outcome = await probeOnce(url, options.fetch ?? fetch, "", env);
    /*
     * THE SAME runChecks THE FREE DOOR RUNS, for its accepts and
     * nothing else. The structural verdict is the preflight's product
     * and the service audit's; duplicating it here would put a third
     * instrument's opinion about the same door into circulation, and
     * the census-versus-audit contradiction (#82) is what that costs.
     * This artifact answers one question and points at the others.
     */
    const ran = runChecks(
      outcome.response,
      outcome.bodyOverLimit,
      outcome.body,
      url,
    );
    accepts = ran.accepts ?? [];
    simulation = simulatePayment(accepts, profile);
    verdict = simulation.outcome;
    if (accepts.length === 0) {
      couldNotRead =
        "the probe completed but no parseable accepts came back, so there was nothing for a client to select among. That is a finding about the door's challenge, and the free preflight is the instrument that reports it — this reading declines to render a payability verdict on bytes that do not exist.";
    }
  } catch (error) {
    /*
     * THE ARTIFACT MUST NOT SAY "UNREACHABLE" OVER A TARGET WE
     * DECLINED TO DIAL. The buy door refuses these before money
     * moves, so the refused branch should never run — it is here so
     * that if it ever does, the signed sentence is still true. The
     * service audit learned this one the same way.
     */
    if (error instanceof ProbeTargetRefused) {
      verdict = "refused";
      couldNotRead = `no request was made: ${error.message} This is a statement about this store's published probe-target law, NOT an observation about that endpoint — we did not look, so we report nothing about what is there.`;
    } else {
      verdict = "unreachable";
      couldNotRead = `the probe could not complete: ${String(error)}. A fact about the network path between us and that host at this moment — it does not prove the endpoint is down, and a buyer elsewhere may reach it fine.`;
    }
  }

  const core = {
    reading_id: `gbuy_${newEntryId()}`,
    url,
    observed_at: (options.now ?? new Date()).toISOString(),
    criteria: goodBuyerCriteriaNote(env.STORE_BASE_URL),
    verdict,
    accepts_as_served: accepts,
    client_profile_as_declared: profile,
    ...(simulation ? { simulation } : {}),
    ...(couldNotRead ? { could_not_read: couldNotRead } : {}),
  };
  const observation: GoodBuyerObservation = {
    ...core,
    evidence_hash: await readingEvidenceHash(core),
    scope: GOOD_BUYER_SCOPE,
  };
  const { signature, publicKey } = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature,
    public_key: publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}

/**
 * Stored AFTER the mint so the envelope can carry the cert id; the
 * signature was fixed before the mint, so the certificate binds the
 * reading and the reading never mentions the certificate — the
 * binding runs one direction, through `attests`.
 */
export async function storeGoodBuyerReading(
  env: Env,
  reading: SignedGoodBuyerReading,
  certId: string,
): Promise<GoodBuyerRecord> {
  const record: GoodBuyerRecord = {
    reading,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await kvPut(
    env.PATRONS,
    KV_KEYS.goodBuyerReading(reading.reading_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getGoodBuyerReading(
  env: Env,
  readingId: string,
): Promise<GoodBuyerRecord | null> {
  return kvGetJson<GoodBuyerRecord>(
    env.PATRONS,
    KV_KEYS.goodBuyerReading(readingId),
    "json",
  );
}
