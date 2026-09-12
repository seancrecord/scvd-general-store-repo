import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pendingPaymentStub } from "./helpers/payment";

const testEnv = env as never as import("@/types").Env;

/**
 * THE QUOTE AND THE STATE OF THE SALE (2026-09-12). Asked from
 * outside, by name, the week the hundredth settlement landed: a cash
 * register with logs exposes product id, agent id, quote, settlement
 * id, delivery hash, and failed retry state per call. Four of six
 * were already inside the signature. These pin the other two:
 *
 *   - `quote`, sha256 of the accepted x402 terms, SIGNED, set only by
 *     the door that verified them, and — per the cross_ref lesson —
 *     stapling one onto a signed certificate breaks the signature
 *     instead of downgrading to a clean legacy pass;
 *   - `settlement_state`, the per-receipt answer to "failed retry
 *     state", derived at read from the signed fields and the
 *     delivery-audit row, and honest that a failed attempt cannot
 *     appear on a receipt because nothing was receipted.
 */

const ITEM = {
  id: "hello",
  name: "A Signed Hello",
  price_usdc: 0.5,
  pricing: "fixed",
  fulfillment: "instant",
  description: "d",
  note_402: "n",
  listed_week: "2026-W30",
} as never;

afterEach(() => vi.unstubAllGlobals());

async function buyWith(overrides: { quote?: string; paidUsdc?: number } = {}) {
  const { fulfillPurchase } = await import("@/services/fulfillment");
  const payment = pendingPaymentStub({ paidUsdc: 0.5, ...overrides }) as unknown as Parameters<
    typeof fulfillPurchase
  >[2];
  return fulfillPurchase(testEnv, ITEM, payment, {});
}

describe("quotedTerms: the five terms an offer commits to, or nothing", () => {
  it("hashes exactly scheme, network, asset, payTo, amount in JCS order", async () => {
    const { quotedTerms, hashQuotedTerms } = await import("@/discovery/receipt-surface");
    const { sha256Hex } = await import("@/lib/idempotency");
    const terms = quotedTerms({
      scheme: "exact", network: "eip155:8453", asset: "0xusdc", payTo: "0xstore", amount: "500000",
      maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" },
    } as Record<string, unknown>);
    expect(terms).toEqual({ scheme: "exact", network: "eip155:8453", asset: "0xusdc", payTo: "0xstore", amount: "500000" });
    expect(await hashQuotedTerms(terms!)).toBe(
      await sha256Hex('{"amount":"500000","asset":"0xusdc","network":"eip155:8453","payTo":"0xstore","scheme":"exact"}'),
    );
  });

  it("refuses to quote with a hole in it", async () => {
    const { quotedTerms } = await import("@/discovery/receipt-surface");
    expect(quotedTerms({ scheme: "exact", network: "eip155:8453", asset: "0xusdc", payTo: "0xstore" })).toBeNull();
    expect(quotedTerms({ scheme: "exact", network: "eip155:8453", asset: "0xusdc", payTo: "0xstore", amount: 500000 })).toBeNull();
  });
});

