import * as ed25519 from "@noble/ed25519";
import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { guestbookSigningPayload } from "@/services/guestbook";
import { createOrder, completeOrder } from "@/services/orders";
import { createRefund, markRefundPaid } from "@/services/refunds";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE TRUST-LAYER ADDITIONS OF 2026-08-01, tested the way their
 * readers will read them: the standards story where diligence looks,
 * the conformance vectors served from the store itself, security.txt
 * at the RFC 9116 URL, the fulfillment log computed from real order
 * records, the refund policy citable before payment, and the
 * guestbook identity path that finally lets identity_verified be
 * true without lying about what true means.
 */

async function getJson(path: string): Promise<Record<string, unknown>> {
  const res = await SELF.fetch(`${BASE}${path}`);
  expect(res.status, path).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

describe("the standards story, front and center", () => {
  it("trust.json carries the standards block with the no-cooperation claim", async () => {
    const trust = await getJson("/.well-known/trust.json");
    const standards = isRecord(trust["standards"]) ? trust["standards"] : {};
    expect(String(standards["summary"])).toContain(
      "Signed Offers & Receipts",
    );
    expect(String(standards["summary"])).toContain("did:web");
    // The load-bearing sentence: verification needs none of our code.
    const steps = standards["verify_without_trusting_us"];
    expect(Array.isArray(steps)).toBe(true);
    expect(JSON.stringify(steps)).toContain("did.json");
  });

  it("the llms.txt guide teaches the same story in its own section", async () => {
    const res = await SELF.fetch(`${BASE}/llms-full.txt`);
    const text = await res.text();
    expect(text).toContain("## Standards, so you can check us without asking us");
    expect(text).toContain("conformance/offer-receipt-vectors.json");
  });

  it("serves the conformance vectors, byte-derived from the committed file", async () => {
    const vectors = await getJson(
      "/.well-known/conformance/offer-receipt-vectors.json",
    );
    expect(Array.isArray(vectors["valid"])).toBe(true);
    expect(Array.isArray(vectors["invalid"])).toBe(true);
    // Derived, not pinned to a number: the set grows as failure modes
    // are found, and a hard-coded count turns every addition into a
    // test edit (AT_SCALE rule 1). What matters is that both arms are
    // populated and the known-bad arm is the larger one — a suite that
    // is mostly happy-path is a demo.
    expect((vectors["valid"] as unknown[]).length).toBeGreaterThan(0);
    expect((vectors["invalid"] as unknown[]).length).toBeGreaterThan(
      (vectors["valid"] as unknown[]).length,
    );
    // The served copy points at the live counterpart and the recipe.
    expect(String(vectors["live_counterpart"])).toContain("/api/buy/hello");
    expect(String(vectors["regenerate"])).toContain(
      "generate-conformance-vectors",
    );
  });

  it("says the wallet-safety story where buyers actually read", async () => {
    // trust.json carries the block; the 402 itself carries it at the
    // exact moment a retry loop is born; every MCP buy tool teaches
    // the retry-safety line in its completion criteria.
    const trust = await getJson("/.well-known/trust.json");
    const safety = isRecord(trust["wallet_safety"]) ? trust["wallet_safety"] : {};
    expect(JSON.stringify(safety)).toContain("Idempotency-Key");

    const res = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(isRecord(body["wallet_safety"])).toBe(true);
    expect(JSON.stringify(body["wallet_safety"])).toContain("no second charge");

    const { mcpToolCatalog } = await import("@/lib/mcp-tools");
    for (const tool of mcpToolCatalog(BASE).filter((t) =>
      t.name.startsWith("buy_"),
    )) {
      expect(tool.description, tool.name).toContain(
        "x402/idempotency-key",
      );
    }
  });

  it("x402.json names the vectors for implementers who land there first", async () => {
    const x402 = await getJson("/.well-known/x402.json");
    expect(String(x402["conformance_vectors"])).toContain(
      "/.well-known/conformance/offer-receipt-vectors.json",
    );
  });
});

describe("security.txt (RFC 9116)", () => {
  it("exists at the well-known URL with the required fields", async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/security.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("Contact: ");
    // A mailto contact beside the letter door: the mailbox exists
    // (Cloudflare Email Routing, catch-all to the keeper) and RFC 2142
    // scanners look for one. Host derived from STORE_BASE_URL, never typed.
    expect(text).toMatch(/^Contact: mailto:security@[a-z0-9.-]+$/m);
    expect(text).toContain("Canonical: ");
    const expiresLine = text
      .split("\n")
      .find((line) => line.startsWith("Expires: "));
    expect(expiresLine).toBeDefined();
    const expires = new Date(expiresLine!.slice("Expires: ".length));
    // In the future, and under the RFC's one-year ceiling.
    expect(expires.getTime()).toBeGreaterThan(Date.now());
    expect(expires.getTime()).toBeLessThan(
      Date.now() + 366 * 24 * 3600 * 1000,
    );
  });
});

