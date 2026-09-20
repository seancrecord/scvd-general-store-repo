import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { recoverTypedDataAddress } from "viem";
import {
  STUDY_BASE_REWARD_USD,
  STUDY_DEBRIEF_FIELDS,
  STUDY_LEG_REWARD_USD,
  STUDY_MAX_REWARD_USD,
  STUDY_RAIL_BONUS_USD,
  STUDY_REFUSALS,
  STUDY_ROSTER_FIELDS,
  STUDY_SURFACE_BONUS_USD,
  STUDY_WEEKLY_BUDGET_USD,
  StudyRefused,
  debriefStudy,
  enrolStudy,
  fieldStudyBoard,
  readOwnStudy,
  studyReward,
  type StudyLeg,
} from "@/services/field-study";
import {
  STUDY_SCENARIOS,
  scenarioById,
} from "@/store/study-scenarios";
import {
  closeScenario,
  liveScenarios,
  openScenario,
  scenarioShelf,
  scenarioTargetMet,
} from "@/services/field-study";
import { findingsFrom, caveatFor } from "@/services/study-findings";
import { fieldSignerFromKey } from "@/services/launch-check";
import { purchaseIntentStore } from "@/services/purchase-intent";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { BASE_USDC } from "@/lib/base-rpc";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const PAYOUT_TO = "0x4444444444444444444444444444444444444444";
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

/** A clear sanctions screen that touches no network. */
const clear = async () => ({ listed: false as const, source: "test" });

async function signer() {
  return fieldSignerFromKey(TEST_FIELD_KEY);
}

async function options(now?: Date) {
  return { signer: await signer(), screen: clear, ...(now ? { now } : {}) };
}

