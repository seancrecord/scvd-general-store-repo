import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { variantGid } from "@/lib/ucp/ids";
import { IDEMPOTENCY_KEY_MIN_LENGTH } from "@/lib/idempotency";

const BASE = "https://scvd.store";

/**
 * THE RETRY THAT USED TO BUY A SECOND CHECKOUT (2026-09-19).
 *
 * The pinned transport contract marks `Idempotency-Key` REQUIRED on
 * every mutating checkout operation. Complete was already safe through
 * the admitted payment identity, Cancel through its own terminal
 * state, Update because an identical replacement changes nothing —
 * and Create minted a fresh id per call, so a lost response cost a
 * platform a second checkout with a second quote.
 *
 * The scope is (UCP-Agent, key), never the key alone: a key is unique
 * to the client that generated it, and a store that honoured it
 * storewide would hand one platform's line items and quote to whoever
 * else generated the same string. That is the assertion below with two
 * agents and one key, and it is the one worth breaking the build over.
 */

const AUDIT = {
  line_items: [{ item: { id: variantGid("service_audit") }, quantity: 1 }],
  "store.scvd": { inputs: { url: "https://example.test/pay" } },
};

const KEY = "idem-ucp-create-0000000001";
const AGENT = "platform-under-test/1.0";

async function create(
  body: unknown = AUDIT,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, any> }> {
  const res = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const keyed = (key: string, agent: string = AGENT) => ({
  "Idempotency-Key": key,
  "UCP-Agent": agent,
});

describe("Create honours the Idempotency-Key the contract requires", () => {
  it("returns the same checkout for a repeated key, rather than opening a second", async () => {
    const key = `${KEY}-same`;
    const first = await create(AUDIT, keyed(key));
    const second = await create(AUDIT, keyed(key));

    expect(first.status).toBe(201);
    // The same answer, at the same status: a retry must not be
    // distinguishable from the request it retries.
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.messages[0].code).toBe("idempotent_replay");

    // And it is the same checkout, not a copy: one version, one quote.
    const handler = (doc: Record<string, any>) =>
      doc.ucp.payment_handlers["store.scvd.payment.usdc"][0].config;
    expect(handler(second.body).checkout_version).toBe(handler(first.body).checkout_version);
    expect(handler(second.body).terms_digest).toBe(handler(first.body).terms_digest);
  });

  it("hands back the checkout as it STANDS, not as it was created", async () => {
    const key = `${KEY}-moved`;
    const first = await create(AUDIT, keyed(key));
    // Withdraw it, then retry the create: the honest answer is the
    // canceled checkout, because that is what this key opened.
    await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions/${first.body.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const retry = await create(AUDIT, keyed(key));
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.status).toBe("canceled");
  });

  it("scopes the key to the agent, so one platform's key cannot reach another's checkout", async () => {
    const key = `${KEY}-scoped`;
    const mine = await create(AUDIT, keyed(key, "platform-a/1.0"));
    const theirs = await create(AUDIT, keyed(key, "platform-b/1.0"));
    expect(theirs.body.id).not.toBe(mine.body.id);
    expect(theirs.body.messages).toBeUndefined();
  });

  it("opens a second checkout for a different key, which is what a different key means", async () => {
    const first = await create(AUDIT, keyed(`${KEY}-one`));
    const second = await create(AUDIT, keyed(`${KEY}-two`));
    expect(second.body.id).not.toBe(first.body.id);
  });

  it("says so when a key was sent that it cannot honour, rather than discarding it in silence", async () => {
    // A key with no agent: the scope is missing, so the key cannot apply.
    const unscoped = await create(AUDIT, { "Idempotency-Key": `${KEY}-unscoped` });
    expect(unscoped.status).toBe(201);
    expect(unscoped.body.messages[0].code).toBe("idempotency_key_ignored");
    expect(unscoped.body.messages[0].content).toContain("UCP-Agent");

    // A key below the honoured length: same class of answer, and it
    // names the bound rather than leaving the caller to guess.
    const short = await create(AUDIT, keyed("tooshort"));
    expect(short.body.messages[0].code).toBe("idempotency_key_ignored");
    expect(short.body.messages[0].content).toContain(String(IDEMPOTENCY_KEY_MIN_LENGTH));

    // Both were still created — a key this store cannot honour is not
    // a reason to refuse the checkout.
    expect(short.body.id).not.toBe(unscoped.body.id);
  });

  it("stays quiet when no key was sent at all, because nothing was asked for", async () => {
    const plain = await create(AUDIT);
    expect(plain.status).toBe(201);
    expect(plain.body.messages).toBeUndefined();
  });
});
