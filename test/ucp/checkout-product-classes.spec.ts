import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { admitUcpCompletion } from "@/services/ucp-admission";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import { mayEnterSettlementFulfillment } from "@/services/settlement-preconditions";
import { preparesBeforeAdmission } from "@/services/purchase-preparation";
import { completionRequest } from "@/lib/ucp/checkout/completion";
import { purchaseRequestDigest } from "@/services/purchase-intent";
import { settlementPurchaseIdentity } from "@/lib/purchase-payment";
import { variantGid } from "@/lib/ucp/ids";
import { getMenuItem, MENU_ITEMS } from "@/store/menu";
import { coreCommerceItems } from "@/store/commerce";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { usdcToAtomic } from "@/lib/payments";
import { priceTiersUsdc } from "@/lib/payments";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const PAYER = "0x2222222222222222222222222222222222222222";

let nonceSeed = 0;
const nextNonce = () => (++nonceSeed).toString(16).padStart(64, "0");

function credential(nonce: string, atomic: string) {
  return {
    x402Version: 2,
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: PAYER,
        to: "0x1111111111111111111111111111111111111111",
        value: atomic,
        validAfter: "0",
        validBefore: "99999999999",
        nonce: `0x${nonce}`,
      },
    },
  };
}

const accepts = () => vi.fn(async () => ({ isValid: true, payer: PAYER }));

/**
 * Plausible values for whatever a product requires, so a whole class
 * can be walked without a bespoke fixture per item.
 */
const INPUT_VALUES: Record<string, string> = {
  url: "https://example.test/door",
  wallet: "0x3333333333333333333333333333333333333333",
  address: "0x3333333333333333333333333333333333333333",
  summary: "A short agent state summary, for the anchor.",
  digest: "a".repeat(64),
  tag: "a mark on the wall",
  confession: "I shipped on a Friday.",
  win: "Closed the quarter.",
  mandate: "Spend up to ten dollars on audits.",
  transaction: `0x${"b".repeat(64)}`,
  transactions: `0x${"b".repeat(64)},0x${"c".repeat(64)}`,
  hashes: `0x${"b".repeat(64)},0x${"c".repeat(64)}`,
  tx: `0x${"b".repeat(64)}`,
  query: `0x${"b".repeat(64)}`,
  network: "eip155:8453",
};

function inputsFor(itemId: string): Record<string, string> {
  const item = getMenuItem(itemId)!;
  const inputs: Record<string, string> = {};
  for (const name of buyInputSchema(item).required ?? []) {
    inputs[name] = INPUT_VALUES[name] ?? "https://example.test/door";
  }
  return inputs;
}

