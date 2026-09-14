import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { solFacts, evmBuyer, solBuyer } from "./helpers/buyer-signed-payments";
import { purchaseIdentity, purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { idempotencyScope, idempotencySlotName, idempotentPurchaseSlot, jsonBodyDigest } from "@/lib/idempotency";
import { nonceTtlSeconds, authorizationValidBefore } from "@/lib/replay-guard";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { LaborCapacityStore, laborCapacity, type LaborReservation } from "@/services/labor-reservations";
import { baseline, call, items, shelves, object, testEnv, sourceEnv, facilitator, NOW } from "./helpers/buyer-harness";

/** The bench, so a freed key can be seen not to have cost the labour hold. */
async function held(): Promise<LaborReservation[]> {
  return runInDurableObject(laborCapacity(testEnv), async (_instance, state) =>
    [...(await state.storage.list<LaborReservation>({ prefix: "capacity:open:" })).values()]);
}

/**
 * IN FLIGHT IS NOT USED.
 *
 * The durable claim (BUY-016) binds one idempotency key to one payment
 * identity so a looping agent cannot settle twice. It was permanent — and
 * a CONFIRMED non-payment left the key bound to a dead purchase forever,
 * so a buyer retrying that key correctly was refused `purchase_not_settled`
 * and could never clear it. The store's own copy had to tell them to
 * rotate the key, which is not the Idempotency-Key semantic anyone else
 * implements and not a promise a store should need to make about money
 * that never moved.
 *
 * These tests pin BOTH directions, because only one of them is safe to
 * get wrong: a confirmed non-payment MUST hand the key back, and an
 * UNRESOLVED outcome MUST NOT — that second case is the whole reason the
 * claim is durable, and releasing it would open the double settlement the
 * claim exists to stop.
 */

installLaborAdmissionHarness();
let settlementFixture: "none" | "declined" | "uncertain" = "none";
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/settle") && settlementFixture !== "none") {
      facilitator.settleCalls++;
      // The real transport shape, outside the harness's JSON rewriting. A
      // definitive refusal names no landed transaction; a 502 is transient
      // and must resolve as unknown rather than as confirmed non-payment.
      if (settlementFixture === "uncertain") return new Response("upstream unavailable", { status: 502 });
      const body = object(JSON.parse(String(init?.body))), wire = object(body.paymentPayload);
      const network = String(object(body.paymentRequirements).network);
      const payer = network.startsWith("solana:") ? (await solFacts(wire)).payer : String(object(object(wire.payload).authorization).from);
      return Response.json({ success: false, errorReason: "insufficient_funds", transaction: "", network, payer });
    }
    return inner(input, init);
  });
});
afterEach(() => { settlementFixture = "none"; vi.restoreAllMocks(); vi.setSystemTime(NOW); });