describe("the accepted quote rides the certificate, signed", () => {
  const QUOTE = "a".repeat(64);

  it("binds the door's quote hash inside the signature", async () => {
    const { canonicalizeCertificate, CERT_FIELDS } = await import("@/lib/signing");
    const response = await buyWith({ quote: QUOTE });
    const cert = response["certificate"] as import("@/types").Certificate;
    expect(cert.quote).toBe(QUOTE);
    expect(canonicalizeCertificate(cert)).toContain(`"quote":"${QUOTE}"`);
    // Appended, never inserted: the first eight positions stay frozen.
    expect(CERT_FIELDS.indexOf("quote")).toBe(CERT_FIELDS.length - 1);
  });

  it("omits the key entirely when the door named no terms", async () => {
    const { canonicalizeCertificate } = await import("@/lib/signing");
    const response = await buyWith();
    const cert = response["certificate"] as import("@/types").Certificate;
    expect(cert.quote).toBeUndefined();
    expect(canonicalizeCertificate(cert)).not.toContain('"quote"');
  });

  it("breaks the signature when a quote is stapled on afterward, in BOTH forms", async () => {
    const { certificateSignatureForm } = await import("@/lib/signing");
    const response = await buyWith();
    const cert = response["certificate"] as import("@/types").Certificate;
    const tampered = { ...cert, quote: "b".repeat(64) };
    const form = await certificateSignatureForm(
      tampered,
      response["signature"] as string,
      response["public_key"] as string,
    );
    expect(form).toBe("invalid");
  });

  it("is named on /attestation as covered by the signature, derived not typed", async () => {
    const { ARTIFACT_CLASSES } = await import("@/store/attestation-spec");
    const certificate = ARTIFACT_CLASSES.find((entry) => entry.id === "certificate");
    expect(certificate?.signs).toContain("quote");
    expect(certificate?.signs).toContain("scheme, network, asset, payTo, amount");
  });
});

describe("through the real door: the quote is the terms the buyer signed", () => {
  it("HTTP: certificate.quote recomputes from the accepted offer, and verify explains it", async () => {
    const { installMultiPurchaseFacilitatorMock } = await import("./helpers/facilitator-mock");
    const { decodePaymentRequired, buildPaymentSignature } = await import("./helpers/payment");
    const { quotedTerms, hashQuotedTerms } = await import("@/discovery/receipt-surface");
    installMultiPurchaseFacilitatorMock();
    const url = "https://scvd.store/api/buy/hello";
    const quote = await SELF.fetch(url);
    expect(quote.status).toBe(402);
    const offer = decodePaymentRequired(quote).accepts[0]!;
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(offer) } });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as { certificate: import("@/types").Certificate; verify_url: string };
    const expected = await hashQuotedTerms(quotedTerms(offer)!);
    expect(body.certificate.quote).toBe(expected);

    const json = (await (await SELF.fetch(body.verify_url)).json()) as Record<string, unknown>;
    expect(json.valid).toBe(true);
    expect((json.certificate as { quote?: string }).quote).toBe(expected);
    expect(String(json.quote_covers)).toContain("scheme, network, asset, payTo, amount");
    expect(String(json.quote_covers)).toContain("offer-receipt");

    const html = await (await SELF.fetch(body.verify_url, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("Accepted quote");
    expect(html).toContain(expected);
  });

  it("MCP: the same hash from the same terms, through the other door", async () => {
    const { installMultiPurchaseFacilitatorMock } = await import("./helpers/facilitator-mock");
    const { buildPaymentSignature } = await import("./helpers/payment");
    const { quotedTerms, hashQuotedTerms } = await import("@/discovery/receipt-surface");
    installMultiPurchaseFacilitatorMock();
    const rpc = async (meta?: Record<string, unknown>) => {
      const response = await SELF.fetch("https://scvd.store/mcp?item_id=hello&payment=tool-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "buy_hello", arguments: {}, ...(meta ? { _meta: meta } : {}) },
        }),
      });
      const body = (await response.json()) as {
        error?: unknown;
        result: { isError?: boolean; structuredContent: { accepts?: Parameters<typeof buildPaymentSignature>[0][]; cert_id?: string } };
      };
      expect(body.error).toBeUndefined();
      return body.result;
    };
    const offer = (await rpc()).structuredContent.accepts![0]!;
    const paid = await rpc({
      "x402/payment": JSON.parse(atob(buildPaymentSignature(offer))),
      "x402/idempotency-key": `quote-test-${crypto.randomUUID()}`,
    });
    expect(paid.isError).not.toBe(true);
    expect(paid.structuredContent.cert_id).toBeTruthy();
    // The MCP result carries cert_id and verify_url, not the whole
    // certificate; the signed field is read back from the verify book.
    const json = (await (await SELF.fetch(`https://scvd.store/api/verify/${paid.structuredContent.cert_id}`)).json()) as {
      valid: boolean; certificate: { quote?: string };
    };
    expect(json.valid).toBe(true);
    expect(json.certificate.quote).toBe(await hashQuotedTerms(quotedTerms(offer)!));
  });
});

