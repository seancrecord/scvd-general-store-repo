import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { LOOK_HOLD_SECONDS, NOT_A_SCORE, heldHalfOf, lookAtDoor, nowAgainstHeld } from "@/services/look";
import { webmcpUnhandledTools } from "@/routes/webmcp";
import { FREE_INSTRUMENTS } from "@/lib/when-to-buy";
import { FREE_DOORS } from "@/store/atlas";
import { API_VERSIONS } from "@/store/api-lifecycle";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE LOOK (roadmap L6, 2026-09-02): "what do you hold about this
 * door?" in one free call. What this file holds:
 *
 *   - every refusal is the preflight's refusal, inherited not agreed
 *     with: http, a custom port, our own hostname;
 *   - one probe, exactly, and the same battery the free preflight
 *     serves, carried whole;
 *   - a host the chain never met comes back never met, with no tier
 *     read from nothing and no comparison invented;
 *   - a host the chain has met carries counts with their denominators,
 *     the tier line with its fraction and rows, the last probed round,
 *     the passport decision, and same / changed against the live answer;
 *   - the held half is held: a second look inside the hold does not
 *     refold the chain;
 *   - never a score: no key on the artifact reads as one;
 *   - the door is on every surface a free door lives on: the MCP
 *     catalogue with the browser handler, the atlas, the routing table,
 *     how-it-works, the lifecycle table, the guide.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const DOOR = "https://looked.example/api/buy/thing";

beforeAll(installFacilitatorMock);
afterEach(async () => {
  vi.unstubAllGlobals();
  // The held half is held under the host's name for LOOK_HOLD_SECONDS;
  // between tests the hold is forgotten so each seeds its own chain.
  await testEnv.COUNTERS.delete(KV_KEYS.look("looked.example"));
  // And the seeded chain: KV persists across the tests in one file,
  // and a round seeded for one test would read as history in the next.
  const seeded = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  for (const key of seeded.keys) await testEnv.COUNTERS.delete(key.name);
});

function ready402(): Response {
  return new Response("{}", {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": btoa(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:8453",
              amount: "10000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0x1111111111111111111111111111111111111111",
            },
          ],
        }),
      ),
    },
  });
}

