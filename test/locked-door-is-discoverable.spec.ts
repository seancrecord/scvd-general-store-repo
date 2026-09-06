import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buyInputSchema, requiredInputsExtension } from "@/lib/bazaar-discovery";
import { MENU_ITEMS, getMenuItem } from "@/store";

/**
 * THE LOCKED DOOR, 2026-09-06.
 *
 * Seventeen doors cannot be served without an input the buyer brings.
 * The funnel read them as window-shopping — asks with no wallet ever
 * opened — and the declines that DID arrive were signed requests
 * refused before the gate for the missing input, which is a buyer who
 * tried and could not learn how.
 *
 * The requirement was published in exactly one place a machine could
 * reach: extensions.bazaar.schema.properties.input.properties
 * .queryParams.required, four levels inside a vendor namespace, next
 * to an EXAMPLE of the same parameter. The catalog every planning
 * agent reads had it nowhere, and the refusal said `bad_request` and
 * a sentence.
 *
 * Three moments, three fixes, one schema behind all of them:
 *   PLAN     — /menu.json carries required_params per item.
 *   PRICE    — the challenge carries a shallow "required-inputs".
 *   RECOVER  — the refusal names what is missing and how to retry.
 */

const BASE = "https://scvd.store";
/** As a buying client arrives: a user-agent and a preference for JSON, never the browser paywall. */
const AS_AGENT = { "User-Agent": "locked-door-spec/1.0", Accept: "application/json" };

// The priced doors reach the facilitator to build a challenge; without
// the mock they answer 500 and this file would test nothing.
beforeAll(() => {
  installFacilitatorMock();
});

/** Every item whose door needs something the buyer supplies. */
const GATED = MENU_ITEMS.filter(
  (item) => (buyInputSchema(item).required ?? []).filter((n) => n !== "agent_name").length > 0,
);

describe("the requirement is in the catalog a planner reads", () => {
  it("names an item that needs an input, so this test cannot pass vacuously", () => {
    expect(GATED.length).toBeGreaterThan(0);
    expect(GATED.map((i) => i.id)).toContain("settlement_attestation");
  });

  it("puts required_params on every gated item in /menu.json", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`, { headers: AS_AGENT })).json()) as {
      items: Array<{ id: string; required_params?: string[]; required_params_note?: string }>;
    };
    const byId = new Map(menu.items.map((i) => [i.id, i]));
    for (const item of GATED) {
      const listed = byId.get(item.id);
      const required = (buyInputSchema(item).required ?? []).filter((n) => n !== "agent_name");
      expect(listed?.required_params, `${item.id} listed without its required inputs`).toEqual(required);
      expect(listed?.required_params_note).toContain(required[0]!);
    }
  });

  it("leaves an ungated item alone rather than writing an empty list", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`, { headers: AS_AGENT })).json()) as {
      items: Array<{ id: string; required_params?: string[] }>;
    };
    const blessing = menu.items.find((i) => i.id === "small_blessing");
    expect(blessing).toBeDefined();
    /*
     * CHANGED 2026-09-06 with the merge that brought buyerLinks in:
     * an ungated item now carries required_params as an EMPTY ARRAY
     * rather than omitting the key, so a machine reads one key of one
     * type across the whole shelf. What must stay absent is the
     * SENTENCE — prose telling a buyer to supply something on a door
     * that asks for nothing is the actual harm this test was written
     * to catch.
     */
    expect(blessing?.required_params, "an ungated item should read as needing nothing, not as unknown").toEqual([]);
    expect(
      (blessing as Record<string, unknown>)["required_params_note"],
      "a door that needs nothing is telling buyers to supply something",
    ).toBeUndefined();
  });
});

describe("the requirement is in the challenge, one level deep", () => {
  it("declares required-inputs beside the schema that buried it", () => {
    const ext = requiredInputsExtension(getMenuItem("settlement_attestation")!, BASE) as unknown as {
      "required-inputs": { queryParams: string[]; note: string; retry_url_template: string };
    };
    const declared = ext["required-inputs"];
    expect(declared.queryParams).toEqual(["tx_hash"]);
    expect(declared.retry_url_template).toBe(`${BASE}/api/buy/settlement_attestation?tx_hash=<tx_hash>`);
    // The point of the fix: reachable without descending a schema.
    expect(Object.keys(declared)).toContain("queryParams");
  });

  it("cannot drift from the schema, because both read buyInputSchema", () => {
    for (const item of GATED) {
      const required = (buyInputSchema(item).required ?? []).filter((n) => n !== "agent_name");
      const ext = requiredInputsExtension(item, BASE) as unknown as Record<string, { queryParams: string[] }>;
      expect(ext["required-inputs"]?.queryParams, item.id).toEqual(required);
    }
  });

  it("says nothing at all for a door that needs nothing", () => {
    expect(requiredInputsExtension(getMenuItem("small_blessing")!, BASE)).toEqual({});
  });

  it("is actually served on the live 402, not just constructible", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/settlement_attestation`, { headers: AS_AGENT });
    expect(response.status).toBe(402);
    const header = response.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const challenge = JSON.parse(atob(header!)) as { extensions: Record<string, unknown> };
    expect(Object.keys(challenge.extensions)).toContain("required-inputs");
    expect(JSON.stringify(challenge.extensions["required-inputs"])).toContain("tx_hash");
  });
});

describe("the refusal names the cure, not only the class", () => {
  /*
   * REWRITTEN 2026-09-06, AFTER A MERGE. This file first asserted
   * against requiredInputFacts(), a helper written here for the
   * RECOVER moment. Main had meanwhile landed buyerInputRepair(),
   * which answers the same question with more in it — a per-field
   * issues[] naming required vs invalid and where it belongs, an
   * input contract URL for the one item, and the sentence that says
   * no charge was taken. The helper this file was built on is gone,
   * and asserting on a function nothing calls would have been a
   * passing test guarding nothing.
   *
   * So these go through the DOOR. A signature the facilitator will
   * never honour is enough: the input check runs before the payment
   * gate, which is the whole point of the design — the buyer is told
   * what it needs while its money is still its own.
   */
  const SIGNED = { ...AS_AGENT, "PAYMENT-SIGNATURE": "not-a-real-signature" };

  async function refusalFor(path: string) {
    const response = await SELF.fetch(`${BASE}${path}`, { headers: SIGNED });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it("lists what is required and which field failed, before taking money", async () => {
    const { status, body } = await refusalFor("/api/buy/settlement_attestation");
    expect(status).toBe(400);
    expect(body["required_params"]).toEqual(["tx_hash"]);
    expect(String(body["input_contract_url"])).toContain("/menu/settlement_attestation");
    expect(body["issues"]).toEqual([{ field: "tx_hash", code: "required", location: "query" }]);
    expect(String(body["next_action"]).toLowerCase()).toContain("no charge");
  });

  it("stops naming a field the caller did get right", async () => {
    const { body } = await refusalFor("/api/buy/settlement_attestation?tx_hash=0xabc");
    const issues = (body["issues"] ?? []) as { field: string; code: string }[];
    expect(
      issues.filter((issue) => issue.field === "tx_hash" && issue.code === "required"),
      "the door still calls a supplied input missing",
    ).toEqual([]);
  });

  it("adds no input repair to a door that requires nothing", async () => {
    const { body } = await refusalFor("/api/buy/small_blessing");
    expect(body["required_params"], "a door needing no input still advertises inputs").toBeUndefined();
    expect(body["issues"]).toBeUndefined();
  });
});
