import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { markKeeperSeen } from "@/services/shutter";
import { MENU_ITEMS, getMenuItem } from "@/store";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  ADVISORY_NAMES,
  BATTERY_CHANGELOG,
  runChecks,
  schemaProblems,
} from "@/services/preflight";
import {
  DEFECT_VOCABULARY_VERSION,
  VOCABULARY_CHANGELOG,
  defectClass,
} from "@/store/defect-vocabulary";
import { buyDiscoveryExtensions } from "@/lib/bazaar-discovery";

/**
 * S8 TIER A (2026-09-02): the door disagreeing with itself inside the
 * one 402 the battery already holds. Three advisories over bytes every
 * probe had, none folded into a verdict — the keeper's ruling is that
 * the fold waits on a month of rows. What this file holds:
 *
 *   - each advisory fires on a door that contradicts itself and stays
 *     silent on one that does not, including our own bazaar block;
 *   - the practice door two-surfaces serves the lesson live;
 *   - the vocabulary carries the two classes under a dated v8 row,
 *     each pointing at the advisory that reports it;
 *   - the battery changelog carries the date.
 */

const BASE = "https://scvd.store";

beforeAll(installFacilitatorMock);

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x0000000000000000000000000000000000000001";

function b64url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jws(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: "EdDSA", kid: "did:web:door.example#key-1" }))}.${b64url(JSON.stringify(payload))}.${b64url("signature-bytes")}`;
}

function accept(amount = "1000", payTo = PAY_TO): Record<string, unknown> {
  return { scheme: "exact", network: "eip155:8453", asset: USDC, payTo, amount };
}

function challenge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { x402Version: 2, accepts: [accept()], ...overrides };
}

function door(header: Record<string, unknown>, body?: Record<string, unknown>) {
  const bodyText = JSON.stringify(body ?? header);
  const response = new Response(bodyText, {
    status: 402,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(header)) },
  });
  return runChecks(response, false, bodyText, "https://door.example/api/thing");
}

function advisory(report: ReturnType<typeof runChecks>, name: string) {
  return report.advisories.find((entry) => entry.name === name);
}

describe("the three readings are registered, advisory-side, dated", () => {
  it("names them in the advisory registry and nowhere in a verdict", () => {
    for (const name of [
      "discovery-info-fails-schema",
      "resource-description-absent",
      "offer-contradicts-challenge",
    ]) {
      expect(ADVISORY_NAMES).toContain(name);
    }
  });

  it("carries a dated changelog row naming all three", () => {
    const row = BATTERY_CHANGELOG.find((entry) => entry.date === "2026-09-02");
    expect(row?.battery).toBe("v2");
    expect(row?.change).toContain("discovery-info-fails-schema");
    expect(row?.change).toContain("offer-contradicts-challenge");
    expect(row?.change).toContain("resource-description-absent");
    expect(row?.change).toContain("No verdict moved");
  });
});

describe("discovery-info-fails-schema: the block against its own schema", () => {
  it("stays silent on every one of this store's own doors, read from the served 402", async () => {
    // Our own doors first (the design's rule), and read the way a
    // buyer reads them: the served 402, after the SDK enriches the
    // declaration with the live method. The raw declaration alone
    // omits method and fails the helper's own schema, which is a
    // fact about the helper, not the door — this test learned that
    // the hard way on its first run.
    await markKeeperSeen(env as unknown as Env);
    const silent = ["discovery-info-fails-schema", "resource-description-absent", "offer-contradicts-challenge"];
    for (const item of MENU_ITEMS) {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      expect(response.status, `${item.id} did not answer 402`).toBe(402);
      const body = await response.text();
      const report = runChecks(
        new Response(body, { status: 402, headers: { "PAYMENT-REQUIRED": response.headers.get("PAYMENT-REQUIRED")! } }),
        false,
        body,
        `${BASE}/api/buy/${item.id}`,
      );
      for (const name of silent) {
        expect(advisory(report, name), `${item.id}: ${advisory(report, name)?.detail ?? ""}`).toBeUndefined();
      }
    }
  });

  it("names the path when a required input is missing and a const is wrong", () => {
    const own = buyDiscoveryExtensions(getMenuItem("service_audit")!) as unknown as Record<string, { info: Record<string, unknown>; schema: Record<string, unknown> }>;
    const bazaar = own["bazaar"]!;
    const broken = {
      bazaar: {
        schema: bazaar.schema,
        info: {
          ...bazaar.info,
          input: { type: "grpc", method: "GET", queryParams: { agent_name: "x" } },
        },
      },
    };
    const report = door(challenge({ resource: { url: "https://door.example/api/thing", description: "a thing" }, extensions: broken }));
    const found = advisory(report, "discovery-info-fails-schema");
    expect(found).toBeDefined();
    expect(found!.detail).toContain("info.input.type");
    expect(found!.detail).toContain("info.input.queryParams.url is required");
    expect(found!.detail).toContain("Not checked: formats");
  });

  it("the bounded reader says what it checks, in its own words", () => {
    const problems = schemaProblems(
      { a: "x", b: 2, c: ["y", 3] },
      {
        type: "object",
        required: ["a", "d"],
        additionalProperties: false,
        properties: {
          a: { type: "string", enum: ["y"] },
          b: { type: "integer", const: 3 },
          c: { type: "array", items: { type: "string" } },
        },
      },
      "info",
    );
    expect(problems).toEqual([
      "info.d is required by the schema and absent",
      "info.a is \"x\", not one of the schema's 1 allowed values",
      "info.b is 2, schema fixes it to 3",
      "info.c[1] is number, schema says string",
    ]);
  });
});

describe("resource-description-absent: the field the catalog indexes", () => {
  it("fires beside a bazaar block when resource carries no description, and only then", () => {
    const own = buyDiscoveryExtensions(getMenuItem("service_audit")!);
    const bare = door(challenge({ resource: { url: "https://door.example/api/thing" }, extensions: own }));
    expect(advisory(bare, "resource-description-absent")?.detail).toContain("Inference labelled as such");
    const noBlock = door(challenge({ resource: { url: "https://door.example/api/thing" } }));
    expect(advisory(noBlock, "resource-description-absent")).toBeUndefined();
  });
});

describe("offer-contradicts-challenge: the offer against the challenge it rides", () => {
  const offerFor = (payload: Record<string, unknown>) => ({
    "offer-receipt": { info: { offers: [{ signature: jws(payload) }] } },
  });
  const commit = (amount: string, payTo = PAY_TO) => ({
    version: 1,
    resourceUrl: "https://door.example/api/thing",
    scheme: "exact",
    network: "eip155:8453",
    asset: USDC,
    payTo,
    amount,
  });

  it("stays silent when the offer commits to the accepts entry exactly", () => {
    const report = door(challenge({ extensions: offerFor(commit("1000")) }));
    expect(report.checks.find((c) => c.name === "signed-offers")?.ok).toBe(true);
    expect(advisory(report, "offer-contradicts-challenge")).toBeUndefined();
  });

  it("stays silent on pay-what-it-deserves: three tiers on one rail, one offer per tier", () => {
    const tiers = ["1000", "2000", "5000"];
    const report = door(
      challenge({
        accepts: tiers.map((amount) => accept(amount)),
        extensions: { "offer-receipt": { info: { offers: tiers.map((amount) => ({ signature: jws(commit(amount)) })) } } },
      }),
    );
    expect(advisory(report, "offer-contradicts-challenge")).toBeUndefined();
    expect(advisory(report, "conflicting-amounts")).toBeDefined();
  });

  it("names the amount when the signed price is not the challenge's price", () => {
    const report = door(challenge({ extensions: offerFor(commit("2000")) }));
    const found = advisory(report, "offer-contradicts-challenge");
    expect(found?.detail).toContain("amount 2000 where the challenge offers 1000");
    expect(found?.detail).toContain("1 of 1 signed offers");
  });

  it("names the payTo, and a rail the challenge never offered", () => {
    const moved = door(challenge({ extensions: offerFor(commit("1000", "0x0000000000000000000000000000000000000002")) }));
    expect(advisory(moved, "offer-contradicts-challenge")?.detail).toContain("payTo 0x0000000000000000000000000000000000000002 where the challenge names");
    const otherRail = door(
      challenge({ extensions: offerFor({ ...commit("1000"), network: "eip155:137" }) }),
    );
    expect(advisory(otherRail, "offer-contradicts-challenge")?.detail).toContain("an asset the accepts never offer");
  });
});

describe("placement-mismatch names the fields that moved", () => {
  it("says which rail and field differ between header and body", () => {
    const report = door(challenge(), { x402Version: 2, accepts: [accept("2000")] });
    const found = advisory(report, "placement-mismatch");
    expect(found?.detail).toContain("amount on eip155:8453: header 1000, body 2000");
    expect(found?.detail).toContain("canonical placement");
  });
});

describe("the practice door two-surfaces", () => {
  it("serves one price in the header and another in the body, and the battery names it", async () => {
    const response = await SELF.fetch(`${BASE}/api/practice/two-surfaces`);
    expect(response.status).toBe(402);
    const body = await response.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed["preflight_names_this"]).toBe("placement-mismatch");
    const report = runChecks(
      new Response(body, { status: 402, headers: { "PAYMENT-REQUIRED": response.headers.get("PAYMENT-REQUIRED")! } }),
      false,
      body,
      `${BASE}/api/practice/two-surfaces`,
    );
    expect(advisory(report, "placement-mismatch")?.detail).toContain("header 1000, body 2000");
  });

  it("is on the course's index", async () => {
    const index = (await (await SELF.fetch(`${BASE}/api/practice`)).json()) as { scenarios: { id: string }[] };
    expect(index.scenarios.map((s) => s.id)).toContain("two-surfaces");
  });
});

describe("the vocabulary carries the two classes under v8", () => {
  it("bumps the version with a dated row that names both classes and the tiers not yet named", () => {
    expect(DEFECT_VOCABULARY_VERSION).toBe("8");
    const row = VOCABULARY_CHANGELOG.find((entry) => entry.version === "8");
    expect(row?.date).toBe("2026-09-02");
    expect(row?.what_changed).toContain("discovery-info-invalid");
    expect(row?.what_changed).toContain("offer-contradicts-challenge");
    expect(row?.what_changed).toContain("not classes yet");
  });

  it("each class points at the advisory that reports it, unpaid-detectable", () => {
    for (const [id, signal] of [
      ["discovery-info-invalid", "discovery-info-fails-schema"],
      ["offer-contradicts-challenge", "offer-contradicts-challenge"],
    ] as const) {
      const entry = defectClass(id);
      expect(entry?.detectable).toBe("unpaid");
      expect(entry?.our_signal).toContain(signal);
      expect((ADVISORY_NAMES as readonly string[]).includes(signal)).toBe(true);
      expect(entry?.registered).toBe("2026-09-02");
    }
  });
});