function hex(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

const ROSTER = {
  payout_to: PAYOUT_TO,
  model: "test-model-1",
  harness: "clawhub",
  operator: "a test operator",
  task: "buy something small and report back",
  purpose: "to see whether this store can be shopped by an agent at all",
  autonomy: "unsupervised",
  funding: "own_wallet",
  found_via: "the bounty board",
  prior_x402: false,
};

/**
 * A SETTLED PURCHASE IN OUR OWN BOOKS. Seeded through the same Durable
 * Object the till writes to, because the whole claim this instrument
 * makes is that a leg is verified against THIS store's record rather
 * than the researcher's word — a test that faked the lookup would be
 * testing the researcher's word.
 */
async function seedPurchase(input: {
  id: string;
  token: string;
  door: "http" | "mcp" | "ucp";
  network: string;
  path?: string;
  payer?: string;
  createdAt: string;
  state?: "settled" | "not_settled" | "unknown";
}): Promise<{ purchase_id: string; status_token: string }> {
  const record = {
    version: 1 as const,
    id: input.id,
    token: input.token,
    path: input.path ?? "/api/buy/thing",
    door: input.door,
    payer: input.payer ?? "0x9999999999999999999999999999999999999999",
    terms: { network: input.network, maxAmountRequired: "1000", asset: BASE_USDC },
    request: "",
    created_at: input.createdAt,
    state: input.state ?? ("settled" as const),
  };
  await purchaseIntentStore(testEnv, input.id).beginPurchase(JSON.stringify(record));
  return { purchase_id: input.id, status_token: input.token };
}

const ANSWERS = Object.fromEntries(
  STUDY_DEBRIEF_FIELDS.map((field) => [field.field, `an answer for ${field.field}`]),
);

describe("enrolment: free, prospective, and refused rather than paid blank", () => {
  it("opens a study, returns a token once, and never stores the token itself", async () => {
    const { study_id, study_token, record } = await enrolStudy(
      testEnv,
      { ...ROSTER },
      await options(),
    );
    expect(study_id).toMatch(/^sty_[a-f0-9]{16}$/);
    expect(study_token).toMatch(/^[a-f0-9]{64}$/);
    expect(record.status).toBe("enrolled");
    const stored = await testEnv.COUNTERS.get(KV_KEYS.study(study_id));
    expect(stored, "the record is on file").toBeTruthy();
    expect(
      stored,
      "the token itself is never written — only its digest",
    ).not.toContain(study_token);
    expect(JSON.parse(stored!).token_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses a missing roster field by name, and says what the answer buys", async () => {
    for (const field of ["model", "operator", "task", "purpose", "found_via"]) {
      const body: Record<string, unknown> = { ...ROSTER };
      delete body[field];
      await expect(enrolStudy(testEnv, body, await options())).rejects.toThrow(
        new RegExp(`\`${field}\``),
      );
    }
  });

  it("refuses a harness off the closed list, and names the list", async () => {
    await expect(
      enrolStudy(testEnv, { ...ROSTER, harness: "something-else" }, await options()),
    ).rejects.toThrow(/clawhub/);
  });

  it("requires harness_other when the harness is other or custom", async () => {
    await expect(
      enrolStudy(testEnv, { ...ROSTER, harness: "other" }, await options()),
    ).rejects.toThrow(/harness_other/);
    const named = await enrolStudy(
      testEnv,
      { ...ROSTER, harness: "other", harness_other: "a bespoke runtime" },
      await options(),
    );
    expect(named.record.roster.harness_other).toBe("a bespoke runtime");
  });

  it("refuses a house wallet: family money must never enter the organic column", async () => {
    await expect(
      enrolStudy(
        testEnv,
        { ...ROSTER, payout_to: "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7" },
        await options(),
      ),
    ).rejects.toThrow(/house wallet/);
  });

  it("refuses a payout address that is not a 0x address at all", async () => {
    await expect(
      enrolStudy(testEnv, { ...ROSTER, payout_to: "not-an-address" }, await options()),
    ).rejects.toThrow(/payout_to/);
  });
});

describe("the debrief verifies against our own books, never the researcher's word", () => {
  it("pays a complete study and signs an authorization the payout address can redeem", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0x5555555555555555555555555555555555555555" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("a1"),
      token: hex("b1"),
      door: "http",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    const result = await debriefStudy(
      testEnv,
      {
        study_id,
        study_token,
        legs: [{ ...leg, surface: "x402_http" }],
        answers: ANSWERS,
      },
      await options(new Date(now.getTime() + 2000)),
    );
    expect(result.reward_usd).toBe(STUDY_BASE_REWARD_USD + STUDY_LEG_REWARD_USD);
    expect(result.legs[0]!.observed.door).toBe("http");
    expect(result.legs[0]!.observed.settled).toBe(true);
    expect(
      result.legs[0]!.observed.payer_digest,
      "the payer never rides verbatim",
    ).not.toContain("0x9999");
    // The signature is the payment: it must recover to the field wallet.
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract: BASE_USDC as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: result.payout.authorization as never,
      signature: result.payout.signature as `0x${string}`,
    });
    expect(recovered.toLowerCase()).toBe((await signer()).address.toLowerCase());
    expect(result.payout.authorization["value"]).toBe(
      String(Math.round(result.reward_usd * 1e6)),
    );
  });

  it("refuses a purchase that predates the enrolment: the study is prospective", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0x6666666666666666666666666666666666666666" },
      await options(now),
    );
    const early = await seedPurchase({
      id: hex("a2"),
      token: hex("b2"),
      door: "http",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() - 60_000).toISOString(),
    });
    await expect(
      debriefStudy(
        testEnv,
        { study_id, study_token, legs: [{ ...early, surface: "x402_http" }], answers: ANSWERS },
        await options(now),
      ),
    ).rejects.toThrow(/before this study enrolled/);
  });

  it("refuses a leg whose status token does not open our record", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0x7777777777777777777777777777777777777777" },
      await options(now),
    );
    await seedPurchase({
      id: hex("a3"),
      token: hex("b3"),
      door: "http",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    await expect(
      debriefStudy(
        testEnv,
        {
          study_id,
          study_token,
          legs: [{ purchase_id: hex("a3"), status_token: hex("cc"), surface: "x402_http" }],
          answers: ANSWERS,
        },
        await options(now),
      ),
    ).rejects.toThrow(/not in our books under that status token/);
  });

  it("refuses an incomplete questionnaire by name, and pays nothing for it", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0x8888888888888888888888888888888888888888" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("a4"),
      token: hex("b4"),
      door: "mcp",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    const short = { ...ANSWERS };
    delete (short as Record<string, unknown>)["hardest_step"];
    await expect(
      debriefStudy(
        testEnv,
        { study_id, study_token, legs: [{ ...leg, surface: "mcp" }], answers: short },
        await options(now),
      ),
    ).rejects.toThrow(/hardest_step/);
    const after = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.study(study_id)))!);
    expect(after.status, "a refused debrief spends the study nothing").toBe("enrolled");
  });

  it("counts one purchase for one study, ever", async () => {
    const now = new Date();
    const first = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaa1111111111111111111111111111111111111" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("a5"),
      token: hex("b5"),
      door: "http",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    await debriefStudy(
      testEnv,
      {
        study_id: first.study_id,
        study_token: first.study_token,
        legs: [{ ...leg, surface: "x402_http" }],
        answers: ANSWERS,
      },
      await options(now),
    );
    const second = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaa2222222222222222222222222222222222222" },
      await options(now),
    );
    await expect(
      debriefStudy(
        testEnv,
        {
          study_id: second.study_id,
          study_token: second.study_token,
          legs: [{ ...leg, surface: "x402_http" }],
          answers: ANSWERS,
        },
        await options(now),
      ),
    ).rejects.toThrow(/already counted by study/);
  });

  it("refuses a second debrief of the same study", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaa3333333333333333333333333333333333333" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("a6"),
      token: hex("b6"),
      door: "http",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    await debriefStudy(
      testEnv,
      { study_id, study_token, legs: [{ ...leg, surface: "x402_http" }], answers: ANSWERS },
      await options(now),
    );
    await expect(
      debriefStudy(
        testEnv,
        { study_id, study_token, legs: [{ ...leg, surface: "x402_http" }], answers: ANSWERS },
        await options(now),
      ),
    ).rejects.toThrow(/already been debriefed/);
  });

  it("refuses when no cited purchase settled, and says abandonment is welcome instead", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaa4444444444444444444444444444444444444" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("a7"),
      token: hex("b7"),
      door: "http",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
      state: "not_settled",
    });
    await expect(
      debriefStudy(
        testEnv,
        { study_id, study_token, legs: [{ ...leg, surface: "x402_http" }], answers: ANSWERS },
        await options(now),
      ),
    ).rejects.toThrow(/abandoned/i);
  });

  it("records a declared surface our books disagree with, and charges nothing for it", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaa5555555555555555555555555555555555555" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("a8"),
      token: hex("b8"),
      door: "http",
      network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    const result = await debriefStudy(
      testEnv,
      { study_id, study_token, legs: [{ ...leg, surface: "ucp" }], answers: ANSWERS },
      await options(now),
    );
    expect(result.legs[0]!.mismatch, "the disagreement is named").toMatch(/declared/);
    expect(result.legs[0]!.declared.surface, "theirs is kept").toBe("ucp");
    expect(result.legs[0]!.observed.door, "ours is kept").toBe("http");
    expect(
      result.reward_usd,
      "a disagreement is a finding, never a penalty",
    ).toBe(STUDY_BASE_REWARD_USD + STUDY_LEG_REWARD_USD);
  });

  it("holds one study per payout wallet per ISO week", async () => {
    const now = new Date();
    const wallet = "0xaaa6666666666666666666666666666666666666";
    const first = await enrolStudy(testEnv, { ...ROSTER, payout_to: wallet }, await options(now));
    const legA = await seedPurchase({
      id: hex("a9"), token: hex("b9"), door: "http", network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    await debriefStudy(
      testEnv,
      { study_id: first.study_id, study_token: first.study_token, legs: [{ ...legA, surface: "x402_http" }], answers: ANSWERS },
      await options(now),
    );
    const second = await enrolStudy(testEnv, { ...ROSTER, payout_to: wallet }, await options(now));
    const legB = await seedPurchase({
      id: hex("ab"), token: hex("bb"), door: "http", network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    await expect(
      debriefStudy(
        testEnv,
        { study_id: second.study_id, study_token: second.study_token, legs: [{ ...legB, surface: "x402_http" }], answers: ANSWERS },
        await options(now),
      ),
    ).rejects.toThrow(/already debriefed a study this ISO week/);
  });

  it("refuses past the weekly cap, and names the budget it is kept apart from", async () => {
    const now = new Date();
    const week = currentWeekKey(now);
    const before = await testEnv.COUNTERS.get(KV_KEYS.studyBudget(week));
    await testEnv.COUNTERS.put(
      KV_KEYS.studyBudget(week),
      String(STUDY_WEEKLY_BUDGET_USD),
    );
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaa7777777777777777777777777777777777777" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("ac"), token: hex("bc"), door: "http", network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    await expect(
      debriefStudy(
        testEnv,
        { study_id, study_token, legs: [{ ...leg, surface: "x402_http" }], answers: ANSWERS },
        await options(now),
      ),
    ).rejects.toThrow(/field-study budget/);
    /*
     * AND THE GUARDS ROLL BACK. A refusal after the leg key was written
     * must not burn the purchase — the researcher gets the same walk
     * back next week or it was not a refusal, it was a confiscation.
     */
    expect(await testEnv.COUNTERS.get(KV_KEYS.studyLeg(hex("ac")))).toBeNull();
    await testEnv.COUNTERS.put(KV_KEYS.studyBudget(week), before ?? "0");
  });

  it("fails closed when the sanctions screen does not answer", async () => {
    const now = new Date();
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaa8888888888888888888888888888888888888" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("ad"), token: hex("bd"), door: "http", network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    await expect(
      debriefStudy(
        testEnv,
        { study_id, study_token, legs: [{ ...leg, surface: "x402_http" }], answers: ANSWERS },
        {
          signer: await signer(),
          screen: async () => ({ listed: null, source: "a silent oracle" }),
          now,
        },
      ),
    ).rejects.toThrow(/did not answer/);
  });
});

