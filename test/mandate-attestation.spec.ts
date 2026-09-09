import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";
import { KV_KEYS } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import {
  MANDATE_ATTESTATION_CAP,
  attestMandate,
  attestationPayload,
  listAttestations,
  performMandate,
  storeMandate,
} from "@/services/mandates";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE COUNTER-ATTESTATION (2026-09-09).
 *
 * The mandate's own scope note has always carried the objection
 * against itself: it cannot tell a principal's submission from an
 * agent writing its own authorization. A second key signing the same
 * record is the distinguisher, and these walks hold the store to what
 * it does and does not claim about that.
 */
const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

async function keypair() {
  const priv = ed25519.utils.randomSecretKey();
  return { priv, pub: hex(await ed25519.getPublicKeyAsync(priv)) };
}

async function signPayload(priv: Uint8Array, payload: string) {
  return hex(await ed25519.signAsync(new TextEncoder().encode(payload), priv));
}

/** A mandate on the shelf, recorded and filed the way a purchase does. */
async function freshMandate(text = "Buy at most one report, under five dollars.") {
  const mandate = await performMandate(testEnv, { text, submittedAs: "agent" });
  await storeMandate(testEnv, mandate, "cert_test", mandate.recorded_at);
  return mandate;
}

describe("a second key can sign a mandate, free, and the store adds no claim", () => {
  it("verifies before filing, serves the signature, and lets a stranger re-check it", async () => {
    const mandate = await freshMandate();
    const principal = await keypair();

    // The record tells you exactly what to sign, and says nobody has.
    const before = (await (
      await SELF.fetch(`${BASE}/api/mandate/${mandate.mandate_id}`)
    ).json()) as Record<string, unknown>;
    const attestHere = before["attest_here"] as { sign_this: string; url: string };
    expect(before["attestations"]).toEqual([]);
    expect(String(before["attestation_note"])).toContain("Nobody but the submitter");
    expect(attestHere.sign_this).toBe(
      attestationPayload(mandate.mandate_id, mandate.evidence_hash),
    );

    const posted = await SELF.fetch(
      `${BASE}/api/mandate/${mandate.mandate_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: principal.pub,
          signature: await signPayload(principal.priv, attestHere.sign_this),
          label: "the principal",
        }),
      },
    );
    expect(posted.status).toBe(201);
    const receipt = (await posted.json()) as Record<string, unknown>;
    expect(receipt["attesting_keys"]).toBe(1);
    // The store states the limit of its own claim on the way out.
    expect(String(receipt["what_this_does_not_say"])).toContain("agreed to anything");

    const after = (await (
      await SELF.fetch(`${BASE}/api/mandate/${mandate.mandate_id}`)
    ).json()) as Record<string, unknown>;
    const filed = after["attestations"] as {
      public_key: string;
      signature: string;
      signature_covers: string;
      label?: string;
    }[];
    expect(filed).toHaveLength(1);
    expect(filed[0]?.public_key).toBe(principal.pub);
    expect(filed[0]?.label).toBe("the principal");

    // The whole point: a stranger checks it without believing the store.
    expect(
      await verifyMessageSignature(
        filed[0]!.signature_covers,
        filed[0]!.signature,
        filed[0]!.public_key,
      ),
    ).toBe(true);

    // And the mandate's OWN signature is untouched by any of this — a
    // record verified before an attestation still verifies after.
    const served = after["mandate"] as Record<string, unknown>;
    expect(served["signature"]).toBe(mandate.signature);
    expect(served["evidence_hash"]).toBe(mandate.evidence_hash);
  });

  it("files nothing it cannot verify", async () => {
    const mandate = await freshMandate();
    const stranger = await keypair();
    const other = await keypair();
    const payload = attestationPayload(mandate.mandate_id, mandate.evidence_hash);

    // A real signature, but from a different key than the one claimed.
    const mismatched = await SELF.fetch(
      `${BASE}/api/mandate/${mandate.mandate_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: stranger.pub,
          signature: await signPayload(other.priv, payload),
        }),
      },
    );
    expect(mismatched.status).toBe(400);
    expect(
      String(((await mismatched.json()) as Record<string, unknown>)["error"]),
    ).toContain("does not verify");

    // Shapes that are not keys or signatures at all.
    for (const body of [
      { public_key: "nothex", signature: "a".repeat(128) },
      { public_key: "a".repeat(64), signature: "short" },
    ]) {
      const bad = await SELF.fetch(
        `${BASE}/api/mandate/${mandate.mandate_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      expect(bad.status).toBe(400);
    }

    // Nothing above reached the record.
    expect((await listAttestations(testEnv, mandate.mandate_id)).attestations).toEqual([]);
  });

  it("refuses a signature replayed from another mandate carrying the same text", async () => {
    // Two parties agreeing the same words twice is ordinary. The id is
    // inside the signed payload so one assent cannot be moved onto the
    // other record.
    const text = "Ship the integration, then we both sign off.";
    const first = await freshMandate(text);
    const second = await freshMandate(text);
    expect(first.mandate_id).not.toBe(second.mandate_id);

    const party = await keypair();
    const forFirst = await signPayload(
      party.priv,
      attestationPayload(first.mandate_id, first.evidence_hash),
    );

    const replayed = await attestMandate(testEnv, second.mandate_id, {
      publicKey: party.pub,
      signature: forFirst,
    });
    expect(replayed.ok).toBe(false);
    expect((await listAttestations(testEnv, second.mandate_id)).attestations).toEqual([]);

    // It lands on the record it was actually made for.
    const honest = await attestMandate(testEnv, first.mandate_id, {
      publicKey: party.pub,
      signature: forFirst,
    });
    expect(honest.ok).toBe(true);
  });

  it("counts keys, not submissions — a retry costs no slot", async () => {
    const mandate = await freshMandate();
    const party = await keypair();
    const signature = await signPayload(
      party.priv,
      attestationPayload(mandate.mandate_id, mandate.evidence_hash),
    );
    const send = () =>
      attestMandate(testEnv, mandate.mandate_id, {
        publicKey: party.pub,
        signature,
      });

    const first = await send();
    const again = await send();
    expect(first.ok && first.total).toBe(1);
    // Idempotent: the key writes its own key again rather than a second row.
    expect(again.ok && again.total).toBe(1);
    expect((await listAttestations(testEnv, mandate.mandate_id)).attestations).toHaveLength(1);
    // And each attestation lives under its own key, so two parties
    // signing at once cannot overwrite one another.
    const listed = await testEnv.PATRONS.list({
      prefix: KV_KEYS.mandateAttestationPrefix(mandate.mandate_id),
    });
    expect(listed.keys).toHaveLength(1);
  });

  it("holds both sides of a two-party record, oldest first", async () => {
    // The handshake case, which is this primitive with two parties and
    // nothing else added: one text, two keys, no verdict.
    const mandate = await freshMandate(
      "Five checks, agreed before work: 402 shape, header/body match, schema, hashes, evidence tier.",
    );
    const payload = attestationPayload(mandate.mandate_id, mandate.evidence_hash);
    const buyer = await keypair();
    const implementer = await keypair();

    await attestMandate(testEnv, mandate.mandate_id, {
      publicKey: buyer.pub,
      signature: await signPayload(buyer.priv, payload),
      label: "buyer",
    });
    await attestMandate(testEnv, mandate.mandate_id, {
      publicKey: implementer.pub,
      signature: await signPayload(implementer.priv, payload),
      label: "implementer",
    });

    const { attestations: both } = await listAttestations(testEnv, mandate.mandate_id);
    expect(both.map((entry) => entry.label)).toEqual(["buyer", "implementer"]);
    expect(both[0]!.attested_at <= both[1]!.attested_at).toBe(true);

    const served = (await (
      await SELF.fetch(`${BASE}/api/mandate/${mandate.mandate_id}`)
    ).json()) as Record<string, unknown>;
    // Two keys on one text, and still no word suggesting a bargain.
    const note = String(served["attestation_note"]);
    expect(note).toContain("2 keys have signed");
    expect(note).toContain("not that the parties agreed");
    expect(note).not.toMatch(/\bbinding\b/);
  });

  it("refuses an unknown mandate and says where ids come from", async () => {
    const response = await SELF.fetch(`${BASE}/api/mandate/m_nope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_key: "a".repeat(64),
        signature: "b".repeat(128),
      }),
    });
    expect(response.status).toBe(404);
  });
});

describe("the cap", () => {
  it("stops at the cap and says so", async () => {
    const mandate = await freshMandate();
    const payload = attestationPayload(mandate.mandate_id, mandate.evidence_hash);
    for (let i = 0; i < MANDATE_ATTESTATION_CAP; i += 1) {
      const party = await keypair();
      const filed = await attestMandate(testEnv, mandate.mandate_id, {
        publicKey: party.pub,
        signature: await signPayload(party.priv, payload),
      });
      expect(filed.ok).toBe(true);
    }
    const extra = await keypair();
    const refused = await attestMandate(testEnv, mandate.mandate_id, {
      publicKey: extra.pub,
      signature: await signPayload(extra.priv, payload),
    });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toBe("full");
  });
});
