import { describe, expect, it } from "vitest";
import {
  SETTLEMENT_OUTCOMES,
  SETTLEMENT_RESPONSE_BATTERY,
  SETTLEMENT_RESPONSE_CHECKS,
  decodeSettlementResponse,
  readSettlementResponse,
} from "../defects/settlement-response.js";

/**
 * THE SETTLEMENT-RESPONSE FIXTURES, REPLAYED OFFLINE (2026-09-12).
 *
 * The x402 spec thread (x402-foundation/x402#3325 and the receiver
 * obligation split out to #3437) converged on two properties a
 * conformance claim about settlement handling has to carry: count
 * settlements rather than responses, and ship a negative control —
 * "a battery that cannot fail cannot pass." This file is the second
 * property for READERS of a SettleResponse: every recorded shape
 * names the checks it fails and the outcome a reader must reach, and
 * a deliberately naive reader is shown failing the pending shapes.
 *
 * The acceptance criterion is check independence, as for the doors:
 * every fixture fails EXACTLY the checks it is bad in and no others.
 */

interface SettlementFixture {
  name: string;
  recorded: string;
  why: string;
  expect_failed: string[];
  expect_outcome: string;
  must_not_conclude: string[];
  payment_response: string;
  decoded: Record<string, unknown> | null;
}

const fixtures = Object.entries(
  import.meta.glob("./fixtures/settlement-responses/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
).map(([path, raw]) => ({ path, fixture: JSON.parse(raw) as SettlementFixture }));

describe("the settlement-response fixtures replay offline", () => {
  it("the corpus exists and every entry documents what it is", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    for (const { path, fixture } of fixtures) {
      expect(fixture.name, `${path} needs a name`).toBe(path.split("/").at(-1)!.replace(/\.json$/, ""));
      expect(fixture.recorded, `${path} must say where the bytes came from`).toBeTruthy();
      expect(fixture.why, `${path} must say what it demonstrates`).toBeTruthy();
      expect(SETTLEMENT_OUTCOMES as readonly string[]).toContain(fixture.expect_outcome);
      // A typo here would otherwise pass forever by expecting nothing.
      for (const name of fixture.expect_failed) {
        expect(SETTLEMENT_RESPONSE_CHECKS as readonly string[], `${path} expects unknown check ${name}`).toContain(name);
      }
      for (const outcome of fixture.must_not_conclude) {
        expect(SETTLEMENT_OUTCOMES as readonly string[], `${path} forbids unknown outcome ${outcome}`).toContain(outcome);
        expect(outcome, `${path} forbids the outcome it expects`).not.toBe(fixture.expect_outcome);
      }
      // No hostname and no live door: a fixture is a test corpus.
      expect(JSON.stringify(fixture)).not.toMatch(/https?:\/\//);
    }
  });

  it("the decoded object beside each fixture is the bytes, not a second copy that can drift", () => {
    for (const { path, fixture } of fixtures) {
      expect(decodeSettlementResponse(fixture.payment_response), path).toEqual(fixture.decoded);
    }
  });

  for (const { path, fixture } of fixtures) {
    it(`${fixture.name}: fails exactly ${fixture.expect_failed.length ? fixture.expect_failed.join(", ") : "nothing"} and reads ${fixture.expect_outcome}`, () => {
      const reading = readSettlementResponse(fixture.payment_response);
      expect(reading.battery).toBe(SETTLEMENT_RESPONSE_BATTERY);
      expect(reading.failed.sort(), path).toEqual([...fixture.expect_failed].sort());
      expect(reading.outcome, path).toBe(fixture.expect_outcome);
      expect(fixture.must_not_conclude, path).not.toContain(reading.outcome);
      // Every check is present, in battery order, and a check not
      // reached says so rather than passing by default.
      expect(reading.checks.map((entry) => entry.check)).toEqual([...SETTLEMENT_RESPONSE_CHECKS]);
      for (const entry of reading.checks) {
        expect([true, false, null], `${path} ${entry.check}`).toContain(entry.ok);
        expect(entry.detail).toBeTruthy();
      }
      expect(reading.reading).toBeTruthy();
    });
  }
});

describe("the negative control: a battery that cannot fail cannot pass", () => {
  /**
   * The reader most implementations ship: success is settled, anything
   * else is failed. It is exactly wrong on settlement_pending and on
   * shapes it cannot read, and the fixtures have to catch it or they
   * are decoration.
   */
  const naive = (raw: string): string => {
    const decoded = decodeSettlementResponse(raw);
    return decoded?.success === true ? "settled" : "failed";
  };

  it("the naive reader is wrong on exactly the unresolved fixtures, and nowhere else", () => {
    // Derived from the fixtures, not typed: the naive reader has no
    // third outcome, so every shape whose honest reading is
    // "unresolved" is one it gets wrong, and every settled or failed
    // shape is one it gets right. If a fixture ever breaks that
    // relationship, either the fixture or the reader has drifted.
    const caught = fixtures.filter(({ fixture }) => fixture.must_not_conclude.includes(naive(fixture.payment_response))).map(({ fixture }) => fixture.name).sort();
    const unresolved = fixtures.filter(({ fixture }) => fixture.expect_outcome === "unresolved").map(({ fixture }) => fixture.name).sort();
    expect(caught).toEqual(unresolved);
    expect(caught.length).toBeGreaterThanOrEqual(3);
    // And the pending shape, the one the spec thread measured, is
    // among them by name — the control this file exists for.
    expect(caught).toContain("pending-with-hash");
  });

  it("the reference reader reaches no forbidden outcome anywhere", () => {
    for (const { path, fixture } of fixtures) {
      expect(fixture.must_not_conclude, path).not.toContain(readSettlementResponse(fixture.payment_response).outcome);
    }
  });

  it("settlement_pending is never read as failed, with or without its hash", () => {
    for (const { fixture } of fixtures) {
      if (fixture.decoded?.errorReason === "settlement_pending") {
        expect(readSettlementResponse(fixture.payment_response).outcome).toBe("unresolved");
      }
    }
  });
});

describe("the reader on bytes no fixture carries", () => {
  it("reads a JSON body the same as the base64 header of it", () => {
    const body = JSON.stringify({ success: true, transaction: `0x${"1".repeat(64)}`, network: "eip155:8453" });
    expect(readSettlementResponse(body).outcome).toBe("settled");
    expect(readSettlementResponse(btoa(body)).outcome).toBe("settled");
    expect(readSettlementResponse(btoa(body)).failed).toEqual([]);
  });

  it("does not stop at a bare number when the base64 reading is the object", () => {
    // "MTIz" is base64 for "123"; a JSON.parse-first reader takes the
    // number and never sees the object the same bytes could be.
    expect(decodeSettlementResponse("123")).toBeNull();
    expect(decodeSettlementResponse(btoa("{\"success\":false}"))).toEqual({ success: false });
  });

  it("treats empty input as unreadable, not as a failed payment", () => {
    const reading = readSettlementResponse("");
    expect(reading.outcome).toBe("unresolved");
    expect(reading.failed).toEqual(["json"]);
    expect(reading.checks.filter((entry) => entry.ok === null)).toHaveLength(SETTLEMENT_RESPONSE_CHECKS.length - 1);
  });
});
