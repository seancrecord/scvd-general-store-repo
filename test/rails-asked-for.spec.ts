import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { railAskedFor, readDeclines, readReason } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import {
  describeMismatch,
  mismatchReasonCode,
  wantedNetwork,
} from "@/lib/requirement-match";
import type { Env } from "@/types";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE RAIL THE BUYER WANTED, 2026-09-11.
 *
 * PAYMENT_RAILS.md grows an accepted scheme only for a named
 * counterparty an existing rail does not serve. A buyer who signs for
 * a chain the challenge does not offer IS that counterparty, and until
 * today the books could not see them: the match failed on `asset`,
 * `network` and `payTo` together, the code carried the first field
 * alphabetically, and `requirement_mismatch:asset` said nothing about
 * which chain. The 402 body knew; the desk did not.
 */
describe("a payment signed for a rail the challenge did not offer", () => {
  const offered = {
    scheme: "exact",
    network: "eip155:8453",
    amount: "500000",
    asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    payTo: "0x1111111111111111111111111111111111111111",
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" },
  };

  it("books the network first, with the chain it named, not the alphabetical field", () => {
    const optimism = {
      ...offered,
      network: "eip155:10",
      asset: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
      payTo: "0x2222222222222222222222222222222222222222",
    };
    const report = describeMismatch([offered], optimism);
    expect(report).toBeDefined();
    // Three fields disagree, and `asset` sorts first.
    expect(report!.mismatches.map((entry) => entry.field)).toEqual([
      "asset",
      "network",
      "payTo",
    ]);
    // The network wins the code, and carries the chain.
    expect(wantedNetwork(report!)).toBe("eip155:10");
    expect(mismatchReasonCode(report!)).toBe(
      "local:requirement_mismatch:network:eip155:10",
    );
  });

  it("keeps the code bounded: a network that is not CAIP-2 shaped books as other", () => {
    const strange = { ...offered, network: "base mainnet (please)" };
    const report = describeMismatch([offered], strange);
    expect(mismatchReasonCode(report!)).toBe(
      "local:requirement_mismatch:network:other",
    );
    // And a payload whose network is not a string at all.
    const typed = { ...offered, network: 8453 };
    expect(mismatchReasonCode(describeMismatch([offered], typed)!)).toBe(
      "local:requirement_mismatch:network:other",
    );
  });

  it("leaves every other mismatch exactly as it was", () => {
    const rebuilt = { ...offered, amount: 500000 };
    expect(mismatchReasonCode(describeMismatch([offered], rebuilt)!)).toBe(
      "local:requirement_mismatch:amount",
    );
  });

  it("reads back from the code, settle prefix or not", () => {
    expect(railAskedFor("local:requirement_mismatch:network:eip155:10")).toBe(
      "eip155:10",
    );
    expect(
      railAskedFor("settle:local:requirement_mismatch:network:eip155:10"),
    ).toBe("eip155:10");
    expect(railAskedFor("local:requirement_mismatch:asset")).toBeUndefined();
    expect(railAskedFor("local:requirement_mismatch:network:")).toBeUndefined();
  });

  it("is read on the desk as demand for a rail, the buyer's side, nothing of ours to fix", () => {
    const read = readReason("local:requirement_mismatch:network:eip155:10");
    expect(read.fault).toBe("buyer");
    expect(read.reading).toContain("eip155:10");
    expect(read.reading).toContain("did not offer");
    expect(read.reading).toContain("intake rule");
  });

  it("through the HTTP door: the 402 and the books both name the chain", async () => {
    const first = await SELF.fetch("https://scvd.store/api/buy/hello");
    const accepted = decodePaymentRequired(first).accepts[0] as unknown as Record<
      string,
      unknown
    >;
    // The offered entry, echoed verbatim except for the chain: what a
    // correct client with an Optimism wallet and no Base wallet sends.
    const signature = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: { ...accepted, network: "eip155:10" },
        payload: {
          signature: `0x${"cd".repeat(65)}`,
          authorization: {
            from: TEST_PAYER,
            to: accepted.payTo,
            value: accepted.amount,
            validAfter: "0",
            validBefore: "99999999999",
            nonce: `0x${"33".repeat(32)}`,
          },
        },
      }),
    );
    const declined = await SELF.fetch("https://scvd.store/api/buy/hello", {
      headers: {
        "PAYMENT-SIGNATURE": signature,
        "User-Agent": "rails-asked-for-spec/1.0",
      },
    });
    expect(declined.status).toBe(402);
    const body = (await declined.json()) as Record<string, unknown>;
    const stated = body.payment_declined as Record<string, unknown>;
    expect(stated.reason).toBe("local:requirement_mismatch:network:eip155:10");
    // The SDK's own words still ride beside ours.
    expect(String(stated.message)).toContain("No matching payment requirements");
  });

  it("is tallied by chain on the desk, intent-bearing rows only", async () => {
    let seq = 0;
    async function seedDecline(
      note: string,
      user_agent: string,
      house = false,
    ): Promise<void> {
      const inverted = String(
        10_000_000_000_000 - (Date.now() + seq),
      ).padStart(14, "0");
      seq += 1;
      const event: MetricEvent = {
        kind: "decline",
        item: "hello",
        channel: "direct",
        house,
        at: new Date(Date.now() + seq).toISOString(),
        user_agent,
        note,
      };
      await testEnv.COUNTERS.put(
        `evt:${inverted}:r${seq.toString(36).padStart(5, "0")}`,
        JSON.stringify(event),
      );
    }
    // Chains the door test above did not use, so the counts are these rows' own.
    await seedDecline("local:requirement_mismatch:network:eip155:42220", "rails-spec-a/1.0");
    await seedDecline("local:requirement_mismatch:network:eip155:42220", "rails-spec-b/1.0");
    await seedDecline("local:requirement_mismatch:network:eip155:43114", "rails-spec-c/1.0");
    // The house's own wrong-network probe is not demand.
    await seedDecline("local:requirement_mismatch:network:eip155:1", "rails-spec-house/1.0", true);
    // And an ordinary mismatch is not a rail.
    await seedDecline("local:requirement_mismatch:amount", "rails-spec-d/1.0");

    const report = await readDeclines(testEnv);
    expect(report.rails_asked_for["eip155:42220"]).toBe(2);
    expect(report.rails_asked_for["eip155:43114"]).toBe(1);
    expect(report.rails_asked_for["eip155:1"]).toBeUndefined();
    // The live wrong-network payment from the door test above landed here too.
    expect(report.rails_asked_for["eip155:10"]).toBeGreaterThanOrEqual(1);
    expect(report.by_reason["local:requirement_mismatch:amount"]).toBeGreaterThanOrEqual(1);
  });
});