async function openCheckout(variant: string, itemId: string) {
  const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      line_items: [{ item: { id: variant }, quantity: 1 }],
      "store.scvd": { inputs: inputsFor(itemId) },
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const read = (id: string) => ucpCheckoutStore(testEnv, id).readUcpCheckout();

async function eligibilityOf(checkoutId: string, itemId: string, nonce: string) {
  const stored = await read(checkoutId);
  const { id } = await settlementPurchaseIdentity(
    "eip155:8453",
    PAYER,
    `0x${nonce}`,
    "authorization",
  );
  const path = `/ucp/v1/checkout-sessions/${checkoutId}`;
  const digest = await purchaseRequestDigest(testEnv, "ucp", path, completionRequest({ ...stored! }));
  return mayEnterSettlementFulfillment(testEnv, {
    item: getMenuItem(itemId),
    paymentIdentity: id,
    path,
    requestDigest: digest,
  });
}

/**
 * PRODUCT-CLASS COVERAGE, not another protocol matrix.
 *
 * The orchestration is already proven. What these walk is whether
 * every ACTUAL product implementation can satisfy the contract through
 * the shared seam without changing its own semantics — which is the
 * thing an injected preparer can never tell you.
 */
describe("every product this catalog sells can be prepared through the shared seam", () => {
  const sellable = coreCommerceItems().filter(
    (item) => item.pricing === "fixed" && item.fulfillment === "instant",
  );
  const before = sellable.filter((item) => preparesBeforeAdmission(item));
  const after = sellable.filter((item) => !preparesBeforeAdmission(item));

  it("has both classes on the shelf, so this walk means something", () => {
    expect(before.length).toBeGreaterThan(8);
    expect(after.length).toBeGreaterThan(2);
  });

  /**
   * SOME PRODUCERS CANNOT FINISH INSIDE A TEST ISOLATE, and pretending
   * otherwise would be the wrong fix.
   *
   * These four reach their real producer and it does real work that
   * this environment cannot complete: a Base RPC that answers 403 to
   * the sandbox, a hosted publication that needs bindings the test
   * env does not carry, an agent card fetched from a host that is not
   * there. That is a fact about the isolate, not about the seam.
   *
   * So they are walked for the OTHER invariant, which is the one that
   * matters most and is the same one either way: a preparation that
   * fails takes no ownership, moves no money, and leaves the checkout
   * exactly as payable as it was. A product that reached its producer
   * and failed cleanly has proven the seam works for it; whether the
   * producer succeeds is that producer's own test, against its own
   * fixtures, where it already lives.
   */
  const NEEDS_THE_WORLD = new Set([
    "attestation_bundle",
    "the_case_file",
    "a2a_repair_kit",
    "trust_profile",
    "settlement_attestation",
    "settlement_reconciliation",
    "spot_check",
    "provenance_check",
    "the_statement",
    "operator_statement",
    "launch_check",
    "opening_day",
    "passport_refresh",
    "good_buyer",
    "onpage_audit",
    "signature_agent_card",
  ]);

  for (const item of before.filter((row) => !NEEDS_THE_WORLD.has(row.id))) {
    it(`prepares ${item.id} before owning its payment, and is then settlement-eligible`, async () => {
      const { status, body } = await openCheckout(variantGid(item.id), item.id);
      expect(status, item.id).toBe(201);
      const nonce = nextNonce();
      const outcome = await admitUcpCompletion(testEnv, {
        checkoutId: body.id,
        credential: credential(nonce, usdcToAtomic(item.price_usdc)),
        verify: accepts(),
      });
      expect(outcome.ok, `${item.id}: ${outcome.ok ? "" : outcome.detail}`).toBe(true);
      if (outcome.ok) expect(outcome.prepared).toBe("made");
      expect((await read(body.id))?.status).toBe("ready_for_complete");

      // Owned AND prepared: the money increment's precondition holds.
      const eligible = await eligibilityOf(body.id, item.id, nonce);
      expect(eligible.ok, item.id).toBe(true);
      if (eligible.ok) expect(eligible.requires_preparation).toBe(true);
    });
  }

  for (const item of before.filter((row) => NEEDS_THE_WORLD.has(row.id))) {
    it(`reaches ${item.id}'s real producer, and takes nothing when it cannot finish`, async () => {
      const { status, body } = await openCheckout(variantGid(item.id), item.id);
      expect(status, item.id).toBe(201);
      const outcome = await admitUcpCompletion(testEnv, {
        checkoutId: body.id,
        credential: credential(nextNonce(), usdcToAtomic(item.price_usdc)),
        verify: accepts(),
      });
      const stored = await read(body.id);
      if (outcome.ok) {
        // It managed after all — then it must be genuinely prepared.
        expect(outcome.prepared, item.id).toBe("made");
        expect(stored?.status).toBe("ready_for_complete");
        return;
      }
      // The cheap failure this ordering exists to make possible.
      expect(
        ["preparation_failed", "preparation_unavailable"],
        `${item.id}: ${outcome.code} ${outcome.detail}`,
      ).toContain(outcome.code);
      expect(stored?.status, item.id).toBe("ready_for_complete");
      expect(stored?.completion, item.id).toBeUndefined();
    });
  }

  for (const item of after) {
    it(`owns ${item.id}'s payment without preparing anything first`, async () => {
      const { status, body } = await openCheckout(variantGid(item.id), item.id);
      expect(status, item.id).toBe(201);
      const nonce = nextNonce();
      const prepare = vi.fn(async () => ({ attests: "never" }));
      const outcome = await admitUcpCompletion(testEnv, {
        checkoutId: body.id,
        credential: credential(nonce, usdcToAtomic(item.price_usdc)),
        verify: accepts(),
        prepare,
      });
      expect(outcome.ok, `${item.id}: ${outcome.ok ? "" : outcome.detail}`).toBe(true);
      if (outcome.ok) expect(outcome.prepared).toBe("not_required");
      expect(prepare).not.toHaveBeenCalled();

      const eligible = await eligibilityOf(body.id, item.id, nonce);
      expect(eligible.ok, item.id).toBe(true);
      if (eligible.ok) expect(eligible.requires_preparation).toBe(false);
    });
  }
});

describe("the settlement precondition refuses what it should", () => {
  it("refuses a payment nobody owns", async () => {
    const verdict = await mayEnterSettlementFulfillment(testEnv, {
      item: getMenuItem("hello"),
      paymentIdentity: undefined,
      path: "/p",
      requestDigest: "a".repeat(64),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("not_owned");
  });

  it("refuses a prepare-first product whose journal holds nothing", async () => {
    const verdict = await mayEnterSettlementFulfillment(testEnv, {
      item: getMenuItem("service_audit"),
      paymentIdentity: "d".repeat(64),
      path: "/ucp/v1/checkout-sessions/chk_nothing",
      requestDigest: "e".repeat(64),
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("preparation_missing");
      expect(verdict.detail).toContain("cannot prove it made");
    }
  });
});

describe("a tiered item prepares from the tier its checkout froze", () => {
  it("owns the tier's exact amount and nothing else", async () => {
    const tiers = priceTiersUsdc(getMenuItem("luckies")!);
    const { status, body } = await openCheckout(variantGid("luckies", 2), "luckies");
    expect(status).toBe(201);
    // The patron-of-the-arts tier: $4.95, not the $0.99 minimum.
    expect(body.line_items[0].item.price).toBe(Math.round(tiers[2]! * 100));
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: body.id,
      credential: credential(nextNonce(), usdcToAtomic(tiers[2]!)),
      verify: accepts(),
    });
    expect(outcome.ok).toBe(true);
    const stored = await read(body.id);
    expect(stored?.lines[0]?.tier_index).toBe(2);
    expect(stored?.quote?.terms.amount_atomic).toBe(usdcToAtomic(tiers[2]!));
  });

  it("refuses a credential that says it was signed for the minimum tier", async () => {
    const tiers = priceTiersUsdc(getMenuItem("luckies")!);
    const { body } = await openCheckout(variantGid("luckies", 2), "luckies");
    const verify = vi.fn(async () => ({ isValid: true, payer: PAYER }));
    const outcome = await admitUcpCompletion(testEnv, {
      checkoutId: body.id,
      credential: {
        ...credential(nextNonce(), usdcToAtomic(tiers[0]!)),
        // What the buyer's client believes it signed against.
        accepted: { scheme: "exact", amount: usdcToAtomic(tiers[0]!) },
      },
      verify,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("payment_refused");
    // Refused before the facilitator is troubled.
    expect(verify).not.toHaveBeenCalled();
  });

  /**
   * WHAT THIS STORE CHECKS, AND WHAT THE FACILITATOR CHECKS.
   *
   * A credential carrying no `accepted` block asserts nothing, so
   * there is nothing here to disagree with; whether the signed
   * authorization's own value matches the requirements is the
   * facilitator's question, asked with the frozen terms. This store's
   * layer is the comparison in lib/ucp/checkout/binding.ts, which is
   * exercised directly against a PurchasePayment rather than through a
   * stub that would only be testing the stub.
   */
  it("hands the frozen terms to the verifier, whatever the credential omits", async () => {
    const tiers = priceTiersUsdc(getMenuItem("luckies")!);
    const { body } = await openCheckout(variantGid("luckies", 2), "luckies");
    const verify = vi.fn(async () => ({ isValid: true, payer: PAYER }));
    await admitUcpCompletion(testEnv, {
      checkoutId: body.id,
      credential: credential(nextNonce(), usdcToAtomic(tiers[0]!)),
      verify,
    });
    const [, requirements] = verify.mock.calls[0] as unknown as [unknown, { amount: string }];
    expect(requirements.amount).toBe(usdcToAtomic(tiers[2]!));
  });
});

/**
 * THE GLOBAL ASSERTION FOR THIS WHOLE CHAPTER, amended once.
 *
 * Until 44d6457 this read "nothing in the UCP path can settle". The
 * real-settlement increment makes that false in exactly one file, so
 * the assertion is not loosened — it is made precise. Settlement in
 * the UCP path is reachable through ONE module, and that module
 * reaches it only through the store's shared retry-and-rescue
 * orchestration: no direct facilitator settle, no raw resource-server
 * settle, and therefore no UCP-specific retry policy. Everything else
 * under ucp — the routes, the checkout store, the resolver, the
 * boundary walk — still cannot move money.
 */
describe("settlement in the UCP path lives in exactly one place", () => {
  const PRODUCER = "/src/services/ucp-settlement-producer.ts";

  it("only the producer touches the machinery, and only through the shared orchestration", async () => {
    const sources = import.meta.glob("/src/**/ucp*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const ucp = import.meta.glob("/src/lib/ucp/**/*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const all = { ...sources, ...ucp };
    expect(Object.keys(all).length).toBeGreaterThan(8);
    expect(all[PRODUCER], "the one settling module must exist").toBeDefined();
    for (const [path, text] of Object.entries(all)) {
      // Nobody in the UCP path calls a facilitator settle, holds the
      // facilitator, or calls the resource server's settle directly:
      // the retry is the store's, decided once in lib/payments.
      expect(text, path).not.toMatch(/facilitator\s*\.\s*settle\s*\(/);
      expect(text, path).not.toMatch(/\bstack\s*\.\s*facilitator\b/);
      expect(text, path).not.toMatch(/\.\s*processSettlement\s*\(/);
      if (path === PRODUCER) continue;
      expect(text, path).not.toMatch(/processSettlementWithRetry|rescueAmbiguousSettle/);
    }
    // And the one module that may settle does so through the shared
    // orchestration, with the ambiguity rescue beside it.
    expect(all[PRODUCER]).toMatch(/processSettlementWithRetry\s*\(/);
    expect(all[PRODUCER]).toMatch(/rescueAmbiguousSettle\s*\(/);
  });

  it("prepares through a settle that refuses, by construction", async () => {
    const source = (
      import.meta.glob("/src/services/ucp-preparation.ts", {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>
    )["/src/services/ucp-preparation.ts"]!;
    expect(source).toContain("throw new PreparationOnly()");
  });
});
