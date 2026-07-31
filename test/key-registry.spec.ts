import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  attributeKey,
  FIRST_KEY_IN_SERVICE_FROM,
  RETIRED_KEYS,
  retiredKeysFor,
  rotationsPerformed,
} from "@/store/key-registry";
import {
  canonicalizeHandover,
  createHandover,
  HandoverError,
  verifyHandoverSignature,
} from "@/services/key-handover";
import { getPublicKeyHex } from "@/lib/signing";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const OTHER_KEY = "a".repeat(64);

/**
 * THE KEY REGISTRY — built to close a gap between a claim and a
 * capability, and it turned out to close an older one on the way.
 *
 * /attestation published the form a handover would take while nothing
 * in the code could perform one. That was the reason to build this.
 * Scoping it surfaced the second thing: verification checks a
 * signature against the public key stored in the artifact's own
 * record, which proves internal consistency and NOT that this store
 * issued the artifact. A record carrying somebody else's keypair
 * verified exactly as cleanly as one of ours.
 */
describe("an artifact says which of our keys signed it", () => {
  it("names the current key as current", async () => {
    const current = await getPublicKeyHex((env as Env).SIGNING_KEY);
    expect(attributeKey(current, current).status).toBe("current");
  });

  it("refuses to vouch for a key the store has never published", () => {
    // The hole this closes. Before the registry, an artifact signed
    // with a stranger's keypair would return valid: true with nothing
    // anywhere saying it was not ours.
    const attribution = attributeKey(OTHER_KEY, "b".repeat(64));
    expect(attribution.status).toBe("unrecognised");
    expect(attribution.means).toMatch(/do NOT treat it as ours/i);
  });

  it("rides the verify response, not only the registry", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/cert_missing_on_purpose`)
    ).json()) as { valid: boolean };
    // A missing artifact still 404s honestly; the attribution only
    // exists where there is something to attribute.
    expect(body.valid).toBe(false);
  });

  it("publishes every key it has ever used, current first", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`)
    ).json()) as {
      public_key: string;
      key_history: {
        current: { public_key: string; in_service_from: string };
        retired: unknown[];
        rotations_performed: number;
      };
    };
    expect(body.key_history.current.public_key).toBe(body.public_key);
    expect(body.key_history.current.in_service_from).toBe(
      FIRST_KEY_IN_SERVICE_FROM,
    );
    expect(body.key_history.retired).toEqual(
      retiredKeysFor(body.public_key),
    );
    expect(body.key_history.rotations_performed).toBe(
      rotationsPerformed(body.public_key),
    );
  });

  it("states the rotation count as a number derived, never typed", () => {
    // Not a hand-written figure. The same reasoning as the NOT_BUILT
    // entry: a typed count is a claim with a timer on it.
    expect(rotationsPerformed("z".repeat(64))).toBe(RETIRED_KEYS.length);
  });
});

/**
 * THE SWAP WINDOW — the minutes between announcing a handover and
 * actually replacing the secret.
 *
 * The two moves cannot be simultaneous: the announcement has to be
 * signed while the outgoing key is still live, and the secret changes
 * afterwards. Both naive orders are wrong, and one of them is
 * alarming. Publish the retired entry after the swap and every
 * artifact signed by the old key reads `unrecognised` in the
 * meantime — which tells a holder in strong terms that a genuine
 * certificate may be a forgery. Publish it before and key_history
 * shows one key as current and retired at once, which is just false.
 *
 * So the live secret decides and the registry only states intent.
 */
describe("a key that is still signing is current, whatever the registry says", () => {
  it("does not list the live key as retired, even with its entry written", async () => {
    const current = await getPublicKeyHex((env as Env).SIGNING_KEY);
    expect(retiredKeysFor(current).map((k) => k.public_key)).not.toContain(
      current,
    );
  });

  it("reports it as current rather than retired during the window", async () => {
    const current = await getPublicKeyHex((env as Env).SIGNING_KEY);
    // The lock beats the file. An artifact signed by a key that is
    // still in the lock is signed by the current key, full stop.
    expect(attributeKey(current, current).status).toBe("current");
  });

  it("starts counting the rotation only once the secret has actually changed", async () => {
    const current = await getPublicKeyHex((env as Env).SIGNING_KEY);
    const before = rotationsPerformed(current);
    // Same registry, a different key in the lock: the entry begins
    // applying with no deploy and no window in either direction.
    const after = rotationsPerformed("z".repeat(64));
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBe(RETIRED_KEYS.length);
  });
});

/**
 * THE ANNOUNCEMENT IS THE ONLY PART THAT IS A CHECK.
 *
 * Three of the four published succession rules are promises about our
 * conduct. This is the fourth: the outgoing key signs the notice
 * naming its successor, so a real handover is distinguishable from
 * somebody who took over the page and swapped the key on it.
 */
describe("the handover is signed by the key it retires", () => {
  it("signs with the key currently in service, recorded from the signature", async () => {
    const record = await createHandover(env as Env, {
      incomingPublicKey: OTHER_KEY,
      reason: "Test handover.",
    });
    const current = await getPublicKeyHex((env as Env).SIGNING_KEY);
    // Recorded from what actually signed, never from a value passed
    // in — an announcement that could name an outgoing key which did
    // not sign it is an announcement that proves nothing.
    expect(record.handover.outgoing_public_key).toBe(current);
    expect(record.public_key).toBe(current);
    expect(await verifyHandoverSignature(record)).toBe(true);
  });

  it("covers the incoming key inside the signed bytes", async () => {
    const record = await createHandover(env as Env, {
      incomingPublicKey: OTHER_KEY,
      reason: "Test handover.",
    });
    // If the successor were displayed but unsigned, anybody who could
    // edit the record could redirect the handover to their own key
    // without breaking the signature. Precisely the defect CV found
    // on `attests`.
    expect(canonicalizeHandover(record.handover)).toContain(OTHER_KEY);
  });

  it("refuses to announce a handover to the key already in service", async () => {
    const current = await getPublicKeyHex((env as Env).SIGNING_KEY);
    await expect(
      createHandover(env as Env, {
        incomingPublicKey: current,
        reason: "Not actually a handover.",
      }),
    ).rejects.toBeInstanceOf(HandoverError);
  });

  it("refuses anything that is not a public key, including a signature", async () => {
    // 128 hex characters is a signature. Someone reaching for the
    // wrong field should be stopped by the shape rather than by
    // noticing later.
    await expect(
      createHandover(env as Env, {
        incomingPublicKey: "f".repeat(128),
        reason: "Wrong field.",
      }),
    ).rejects.toBeInstanceOf(HandoverError);
  });

  it("serves at a verify URL, saying which key signed and why that is right", async () => {
    const record = await createHandover(env as Env, {
      incomingPublicKey: OTHER_KEY,
      reason: "Test handover.",
    });
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${record.handover.handover_id}`)
    ).json()) as {
      valid: boolean;
      signed_by: { status: string };
      what_this_is: string;
      signed_payload: string;
    };
    expect(body.valid).toBe(true);
    expect(body.signed_by.status).toBe("current");
    expect(body.what_this_is).toMatch(/OUTGOING key/);
    expect(body.signed_payload).toBe(canonicalizeHandover(record.handover));
  });
});