async function setup(network: string, door: "http" | "mcp" | "mcp-standard", itemId = "context_anchor") {
  const item = items.find(row => row.id === itemId)!;
  const args = itemId === "context_anchor"
    ? { summary: `SCVD-E2E key-release ${crypto.randomUUID()}` }
    : { ...baseline(item), detail: `SCVD-E2E key-release ${crypto.randomUUID()}` } as Record<string, string>;
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(row => row.network === network)!;
  const first = await signLabor(offer), second = await signLabor(offer), key = crypto.randomUUID();
  const payer = network.startsWith("eip155:") ? evmBuyer.address : solBuyer;
  const { id } = await purchaseIdentity(network, payer, first);
  // The MCP door's arguments ARE its body: the surface carries their
  // canonical digest, not a query.
  const surface = door === "http"
    ? await idempotencyScope(new URL(item.buy_url, "https://scvd.store").pathname, new URLSearchParams(args))
    : await idempotencyScope(`mcp:buy_${item.id}`, new URLSearchParams(), await jsonBodyDigest({ item_id: item.id, ...args }));
  const slot = idempotentPurchaseSlot(sourceEnv, await idempotencySlotName(surface, payer, key));
  return { item, args, first, second, key, id, payer, slot };
}

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  for (const network of laborNetworks()) {
    it(`${door} ${network}: a declined settlement hands the key back`, async () => {
      const p = await setup(network, door);
      settlementFixture = "declined";
      const refused = await sendLabor(p.item.id, door, p.args, p.first, p.key);
      expect(refused.refused).toBe(true);
      expect(transfers).toBe(0);
      // Confirmed non-payment, durably recorded, and the claim let go of it.
      const record = JSON.parse((await purchaseIntentStore(sourceEnv, p.id).existingPurchase())!) as PurchaseIntent;
      expect(record.state).toBe("not_settled");
      expect(record.idempotency_slot).toBeTruthy();
      expect(await p.slot.readIdempotentPurchase()).toBeNull();

      // The whole point: the SAME key, a fresh payment, and it goes through.
      settlementFixture = "none";
      const retry = await sendLabor(p.item.id, door, p.args, p.second, p.key);
      expect(retry.refused, String(retry.body.code)).toBe(false);
      expect(transfers).toBe(1);
    });

    it(`${door} ${network}: an unresolved settlement keeps the key claimed`, async () => {
      const p = await setup(network, door);
      settlementFixture = "uncertain";
      const first = await sendLabor(p.item.id, door, p.args, p.first, p.key);
      expect(first.body).toMatchObject({ charged: null, code: "settlement_unknown" });
      // Money may have moved. The claim is exactly what stops a retry here.
      const record = JSON.parse((await purchaseIntentStore(sourceEnv, p.id).existingPurchase())!) as PurchaseIntent;
      expect(record.state).toBe("unknown");
      expect(await p.slot.readIdempotentPurchase()).toBe(p.id);

      settlementFixture = "none";
      const retry = await sendLabor(p.item.id, door, p.args, p.second, p.key);
      expect(retry.refused).toBe(true);
      expect(retry.quote).toBe(false);
      expect(retry.body).toMatchObject({ charged: null, charged_again: false, settlement_attempted: false });
      expect(object(retry.body.recovery).purchase_id).toBe(p.id);
      expect(transfers).toBe(0);
    });
  }
}

it("a settled purchase never releases its key, even on a late not_settled writer", async () => {
  const network = laborNetworks()[0]!;
  const p = await setup(network, "mcp");
  const sold = await sendLabor(p.item.id, "mcp", p.args, p.first, p.key);
  expect(sold.refused, String(sold.body.code)).toBe(false);
  expect(await p.slot.readIdempotentPurchase()).toBe(p.id);
  // A delayed writer cannot regress a confirmed sale to non-payment, and so
  // cannot free the key that guards it. updatePurchase returns the settled
  // prior; the release is keyed on that resulting state, not on the update.
  await purchaseIntentStore(sourceEnv, p.id).updatePurchase({ state: "not_settled" });
  const record = JSON.parse((await purchaseIntentStore(sourceEnv, p.id).existingPurchase())!) as PurchaseIntent;
  expect(record.state).toBe("settled");
  expect(await p.slot.readIdempotentPurchase()).toBe(p.id);
});

it("releasing compares before it deletes: a foreign id never frees another purchase's claim", async () => {
  const slot = idempotentPurchaseSlot(sourceEnv, `idempotency:${"ab".repeat(32)}`);
  expect(await slot.claimIdempotentPurchase("purchase-one")).toBe("purchase-one");
  // A late or repeated release arriving after the buyer's next attempt has
  // re-claimed the slot must not drop THAT claim — dropping a live claim is
  // the second settlement this whole mechanism exists to prevent.
  await slot.releaseIdempotentPurchase("purchase-two");
  expect(await slot.readIdempotentPurchase()).toBe("purchase-one");
  await slot.releaseIdempotentPurchase("purchase-one");
  expect(await slot.readIdempotentPurchase()).toBeNull();
  // Safe to call more than once, so a lost release is retried by the next
  // update rather than stranding the key.
  await slot.releaseIdempotentPurchase("purchase-one");
  expect(await slot.readIdempotentPurchase()).toBeNull();
  // And the freed slot is claimable again, by whoever comes next.
  expect(await slot.claimIdempotentPurchase("purchase-three")).toBe("purchase-three");
  await runInDurableObject(slot, (_instance, state) => state.storage.deleteAll());
});