/** Stub the world by parsed host: the door answers; everything else is unexpected. */
function stubDoor(answer: () => Response): { probes: () => number } {
  let probes = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (new URL(url).host === "looked.example") {
      probes += 1;
      return answer();
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return { probes: () => probes };
}

/** One signed round in the chain, the shape test/passport.spec.ts seeds. */
async function seedRound(hosts: { host: string; verdict: string; failed?: string[] }[], sequence = 1, week = "2026-W34"): Promise<void> {
  const takenAt = `2026-08-${String(18 + sequence).padStart(2, "0")}T17:00:00.000Z`;
  const snapshot = {
    version: 1,
    sequence,
    taken_at: takenAt,
    previous_digest: sequence === 1 ? null : "0".repeat(64),
    source: "ward_round",
    week,
    round: {
      week,
      at: takenAt,
      listed_resources: hosts.length,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: hosts.map((h) => ({
        host: h.host,
        url: `https://${h.host}/api/buy/thing`,
        verdict: h.verdict,
        failed: h.failed ?? [],
        advisories: [],
      })),
    },
  };
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}${String(sequence).padStart(9, "0")}`,
    JSON.stringify({ snapshot, digest: "0".repeat(64), signature: "0".repeat(128), public_key: "0".repeat(64) }),
  );
}

async function post(url: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const response = await SELF.fetch(`${BASE}/api/look/v1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe("every refusal is the preflight's refusal", () => {
  it("refuses http, a custom port, garbage, and our own hostname before any request leaves", async () => {
    let probes = 0;
    vi.stubGlobal("fetch", async () => {
      probes += 1;
      return ready402();
    });
    for (const bad of ["http://shop.example/x", "https://shop.example:8443/x", "not a url", `${BASE}/api/buy/hello`]) {
      const { status, body } = await post(bad);
      expect(status, bad).toBe(400);
      expect(body["error"], bad).toBeTruthy();
    }
    expect(probes).toBe(0);
  });

  it("a body that is not JSON is refused with the shape named", async () => {
    const response = await SELF.fetch(`${BASE}/api/look/v1`, { method: "POST", body: "url=x" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('{"url"');
  });
});

describe("a host the chain never met", () => {
  it("probes exactly once, carries the preflight whole, and invents nothing about history", async () => {
    const door = stubDoor(ready402);
    const { status, body } = await post(DOOR);
    expect(status).toBe(200);
    expect(door.probes(), "the single-probe promise is load-bearing").toBe(1);
    expect(body.now.verdict).toBe("ready");
    expect(body.now.battery).toBe("v2");
    expect(body.now.the_door.verdict).toBe("ready");
    expect(body.now.the_door.checks.length).toBeGreaterThan(3);
    expect(body.held.never_met).toBe(true);
    expect(body.held.rounds_probed).toBe(0);
    expect(body.held.last_probed_round).toBeNull();
    expect(body.held.passport.decision).toBe("INDETERMINATE");
    expect(body.now_against_held.line).toBe("no_prior");
    expect(body.headline).toContain("never met");
    expect(body.held.rows_url).toBe(`${BASE}/corpus/host/looked.example.json`);
    // The response carries the preflight's own budget headers.
  });

  it("names the tier as no rounds rather than reading one from nothing", async () => {
    stubDoor(ready402);
    const { body } = await post(DOOR);
    expect(body.held.tier.fraction.rounds).toBe(0);
    expect(body.held.tier.line).toBeTruthy();
    expect(body.held.tier.rows).toEqual([]);
  });
});

describe("a host the chain has met", () => {
  it("carries counts with denominators, the tier with its rows, the last round, and same against the live answer", async () => {
    await seedRound([{ host: "looked.example", verdict: "ready" }], 1, "2026-W34");
    await seedRound([{ host: "looked.example", verdict: "ready" }], 2, "2026-W35");
    stubDoor(ready402);
    const { status, body } = await post(DOOR);
    expect(status).toBe(200);
    expect(body.held.never_met).toBe(false);
    expect(body.held.rounds_probed).toBe(2);
    expect(body.held.rounds_since_first_sighting).toBeGreaterThanOrEqual(2);
    expect(body.held.tier.fraction.ready).toBe(2);
    expect(body.held.tier.fraction.rounds).toBe(2);
    expect(body.held.tier.line).toContain("2 of 2");
    expect(body.held.tier.rows.length).toBe(2);
    expect(body.held.last_probed_round.week).toBe("2026-W35");
    expect(body.held.last_probed_round.verdict).toBe("ready");
    expect(body.held.last_probed_round.entry_url).toBeTruthy();
    expect(body.now_against_held.line).toBe("same");
    expect(body.now_against_held.detail).toContain("2026-W35");
    expect(body.headline).toContain("2 probed rounds");
  });

  it("says changed, with both sides named, when the door answers differently now", async () => {
    await seedRound([{ host: "looked.example", verdict: "not_ready", failed: ["status-402"] }], 1, "2026-W35");
    stubDoor(ready402);
    const { body } = await post(DOOR);
    expect(body.held.last_probed_round.failed).toEqual(["status-402"]);
    expect(body.now_against_held.line).toBe("changed");
    expect(body.now_against_held.detail).toContain("ready now");
    expect(body.now_against_held.detail).toContain("not_ready");
    expect(body.now_against_held.detail).toContain("two moments and not a trend");
  });

  it("an unreachable live probe is not comparable, and is a fact about the path", async () => {
    await seedRound([{ host: "looked.example", verdict: "ready" }], 1, "2026-W35");
    stubDoor(() => {
      throw new TypeError("connection refused");
    });
    const { status, body } = await post(DOOR);
    expect(status).toBe(200);
    expect(body.now.verdict).toBe("unreachable");
    expect(body.now_against_held.line).toBe("not_comparable");
    expect(body.now_against_held.detail).toContain("not about the door");
  });

  it("holds the folded half so a second look inside the hold does not refold the chain", async () => {
    await seedRound([{ host: "looked.example", verdict: "ready" }], 1, "2026-W35");
    stubDoor(ready402);
    const first = await post(DOOR);
    expect(first.body.held.held_for_seconds).toBe(LOOK_HOLD_SECONDS);
    const stored = await testEnv.COUNTERS.get(KV_KEYS.look("looked.example"));
    expect(stored, "the held half was not written to its hold").toBeTruthy();
    // A round that lands during the hold is not seen until the hold lapses: that is the hold, stated on the artifact.
    await seedRound([{ host: "looked.example", verdict: "not_ready" }], 2, "2026-W36");
    const second = await post(DOOR);
    expect(second.body.held.derived_at).toBe(first.body.held.derived_at);
    expect(second.body.held.rounds_probed).toBe(1);
  });
});

describe("the pure half", () => {
  it("nowAgainstHeld names every line", async () => {
    const never = await heldHalfOf(testEnv, "nobody.example");
    expect(never.never_met).toBe(true);
    expect(nowAgainstHeld("ready", never).line).toBe("no_prior");
    const met = { ...never, never_met: false, last_probed_round: { week: "2026-W35", taken_at: "t", failed: [], advisories: [], entry_url: "u", verdict: "ready" as const } };
    expect(nowAgainstHeld("ready", met).line).toBe("same");
    expect(nowAgainstHeld("not_ready", met).line).toBe("changed");
    expect(nowAgainstHeld("unreachable", met).line).toBe("not_comparable");
  });

  it("the service's refusal passes the preflight's body through", async () => {
    const outcome = await lookAtDoor("http://plain.example/x", testEnv);
    expect(outcome.status).toBe(400);
    expect("error" in outcome.body).toBe(true);
  });
});

describe("never a score", () => {
  it("no key on the artifact reads as a score, rating, rank or ratio, and it says so", async () => {
    await seedRound([{ host: "looked.example", verdict: "ready" }], 1, "2026-W35");
    stubDoor(ready402);
    const { body } = await post(DOOR);
    const keys: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          keys.push(`${path}.${key}`);
          walk(value, `${path}.${key}`);
        }
      }
    };
    walk(body, "$");
    const offending = keys.filter((key) => /score|rating|\brank|ratio|percent|_pct\b/i.test(key.split(".").pop() ?? ""));
    expect(offending).toEqual([]);
    expect(body.what_this_is_not).toBe(NOT_A_SCORE);
    expect(body.counts_travel_with_denominators).toContain("no share or percentage");
  });
});

