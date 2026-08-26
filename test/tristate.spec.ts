import { describe, expect, it } from "vitest";
import {
  BATTERY_CHECK_NAMES,
  runChecks,
  triStateVector,
} from "@/services/preflight";

/**
 * ROADMAP 2.1a — THE VECTOR STOPS OMITTING WHAT IT NEVER RAN.
 *
 * Ledger B1: the binary verdict welds distinct failures — and the
 * checks list has the same defect one layer down: runChecks
 * early-returns, so a door that answered 200 produces a vector with
 * ONE row in it, and every downstream check is silently absent. A
 * reader cannot tell "this check failed", "this check never ran
 * because an earlier one failed", and "this check does not apply"
 * apart — which is the 0.14 shape at the check granularity.
 *
 * The tri-state vector lists EVERY battery check, always, each with
 * a state: pass, fail, or not_reached with the reason being the name
 * of the check that stopped the battery. Nothing is invented — a
 * check that did not run says so, it does not guess.
 *
 * SOURCE-LEVEL ONLY: no signed row changes in this slice. The vector
 * derives from the same checks runChecks already emits, so verdicts
 * everywhere are byte-identical to before.
 */

function response(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return new Response(body, { status, headers });
}

const CHALLENGE = btoa(
  JSON.stringify({
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        payTo: "0x4444444444444444444444444444444444444444",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "5000",
        maxTimeoutSeconds: 300,
      },
    ],
  }),
);

describe("the tri-state vector", () => {
  it("names the whole battery, in order, as a registry", () => {
    // The registry is 2.3's manifest seed; it exists as data so the
    // vector below and a future checks.json cannot disagree.
    expect(BATTERY_CHECK_NAMES.length).toBeGreaterThanOrEqual(4);
    expect(BATTERY_CHECK_NAMES[0]).toBe("status-402");
    expect(new Set(BATTERY_CHECK_NAMES).size).toBe(BATTERY_CHECK_NAMES.length);
  });

  it("a clean 402 runs the battery and every row is pass or fail — none missing", () => {
    const { checks } = runChecks(
      response(402, { "PAYMENT-REQUIRED": CHALLENGE }),
      false,
    );
    const vector = triStateVector(checks);
    expect(vector.map((v) => v.name)).toEqual([...BATTERY_CHECK_NAMES]);
    for (const row of vector) {
      expect(["pass", "fail"]).toContain(row.state);
    }
  });

  it("a 200 door yields one fail and the rest not_reached, each naming the blocker", () => {
    const { checks } = runChecks(response(200), false);
    const vector = triStateVector(checks);
    expect(vector.map((v) => v.name)).toEqual([...BATTERY_CHECK_NAMES]);
    expect(vector[0]).toMatchObject({ name: "status-402", state: "fail" });
    for (const row of vector.slice(1)) {
      /*
       * NOT "fail" — the door's header checks were never exercised,
       * and booking unexercised checks as failures is precisely the
       * probe-limitation-as-subject-defect error 3.4 names. And not
       * silent absence either, which was yesterday's version.
       */
      expect(row.state).toBe("not_reached");
      expect(row.blocked_by).toBe("status-402");
    }
  });

  it("a headerless 402 stops at the header check, honestly", () => {
    const { checks } = runChecks(response(402), false);
    const vector = triStateVector(checks);
    const byName = Object.fromEntries(vector.map((v) => [v.name, v]));
    expect(byName["status-402"]!.state).toBe("pass");
    expect(byName["payment-required-header"]!.state).toBe("fail");
    expect(byName["x402-version"]!.state).toBe("not_reached");
    expect(byName["x402-version"]!.blocked_by).toBe("payment-required-header");
  });

  it("invents nothing: every vector row beyond the ran set carries no detail of its own", () => {
    const { checks } = runChecks(response(200), false);
    const vector = triStateVector(checks);
    for (const row of vector) {
      if (row.state === "not_reached") {
        // The reason is structural (which check blocked), never a
        // fabricated observation about the door.
        expect(row.detail).toContain("never ran");
      }
    }
  });

  it("a conditional check that RAN rides after the registry; one that has no subject appears nowhere", () => {
    const challenge = btoa(
      JSON.stringify({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            payTo: "0x4444444444444444444444444444444444444444",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: "5000",
            maxTimeoutSeconds: 300,
          },
        ],
        extensions: { bazaar: { info: { name: "x" } } },
      }),
    );
    const { checks } = runChecks(
      response(402, { "PAYMENT-REQUIRED": challenge }),
      false,
    );
    const vector = triStateVector(checks);
    expect(vector.slice(0, BATTERY_CHECK_NAMES.length).map((v) => v.name)).toEqual(
      [...BATTERY_CHECK_NAMES],
    );
    const bazaar = vector.find((v) => v.name === "bazaar-extension");
    expect(bazaar).toBeDefined();
    expect(["pass", "fail"]).toContain(bazaar!.state);
    // No bazaar block on the plain CHALLENGE above: no row at all —
    // the vector never fabricates an "absent subject" observation.
    const plain = triStateVector(
      runChecks(response(402, { "PAYMENT-REQUIRED": CHALLENGE }), false).checks,
    );
    expect(plain.find((v) => v.name === "bazaar-extension")).toBeUndefined();
  });
});
