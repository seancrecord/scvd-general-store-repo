import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { houseReceivingAddresses, isHouseTraffic } from "@/lib/channel";
import { mismatchSignal } from "@/lib/metrics";
import { readDeclines } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

let seq = 0;
async function seedIndexRow(event: MetricEvent): Promise<void> {
  seq += 1;
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(14, "0");
  await testEnv.COUNTERS.put(
    `declevt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

function decline(partial: Partial<MetricEvent>): MetricEvent {
  return {
    kind: "decline",
    item: "hello",
    channel: "direct",
    house: false,
    at: new Date().toISOString(),
    ...partial,
  };
}

beforeEach(async () => {
  for (const prefix of ["declevt:", "evt:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
});

/**
 * PAYING OURSELVES IS NOT DEMAND (2026-09-16).
 *
 * The store's RECEIVING address is deliberately not in
 * house-wallets.json — that file registers wallets that SPEND here —
 * so a payment signed from the till's own address met both house
 * tests blind and booked as an outside decline. The facilitator
 * refusing it `self_send_not_allowed` was the only way the keeper
 * ever heard about it.
 */
describe("a payment signed from the address the store receives at", () => {
  const houseEnv = {
    PAY_TO_ADDRESS: "0xAAaAaAAaAAAaaaAAAaaaaaAaaAAaAAAaAAAaAAa1",
    SOLANA_PAY_TO: "So1anaPayToAddressForTheTillXXXXXXXXXXXXXXX",
  } as unknown as Env;

  it("reads as house, on every rail the store receives on", () => {
    for (const payer of [
      "0xAAaAaAAaAAAaaaAAAaaaaaAaaAAaAAAaAAAaAAa1",
      // Case is not identity for the analytics exclusion: a mixed-case
      // spelling of our own address is still our own address.
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1",
      "So1anaPayToAddressForTheTillXXXXXXXXXXXXXXX",
    ]) {
      expect(isHouseTraffic(houseEnv, { payer }), payer).toBe(true);
    }
  });

  it("leaves an ordinary buyer alone", () => {
    expect(
      isHouseTraffic(houseEnv, {
        payer: "0x1234567890123456789012345678901234567890",
      }),
    ).toBe(false);
  });

  /** An unset rail contributes no address, never an empty match. */
  it("never matches on a rail the store does not run", () => {
    const oneRail = { PAY_TO_ADDRESS: "0xabc" } as unknown as Env;
    expect(houseReceivingAddresses(oneRail)).toEqual(["0xabc"]);
    expect(isHouseTraffic(oneRail, { payer: "" })).toBe(false);
    expect(isHouseTraffic({} as unknown as Env, { payer: "0xabc" })).toBe(false);
  });
});

/**
 * THE 402 CARRIED IT AND THE BOOKS DID NOT. describeMismatch has
 * always held both objects; the reason code kept a field NAME and
 * nothing else, so fifteen requirement_mismatch:amount rows from one
 * client could not be told from a client one unit conversion away.
 */
describe("which field disagreed, and both values", () => {
  it("flattens the first disagreement to bounded strings", () => {
    const signal = mismatchSignal({
      mismatches: [
        { field: "amount", we_offered: "5000", you_sent: 5000 },
        { field: "network", we_offered: "a", you_sent: "b" },
      ],
    });
    expect(signal).toEqual({
      field: "amount",
      we_offered: "5000",
      // The classic: JSON.stringify of a number where the schema wants
      // the digits quoted. Now visible instead of inferred.
      you_sent: "5000",
    });
  });

  it("says nothing when there was no disagreement to report", () => {
    expect(mismatchSignal(undefined)).toBeUndefined();
    expect(mismatchSignal({ mismatches: [] })).toBeUndefined();
  });

  it("carries both onto the desk's rows, and leaves old rows honest", () => {
    // Seeded directly: a row booked before 2026-09-16 has neither.
    return (async () => {
      await seedIndexRow(
        decline({
          note: "local:requirement_mismatch:amount",
          user_agent: "node",
          payer: "0x1234567890123456789012345678901234567890",
          mismatch: { field: "amount", we_offered: "5000", you_sent: "5000000000" },
        }),
      );
      await seedIndexRow(decline({ note: "invalid_payload", user_agent: "node" }));

      const report = await readDeclines(testEnv);
      const withDetail = report.declines.find((row) => row.mismatch);
      expect(withDetail?.payer).toBe("0x1234567890123456789012345678901234567890");
      expect(withDetail?.mismatch?.you_sent).toBe("5000000000");
      // The older row carries neither, and the desk must not invent one.
      const without = report.declines.find((row) => row.reason === "invalid_payload");
      expect(without?.payer).toBeUndefined();
      expect(without?.mismatch).toBeUndefined();
    })();
  });
});
