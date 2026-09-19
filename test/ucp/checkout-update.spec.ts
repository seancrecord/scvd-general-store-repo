import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { variantGid } from "@/lib/ucp/ids";
import { ucpCheckoutStore } from "@/services/ucp-checkout-store";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * UPDATE CHECKOUT, THE OPERATION THIS STORE ADVERTISED AND DID NOT
 * SERVE (2026-09-19).
 *
 * The profile advertised `dev.ucp.shopping.checkout`; the pinned REST
 * contract defines four operations under it; this store served three.
 * test/ucp/transport-contract.spec.ts is the guard that would have
 * caught that and now does. This file is the behaviour: a full
 * replacement withdraws the quote it replaces, a replacement that
 * replaces nothing withdraws nothing, and a replacement never lands
 * on a checkout whose money is already moving.
 */

const send = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const AUDIT = {
  line_items: [{ item: { id: variantGid("service_audit") }, quantity: 1 }],
  "store.scvd": { inputs: { url: "https://example.test/pay" } },
};

async function open(body: unknown = AUDIT): Promise<Record<string, any>> {
  const res = await send("POST", "/ucp/v1/checkout-sessions", body);
  expect(res.status).toBe(201);
  return (await res.json()) as Record<string, any>;
}

async function update(id: string, body: unknown) {
  const res = await send("PUT", `/ucp/v1/checkout-sessions/${id}`, body);
  return { res, body: (await res.json()) as Record<string, any> };
}

const handlerOf = (checkout: Record<string, any>) =>
  checkout.ucp.payment_handlers["store.scvd.payment.usdc"]?.[0];