describe("where the sale stands: settlement_state on every certificate verify", () => {
  it("reports a settled, delivered, audit-closed sale after a real purchase", async () => {
    const { installMultiPurchaseFacilitatorMock } = await import("./helpers/facilitator-mock");
    const { decodePaymentRequired, buildPaymentSignature } = await import("./helpers/payment");
    installMultiPurchaseFacilitatorMock();
    const url = "https://scvd.store/api/buy/hello";
    const offer = decodePaymentRequired(await SELF.fetch(url)).accepts[0]!;
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(offer) } });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as { verify_url: string };
    const json = (await (await SELF.fetch(body.verify_url)).json()) as {
      settlement_state: import("@/services/settlement-state").SettlementState;
    };
    expect(json.settlement_state.payment_state).toBe("settled_on_chain");
    expect(json.settlement_state.delivery_state).toBe("delivered");
    expect(json.settlement_state.order_of_operations).toBe("delivered_then_settled");
    // The row the audit opened after settle was deleted when the goods went out.
    expect(json.settlement_state.delivery_audit.state).toBe("closed");
    expect(json.settlement_state.failed_attempts.on_this_receipt).toBe("none_possible");
    expect(json.settlement_state.failed_attempts.where).toContain("/api/purchase-status/");
    expect(json.settlement_state.failed_attempts.where).toContain("check_purchase");

    const html = await (await SELF.fetch(body.verify_url, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("Where this sale stands");
    expect(html).toContain("settled on chain");
    expect(html).toContain("Delivery audit — <strong>closed</strong>");
  });

  it("names an OPEN delivery-audit row rather than smoothing it over", async () => {
    const { settlementStateFor } = await import("@/services/settlement-state");
    const { openDeliveryIntent, closeDeliveryIntent } = await import("@/services/delivery-audit");
    const transaction = `0x${"ef".repeat(32)}`;
    const key = await openDeliveryIntent(testEnv, { path: "/api/buy/hello", transaction, paid_usdc: 0.5, settled_at: new Date().toISOString() });
    try {
      const state = await settlementStateFor(testEnv, {
        cert_id: "cert_test", item: "hello", patron_number: 1, date: "2026-09-12T00:00:00.000Z",
        paid_usdc: 0.5, asset: "USDC", network: "eip155:8453", settlement_tx: transaction,
      });
      expect(state.delivery_audit.state).toBe("open");
      expect(state.delivery_audit.means).toContain("STILL OPEN");
    } finally {
      await closeDeliveryIntent(testEnv, key);
    }
  });

  it("classifies the free shelf, a trade-account sale, and a pre-amendment mint honestly", async () => {
    const { settlementStateFor } = await import("@/services/settlement-state");
    const base = { cert_id: "cert_test", item: "hello", patron_number: 1 };
    const free = await settlementStateFor(testEnv, { ...base, date: "2026-09-12T00:00:00.000Z" });
    expect(free.payment_state).toBe("no_payment_recorded");
    expect(free.delivery_audit.state).toBe("not_applicable");
    const trade = await settlementStateFor(testEnv, {
      ...base, date: "2026-09-12T00:00:00.000Z", settled_via: "trade_account", trade_partner: "x", trade_price_usd: 1, trade_instruction: "d",
    });
    expect(trade.payment_state).toBe("settled_via_trade_account");
    const old = await settlementStateFor(testEnv, {
      ...base, date: "2026-07-28T00:00:00.000Z", paid_usdc: 0.5, settlement_tx: `0x${"01".repeat(32)}`,
    });
    expect(old.order_of_operations).toBe("settled_then_delivered");
    expect(old.delivery_audit.state).toBe("closed");
  });
});
