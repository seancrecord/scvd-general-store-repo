import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { storeIdentity } from "@/lib/identity";
import { CERT_FIELDS } from "@/lib/signing";
import { STORE_SERVICE_NAME } from "@/store";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE ARTIFACT EXPLAINS ITSELF TO WHOEVER HOLDS IT NEXT.
 *
 * The outbound half of this shipped 2026-07-30: a user-agent that
 * doubles as a permanent backlink, copied from another x402 service
 * that had worked out that logs get read by machines. We proved the
 * reasoning and never pointed it at what actually leaves the building.
 *
 * A certificate in somebody else's hands was cert_id, item,
 * patron_number, a verify URL and a bare domain. Nothing saying what
 * scvd.store is — which is a problem exactly for the two propagation
 * mechanisms this store is built for: a successor session reading back
 * a context_anchor, and a stranger reading a document that quotes
 * somebody else's cert.
 *
 * These tests hold the three rules that make it safe rather than
 * marketing.
 */
describe("the breadcrumb never touches the signature", () => {
  it("is absent from CERT_FIELDS", () => {
    // Anything inside signed_payload is frozen the moment it is
    // signed. A store description is the sort of line worth tightening
    // in six months, so it must be decoration and not covered bytes.
    expect(CERT_FIELDS).not.toContain("store_identity");
  });

  it("does not appear in the signed payload of a real certificate", async () => {
    const { mintCertificate } = await import("@/services/certificates");
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const { canonicalizeCertificate } = await import("@/lib/signing");
    expect(canonicalizeCertificate(minted.certificate)).not.toContain(
      "store_identity",
    );
  });

  /**
   * STRONGER THAN MERELY UNSIGNED. If a copy were frozen into each
   * stored record, improving the wording would leave every existing
   * artifact carrying the old one — stale by construction, in the
   * field the block exists to be useful in.
   */
  it("is not persisted with the artifact", async () => {
    const { mintCertificate } = await import("@/services/certificates");
    const { KV_KEYS } = await import("@/lib/kv-keys");
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const stored = await testEnv.PATRONS.get(
      KV_KEYS.cert(minted.certificate.cert_id),
    );
    expect(stored).toBeTruthy();
    expect(
      stored!.includes("store_identity"),
      "the breadcrumb was written into the record, which freezes the wording for every artifact already issued",
    ).toBe(false);
  });
});

describe("one string, not one per item", () => {
  it("is identical whatever it rides on", () => {
    // The rule identity.ts already states for the outbound user-agent:
    // a mark that varies fragments the citation it exists to build.
    const a = storeIdentity(BASE);
    const b = storeIdentity(BASE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("takes the store's name from the naming law rather than retyping it", () => {
    expect(storeIdentity(BASE).name).toBe(STORE_SERVICE_NAME);
  });
});

describe("it reads as a courtesy rather than a claim on the holder", () => {
  it("says outright that no credit is owed", async () => {
    // /rights gives buyers full ownership with no attribution
    // requirement. A self-describing block that read like a demand
    // would contradict a policy we already published — and the reason
    // this lever is the only one left is precisely that we cannot ask.
    const identity = storeIdentity(BASE);
    expect(identity.rights).toContain("owe this store no credit");
    expect(identity.rights).toContain("/rights");
  });

  it("points at verification a holder can do without us", async () => {
    const identity = storeIdentity(BASE);
    expect(identity.verify).toContain("/api/verify/");
    expect(identity.verify).toContain("without asking us");
  });
});

describe("it rides on what actually leaves the building", () => {
  it("is on a verify response, which is where a stranger meets an artifact", async () => {
    const { mintCertificate } = await import("@/services/certificates");
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${minted.certificate.cert_id}`)
    ).json()) as Record<string, any>;
    expect(
      body["store_identity"],
      "a stranger checking somebody else's certificate still meets a bare domain",
    ).toBeTruthy();
    expect(body["store_identity"]["what"]).toContain("general store");
  });

  it("is served fresh, so old artifacts get the current wording", async () => {
    // The point of not persisting it: an artifact minted months ago and
    // sitting in a stranger's context gets today's description when
    // anybody checks it.
    const { mintCertificate } = await import("@/services/certificates");
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${minted.certificate.cert_id}`)
    ).json()) as Record<string, any>;
    expect(JSON.stringify(body["store_identity"])).toBe(
      JSON.stringify(storeIdentity(BASE)),
    );
  });
});
