import { signJcs } from "@/lib/jcs";
import { signMessage } from "@/lib/signing";
import { subjectHistory, type SubjectHistory } from "@/services/subject-history";
import type { Env } from "@/types";

/**
 * THE SPOT CHECK — the observatory's own data, at the counter, for a
 * tenth of a cent (roadmap 0.17; the keeper named it, priced it, and
 * signed the copy on 2026-08-26).
 *
 * WHAT IT IS. Name a host, get what this store already holds on it:
 * ladder state as the corpus recorded it, when we last actually
 * knocked, our coverage of the window since we met it, and — said
 * plainly rather than omitted — what we have never observed. KV
 * reads only: NO request is made to the subject, so the answer is
 * never newer than our last round, and it says so. The routine
 * pre-transaction question ("what does the observatory know about
 * this door?") answered at the cheapest price on the shelf.
 *
 * WHAT IT IS NOT, in the store's own law: never a score, a rating,
 * or a ranking. A host we have never met returns not_observed, and
 * not_observed IS the answer — Rule 52 forbids this lookup from
 * letting its own blindness read as a verdict about the subject.
 *
 * WHY IT IS SIGNED like everything else: a tenth of a cent buys the
 * same discipline five dollars buys. The record's canonical JSON is
 * signed, its evidence hash binds into the purchase certificate, and
 * /api/verify answers for it forever.
 */

export interface SpotCheckRecord {
  spot_check_id: string;
  host: string;
  asked_at: string;
  /**
   * The whole per-host view, verbatim from the same derivation the
   * free corpus surface serves. Duplicating fields here would be a
   * second copy free to drift; quoting the view keeps one deriver.
   */
  history: SubjectHistory;
  /** True when the observatory has never met this host. An answer. */
  not_observed: boolean;
  what_this_is: string;
  what_this_is_not: string;
  /** Where the same facts live free, because they do. */
  free_twin_url: string;
}

const WHAT_THIS_IS =
  "What the observatory already holds on this host, read from the books at the counter: corpus rounds, verdicts as recorded, when we last actually knocked, our own coverage of the window, and the gaps with their reasons. No request was made to the host — this answer is as fresh as our last round and no fresher, and the timestamps say exactly when that was.";

const WHAT_THIS_IS_NOT =
  "Not a score, a rating, or a ranking — house law. Not a live probe: the free preflight at /api/preflight/v2 knocks on the door right now; this reads the ledger instead. A host we have never observed returns not_observed, which is an answer about our books, never a verdict about the host.";

/** A refusal with a buyer-facing reason; thrown pre-mint, charges nothing. */
export class SpotCheckRefused extends Error {}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface SignedSpotCheck {
  record: SpotCheckRecord;
  evidence_hash: string;
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  public_key: string;
}

export function validSpotCheckHost(raw: string | undefined): string | null {
  const host = (raw ?? "").trim().toLowerCase();
  if (!host || host.length > 253) return null;
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/.test(host)) return null;
  return host;
}

export async function performSpotCheck(
  env: Env,
  rawHost: string,
): Promise<SignedSpotCheck> {
  const host = validSpotCheckHost(rawHost);
  if (!host) {
    throw new SpotCheckRefused(
      "Give a bare hostname in the host query parameter — example.com, not a URL. No host, no charge.",
    );
  }
  const base = env.STORE_BASE_URL;
  const history = await subjectHistory(env, host, base);
  /*
   * NOT OBSERVED IS DERIVED, NEVER GUESSED: the host is unobserved
   * when the chain holds no probed round and the register never
   * listed it. Both instruments looked; both came back empty; the
   * emptiness is the finding.
   */
  const notObserved =
    history.rounds_probed === 0 && history.listing === null;

  const record: SpotCheckRecord = {
    spot_check_id: `spot_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
    host,
    asked_at: history.asked_at,
    history,
    not_observed: notObserved,
    what_this_is: WHAT_THIS_IS,
    what_this_is_not: WHAT_THIS_IS_NOT,
    free_twin_url: `${base}/corpus/host/${host}.json`,
  };
  const signedPayload = JSON.stringify(record);
  const { signature, publicKey } = await signMessage(
    signedPayload,
    env.SIGNING_KEY,
  );
  return {
    record,
    evidence_hash: await sha256Hex(signedPayload),
    signed_payload: signedPayload,
    signature,
    signature_jcs: await signJcs(
      record as unknown as Record<string, unknown>,
      env.SIGNING_KEY,
    ),
    public_key: publicKey,
  };
}
