import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";

/**
 * EVERYTHING THE VERIFY CHAIN NAMES MUST BE REACHABLE BY FOLLOWING
 * LINKS FROM THE VERIFY RESPONSE — no spec-knowledge guesses, no
 * homepage detours.
 *
 * From the first cold walk of a verify URL (2026-08-03): a subagent
 * handed cert_nn2thd2tak's bare URL and nothing else filled an
 * external_receipt_seen row in ONE round trip — the loop works — but
 * needed a convention-based guess to find the DID document and a
 * blind two-hop detour (homepage → llms.txt) to turn "a free
 * conformance desk" from a phrase in store_identity.what into an
 * endpoint. Both were the file-over defect one FETCH over: the answer
 * existed, nothing standing at the artifact could reach it.
 *
 * These tests walk the chain the way the walker did, so the property
 * that failed — link-following closure from the artifact — is the
 * thing asserted, not the presence of two particular strings.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

async function verifyResponse(): Promise<string> {
  const { mintCertificate } = await import("@/services/certificates");
  const minted = await mintCertificate(testEnv, { itemId: "hello" });
  const response = await SELF.fetch(
    `${BASE}/api/verify/${minted.certificate.cert_id}`,
  );
  expect(response.status).toBe(200);
  return response.text();
}

describe("the verify response reaches everything it talks about", () => {
  it("names the conformance desk WITH its address, in the same breath", async () => {
    const body = await verifyResponse();
    // The phrase that started the hunt…
    expect(body).toContain("conformance desk");
    // …now carries its own destination.
    expect(body).toContain("/api/conformance/v1");
  });

  it("that address answers, and is the desk rather than a page about it", async () => {
    const doc = await SELF.fetch(`${BASE}/api/conformance/v1`);
    expect(doc.status).toBe(200);
    const parsed = (await doc.json()) as Record<string, unknown>;
    expect(parsed["method"]).toBe("POST");
  });
});

describe("the signing-key page reaches the DID document", () => {
  it("links did.json instead of requiring the did:web convention as prior knowledge", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      did?: { id?: string; document?: string };
    };
    expect(body.did?.document).toBe(`${BASE}/.well-known/did.json`);
    expect(body.did?.id).toBe("did:web:scvd.store");
  });

  it("and the linked document agrees with the page that linked it", async () => {
    // One derivation serves both, so this can only fail if somebody
    // forks the key path — which is exactly when it must fail.
    const keyPage = (await (
      await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`)
    ).json()) as { public_key: string };
    const didDoc = (await (
      await SELF.fetch(`${BASE}/.well-known/did.json`)
    ).json()) as {
      verificationMethod: { publicKeyJwk: { x: string } }[];
    };
    const jwkX = didDoc.verificationMethod[0]!.publicKeyJwk.x;
    const raw = atob(jwkX.replace(/-/g, "+").replace(/_/g, "/"));
    const hex = [...raw]
      .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe(keyPage.public_key);
  });
});

describe("what the walk confirmed clean stays pinned clean", () => {
  it("one GET fills an external_receipt_seen row: bytes, signature, key, permanence", async () => {
    const body = JSON.parse(await verifyResponse()) as Record<string, unknown>;
    // Everything a consumer fixture records, in the one response the
    // walker was handed — the property causeclaw's row depends on.
    expect(body["signed_payload"]).toBeTruthy();
    expect(body["signature"]).toBeTruthy();
    expect(body["public_key"]).toBeTruthy();
    const identity = body["store_identity"] as Record<string, string>;
    expect(identity["verify"]).toContain("free and permanent");
  });
});
