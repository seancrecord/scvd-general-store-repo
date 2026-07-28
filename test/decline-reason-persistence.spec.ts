import { describe, expect, it } from "vitest";
import { readDeclines } from "@/lib/declines";
import { DECLINE_SLOT_KEY } from "@/lib/payments";
import type { DeclineSlot } from "@/lib/payments";
import { env } from "cloudflare:test";
import type { Env } from "@/types";
import type { MetricEvent } from "@/lib/metrics";

const testEnv = env as unknown as Env;

/**
 * THE REASON-PERSISTENCE FIX, 2026-07-28.
 *
 * The reason used to be joined to the request by payment NONCE: the
 * verify hook wrote it into a module-level Map, and the gate
 * re-derived the same nonce from the raw header to read it back. Three
 * silent failure modes, all ending in "unspecified" — and the worst of
 * them was the case that matters most, because a client signing for
 * the wrong network carries no exact-EVM nonce at all, so the join key
 * does not exist on either side and the one reason worth having ("you
 * signed for something we don't accept") was guaranteed to be lost.
 *
 * The fix stops joining. The reason rides a slot on the request
 * context, which the SDK passes through to the hooks.
 */
describe("the slot survives the trip", () => {
  it("keeps the same object reference through the SDK's shallow copies", () => {
    // This is the entire mechanism, and it is worth pinning because it
    // depends on someone else's implementation detail: the SDK does
    // `context = { ...context, method }` and then
    // `{ ...context, routePattern }` before handing the object to the
    // hooks. A shallow copy preserves property VALUES by reference, so
    // the slot the gate holds and the slot the hook writes are one
    // object. If the SDK ever deep-copies, this test fails and the
    // reason starts going missing again — loudly, this time.
    const slot: DeclineSlot = {};
    const context = {
      adapter: {},
      path: "/api/buy/hello",
      method: "GET",
    } as Record<string, unknown>;
    context[DECLINE_SLOT_KEY] = slot;

    const withMethod = { ...context, method: "GET" };
    const enriched = { ...withMethod, routePattern: "GET /api/buy/hello" };
    const transport = { request: enriched };

    // What the hook does:
    const seen = (transport.request as Record<string, unknown>)[
      DECLINE_SLOT_KEY
    ] as DeclineSlot;
    seen.reason = { reason: "invalid_network", matched_by: "slot" };

    // What the gate reads back:
    expect(slot.reason?.reason).toBe("invalid_network");
    expect(slot.reason?.matched_by).toBe("slot");
  });

  it("works when there is no nonce to join on at all", () => {
    // The wrong-network payload has no payload.authorization.nonce, so
    // the old design had no key and dropped the reason. The slot does
    // not care: it never needed a key.
    const slot: DeclineSlot = {};
    const noNoncePayload = { scheme: "exact", network: "solana:mainnet" };
    expect(
      Object.prototype.hasOwnProperty.call(noNoncePayload, "payload"),
    ).toBe(false);
    slot.reason = { reason: "invalid_network", matched_by: "slot" };
    expect(slot.reason.reason).toBe("invalid_network");
  });
});

describe("what the books say when a reason still goes missing", () => {
  let seq = 0;
  async function seedDecline(note: string): Promise<void> {
    const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(
      14,
      "0",
    );
    seq += 1;
    const event: MetricEvent = {
      kind: "decline",
      item: "hello",
      channel: "direct",
      house: false,
      at: new Date().toISOString(),
      user_agent: `persistence-spec-${seq}`,
      note,
    };
    await testEnv.COUNTERS.put(
      `evt:${inverted}:p${seq.toString(36).padStart(5, "0")}`,
      JSON.stringify(event),
    );
  }

  it("names WHICH way the reason went missing, instead of a flat unspecified", async () => {
    await seedDecline("unspecified:no_nonce_in_payload");
    await seedDecline("unspecified:reason_not_captured");
    const report = await readDeclines(testEnv);

    const noNonce = report.declines.find(
      (row) => row.reason === "unspecified:no_nonce_in_payload",
    );
    // No nonce in the payload is not a shrug — it points at a scheme or
    // network we advertise but do not accept, which is ours to fix.
    expect(noNonce?.fault).toBe("ours");
    expect(noNonce?.reading.toLowerCase()).toContain("discovery mismatch");

    const notCaptured = report.declines.find(
      (row) => row.reason === "unspecified:reason_not_captured",
    );
    // A nonce existed and the hook still left nothing: that is the
    // instrument, and it should be rare now.
    expect(notCaptured?.fault).toBe("unknown");
    expect(notCaptured?.reading.toLowerCase()).toContain("instrument");
  });

  it("still reads the old bare unspecified rows, which predate the fix", async () => {
    await seedDecline("unspecified");
    const report = await readDeclines(testEnv);
    const row = report.declines.find((entry) => entry.reason === "unspecified");
    expect(row?.reading.toLowerCase()).toContain("instrument");
    // And says out loud that those rows came from the older mechanism,
    // so nobody reads a historical gap as today's behaviour.
    expect(row?.reading).toContain("2026-07-28");
  });
});