describe("the reward is arithmetic on observed facts, never a grade", () => {
  const leg = (door: StudyLeg["observed"]["door"], protocol: string, network: string, settled = true): StudyLeg => ({
    purchase_id: `${door}${protocol}${network}`,
    declared: { surface: "x402_http" },
    observed: {
      door, protocol, network, path: "/api/buy/thing", settled,
      created_at: new Date().toISOString(), payer_digest: "digest",
    },
  });

  it("pays nothing at all when nothing settled", () => {
    expect(studyReward([leg("http", "x402", "eip155:8453", false)]).total_usd).toBe(0);
  });

  it("adds a bonus per distinct observed surface and rail, and publishes the arithmetic", () => {
    const reward = studyReward([
      leg("http", "x402", "eip155:8453"),
      leg("mcp", "x402", "eip155:8453"),
      leg("ucp", "mpp", "eip155:137"),
    ]);
    expect(reward.surfaces).toHaveLength(3);
    expect(reward.rails).toHaveLength(2);
    expect(reward.legs_counted).toBe(3);
    expect(reward.subtotal_usd).toBeCloseTo(
      STUDY_BASE_REWARD_USD +
        3 * STUDY_LEG_REWARD_USD +
        2 * STUDY_SURFACE_BONUS_USD +
        1 * STUDY_RAIL_BONUS_USD,
      5,
    );
  });

  it("never exceeds the per-study ceiling, and says when it bit", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      leg("http", `proto${index}`, `chain${index}`),
    );
    const reward = studyReward(many);
    expect(reward.total_usd).toBeLessThanOrEqual(STUDY_MAX_REWARD_USD);
    expect(reward.capped).toBe(true);
  });

  it("counts a rail once however it is cased", () => {
    expect(
      studyReward([
        leg("http", "x402", "EIP155:8453"),
        leg("http", "x402", "eip155:8453"),
      ]).rails,
    ).toHaveLength(1);
  });
});

