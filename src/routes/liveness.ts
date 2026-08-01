import { Hono } from "hono";
import { cachedPublicKeyHex, signMessage } from "@/lib/signing";
import { PRESENT_WINDOW_HOURS } from "@/services/shutter";
import { KV_KEYS } from "@/lib/kv-keys";
import type { HonoEnv } from "@/types";

/**
 * THE LIVENESS BEACON — the dead-man pattern, made honest.
 *
 * An outside operator's stated requirement for honoring another shop's
 * receipts was fail-closed semantics "for when the issuer disappears."
 * The solved pattern is the warrant canary / dead-man switch: a dated,
 * signed statement a verifier can check for staleness instead of
 * guessing whether silence means anything.
 *
 * THE MORBIDITY IS DEALT WITH BY NOT CLAIMING THE MORBID THING. An
 * automated signature cannot prove the keeper is alive — it proves the
 * WORKER still signs, which is a fact about infrastructure. What it
 * can honestly carry about the human is a fact the store has tracked
 * since July and already ACTS ON: the keeper's last provable visit to
 * the counter, and whether that falls inside the same 48-hour presence
 * window the shutter uses to refuse human-labor money when nobody is
 * provably there. This beacon signs no new promise — it makes an
 * existing discipline machine-consumable by outsiders. The store
 * already refuses your money when the keeper is away; now a verifier
 * can see the same fact we act on, signed.
 *
 * COMPUTED PER REQUEST, NEVER STORED, and the fail-closed semantics
 * follow from that: a verifier fetches fresh, so issued_at is always
 * now — staleness cannot creep, it can only FAIL, and a fetch that
 * fails or a presence window that has lapsed are the two signals to
 * fail closed on, each meaning exactly what it says. The infrastructure
 * signal and the human signal are separate fields because they are
 * separate facts, and collapsing them is how a canary starts lying.
 */
export const livenessRoutes = new Hono<HonoEnv>();

/** Deterministic field order, the same discipline as every artifact. */
function canonicalizeLiveness(payload: {
  statement: string;
  issued_at: string;
  keeper_last_seen: string | null;
  keeper_within_presence_window: boolean;
  presence_window_hours: number;
}): string {
  return JSON.stringify({
    statement: payload.statement,
    issued_at: payload.issued_at,
    keeper_last_seen: payload.keeper_last_seen,
    keeper_within_presence_window: payload.keeper_within_presence_window,
    presence_window_hours: payload.presence_window_hours,
  });
}

livenessRoutes.get("/.well-known/liveness.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const lastSeen = await c.env.COUNTERS.get(KV_KEYS.keeperLastSeen);
  const withinWindow =
    lastSeen !== null &&
    Date.now() - new Date(lastSeen).getTime() <=
      PRESENT_WINDOW_HOURS * 3600 * 1000;

  const payload = {
    statement:
      "This store's signing infrastructure produced and signed this document at issued_at. That proves the Worker runs and the key signs — infrastructure liveness, nothing more. The keeper fields carry a separate fact, one this store already acts on: his last provable visit to the counter, against the same presence window the shutter uses to refuse human-labor purchases when nobody is provably there.",
    issued_at: new Date().toISOString(),
    keeper_last_seen: lastSeen,
    keeper_within_presence_window: withinWindow,
    presence_window_hours: PRESENT_WINDOW_HOURS,
  };
  const { signature, publicKey } = await signMessage(
    canonicalizeLiveness(payload),
    c.env.SIGNING_KEY,
  );

  return c.json({
    ...payload,
    signature,
    public_key: publicKey,
    algorithm: "ed25519",
    signed_payload: canonicalizeLiveness(payload),
    /**
     * The consumption contract, stated where it is consumed. A beacon
     * whose reader has to guess what staleness means is a beacon that
     * gets read optimistically, which defeats it.
     */
    how_to_fail_closed:
      "Fetch this document fresh; never cache it as evidence. It is computed and signed per request, so three signals carry all the meaning: (1) the fetch FAILS — treat the issuer as unreachable and fail closed; (2) keeper_within_presence_window is FALSE — the human half of this store is not provably present, which is exactly when the store itself refuses human-labor purchases, so weight human-dependent promises accordingly; (3) the signature does not verify against the key at /.well-known/scvd-signing-key — treat everything as compromised. A missing beacon is a signal; an old copy of one is not evidence of anything.",
    what_this_does_not_prove:
      "That the keeper is alive or well — an automated signature cannot know that, and this one does not claim it. It proves the infrastructure signs and reports when the keeper last provably stood at the counter. The distinction between those is the same self_signed honesty /attestation applies to everything else here.",
    key_history: `${base}/.well-known/scvd-signing-key`,
    succession_protocol: `${base}/attestation`,
  });
});