describe("the door is on every surface a free door lives on", () => {
  it("the GET is the document: free, the ladder priced from the shelf, what it cannot tell you", async () => {
    const doc = (await (await SELF.fetch(`${BASE}/api/look/v1`)).json()) as Record<string, any>;
    expect(doc.summary).toContain("Free");
    expect(doc.what_it_cannot_tell_you.join(" ")).toContain("Whether to pay");
    expect(doc.the_ladder.paid.map((rung: { id: string }) => rung.id)).toEqual(["service_audit", "passport_refresh"]);
    expect(doc.errors.length).toBeGreaterThan(1);
    expect(doc.security.what_this_does_in_your_name).toContain("outbound GET");
    expect(doc.why_it_is_not_a_score).toBe(NOT_A_SCORE);
  });

  it("is an MCP tool, read-only, under the contract, with a browser handler", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const tools = ((await response.json()) as { result: { tools: Record<string, any>[] } }).result.tools;
    const tool = tools.find((entry) => entry.name === "look_at_door")!;
    expect(tool).toBeTruthy();
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.reads).toBe("subject_fetch");
    expect(tool.security.what_this_does_in_your_name).toContain("outbound GET");
    expect(tool.errors.map((error: { code: string }) => error.code)).not.toContain("sold_out");
    expect(webmcpUnhandledTools()).toEqual([]);
  });

  it("answers over MCP with the same body the HTTP door serves", async () => {
    stubDoor(ready402);
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "look_at_door", arguments: { url: DOOR } },
      }),
    });
    const body = (await response.json()) as Record<string, any>;
    const structured = body.result.structuredContent ?? JSON.parse(body.result.content[0].text);
    expect(structured.now.verdict).toBe("ready");
    expect(structured.held.never_met).toBe(true);
  });

  it("is on the atlas, the routing table, how-it-works, the lifecycle table, and the guide", async () => {
    expect(FREE_DOORS.map((door) => door.path)).toContain("/api/look/v1");
    expect(FREE_INSTRUMENTS.find((one) => one.name === "The look")?.isTool).toBe(true);
    const how = (await (await SELF.fetch(`${BASE}/how-it-works.json`)).json()) as Record<string, any>;
    expect(JSON.stringify(how)).toContain("/api/look/v1");
    expect(API_VERSIONS.map((row) => row.path)).toContain("/api/look/v1");
    const guide = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(guide).toContain("/api/look/v1");
    expect(guide).toContain("look_at_door");
    const lifecycle = await SELF.fetch(`${BASE}/api/look/v1`);
    expect(lifecycle.headers.get("link") ?? "").toContain("service-doc");
  });
});