describe("the findings keep their two tiers and their denominator", () => {
  it("says plainly that nothing has happened rather than publishing zeros as a rate", () => {
    expect(findingsFrom([]).studies).toBe(0);
    expect(caveatFor(0, 0)).toMatch(/not because nothing went wrong/);
    expect(caveatFor(3, 4)).toMatch(/far too few to be a rate/);
    expect(caveatFor(40, 120)).toMatch(/upper bound/);
  });

  it("counts observed surfaces and rails off our books and quotes their words whole", () => {
    const findings = findingsFrom([
      {
        study_id: "sty_0000000000000001",
        enrolled_at: "2026-09-19T00:00:00.000Z",
        expires_at: "2026-09-22T00:00:00.000Z",
        roster: {
          model: "m1", harness: "clawhub", operator: "op", task: "t",
          purpose: "p", autonomy: "unsupervised", funding: "own_wallet",
          found_via: "f", prior_x402: false,
        },
        status: "debriefed",
        payout_to: "0xdead",
        token_sha256: "x",
        debrief: {
          at: "2026-09-19T01:00:00.000Z",
          answers: {
            first_read: "the storefront", price_read: "the menu",
            hardest_step: "the MCP handshake", abandoned: "nothing",
            surprises: "the receipt", compared_to: "writing it myself",
            would_return: "true, it was cheap",
          },
          legs: [
            {
              purchase_id: "p1",
              declared: { surface: "ucp" },
              observed: {
                door: "http", protocol: "x402", network: "eip155:8453",
                path: "/api/buy/a", settled: true,
                created_at: "2026-09-19T00:30:00.000Z", payer_digest: "d",
              },
              mismatch: "declared `ucp`, our books recorded `door: http`",
            },
          ],
          defects: [{ where: "/mcp", what: "the tool list was slow", severity: "annoying" }],
          reward_usd: 0.7,
          reward_breakdown: studyReward([]),
          authorization_nonce: "0x0",
          authorization_valid_before: "0",
        },
      },
    ]);
    expect(findings.studies).toBe(1);
    expect(findings.surfaces[0]!.observed).toBe("http+x402");
    expect(findings.rails[0]!.network).toBe("eip155:8453");
    expect(findings.surface_confusion.legs, "ours vs theirs is counted").toBe(1);
    expect(findings.abandoned_something.studies, "'nothing' is not an abandonment").toBe(0);
    expect(findings.would_return.yes).toBe(1);
    expect(findings.defects.annoying).toBe(1);
    expect(
      findings.voices[0]!.hardest_step,
      "their words are quoted whole, never summarised",
    ).toBe("the MCP handshake");
    expect(
      JSON.stringify(findings),
      "no wallet and no operator string ever rides an aggregate",
    ).not.toContain("0xdead");
    expect(JSON.stringify(findings)).not.toContain('"op"');
  });
});

