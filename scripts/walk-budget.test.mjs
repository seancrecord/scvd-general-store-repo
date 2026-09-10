import { test } from "node:test";
import assert from "node:assert/strict";
import * as walk from "./lib/walkabout.mjs";
const caps = { perItemUsd: 0.01, runUsd: 0.01, perDomain: 1 };
const chosen = { amountUsd: 0.01, amountAtomic: "10000", payTo: "0x1111111111111111111111111111111111111111", domain: "vendor.example" };
for (const outcome of ["charged-404", "lost-response", "free-200"]) {
  test(`${outcome} retains the budget reservation and cannot authorize another purchase`, async () => {
    const state = { reservedAtomic: 0n, domains: {} };
    let calls = 0;
    try {
      await walk.submitWithinBudget(chosen, state, caps, async () => {
        calls++;
        assert.equal(state.reservedAtomic, 10000n);
        if (outcome === "lost-response") throw new Error("transport lost");
        return new Response("{}", { status: outcome === "charged-404" ? 404 : 200 });
      });
    } catch (error) { if (outcome !== "lost-response" || error.message !== "transport lost") throw error; }
    await assert.rejects(walk.submitWithinBudget({ ...chosen, domain: "another.example" }, state, caps, () => { calls++; }), /run_cap/);
    await assert.rejects(walk.submitWithinBudget(chosen, state, { ...caps, runUsd: 1 }, () => { calls++; }), /per_domain_cap/);
    assert.equal(calls, 1);
    assert.equal(state.reservedAtomic, 10000n);
  });
}
test("sub-cent budget arithmetic and invalid amounts cannot widen authorization", async () => {
  const state = { reservedAtomic: 9999999n, domains: {} };
  assert.equal(walk.ruleCheck({ ...chosen, amountUsd: 0.000001, amountAtomic: "1" }, state, { ...caps, runUsd: 10 }), null);
  assert.equal(walk.ruleCheck({ ...chosen, amountUsd: 0.000002, amountAtomic: "2" }, state, { ...caps, runUsd: 10 }), "run_cap");
  for (const amountUsd of [-1, Infinity, NaN]) assert.equal(walk.ruleCheck({ ...chosen, amountUsd, amountAtomic: undefined }, state, caps), "unreadable_amount");
});