describe("the fulfillment log", () => {
  it("derives its rows from real order records and keeps buyer detail out", async () => {
    const item = getMenuItem("the_collab");
    expect(item).toBeDefined();
    const order = await createOrder(testEnv, {
      item: item!,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 990001,
      certId: "cert_testlog01",
      detail: "PRIVATE-BUYER-TEXT-MUST-NOT-APPEAR",
    });
    await completeOrder(testEnv, order.order_id, "done");
    const refund = await createRefund(testEnv, {
      item: item!.id,
      amountUsdc: 5,
    });
    await markRefundPaid(testEnv, refund.refund_id, `0x${"cd".repeat(32)}`);

    const log = await getJson("/fulfillment-log");
    const summary = isRecord(log["summary"]) ? log["summary"] : {};
    expect(Number(summary["orders_total"])).toBeGreaterThanOrEqual(1);
    expect(Number(summary["completed"])).toBeGreaterThanOrEqual(1);
    expect(Number(summary["refunds_paid"])).toBeGreaterThanOrEqual(1);

    const rows = log["orders"] as Array<Record<string, unknown>>;
    const row = rows.find((r) => r["item"] === "the_collab");
    expect(row).toBeDefined();
    expect(typeof row!["hours_taken"]).toBe("number");
    expect(row!["on_time"]).toBe(true);
    expect(row!["due_by"]).toBeDefined();

    const serialized = JSON.stringify(log);
    // The privacy line, enforced rather than promised.
    expect(serialized).not.toContain("PRIVATE-BUYER-TEXT");
    expect(serialized).not.toContain(order.order_id);

    const refunds = log["refunds"] as Array<Record<string, unknown>>;
    const paid = refunds.find((r) => r["status"] === "refund_paid");
    expect(String(paid!["tx_hash"])).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("carries the refund policy, which /rights and trust.json also cite", async () => {
    const log = await getJson("/fulfillment-log");
    const rights = await getJson("/rights");
    const trust = await getJson("/.well-known/trust.json");
    for (const doc of [log, rights, trust]) {
      const policy = isRecord(doc["refund_policy"]) ? doc["refund_policy"] : {};
      expect(String(policy["commitment"])).toContain(
        "refunds you himself",
      );
      // Honest about what it is not: escrow.
      expect(String(policy["what_this_is_not"])).toContain("Not escrow");
    }
    expect(String(trust["fulfillment_log"])).toContain("/fulfillment-log");
  });
});

describe("the guestbook identity path", () => {
  const seed = Uint8Array.from({ length: 32 }, () => 7);

  async function signedEntry(name: string, message: string) {
    const payload = guestbookSigningPayload(name, message);
    const signature = await ed25519.signAsync(
      new TextEncoder().encode(payload),
      seed,
    );
    const publicKey = await ed25519.getPublicKeyAsync(seed);
    return {
      name,
      message,
      identity_public_key: Buffer.from(publicKey).toString("hex"),
      identity_signature: Buffer.from(signature).toString("hex"),
    };
  }

  it("flips identity_verified true for a signature that actually verifies", async () => {
    const body = await signedEntry("key-holder", "same key, same signer");
    const res = await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
    const reply = (await res.json()) as Record<string, unknown>;
    const entry = reply["entry"] as Record<string, unknown>;
    expect(entry["identity_verified"]).toBe(true);
    expect(entry["identity_public_key"]).toBe(body.identity_public_key);
    // And the response says what true means — the narrow thing only.
    expect(String(reply["identity_note"])).toContain("same signer");
  });

  it("refuses a bad signature outright instead of storing it unverified", async () => {
    const body = await signedEntry("key-holder", "original message");
    body.message = "tampered after signing";
    const res = await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    const reply = (await res.json()) as Record<string, unknown>;
    expect(String(reply["error"])).toContain("does not verify");
  });

  it("keeps a bare URL claim honestly false, exactly as before", async () => {
    const res = await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "claimer",
        message: "no key, just a link",
        verified_identity: "https://example.com/profile",
      }),
    });
    expect(res.status).toBe(201);
    const reply = (await res.json()) as Record<string, unknown>;
    const entry = reply["entry"] as Record<string, unknown>;
    expect(entry["identity_verified"]).toBe(false);
  });

  it("explains the signing contract on the GET, where a signer would look", async () => {
    const book = await getJson("/api/guestbook");
    expect(String(book["how_to_sign"])).toContain("scvd-guestbook-v1");
    expect(String(book["identity_verified_means"])).toContain(
      "Never that a real-world person was confirmed",
    );
  });
});