describe("the public doors", () => {
  it("serves the room, its JSON twin and the board without an account", async () => {
    for (const path of ["/field-study", "/api/field-study"]) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
      });
      expect(response.status, path).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      for (const key of ["what_this_is", "price", "how_to_call", "errors", "security"]) {
        expect(body[key], `${path} answers ${key}`).toBeDefined();
      }
      expect(body["refusals"], "every refusal is published in advance").toBeDefined();
    }
  });

  it("answers GET on both write doors with their shape rather than a 404", async () => {
    for (const path of [
      "/api/study/enrol",
      "/api/study/enroll",
      "/api/study/debrief",
    ]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, path).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body["this_door_takes"]).toBe("POST");
      expect(body["refusals"]).toBeDefined();
    }
  });

  it("publishes no roster: the room can never be read back to one researcher", async () => {
    await enrolStudy(
      testEnv,
      { ...ROSTER, operator: "a-very-distinctive-operator-string", payout_to: "0xaaa9999999999999999999999999999999999999" },
      await options(),
    );
    const body = await (
      await SELF.fetch(`${BASE}/api/field-study`, { headers: { Accept: "application/json" } })
    ).text();
    expect(body).not.toContain("a-very-distinctive-operator-string");
    expect(body).not.toContain("0xaaa9999999999999999999999999999999999999");
  });

  it("opens one study only to the token that wrote it", async () => {
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaaa111111111111111111111111111111111111" },
      await options(),
    );
    expect(await readOwnStudy(testEnv, study_id, study_token)).not.toBeNull();
    expect(await readOwnStudy(testEnv, study_id, hex("ff"))).toBeNull();
    expect(await readOwnStudy(testEnv, study_id, undefined)).toBeNull();
    const refused = await SELF.fetch(`${BASE}/api/study/${study_id}`);
    expect(refused.status).toBe(404);
    const opened = await SELF.fetch(
      `${BASE}/api/study/${study_id}?study_token=${study_token}`,
    );
    expect(opened.status).toBe(200);
    expect(await opened.text(), "the digest never leaves either").not.toContain(
      "token_sha256",
    );
  });

  it("refuses an enrolment over HTTP with the field named and the catalogue attached", async () => {
    const response = await SELF.fetch(`${BASE}/api/study/enrol`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ROSTER, task: "" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["error"])).toContain("`task`");
    expect(body["refusals"]).toBeDefined();
  });
});