/**
 * THE SPENT-NONCE ROW MUST OUTLIVE THE AUTHORIZATION IT GUARDS.
 *
 * `validBefore` is chosen by the buyer and nothing in this stack caps it,
 * so the old fixed day was not the "comfortably outlives" it claimed to be.
 * The chain still refuses the double-settle either way; what an expired row
 * actually costs is the paid-retry link (nonce -> settle -> delivery
 * intent), silently, while the authorization is still live.
 */
it("nonce retention is pinned to the buyer's own expiry, never below the floor", () => {
  const DAY = 24 * 60 * 60, now = Date.parse("2026-09-05T12:00:00Z"), seconds = Math.floor(now / 1000);
  // A short authorization keeps today's floor rather than shrinking to it.
  expect(nonceTtlSeconds(seconds + 300, now)).toBe(DAY);
  expect(nonceTtlSeconds(null, now)).toBe(DAY);
  // A week-long one used to outlive its row by six days. Now the row wins,
  // with an hour of skew and settlement slack past the expiry.
  expect(nonceTtlSeconds(seconds + 7 * DAY, now)).toBe(7 * DAY + 3600);
  // Already expired, and a nonsense expiry, both fall back to the floor.
  expect(nonceTtlSeconds(seconds - 7 * DAY, now)).toBe(DAY);
  expect(nonceTtlSeconds(0, now)).toBe(DAY);
  // validBefore is BUYER-CONTROLLED and the retention derived from it is our
  // storage, so it is capped: no stranger picks how long we keep a row. The
  // chain consumes the nonce regardless, which is what makes a cap safe.
  expect(nonceTtlSeconds(seconds + 365 * DAY, now)).toBe(30 * DAY);
  expect(nonceTtlSeconds(Number.MAX_SAFE_INTEGER, now)).toBe(30 * DAY);
  // Past what a Number can hold exactly, it is not an expiry we will read.
  expect(nonceTtlSeconds(authorizationValidBefore({ payload: { authorization: { validBefore: "1".repeat(78) } } }), now)).toBe(DAY);
});

it("the expiry is read only from a verified exact-EVM envelope", async () => {
  const network = laborNetworks().find(row => row.startsWith("eip155:"))!;
  const item = items.find(row => row.id === "context_anchor")!;
  const args = { summary: `SCVD-E2E validBefore ${crypto.randomUUID()}` };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(row => row.network === network)!;
  const payment = await signLabor(offer);
  const validBefore = authorizationValidBefore(payment);
  expect(validBefore).toBeGreaterThan(Math.floor(NOW.getTime() / 1000));
  expect(validBefore).toBe(Number(object(object(object(payment).payload).authorization).validBefore));
  // A bare authorization fragment is buyer-supplied evidence, not our
  // retention policy — the same gate extractPaymentNonce reads through.
  expect(authorizationValidBefore({ x402Version: 2, accepted: { scheme: "exact", network: "not-a-chain" }, payload: object(object(payment).payload) })).toBeNull();
  expect(authorizationValidBefore({ payload: { authorization: {} } })).toBeNull();
  expect(authorizationValidBefore(null)).toBeNull();
});

/**
 * THE CAPACITY REFUSALS, end to end.
 *
 * These share the updatePurchase chokepoint with the declined settlement
 * above, but they are the refusals whose BUYER-FACING COPY changed, and the
 * copy is a promise about somebody's money. They are also the only paths
 * that reach the release with a labour hold outstanding, which is the case
 * the release ordering exists for. Worth their own cases rather than an
 * argument that the chokepoint covers them.
 */
