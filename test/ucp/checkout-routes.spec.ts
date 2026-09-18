import { SELF, createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { app } from "@/index";
import type { Env } from "@/types";
import { describe, expect, it } from "vitest";
import { variantGid } from "@/lib/ucp/ids";

const BASE = "https://scvd.store";

const post = (path: string, body?: unknown) =>
  SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function createCheckout(body: unknown) {
  const res = await post("/ucp/v1/checkout-sessions", body);
  return { res, body: (await res.json()) as Record<string, any> };
}

const ONE_AUDIT = {
  line_items: [{ item: { id: variantGid("service_audit") }, quantity: 1 }],
  "store.scvd": { inputs: { url: "https://example.test/pay" } },
};

describe("creating a checkout", () => {
  it("freezes the variant and quotes an exact amount for it", async () => {
    const { res, body } = await createCheckout(ONE_AUDIT);
    expect(res.status).toBe(201);
    expect(body.id).toMatch(/^chk_[a-z0-9]+$/);
    expect(body.status).toBe("ready_for_complete");
    expect(body.currency).toBe("USD");
    expect(body.line_items[0].item.id).toBe(variantGid("service_audit"));
    expect(body.line_items[0].item.price).toBe(500);
    expect(body.totals.find((t: any) => t.type === "total").amount).toBe(500);

    // The exact transfer that settles THIS checkout, on the handler.
    const handler = body.ucp.payment_handlers["store.scvd.payment.usdc"][0];
    expect(handler.config.amount_atomic).toBe("5000000");
    expect(handler.config.checkout_id).toBe(body.id);
    expect(handler.config.checkout_version).toBe(1);
    expect(handler.config.terms_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(handler.config.decimals).toBe(6);
  });

  it("carries the links the schema calls mandatory", async () => {
    const { body } = await createCheckout(ONE_AUDIT);
    const types = body.links.map((link: any) => link.type);
    expect(types).toContain("terms_of_service");
    expect(types).toContain("privacy_policy");
    for (const link of body.links) {
      const page = await SELF.fetch(link.url);
      expect(page.status, link.url).toBe(200);
    }
  });

  it("charges each tier its own price and never infers one from the other", async () => {
    for (const [tier, cents, atomic] of [
      [0, 30_000, "300000000"],
      [1, 60_000, "600000000"],
      [2, 150_000, "1500000000"],
    ] as const) {
      const { body } = await createCheckout({
        line_items: [{ item: { id: variantGid("the_collab", tier) }, quantity: 1 }],
      });
      expect(body.line_items[0].item.price, `tier ${tier}`).toBe(cents);
      expect(
        body.ucp.payment_handlers["store.scvd.payment.usdc"][0].config.amount_atomic,
      ).toBe(atomic);
    }
  });

  it("asks for a required product input rather than quoting and then refusing the money", async () => {
    const { res, body } = await createCheckout({
      line_items: [{ item: { id: variantGid("service_audit") }, quantity: 1 }],
    });
    expect(res.status).toBe(200);
    expect(body.status).toBe("incomplete");
    const message = body.messages[0];
    expect(message.severity).toBe("requires_buyer_input");
    expect(message.content).toContain("url");
    // Nothing payable was issued.
    expect(
      body.ucp.payment_handlers["store.scvd.payment.usdc"]?.[0]?.config?.amount_atomic,
    ).toBeUndefined();
  });

  it("refuses a variant this catalog does not sell", async () => {
    for (const id of [
      variantGid("spot_check"),
      variantGid("the_collab"),
      "gid://evil.example/Variant/service_audit",
      "not-a-gid",
    ]) {
      const { res } = await createCheckout({
        line_items: [{ item: { id }, quantity: 1 }],
      });
      expect(res.status, id).toBe(400);
    }
  });

  it("refuses a cart, because this shelf has no cart", async () => {
    const { res, body } = await createCheckout({
      line_items: [
        { item: { id: variantGid("hello") }, quantity: 1 },
        { item: { id: variantGid("daily_fortune") }, quantity: 1 },
      ],
    });
    expect(res.status).toBe(400);
    expect(body.messages[0].content).toContain("no cart");
  });

  it("refuses a rail this store does not settle on", async () => {
    const { res, body } = await createCheckout({
      ...ONE_AUDIT,
      "store.scvd": { ...ONE_AUDIT["store.scvd"], network: "eip155:1" },
    });
    expect(res.status).toBe(400);
    expect(body.messages[0].code).toBe("payment_failed");
  });
});

/**
 * The snapshot is only a snapshot if Complete reads it back rather
 * than rebuilding it. This proves the checkout carries the exact x402
 * requirements a buyer will sign against, resolved at Create.
 */
describe("the checkout stores the requirements it will be paid against", () => {
  it("freezes the resolved x402 terms, not just the price", async () => {
    const { body: created } = await createCheckout(ONE_AUDIT);
    const read = (await (
      await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${created.id}`)
    ).json()) as Record<string, any>;
    const terms = read["store.scvd"].payment_terms;
    expect(terms.amount_atomic).toBe("5000000");
    expect(terms.checkout_id).toBe(created.id);
    expect(terms.checkout_version).toBe(1);
    expect(terms.terms_digest).toMatch(/^[0-9a-f]{64}$/);
    // And the handler quotes the same money, not a second opinion.
    expect(
      read.ucp.payment_handlers["store.scvd.payment.usdc"][0].config.amount_atomic,
    ).toBe(terms.amount_atomic);
  });
});

describe("capacity is read before a quote is issued", () => {
  it("quotes a keeper-time item while the bench has room", async () => {
    const { res, body } = await createCheckout({
      line_items: [{ item: { id: variantGid("aura_walk") }, quantity: 1 }],
      "store.scvd": { inputs: { url: "https://example.test/door" } },
    });
    expect(res.status).toBe(201);
    expect(body.status).toBe("ready_for_complete");
    expect(body.line_items[0].item.price).toBe(15_000);
  });

  it("carries the weekly ceiling into the checkout's own policies", async () => {
    const { body } = await createCheckout({
      line_items: [{ item: { id: variantGid("aura_walk") }, quantity: 1 }],
      "store.scvd": { inputs: { url: "https://example.test/door" } },
    });
    const fulfillment = body.policies.find(
      (policy: any) => policy.type === "store.scvd.policy.fulfillment",
    );
    expect(fulfillment.mode).toBe("human_queue");
    expect(fulfillment.sla_hours).toBe(168);
    // Every policy targets the line it is about.
    expect(fulfillment.applies_to).toEqual(["$.line_items[0]"]);
  });
});

describe("reading and cancelling a checkout", () => {
  it("reads back exactly what it issued", async () => {
    const { body: created } = await createCheckout(ONE_AUDIT);
    const read = (await (
      await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${created.id}`)
    ).json()) as Record<string, any>;
    expect(read.id).toBe(created.id);
    expect(read.status).toBe(created.status);
    expect(
      read.ucp.payment_handlers["store.scvd.payment.usdc"][0].config.terms_digest,
    ).toBe(created.ucp.payment_handlers["store.scvd.payment.usdc"][0].config.terms_digest);
  });

  it("404s a checkout nobody opened", async () => {
    const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/chk_nothing`);
    expect(res.status).toBe(404);
  });

  it("cancels an unpaid checkout, and cancelling twice is still cancelled", async () => {
    const { body: created } = await createCheckout(ONE_AUDIT);
    const first = (await (
      await post(`/ucp/v1/checkout-sessions/${created.id}/cancel`)
    ).json()) as Record<string, any>;
    expect(first.status).toBe("canceled");
    const again = await post(`/ucp/v1/checkout-sessions/${created.id}/cancel`);
    expect(again.status).toBe(200);
    expect(((await again.json()) as Record<string, any>).status).toBe("canceled");
  });

  it("will not quote a cancelled checkout back into life", async () => {
    const { body: created } = await createCheckout(ONE_AUDIT);
    await post(`/ucp/v1/checkout-sessions/${created.id}/cancel`);
    const read = (await (
      await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${created.id}`)
    ).json()) as Record<string, any>;
    expect(read.status).toBe("canceled");
  });
});