describe("the keeper's desk", () => {
  const AUTH = {
    Authorization: `Basic ${btoa(`keeper:${(testEnv as unknown as { ADMIN_PASSWORD: string }).ADMIN_PASSWORD}`)}`,
  };

  it("renders the study beside the bounty board, with both budgets kept apart", async () => {
    const page = await SELF.fetch(`${BASE}/admin/bounties`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("The field study — the week's budget");
    expect(html).toContain("The field study — who enrolled and never came back");
    expect(html).toContain("The field study — what the studies show");
    expect(html, "the board's own sections still stand").toContain("The week's budget");
    expect(
      html,
      "the two caps are named as separate money on one page",
    ).toContain("kept apart from the bounty board");
  });

  /**
   * THE ROW THAT LEAVES NO OTHER TRACE. An agent that enrolled, wrote
   * down what it came here to do, and then bought nothing is invisible
   * everywhere else in this store — so if it ever stops appearing on
   * the desk, the instrument has quietly lost the most expensive fact
   * it collects.
   */
  it("shows an enrolment that never debriefed, with the task they typed", async () => {
    await enrolStudy(
      testEnv,
      {
        ...ROSTER,
        payout_to: "0xaaab111111111111111111111111111111111111",
        task: "a-task-nobody-else-would-type",
      },
      await options(),
    );
    const html = await (
      await SELF.fetch(`${BASE}/admin/bounties`, { headers: AUTH })
    ).text();
    expect(html).toContain("a-task-nobody-else-would-type");
    expect(html).toContain("the task they typed");
  });
});

describe("the register itself", () => {
  it("names a reason on every question it asks, because the answers are the goods", () => {
    for (const entry of [...STUDY_ROSTER_FIELDS, ...STUDY_DEBRIEF_FIELDS]) {
      expect(entry.why.length, `${entry.field} says what the answer buys`).toBeGreaterThan(40);
      expect(entry.what.length, `${entry.field} says what it is`).toBeGreaterThan(20);
    }
  });

  it("publishes every refusal with the reason it exists", () => {
    expect(STUDY_REFUSALS.length).toBeGreaterThan(5);
    for (const entry of STUDY_REFUSALS) {
      expect(entry.why.length, entry.refusal).toBeGreaterThan(40);
    }
  });

  it("keeps its budget apart from the bounty board's", async () => {
    const board = await fieldStudyBoard(testEnv);
    expect(board.weekly_budget_usd).toBe(STUDY_WEEKLY_BUDGET_USD);
    expect(KV_KEYS.studyBudget("2026-W38")).not.toBe(KV_KEYS.bountyBudget("2026-W38"));
  });

  it("is a StudyRefused, so a refusal never reads as an outage", async () => {
    await expect(
      enrolStudy(testEnv, {}, await options()),
    ).rejects.toBeInstanceOf(StudyRefused);
  });
});


describe("the scenario shelf", () => {
  it("carries the predetermined set, each with a distinct id", () => {
    expect(STUDY_SCENARIOS.length).toBeGreaterThanOrEqual(20);
    const ids = STUDY_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size, "ids are distinct").toBe(ids.length);
  });

  /**
   * THE HONESTY RULE OF THE WHOLE SHELF, as a test. A scenario whose
   * condition our books cannot confirm must pay NOTHING extra — not a
   * reduced bonus, none — because a bonus on an unverifiable condition
   * is a bounty on claiming it rather than walking it. The inverse
   * matters too: a scenario that CAN be checked and pays nothing is a
   * harder walk priced as an easy one.
   */
  it("prices only what our own books can confirm, and says so either way", () => {
    for (const scenario of STUDY_SCENARIOS) {
      if (scenario.target === null) {
        expect(scenario.bonus_usd, `${scenario.id} pays no bonus`).toBe(0);
        expect(
          scenario.unverifiable_because?.length ?? 0,
          `${scenario.id} says why it cannot be checked`,
        ).toBeGreaterThan(40);
      } else {
        expect(scenario.bonus_usd, `${scenario.id} pays for the harder walk`).toBeGreaterThan(0);
      }
    }
  });

  it("asks nothing without saying what the answer buys", () => {
    for (const scenario of STUDY_SCENARIOS) {
      expect(scenario.brief.length, `${scenario.id} has instructions`).toBeGreaterThan(0);
      expect(scenario.question.length, `${scenario.id} names its question`).toBeGreaterThan(30);
      expect(scenario.asks.length, `${scenario.id} asks something extra`).toBeGreaterThan(0);
      for (const ask of scenario.asks) {
        expect(ask.why.length, `${scenario.id}.${ask.field} says why`).toBeGreaterThan(40);
      }
    }
  });

  it("reads every target off verified legs and never off a declaration", () => {
    const leg = (over: Partial<StudyLeg["observed"]> = {}): StudyLeg => ({
      purchase_id: JSON.stringify(over),
      declared: { surface: "ucp" },
      observed: {
        door: "http", protocol: "x402", network: "eip155:8453",
        path: "/api/buy/thing", settled: true,
        created_at: "2026-09-19T00:00:00.000Z", payer_digest: "d", ...over,
      },
    });
    expect(scenarioTargetMet([leg({ door: "mcp" })], { kind: "door", door: "mcp" })).toBe(true);
    expect(scenarioTargetMet([leg({ door: "http" })], { kind: "door", door: "mcp" })).toBe(false);
    // Declared `ucp` on every leg above; a target must never read it.
    expect(scenarioTargetMet([leg()], { kind: "door", door: "ucp" })).toBe(false);
    expect(
      scenarioTargetMet([leg({ network: "eip155:137" })], { kind: "rail_other_than", network: "eip155:8453" }),
    ).toBe(true);
    expect(
      scenarioTargetMet([leg({ item: "a" }), leg({ item: "b" }), leg({ item: "c" })], { kind: "distinct_items", count: 3 }),
    ).toBe(true);
    expect(
      scenarioTargetMet(
        [leg({ created_at: "2026-09-19T00:00:00.000Z" }), leg({ created_at: "2026-09-19T05:00:00.000Z" })],
        { kind: "spread_hours", hours: 4 },
      ),
    ).toBe(true);
    // An unsettled leg alone is not the abandonment study; it needs a real one beside it.
    expect(scenarioTargetMet([leg({ settled: false })], { kind: "unsettled_leg" })).toBe(false);
    expect(scenarioTargetMet([leg(), leg({ settled: false })], { kind: "unsettled_leg" })).toBe(true);
  });

  it("goes live and comes down from the keeper's hand alone", async () => {
    await openScenario(testEnv, "mcp_only");
    expect((await liveScenarios(testEnv)).some((row) => row.scenario.id === "mcp_only")).toBe(true);
    const shelf = await scenarioShelf(testEnv);
    expect(shelf.length).toBe(STUDY_SCENARIOS.length);
    expect(shelf.find((row) => row.scenario.id === "mcp_only")?.live).toBe(true);
    await closeScenario(testEnv, "mcp_only");
    expect((await liveScenarios(testEnv)).some((row) => row.scenario.id === "mcp_only")).toBe(false);
  });

  it("refuses to open a scenario that is not written", async () => {
    await expect(openScenario(testEnv, "not_a_scenario")).rejects.toThrow(/no scenario is called/);
  });

  it("refuses an enrolment naming a scenario that is not live", async () => {
    await closeScenario(testEnv, "off_base");
    await expect(
      enrolStudy(
        testEnv,
        { ...ROSTER, payout_to: "0xaaac111111111111111111111111111111111111", scenario: "off_base" },
        await options(),
      ),
    ).rejects.toThrow(/not a scenario that is live/);
  });

  it("pays the bonus when our books show the target, and asks the scenario's own questions", async () => {
    const now = new Date();
    await openScenario(testEnv, "mcp_only", now);
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaad111111111111111111111111111111111111", scenario: "mcp_only" },
      await options(now),
    );
    const leg = await seedPurchase({
      id: hex("c1"), token: hex("d1"), door: "mcp", network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    const scenario = scenarioById("mcp_only")!;
    // Missing the scenario's own question is refused by name, and pays nothing.
    await expect(
      debriefStudy(
        testEnv,
        { study_id, study_token, legs: [{ ...leg, surface: "mcp" }], answers: ANSWERS },
        await options(now),
      ),
    ).rejects.toThrow(new RegExp(scenario.asks[0]!.field));

    const result = await debriefStudy(
      testEnv,
      {
        study_id, study_token,
        legs: [{ ...leg, surface: "mcp" }],
        answers: ANSWERS,
        scenario_answers: Object.fromEntries(
          scenario.asks.map((ask) => [ask.field, `an answer for ${ask.field}`]),
        ),
      },
      await options(now),
    );
    expect(result.scenario?.id).toBe("mcp_only");
    expect(result.scenario?.target_met).toBe(true);
    expect(result.scenario?.bonus_usd).toBe(scenario.bonus_usd);
    expect(
      result.reward_usd,
      "the bonus rides ON TOP of the ordinary ladder",
    ).toBe(STUDY_BASE_REWARD_USD + STUDY_LEG_REWARD_USD + scenario.bonus_usd);
    await closeScenario(testEnv, "mcp_only");
  });

  it("pays the ordinary reward untouched when the target is missed", async () => {
    const now = new Date();
    await openScenario(testEnv, "off_base", now);
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaae111111111111111111111111111111111111", scenario: "off_base" },
      await options(now),
    );
    // Settled on Base — precisely what this scenario asked them not to do.
    const leg = await seedPurchase({
      id: hex("c2"), token: hex("d2"), door: "http", network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    const scenario = scenarioById("off_base")!;
    const result = await debriefStudy(
      testEnv,
      {
        study_id, study_token,
        legs: [{ ...leg, surface: "x402_http" }],
        answers: ANSWERS,
        scenario_answers: Object.fromEntries(
          scenario.asks.map((ask) => [ask.field, `an answer for ${ask.field}`]),
        ),
      },
      await options(now),
    );
    expect(result.scenario?.target_met).toBe(false);
    expect(result.scenario?.bonus_usd).toBe(0);
    expect(
      result.reward_usd,
      "a missed target is not a penalty",
    ).toBe(STUDY_BASE_REWARD_USD + STUDY_LEG_REWARD_USD);
    expect(String(result.scenario?.how)).toMatch(/Nothing is deducted/);
    await closeScenario(testEnv, "off_base");
  });

  /**
   * SOMEBODY IS OUT THERE SPENDING THEIR OWN MONEY on the strength of
   * a listing we published. Taking it down must stop new enrolments
   * and never cancel a walk in flight.
   */
  it("lets a study already enrolled debrief after its scenario is taken down", async () => {
    const now = new Date();
    await openScenario(testEnv, "three_items", now);
    const { study_id, study_token } = await enrolStudy(
      testEnv,
      { ...ROSTER, payout_to: "0xaaaf111111111111111111111111111111111111", scenario: "three_items" },
      await options(now),
    );
    await closeScenario(testEnv, "three_items");
    const leg = await seedPurchase({
      id: hex("c3"), token: hex("d3"), door: "http", network: "eip155:8453",
      createdAt: new Date(now.getTime() + 1000).toISOString(),
    });
    const scenario = scenarioById("three_items")!;
    const result = await debriefStudy(
      testEnv,
      {
        study_id, study_token,
        legs: [{ ...leg, surface: "x402_http" }],
        answers: ANSWERS,
        scenario_answers: Object.fromEntries(
          scenario.asks.map((ask) => [ask.field, `an answer for ${ask.field}`]),
        ),
      },
      await options(now),
    );
    expect(result.scenario?.id).toBe("three_items");
    expect(result.reward_usd).toBeGreaterThan(0);
  });

  it("puts the whole shelf live from one button, and takes it down again", async () => {
    const AUTH = {
      Authorization: `Basic ${btoa(`keeper:${(testEnv as unknown as { ADMIN_PASSWORD: string }).ADMIN_PASSWORD}`)}`,
      "Content-Type": "application/json",
    };
    const open = await SELF.fetch(`${BASE}/admin/field-study/scenarios`, {
      method: "POST", headers: AUTH, body: JSON.stringify({ action: "open_all" }),
    });
    expect(open.status).toBe(200);
    expect((await liveScenarios(testEnv)).length).toBe(STUDY_SCENARIOS.length);

    const room = await (
      await SELF.fetch(`${BASE}/api/field-study`, { headers: { Accept: "application/json" } })
    ).json() as { scenarios: { id: string; bonus_usd: number; bonus_pays_when: string | null; no_bonus_because: string | null }[] };
    expect(room.scenarios.length).toBe(STUDY_SCENARIOS.length);
    for (const published of room.scenarios) {
      // The promise the shelf makes, kept on the public surface too.
      if (published.bonus_usd === 0) expect(published.no_bonus_because).toBeTruthy();
      else expect(published.bonus_pays_when).toBeTruthy();
    }

    const close = await SELF.fetch(`${BASE}/admin/field-study/scenarios`, {
      method: "POST", headers: AUTH, body: JSON.stringify({ action: "close_all" }),
    });
    expect(close.status).toBe(200);
    expect((await liveScenarios(testEnv)).length).toBe(0);
  });
});