for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: a lost reservation acknowledgement frees the key and the bench`, async () => {
    const p = await setup(laborNetworks()[0]!, door, "the_collab");
    const reserve = LaborCapacityStore.prototype.reserve;
    vi.spyOn(LaborCapacityStore.prototype, "reserve").mockImplementationOnce(async function (this: LaborCapacityStore, ...args) {
      await reserve.apply(this, args);
      throw new Error("fixture drops reserved acknowledgement");
    });
    const refused = await sendLabor(p.item.id, door, p.args, p.first, p.key);
    expect(refused.body).toMatchObject({ code: "capacity_unavailable", charged: false, settlement_attempted: false });
    expect(transfers).toBe(0);
    expect(await held()).toHaveLength(0);
    expect(await p.slot.readIdempotentPurchase()).toBeNull();
    // No money moved, so the key is the buyer's again: same key, fresh payment.
    const retry = await sendLabor(p.item.id, door, p.args, p.second, p.key);
    expect(retry.refused, String(retry.body.code)).toBe(false);
    expect(transfers).toBe(1);
  });

  it(`${door}: capacity taken before payment frees the key and the bench`, async () => {
    const p = await setup(laborNetworks()[0]!, door, "the_collab");
    vi.spyOn(LaborCapacityStore.prototype, "reserve")
      .mockResolvedValueOnce({ ok: false, open: 1, cap: 1, scope: "item" });
    const refused = await sendLabor(p.item.id, door, p.args, p.first, p.key);
    expect(refused.body).toMatchObject({ code: "capacity_unavailable", charged: false, settlement_attempted: false, capacity_scope: "item" });
    expect(transfers).toBe(0);
    expect(await held()).toHaveLength(0);
    expect(await p.slot.readIdempotentPurchase()).toBeNull();
    const retry = await sendLabor(p.item.id, door, p.args, p.second, p.key);
    expect(retry.refused, String(retry.body.code)).toBe(false);
    expect(transfers).toBe(1);
  });
}

/**
 * The release runs AHEAD of the bench and swallows its own failure, so these
 * two independent resources cannot strand each other. Pinned here because it
 * is an ordering choice inside one function, invisible to every other test:
 * put the bench first and an unreleasable hold silently costs the buyer a key
 * they are owed.
 */
it("an unreleasable labour hold does not also cost the buyer their key", async () => {
  const p = await setup(laborNetworks()[0]!, "http", "the_collab");
  vi.spyOn(LaborCapacityStore.prototype, "notSettled").mockRejectedValueOnce(new Error("fixture release unavailable"));
  settlementFixture = "declined";
  const refused = await sendLabor(p.item.id, "http", p.args, p.first, p.key);
  expect(refused.refused).toBe(true);
  expect(transfers).toBe(0);
  // The bench keeps the hold until a later reservation reconciles it — and
  // the key is free regardless, because it was handed back first.
  expect(await held()).toHaveLength(1);
  expect(await p.slot.readIdempotentPurchase()).toBeNull();
  settlementFixture = "none";
  const retry = await sendLabor(p.item.id, "http", p.args, p.second, p.key);
  expect(retry.refused, String(retry.body.code)).toBe(false);
  expect(transfers).toBe(1);
});

/**
 * The copy is the other half of the fix: the old text told buyers to rotate
 * the key, which was true only because the claim was stranded. A sentence
 * that survives the mechanism it described is how a store ends up lying to
 * somebody about their own wallet.
 */
it("no refusal still tells a buyer to rotate a key the store has handed back", async () => {
  const p = await setup(laborNetworks()[0]!, "http", "the_collab");
  vi.spyOn(LaborCapacityStore.prototype, "reserve")
    .mockResolvedValueOnce({ ok: false, open: 1, cap: 1, scope: "item" });
  const refused = await sendLabor(p.item.id, "http", p.args, p.first, p.key);
  const error = String(refused.body.error);
  expect(error).not.toMatch(/new idempotency key/i);
  expect(error).toMatch(/SAME key/);
});
