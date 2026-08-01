import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getPublicKeyHex } from "@/lib/signing";
import { retiredKeysFor } from "@/store/key-registry";
import type { Env } from "@/types";

const BASE = "https://scvd.store";

/**
 * did:web:scvd.store — the shape the x402 Signed Offers & Receipts
 * extension resolves to find our public key.
 *
 * Its JWS format accepts Ed25519, which is what this store already
 * signs everything with, so the key on an offer or receipt would be
 * the same key on every certificate. One key, one identity.
 */
describe("the DID document publishes the key that actually signs", () => {
  async function did(): Promise<Record<string, unknown>> {
    const response = await SELF.fetch(`${BASE}/.well-known/did.json`);
    expect(response.headers.get("content-type")).toContain("did+json");
    return (await response.json()) as Record<string, unknown>;
  }

  it("carries the live key as an Ed25519 JWK, not a typed copy", async () => {
    const body = await did();
    const method = (body["verificationMethod"] as {
      publicKeyJwk: { kty: string; crv: string; x: string };
      id: string;
    }[])[0];
    expect(method?.publicKeyJwk.kty).toBe("OKP");
    expect(method?.publicKeyJwk.crv).toBe("Ed25519");

    // The JWK must decode to exactly the key the store signs with.
    // A second place the key is published is a second thing that can
    // go stale, which is the defect removed from five surfaces today.
    const live = await getPublicKeyHex((env as Env).SIGNING_KEY);
    const raw = atob(
      method!.publicKeyJwk.x.replace(/-/g, "+").replace(/_/g, "/"),
    );
    const hex = [...raw]
      .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    expect(hex, "did.json publishes a different key than the store uses").toBe(
      live,
    );
  });

  it("names each key permanently, never by slot", async () => {
    // The kid must survive rotation: a receipt signed today carries
    // it forever, and a fragment that repoints to the next key would
    // make that receipt FAIL verification rather than merely age.
    const body = await did();
    const live = await getPublicKeyHex((env as Env).SIGNING_KEY);
    const method = (body["verificationMethod"] as { id: string }[])[0];
    const expected = `did:web:scvd.store#key-${retiredKeysFor(live).length + 1}`;
    expect(method?.id).toBe(expected);
    // And every retired key keeps the number it always had.
    const scvd = body["scvd"] as { retired_keys: { kid: string }[] };
    scvd.retired_keys.forEach((entry, index) => {
      expect(entry.kid).toBe(`did:web:scvd.store#key-${index + 1}`);
    });
  });

  it("agrees with the well-known key endpoint exactly", async () => {
    const body = await did();
    const wellKnown = (await (
      await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`)
    ).json()) as { public_key: string };
    const method = (body["verificationMethod"] as { id: string }[])[0];
    expect(method?.id).toContain("did:web:scvd.store");
    // Both derive from the same cached call, so this cannot drift —
    // the test is here to keep it that way if somebody hardcodes one.
    const scvd = body["scvd"] as { key_history: string };
    expect(scvd.key_history).toContain("/.well-known/scvd-signing-key");
    expect(wellKnown.public_key).toBeTruthy();
  });

  it("never lists a retired key as an authorised verification method", async () => {
    /**
     * verificationMethod means AUTHORISED NOW. Listing a retired key
     * there to be helpful would tell a verifier the old key can still
     * sign for us, which is the opposite of what retiring it meant.
     * They belong in the record, with dates, and nowhere else.
     */
    const body = await did();
    const live = await getPublicKeyHex((env as Env).SIGNING_KEY);
    const methods = body["verificationMethod"] as { id: string }[];
    expect(methods.length).toBe(1);
    const scvd = body["scvd"] as {
      retired_keys: { public_key_hex: string; handover: string }[];
    };
    expect(scvd.retired_keys.length).toBe(retiredKeysFor(live).length);
    for (const retired of scvd.retired_keys) {
      expect(retired.handover).toMatch(/\/api\/verify\/handover_/);
    }
  });

  it("names the durability gap did:web has, rather than implying it does not", async () => {
    // The extension's own documentation says a DID document is mutable
    // and current-state only, and lists on-chain attestation as the
    // only durable option. This store already has the durable half —
    // and a document that quietly implied otherwise would be claiming
    // a property it does not have.
    const body = await did();
    const scvd = body["scvd"] as { key_history_note: string };
    expect(scvd.key_history_note).toMatch(/mutable/i);
    expect(scvd.key_history_note).toMatch(/signed by the outgoing key/i);
  });
});
