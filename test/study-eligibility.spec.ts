import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { debriefStudy, enrolStudy, STUDY_DEBRIEF_FIELDS } from "@/services/field-study";
import { fieldSignerFromKey } from "@/services/launch-check";
import { purchaseIntentStore } from "@/services/purchase-intent";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { BASE_USDC } from "@/lib/base-rpc";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const now = new Date("2026-10-14T17:00:00Z");
const clear = async () => ({ listed: false as const, source: "test" });
const answers = Object.fromEntries(STUDY_DEBRIEF_FIELDS.map(({ field }) => [field, "An honest answer."]));
const wallet = (digit: string) => `0x${digit.repeat(40)}`;
const roster = (operator: string) => ({
  operator, model: "test-model", harness: "openai", task: "Shop and report",
  purpose: "Check the journey", autonomy: "supervised", funding: "operator_wallet",
  found_via: "field-study", prior_x402: true,
});
async function options(at = now) {
  return {
    now: at, screen: clear,
    signer: await fieldSignerFromKey("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
  };
}
async function study(operator: string, payout: string, at = now) {
  const enrolled = await enrolStudy(testEnv, roster(operator), await options(at));
  const id = crypto.randomUUID().replaceAll("-", "").repeat(2);
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  await purchaseIntentStore(testEnv, id).beginPurchase(JSON.stringify({
    version: 1, id, token, path: "/api/buy/hello", door: "http", payer: payout,
    terms: { network: "eip155:8453", maxAmountRequired: "1000", asset: BASE_USDC },
    request: "", created_at: new Date(at.getTime() + 1000).toISOString(), state: "settled",
  }));
  return { study_id: enrolled.study_id, study_token: enrolled.study_token, payout_to: payout,
    legs: [{ purchase_id: id, status_token: token, surface: "x402_http" as const }], answers };
}

describe("one operator shares the paid-study allowance", () => {
  it("refuses a second wallet and catches the same operator before new enrolment", async () => {
    const first = await study("Eligibility Shared Operator", wallet("4"));
    const second = await study("  Ｅligibility   shared operator  ", wallet("5"));
    await debriefStudy(testEnv, first, await options());
    const spent = await testEnv.COUNTERS.get(KV_KEYS.studyBudget(currentWeekKey(now)));
    await expect(debriefStudy(testEnv, second, await options())).rejects.toThrow(/operator.*week/i);
    expect(await testEnv.COUNTERS.get(KV_KEYS.studyLeg(second.legs[0]!.purchase_id))).toBeNull();
    expect(await testEnv.COUNTERS.get(KV_KEYS.studyBudget(currentWeekKey(now)))).toBe(spent);
    await expect(enrolStudy(testEnv, roster("Eligibility Shared Operator"), await options())).rejects.toThrow(/operator.*week/i);
  });

  it("allows a different operator and resets at Monday 00:00 UTC", async () => {
    const sunday = new Date("2026-10-18T23:50:00Z");
    const monday = new Date("2026-10-19T00:00:00Z");
    await debriefStudy(testEnv, await study("Eligibility Sunday", wallet("6"), sunday), await options(sunday));
    await debriefStudy(testEnv, await study("Eligibility Other", wallet("7"), sunday), await options(sunday));
    await expect(debriefStudy(testEnv, await study("Eligibility Sunday", wallet("6"), monday), await options(monday))).resolves.toHaveProperty("reward_usd");
  });

  it("allows only one concurrent debrief across different wallets", async () => {
    const first = await study("Eligibility Concurrent", wallet("8"));
    const second = await study("Eligibility Concurrent", wallet("9"));
    const opts = await options();
    const results = await Promise.allSettled([debriefStudy(testEnv, first, opts), debriefStudy(testEnv, second, opts)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason)).toMatch(/operator.*week/i);
  });

  it("releases the allowance after a pre-signature refusal so the study can retry", async () => {
    const input = await study("Eligibility Retry", wallet("a"));
    await expect(debriefStudy(testEnv, input, { ...await options(), screen: async () => ({ listed: null, source: "offline" }) })).rejects.toThrow(/did not answer/);
    await expect(debriefStudy(testEnv, input, await options())).resolves.toHaveProperty("reward_usd");
  });

  it("fails closed without the allowance service", async () => {
    const input = await study("Eligibility Unavailable", wallet("b"));
    const unavailable = { ...testEnv, BOUNTY_CLAIM_LOCKS: undefined } as unknown as Env;
    await expect(debriefStudy(unavailable, input, await options())).rejects.toThrow(/eligibility.*unavailable/i);
    await expect(enrolStudy(unavailable, roster("Eligibility No Service"), await options())).rejects.toThrow(/eligibility.*unavailable/i);
  });

  it("retains the allowance when the signing outcome is uncertain", async () => {
    const first = await study("Eligibility Uncertain Signature", wallet("e"));
    const second = await study("Eligibility Uncertain Signature", wallet("f"));
    const opts = await options();
    await expect(debriefStudy(testEnv, first, {
      ...opts, signer: { ...opts.signer, signTypedData: async () => { throw new Error("signer unavailable"); } },
    })).rejects.toThrow(/signer unavailable/);
    await expect(debriefStudy(testEnv, second, opts)).rejects.toThrow(/operator.*week/i);
    expect(await testEnv.COUNTERS.get(KV_KEYS.studyLeg(first.legs[0]!.purchase_id))).toBe(first.study_id);
  });

  it("releases the allowance after a budget refusal", async () => {
    const input = await study("Eligibility Budget Retry", wallet("1"));
    const key = KV_KEYS.studyBudget(currentWeekKey(now));
    const previous = await testEnv.COUNTERS.get(key);
    await testEnv.COUNTERS.put(key, "1000000");
    try {
      await expect(debriefStudy(testEnv, input, await options())).rejects.toThrow(/field-study budget/);
    } finally {
      await testEnv.COUNTERS.put(key, previous ?? "0");
    }
    await expect(debriefStudy(testEnv, input, await options())).resolves.toHaveProperty("reward_usd");
  });

  it("keeps terms for studies enrolled before the operator rule", async () => {
    const first = await study("Eligibility Legacy", wallet("c"));
    const second = await study("Eligibility Legacy", wallet("d"));
    for (const input of [first, second]) {
      const key = KV_KEYS.study(input.study_id);
      const row = JSON.parse((await testEnv.COUNTERS.get(key))!);
      delete row.eligibility_policy;
      await testEnv.COUNTERS.put(key, JSON.stringify(row));
    }
    await expect(debriefStudy(testEnv, first, await options())).resolves.toHaveProperty("reward_usd");
    await expect(debriefStudy(testEnv, second, await options())).resolves.toHaveProperty("reward_usd");
  });

  it("requires a stable operator label instead of the shared word self", async () => {
    await expect(enrolStudy(testEnv, roster("self"), await options())).rejects.toThrow(/operator/);
  });

  it("publishes eligibility before shopping and directs wall questions to the mailbox", async () => {
    for (const path of ["/field-study", "/field-study.md", "/api/field-study", "/api/study/enrol", "/api/study/enroll", "/api/study/debrief", "/llms.txt", "/llms-full.txt"]) {
      const response = await SELF.fetch(`https://scvd.store${path}`);
      expect(await response.text(), path).toContain("One paid study per operator per week.");
    }
    for (const path of ["/", "/guestbook", "/api/guestbook"]) {
      const response = await SELF.fetch(`https://scvd.store${path}`, { headers: { Accept: "text/html" } });
      const body = await response.text();
      expect(body, path).toContain("Questions for the keeper");
      expect(body, path).toContain("/api/letter");
      expect(body, path).toContain("/field-study");
    }
  });
});
