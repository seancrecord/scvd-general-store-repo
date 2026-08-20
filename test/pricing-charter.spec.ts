import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { jcsCanonicalize } from "@/lib/jcs";
import { verifyMessageSignature } from "@/lib/signing";
import { MENU_ITEMS } from "@/store";
import {
  charterSignedSubset,
  PRICING_CHARTER,
  PRICING_CHARTER_VERSION,
} from "@/store/pricing-charter";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };
const JSON_ACCEPT = { Accept: "application/json" };

/**
 * THE CHARTER IS A PROMISE, so the tests hold the promise-shaped
 * parts: the signature verifies against the served canonical form,
 * the floor is computed rather than typed, and the clauses the store
 * already keeps today are actually kept by the running store — a
 * charter clause the code contradicts on day one would be the most
 * expensive kind of copy defect this store can ship.
 */
describe("/pricing serves a signed charter", () => {
  it("signs the canonical form it serves, verifiably", async () => {
    const response = await SELF.fetch(`${BASE}/pricing`, {
      headers: JSON_ACCEPT,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.version).toBe(PRICING_CHARTER_VERSION);
    const block = body.signature;
    expect(block, "no signature block — is SIGNING_KEY set in tests?").toBeTruthy();
    // The served canonical form is the JCS of the served payload —
    // one source, recomputable.
    expect(block.canonical_form).toBe(jcsCanonicalize(block.signed_payload));
    const key = await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`);
    const keyText = await key.text();
    const publicKeyHex = /[0-9a-f]{64}/.exec(keyText)?.[0] ?? "";
    expect(publicKeyHex).toHaveLength(64);
    expect(
      await verifyMessageSignature(
        block.canonical_form,
        block.signature,
        publicKeyHex,
      ),
    ).toBe(true);
  });

  it("is deterministic: the same words carry the same signature", async () => {
    const [a, b] = await Promise.all([
      SELF.fetch(`${BASE}/pricing`, { headers: JSON_ACCEPT }),
      SELF.fetch(`${BASE}/pricing`, { headers: JSON_ACCEPT }),
    ]);
    const [bodyA, bodyB] = (await Promise.all([a.json(), b.json()])) as [
      Record<string, any>,
      Record<string, any>,
    ];
    expect(bodyA.signature.signature).toBe(bodyB.signature.signature);
  });

  it("computes the floor from the shelf rather than typing it", async () => {
    const response = await SELF.fetch(`${BASE}/pricing`, {
      headers: JSON_ACCEPT,
    });
    const body = (await response.json()) as Record<string, any>;
    expect(body.current_floor_usd).toBe(
      Math.min(...MENU_ITEMS.map((item) => item.price_usdc)),
    );
  });

  it("renders every clause and its check on the page", async () => {
    const response = await SELF.fetch(`${BASE}/pricing`, { headers: HTML });
    const page = await response.text();
    for (const clause of PRICING_CHARTER) {
      expect(page, `clause ${clause.id} missing from the page`).toContain(
        clause.id,
      );
    }
    expect(page).toContain("Check it yourself");
  });

  it("keeps the clauses the store already keeps", async () => {
    // scarcity_is_labor: every capped item is human-fulfilled.
    for (const item of MENU_ITEMS) {
      if (item.weekly_inventory !== undefined) {
        expect(
          item.fulfillment,
          `${item.id} is capped but not human-fulfilled — the charter's scarcity clause just became false`,
        ).toBe("human_queue");
      }
    }
    // floor_stays_low: the floor is actually under a penny.
    expect(Math.min(...MENU_ITEMS.map((item) => item.price_usdc))).toBeLessThan(
      0.01,
    );
    // verification_stays_free: the three named doors answer without a 402.
    for (const path of ["/api/conformance/v1", "/api/preflight/v1"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, `${path} answered ${response.status}`).not.toBe(
        402,
      );
    }
  });

  it("excludes the signature and the moving floor from the signed subset", () => {
    const subset = charterSignedSubset();
    const canonical = jcsCanonicalize(subset);
    expect(canonical).not.toContain("signature");
    expect(canonical).not.toContain("current_floor");
  });
});
