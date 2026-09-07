import { SELF, env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => {
  facilitator = installFacilitatorMock({ uniqueTransactions: true });
});

/**
 * THE PAID RETRY — class B of "paid and got nothing," closed the only
 * honest way. The delivery audit's own ruling stands (no cron can
 * re-run a handler whose inputs it never had) — but the buyer's retry
 * CARRIES the inputs, and 2026-08-07 proved buyers retry. A spent
 * nonce whose delivery intent is still open means money moved and
 * goods never left: the gate runs the handler on the retry's own
 * inputs, charges nothing, closes the intent. Checkpointed goods can
 * also be retrieved after delivery closed; legacy certificate-only
 * records still leave the obligation open.
 */

async function challengeAndSign(item: string): Promise<string> {
  const challenge = await SELF.fetch(`${BASE}/api/buy/${item}`);
  expect(challenge.status).toBe(402);
  const headerName = [...challenge.headers.keys()].find(
    (name) => name.toLowerCase() === "payment-required",
  )!;
  const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
    accepts: Array<Record<string, unknown>>;
  };
  return buildPaymentSignature(required.accepts[0] as never);
}

function nonceOf(header: string): string {
  const payload = JSON.parse(atob(header)) as {
    payload: { authorization: { nonce: string } };
  };
  return payload.payload.authorization.nonce;
}

describe("the paid retry", () => {
  it("delivers on retry when money moved and goods never left — no second charge", async () => {
    const header = await challengeAndSign("hello");
    // The crash, reconstructed as state: the settle happened (spent
    // nonce carries the tx) and the handler never finished (intent
    // open, no certificate names the tx).
    const tx = `0x${"5e".repeat(32)}`;
    await testEnv.COUNTERS.put(
      KV_KEYS.paymentNonce(nonceOf(header)),
      JSON.stringify({ path: "/api/buy/hello", transaction: tx }),
    );
    await testEnv.ORDERS.put(
      KV_KEYS.deliveryIntent(tx),
      JSON.stringify({
        path: "/api/buy/hello",
        transaction: tx,
        paid_usdc: 1,
        settled_at: new Date().toISOString(),
      }),
    );

    const settlesBefore = facilitator.settleCalls;
    const retry = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(retry.status).toBe(200);
    expect(retry.headers.get("Paid-Retry")).toBe("true");
    const body = (await retry.json()) as Record<string, any>;
    // Goods, minted against the ORIGINAL settle: the certificate
    // names the transaction the money actually moved in.
    expect(body.deliverable).toBeTruthy();
    expect(body.certificate.settlement_tx).toBe(tx);
    // Nothing settled again: the facilitator was never asked.
    expect(facilitator.settleCalls).toBe(settlesBefore);
    // The intent closed: the sale terminated in goods.
    expect(await testEnv.ORDERS.get(KV_KEYS.deliveryIntent(tx))).toBeNull();
  });

  it("keeps legacy delivery open when only the certificate can be recovered", async () => {
    // A real purchase start to finish: cert mints, intent closes.
    const header = await challengeAndSign("small_blessing");
    const paid = await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(paid.status).toBe(200);
    const firstBody = (await paid.json()) as Record<string, any>;

    // Model a pre-checkpoint purchase: only the certificate survived.
    // A modern purchase also retains the actual text and is recoverable.
    const transaction = firstBody.certificate.settlement_tx as string;
    const namespace = testEnv.PAID_RECOVERIES!;
    await runInDurableObject(namespace.get(namespace.idFromName(`${firstBody.certificate.network}:${transaction}`)),
      async (_instance, state) => state.storage.deleteAll());
    const settlesBefore = facilitator.settleCalls;
    // Reopen the delivery obligation as if the response died after minting.
    await testEnv.ORDERS.put(
      KV_KEYS.deliveryIntent(transaction),
      JSON.stringify({
        path: "/api/buy/small_blessing",
        transaction,
        paid_usdc: 1,
        settled_at: new Date().toISOString(),
      }),
    );
    const retry = await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(retry.status).toBe(500);
    expect(facilitator.settleCalls).toBe(settlesBefore);
    expect(retry.headers.get("Paid-Retry")).toBe("incomplete");
    const body = (await retry.json()) as Record<string, any>;
    // A blessing's purchased text is not recoverable from its certificate.
    // Preserve the obligation and the payment state instead of claiming delivery.
    expect(body).toMatchObject({ code: "delivery_failed", charged: true, charged_again: false });
    expect(body.already_delivered).not.toBe(true);
    expect(body.certificate_id).toBe(firstBody.certificate.cert_id);
    expect(body.verify_url).toContain(firstBody.certificate.cert_id);
    expect(
      await testEnv.ORDERS.get(KV_KEYS.deliveryIntent(transaction)),
    ).not.toBeNull();
  });

  it("retrieves the same good after delivery closed without another charge", async () => {
    const header = await challengeAndSign("hello");
    const paid = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(paid.status).toBe(200);
    const original = await paid.json();
    const settlesBefore = facilitator.settleCalls;
    // A lost response is recoverable even when delivery already closed.
    const replay = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Paid-Retry")).toBe("true");
    expect(await replay.json()).toEqual(original);
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });

  it("refuses a spent nonce aimed at a DIFFERENT item than the money bought", async () => {
    const header = await challengeAndSign("hello");
    const tx = `0x${"6f".repeat(32)}`;
    await testEnv.COUNTERS.put(
      KV_KEYS.paymentNonce(nonceOf(header)),
      JSON.stringify({ path: "/api/buy/hello", transaction: tx }),
    );
    await testEnv.ORDERS.put(
      KV_KEYS.deliveryIntent(tx),
      JSON.stringify({
        path: "/api/buy/hello",
        transaction: tx,
        paid_usdc: 1,
        settled_at: new Date().toISOString(),
      }),
    );
    // The money bought hello; the retry asks for dibs. Refused — a
    // paid retry re-delivers the sale that happened, never a swap.
    const swap = await SELF.fetch(`${BASE}/api/buy/small_blessing`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(swap.status).toBe(402);
  });

  it("gives pre-upgrade spent-nonce rows the refusal they always got", async () => {
    const header = await challengeAndSign("hello");
    // An old row: the bare path string, no transaction link.
    await testEnv.COUNTERS.put(KV_KEYS.paymentNonce(nonceOf(header)), "/api/buy/hello");
    const retry = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(retry.status).toBe(402);
    const body = (await retry.json()) as Record<string, any>;
    expect(body.error).toContain("through this till once already");
  });
});