/**
 * THE CLOSED DOOR, which is what ships (wrangler.jsonc carries the
 * switch off). The suite runs open; these rows pass the closed
 * bindings through the Worker and hold that a closed Complete refuses
 * in writing, charges nothing, and is matched by a profile that
 * advertises no checkout. The open door is test/ucp/launch.spec.ts.
 */
describe("completing a checkout while the door is closed", () => {
  const closed = { ...(env as unknown as Env), UCP_CHECKOUT_ENABLED: "false" } as Env;
  async function through(path: string, init?: RequestInit) {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`${BASE}${path}`, init), closed, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  it("refuses in writing, and names the door that does take the money", async () => {
    const { body: created } = await createCheckout(ONE_AUDIT);
    const res = await through(`/ucp/v1/checkout-sessions/${created.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment: { instruments: [] } }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, any>;
    expect(body.messages[0].content).toContain("switched off");
    expect(body.messages[0].content).toContain("will not settle");
    expect(body.messages[0].content).toContain("/api/buy/service_audit");
    // And the checkout is untouched: nothing was admitted.
    expect(body.status).toBe("ready_for_complete");
  });

  it("is matched by a profile that advertises no checkout capability", async () => {
    const profile = (await (await through("/.well-known/ucp")).json()) as Record<string, any>;
    expect(Object.keys(profile.ucp.capabilities)).not.toContain(
      "dev.ucp.shopping.checkout",
    );
    expect(profile["store.scvd"].status.checkout).toBe("not enabled");
  });
});