describe("Update Checkout is a full replacement", () => {
  it("replaces the line items, bumps the version and withdraws the quote it replaced", async () => {
    const created = await open();
    const before = handlerOf(created);
    expect(before.config.checkout_version).toBe(1);

    const { res, body } = await update(created.id, {
      line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }],
    });
    // The contract defines ONE response for this operation, whether
    // the update was applied or rejected.
    expect(res.status).toBe(200);
    expect(body.id).toBe(created.id);
    expect(body.line_items.length).toBe(1);
    expect(body.line_items[0].item.id).toBe(variantGid("hello"));

    const after = handlerOf(body);
    // A new version, a new digest, a new amount: the signature the
    // buyer may have made against the old terms is now refusable
    // rather than dangerous.
    expect(after.config.checkout_version).toBe(2);
    expect(after.config.amount_atomic).not.toBe(before.config.amount_atomic);
    expect(after.config.terms_digest).not.toBe(before.config.terms_digest);

    // And the replacement is what a later read returns.
    const read = (await (
      await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${created.id}`)
    ).json()) as Record<string, any>;
    expect(read.line_items[0].item.id).toBe(variantGid("hello"));
    expect(handlerOf(read).config.checkout_version).toBe(2);
  });

  it("changes nothing when the replacement is the checkout it already holds", async () => {
    const created = await open();
    const before = handlerOf(created);

    const { body } = await update(created.id, AUDIT);
    const after = handlerOf(body);
    // A retried Update must not withdraw the terms the buyer is
    // signing against merely because the first response was lost.
    expect(after.config.checkout_version).toBe(before.config.checkout_version);
    expect(after.config.terms_digest).toBe(before.config.terms_digest);
    expect(body.messages).toBeUndefined();
  });

  it("refuses a rail this store does not settle on, and keeps the one the checkout was quoted on when the replacement names none", async () => {
    const created = await open();
    const rail = handlerOf(created).config.network;

    const refused = await update(created.id, {
      ...AUDIT,
      "store.scvd": { ...AUDIT["store.scvd"], network: "eip155:1" },
    });
    expect(refused.res.status).toBe(200);
    expect(refused.body.messages[0].code).toBe("payment_failed");
    // Nothing changed: same rail, same version, same terms.
    expect(handlerOf(refused.body).config.network).toBe(rail);
    expect(handlerOf(refused.body).config.checkout_version).toBe(1);

    /**
     * A replacement that names no rail is not a replacement that
     * chooses one: the checkout keeps the rail it was quoted on, so a
     * buyer changing a line item does not silently move their payment
     * to whichever rail happens to be listed first.
     */
    const changed = await update(created.id, {
      line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }],
    });
    expect(handlerOf(changed.body).config.network).toBe(rail);
    expect(handlerOf(changed.body).config.checkout_version).toBe(2);
  });

  it("asks for a required input the replacement dropped, and stops being payable until it comes back", async () => {
    const created = await open();
    expect(created.status).toBe("ready_for_complete");

    const stripped = await update(created.id, {
      line_items: AUDIT.line_items,
    });
    expect(stripped.body.status).toBe("incomplete");
    expect(stripped.body.messages[0].severity).toBe("requires_buyer_input");
    expect(stripped.body.messages[0].content).toContain("url");
    expect(handlerOf(stripped.body)?.config?.amount_atomic).toBeUndefined();

    const restored = await update(created.id, AUDIT);
    expect(restored.body.status).toBe("ready_for_complete");
    expect(handlerOf(restored.body).config.amount_atomic).toBe("5000000");
  });

  it("refuses an item this deployment has not opened for UCP, without changing anything", async () => {
    const created = await open();
    const { body } = await update(created.id, {
      line_items: [{ item: { id: variantGid("spot_check") }, quantity: 1 }],
    });
    expect(body.messages[0].code).toBe("item_unavailable");
    expect(body.line_items[0].item.id).toBe(variantGid("service_audit"));
    expect(handlerOf(body).config.checkout_version).toBe(1);
  });

  it("answers 404 for an id that names no checkout, because there is no state to return", async () => {
    const { res, body } = await update("chk_nosuchcheckout", AUDIT);
    expect(res.status).toBe(404);
    expect(body.messages[0].code).toBe("not_found");
  });

  it("refuses to replace a checkout whose payment is already in flight", async () => {
    const created = await open();
    const store = ucpCheckoutStore(testEnv, created.id);
    const held = await store.readUcpCheckout();
    /**
     * THE STATE THE CONTRACT DOES NOT NAME AND THIS STORE HAS.
     * Between admission and the settlement boundary a checkout still
     * reads `ready_for_complete` while a payment it already owns is
     * on its way to the facilitator. The contract forbids an update
     * in `complete_in_progress`; this is the same fact one moment
     * earlier, and re-quoting here would withdraw the terms the money
     * is moving against.
     */
    const bound = await store.bindUcpCompletion({
      payment_identity: "a".repeat(64),
      request_digest: "b".repeat(64),
      terms_digest: held!.quote!.digest,
      checkout_version: held!.version,
      nowMs: Date.now(),
    });
    expect(bound.ok).toBe(true);
    expect((await store.readUcpCheckout())!.status).toBe("ready_for_complete");

    const { res, body } = await update(created.id, {
      line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }],
    });
    expect(res.status).toBe(200);
    expect(body.messages[0].severity).toBe("recoverable");
    expect(body.messages[0].content).toContain("money may already be moving");
    // Untouched: same line, same version, same terms the payment holds.
    expect(body.line_items[0].item.id).toBe(variantGid("service_audit"));
    expect(handlerOf(body).config.terms_digest).toBe(held!.quote!.digest);
    expect((await store.readUcpCheckout())!.version).toBe(held!.version);
  });

  it("refuses to replace a withdrawn checkout", async () => {
    const created = await open();
    await send("POST", `/ucp/v1/checkout-sessions/${created.id}/cancel`, {});
    const { res, body } = await update(created.id, AUDIT);
    expect(res.status).toBe(200);
    expect(body.status).toBe("canceled");
    expect(body.messages[0].severity).toBe("unrecoverable");
    expect(body.messages[0].content).toContain("withdrawn");
  });
});
