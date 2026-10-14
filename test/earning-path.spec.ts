import { SELF, env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as bounties from "@/services/bounty-board";
import * as studies from "@/services/field-study";
import * as cards from "@/services/cards";
import { bountyRoutes } from "@/routes/bounties";
import { fieldStudyRoutes } from "@/routes/field-study";

interface ResponseBody {
  payout: unknown;
  spend_it_here: unknown;
  legs: unknown[];
  completion: { free_next_steps: { cost: string }[] };
  earning_answers: { id: string; question: string; answer: string }[];
  faq: { question: string; answer: string }[];
}

const BASE = "https://scvd.store";
const payout = {
  method: "eip3009_transfer_with_authorization",
  chain: "eip155:8453",
  authorization: { to: `0x${"44".repeat(20)}`, value: "170000", validBefore: "1800000000" },
  signature: "test-signature-never-a-live-payment",
  how_to_redeem: "Use the existing authorization before expiry.",
};
const evidence = { what_was_verified: "Observed settlement for this task.", what_was_not: "The submitted report remains the worker's claim." };

afterEach(() => vi.restoreAllMocks());

describe("optional contribution completion", () => {
  it("adds a bounded handoff to successful bounty responses without changing payment or reinterpreting evidence", async () => {
    // These service outputs isolate response decoration; the bounty suite exercises actual signing/replay.
    const result = { bounty_id: "bty_completion", reward_usd: 0.17, ...evidence, payout };
    vi.spyOn(bounties, "claimBounty").mockResolvedValue(result as Awaited<ReturnType<typeof bounties.claimBounty>>);
    vi.spyOn(cards, "earnedPressing").mockResolvedValue(null);
    vi.spyOn(cards, "clearConditions").mockResolvedValue([]);
    const call = async () => {
      const ctx = createExecutionContext();
      const response = await bountyRoutes.request(`${BASE}/api/bounty-claim`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bounty_id: result.bounty_id, observation: "PRIVATE OPERATOR TEXT" }),
      }, env, ctx);
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
      return response.json<ResponseBody>();
    };
    const first = await call();
    expect(first.payout).toEqual(payout);
    expect(first.spend_it_here).toBeDefined();
    expect(first.completion).toMatchObject({ optional: true, task_id: result.bounty_id, reward_usd: 0.17, reward_state: "authorized", redemption_state: "not_observed", ...evidence });
    expect(first.completion.free_next_steps).toHaveLength(2);
    expect(first.completion.free_next_steps.every((step: { cost: string }) => step.cost === "free")).toBe(true);
    expect(first.completion).not.toHaveProperty("signature");
    expect(JSON.stringify(first.completion)).not.toContain("PRIVATE OPERATOR TEXT");
    expect(JSON.stringify(first.completion)).not.toContain(payout.signature);
    expect((await call()).completion).toEqual(first.completion);
  });

  it("adds the same bounded summary to a study without copying private legs or answers", async () => {
    const result = { study_id: "sty_completion", reward_usd: 1.25, legs: [{ status_token: "PRIVATE TOKEN" }], ...evidence, payout };
    vi.spyOn(studies, "debriefStudy").mockResolvedValue(result as unknown as Awaited<ReturnType<typeof studies.debriefStudy>>);
    const ctx = createExecutionContext();
    const response = await fieldStudyRoutes.request(`${BASE}/api/study/debrief`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ study_id: result.study_id }),
    }, env, ctx);
    await waitOnExecutionContext(ctx);
    const body = await response.json<ResponseBody>();
    expect(response.status).toBe(200);
    expect(body.payout).toEqual(payout);
    expect(body.legs).toEqual(result.legs);
    expect(body.completion).toMatchObject({ optional: true, task_id: result.study_id, reward_usd: result.reward_usd, ...evidence });
    expect(JSON.stringify(body.completion)).not.toContain("PRIVATE TOKEN");
    expect(body.completion.free_next_steps).toHaveLength(2);
  });

  it.each(["/api/bounty-claim", "/api/study/debrief"])("does not add a handoff to a refused %s", async (path) => {
    const response = await SELF.fetch(`${BASE}${path}`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty("completion");
  });
});

describe("earning answers on existing surfaces", () => {
  it.each([["/bounties", "/api/bounties"], ["/field-study", "/api/field-study"]])("keeps %s readable answers alongside its machine contract", async (room, api) => {
    const data = await (await SELF.fetch(`${BASE}${api}`)).json<ResponseBody>();
    expect(data.earning_answers).toHaveLength(3);
    const html = await (await SELF.fetch(`${BASE}${room}`, { headers: { Accept: "text/html" } })).text();
    const json = await (await SELF.fetch(`${BASE}${room}`, { headers: { Accept: "application/json" } })).json<ResponseBody>();
    expect(json.earning_answers).toEqual(data.earning_answers);
    for (const answer of data.earning_answers) expect(html).toContain(answer.question);
    const capital = data.earning_answers.find((answer: { id: string }) => answer.id === "upfront");
    expect(capital!.answer).toContain("settled purchase");
    expect(capital!.answer).toContain("redemption");
  });

  it("answers expense tracking and free checks consistently in the FAQ and full guide", async () => {
    const data = await (await SELF.fetch(`${BASE}/what`, { headers: { Accept: "application/json" } })).json<ResponseBody>();
    const guide = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    for (const phrase of ["track my software expenses", "check an endpoint before paying", "check the signed receipts"]) {
      const answer = data.faq.find((entry: { question: string }) => entry.question.includes(phrase));
      expect(answer, phrase).toBeDefined();
      expect(guide).toContain(answer!.answer);
    }
  });

  it("does not represent the required purchase as zero cost in bounty structured data", async () => {
    const html = await (await SELF.fetch(`${BASE}/bounties`, { headers: { Accept: "text/html" } })).text();
    const nodes = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]!));
    const how = nodes.find((node) => node["@type"] === "HowTo");
    expect(how).toBeDefined();
    expect(how.estimatedCost?.value).not.toBe(0);
    expect(how.description).toContain("own wallet");
  });
});
