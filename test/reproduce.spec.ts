import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { RESULT_CLASS_RULE, liveBatteryId, reproduceAgainst } from "@/services/reproduce";
import { citeRow } from "@/services/cite";
import { MISUSE_CLAUSE, TWO_SEATS_SENTENCE } from "@/store/copy/doctrine";
import type { SubjectRound } from "@/services/subject-history";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * REPRODUCE, AS ONE CALL (2026-09-04). What this file holds:
 *
 *   - the class of result is a pure function of the two probes and
 *     the battery: a door that moved, a battery that moved, one that
 *     did neither, a path that did not reach, a week not held;
 *   - the look carries the block, reads a named week with `since`,
 *     refuses a week not spelled the corpus's way, and cites the row;
 *   - the cite shape is one shape on every row surface, and the
 *     digest in it is the row's own;
 *   - the seats are declared where a crawler reads them.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const DOOR = "https://looked.example/api/buy/thing";

beforeAll(installFacilitatorMock);
afterEach(async () => {
  vi.unstubAllGlobals();
  await testEnv.COUNTERS.delete(KV_KEYS.look("looked.example"));
  const seeded = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  for (const key of seeded.keys) await testEnv.COUNTERS.delete(key.name);
  const held = await testEnv.COUNTERS.list({ prefix: KV_KEYS.archiveDepthPrefix });
  for (const key of held.keys) await testEnv.COUNTERS.delete(key.name);
});

function round(week: string, sequence: number, extra: Partial<SubjectRound> = {}): SubjectRound {
  return {
    sequence,
    week,
    taken_at: `2026-08-${String(18 + sequence).padStart(2, "0")}T17:00:00.000Z`,
    digest: String(sequence).repeat(64).slice(0, 64),
    entry_url: `${BASE}/corpus/${sequence}.json`,
    listed: true,
    probed: true,
    coverage_suspect: false,
    url: DOOR,
    verdict: "ready",
    failed: [],
    advisories: [],
    ...extra,
  } as SubjectRound;
}

describe("the class of result, typed once", () => {
  const live = { verdict: "ready", failed: [] as string[], battery: "v2" };

  it("names the five classes on /criteria and nowhere else typed", () => {
    expect(RESULT_CLASS_RULE.map((entry) => entry.class)).toEqual(["same", "moved", "instrument_moved", "not_comparable", "no_such_round"]);
    expect(liveBatteryId("v2")).toBe("preflight-v2");
    expect(liveBatteryId("preflight-v2")).toBe("preflight-v2");
  });

  it("same: equal verdict, equal failed set, same battery", () => {
    const out = reproduceAgainst(BASE, "looked.example", { timeline: [round("2026-W34", 1, { battery: "preflight-v2" })] }, live);
    expect(out.class).toBe("same");
    expect(out.verdict_same).toBe(true);
    expect(out.battery_same).toBe(true);
    expect(out.battery_recorded).toBe(true);
    expect(out.compared_with?.week).toBe("2026-W34");
    expect(out.cite?.json.cites).toBe(`${BASE}/corpus/1.json`);
    expect(out.cite?.json.digest).toBe("1".repeat(64));
  });

  it("moved: the door changed under the same battery, the added and cleared checks named", () => {
    const out = reproduceAgainst(
      BASE,
      "looked.example",
      { timeline: [round("2026-W34", 1, { verdict: "not_ready", failed: ["signable-accepts"], battery: "preflight-v2" })] },
      { verdict: "ready", failed: [], battery: "v2" },
    );
    expect(out.class).toBe("moved");
    expect(out.failed_cleared).toEqual(["signable-accepts"]);
    expect(out.failed_added).toEqual([]);
    expect(out.detail).toContain("Two moments, not a trend");
  });

  it("instrument_moved: a different battery says the instrument first, and still prints both sides", () => {
    const out = reproduceAgainst(
      BASE,
      "looked.example",
      { timeline: [round("2026-W34", 1, { battery: "preflight-v1" })] },
      { verdict: "not_ready", failed: ["transfer-method-signable"], battery: "v2" },
    );
    expect(out.class).toBe("instrument_moved");
    expect(out.battery_same).toBe(false);
    expect(out.failed_added).toEqual(["transfer-method-signable"]);
    expect(out.detail).toContain("instrument moved first");
  });

  it("a row without a recorded battery is compared under the live one and says so", () => {
    const out = reproduceAgainst(BASE, "looked.example", { timeline: [round("2026-W34", 1)] }, live);
    expect(out.class).toBe("same");
    expect(out.battery_recorded).toBe(false);
    expect(out.detail).toContain("did not record its battery");
  });

  it("not_comparable: the live probe did not reach, or the row was a gap", () => {
    const unreachable = reproduceAgainst(BASE, "looked.example", { timeline: [round("2026-W34", 1)] }, { ...live, verdict: "unreachable" });
    expect(unreachable.class).toBe("not_comparable");
    expect(unreachable.detail).toContain("path from here");
    const gap = reproduceAgainst(
      BASE,
      "looked.example",
      { timeline: [round("2026-W34", 1, { probed: false, verdict: undefined, gap: "listed_not_walked" } as Partial<SubjectRound>)] },
      live,
      "2026-W34",
    );
    expect(gap.class).toBe("not_comparable");
    expect(gap.detail).toContain("our coverage");
  });

  it("no_such_round: a week the chain does not hold for this host, with the weeks it does", () => {
    const out = reproduceAgainst(BASE, "looked.example", { timeline: [round("2026-W34", 1), round("2026-W35", 2)] }, live, "2026-W36");
    expect(out.class).toBe("no_such_round");
    expect(out.known_weeks).toEqual(["2026-W34", "2026-W35"]);
    expect(out.compared_with).toBeNull();
    const never = reproduceAgainst(BASE, "looked.example", { timeline: [] }, live);
    expect(never.class).toBe("no_such_round");
  });

  it("picks the last probed row by default and the named week with since", () => {
    const timeline = [round("2026-W34", 1, { verdict: "not_ready", failed: ["x"] }), round("2026-W35", 2)];
    expect(reproduceAgainst(BASE, "looked.example", { timeline }, live).compared_with?.week).toBe("2026-W35");
    expect(reproduceAgainst(BASE, "looked.example", { timeline }, live, "2026-W34").class).toBe("moved");
  });
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

function stubDoor(answer: () => Response): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (new URL(url).host === "looked.example") return answer();
    throw new Error(`unexpected fetch ${url}`);
  });
}

async function seedRound(hosts: { host: string; verdict: string; failed?: string[]; battery?: string }[], sequence = 1, week = "2026-W34"): Promise<void> {
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
        ...(h.battery ? { battery: h.battery } : {}),
      })),
    },
  };
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}${String(sequence).padStart(9, "0")}`,
    JSON.stringify({ snapshot, digest: String(sequence).repeat(64).slice(0, 64), signature: "0".repeat(128), public_key: "0".repeat(64) }),
  );
}

async function look(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, any> }> {
  const response = await SELF.fetch(`${BASE}/api/look/v1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe("the look carries the reproduction", () => {
  it("compares with the last probed row by default and cites it with the row's own digest", async () => {
    await seedRound([{ host: "looked.example", verdict: "not_ready", failed: ["signable-accepts"], battery: "preflight-v2" }], 1, "2026-W34");
    await seedRound([{ host: "looked.example", verdict: "ready", battery: "preflight-v2" }], 2, "2026-W35");
    stubDoor(ready402);
    const { status, body } = await look({ url: DOOR });
    expect(status).toBe(200);
    expect(body.reproduce.class).toBe("same");
    expect(body.reproduce.compared_with.week).toBe("2026-W35");
    expect(body.reproduce.compared_with.digest).toBe("2".repeat(64));
    expect(body.reproduce.cite.json.cites).toBe(`${BASE}/corpus/2.json`);
    expect(body.reproduce.cite.json.digest).toBe("2".repeat(64));
    expect(body.reproduce.rule_url).toBe(`${BASE}/criteria#result-class`);
    expect(body.held.last_probed_round.digest).toBe("2".repeat(64));
  });

  it("reads the named week with since, and says no_such_round for one the chain does not hold", async () => {
    await seedRound([{ host: "looked.example", verdict: "not_ready", failed: ["signable-accepts"], battery: "preflight-v2" }], 1, "2026-W34");
    await seedRound([{ host: "looked.example", verdict: "ready", battery: "preflight-v2" }], 2, "2026-W35");
    stubDoor(ready402);
    const moved = await look({ url: DOOR, since: "2026-W34" });
    expect(moved.body.reproduce.class).toBe("moved");
    expect(moved.body.reproduce.asked_for).toBe("2026-W34");
    expect(moved.body.reproduce.failed_cleared).toEqual(["signable-accepts"]);
    const none = await look({ url: DOOR, since: "2026-W40" });
    expect(none.body.reproduce.class).toBe("no_such_round");
    expect(none.body.reproduce.known_weeks).toEqual(["2026-W34", "2026-W35"]);
  });

  it("refuses a since that is not a signed week, naming the shape", async () => {
    stubDoor(ready402);
    const { status, body } = await look({ url: DOOR, since: "last tuesday" });
    expect(status).toBe(400);
    expect(body.code).toBe("bad_since");
    expect(body.error).toContain("2026-W34");
  });

  it("a host the chain never met reproduces as no_such_round, not as a zero", async () => {
    stubDoor(ready402);
    const { body } = await look({ url: DOOR });
    expect(body.reproduce.class).toBe("no_such_round");
    expect(body.reproduce.compared_with).toBeNull();
  });
});

describe("the cite box is one shape on every row surface", () => {
  it("host JSON, host page, snapshot and round all print it, with the row's own digest", async () => {
    await seedRound([{ host: "looked.example", verdict: "ready", battery: "preflight-v2" }], 1, "2026-W34");
    const host = (await (await SELF.fetch(`${BASE}/corpus/host/looked.example.json`)).json()) as Record<string, any>;
    expect(host.cite.latest_probed_row.json.cites).toBe(`${BASE}/corpus/1.json`);
    expect(host.cite.latest_probed_row.json.digest).toBe("1".repeat(64));
    expect(host.cite.latest_probed_row.json.license).toBe("CC-BY-4.0");
    expect(host.timeline[0].battery).toBe("preflight-v2");
    const page = await (await SELF.fetch(`${BASE}/corpus/host/looked.example`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("Cite this row");
    expect(page).toContain(`&quot;cites&quot;: &quot;${BASE}/corpus/1.json&quot;`);
    const snapshot = (await (await SELF.fetch(`${BASE}/corpus/1.json`)).json()) as Record<string, any>;
    expect(snapshot.cite.json.cites).toBe(`${BASE}/corpus/1.json`);
    expect(snapshot.cite.json.digest).toBe(snapshot.digest);
    expect(snapshot.snapshot.week).toBe("2026-W34");
    const round = (await (await SELF.fetch(`${BASE}/corpus/round/2026-W34`, { headers: { Accept: "application/json" } })).json()) as Record<string, any>;
    expect(round.cite.json.cites).toBe(`${BASE}/corpus/1.json`);
    const expected = citeRow(BASE, { host: "looked.example", week: "2026-W34", sequence: 1, taken_at: host.timeline[0].taken_at, digest: "1".repeat(64), entry_url: `${BASE}/corpus/1.json` });
    expect(host.cite.latest_probed_row).toEqual(expected);
  });
});

describe("the seats are declared where a crawler reads them", () => {
  it("trust.json and the corpus Dataset carry record true, dispute_artifact true, interpretation false", async () => {
    for (const path of ["/.well-known/trust.json", "/corpus.json"]) {
      const body = (await (await SELF.fetch(`${BASE}${path}`)).json()) as { seats: Record<string, unknown> };
      expect(body.seats.record, path).toBe(true);
      expect(body.seats.dispute_artifact, path).toBe(true);
      expect(body.seats.interpretation, path).toBe(false);
      expect(body.seats.sentence, path).toBe(TWO_SEATS_SENTENCE);
      expect(body.seats.misuse, path).toBe(MISUSE_CLAUSE);
      expect(body.seats.how_to_consume, path).toBe(`${BASE}/scorers`);
    }
    const dataset = (await (await SELF.fetch(`${BASE}/corpus.json`)).json()) as { citation_shape: { json: { cites: string } } };
    expect(dataset.citation_shape.json.cites).toContain("/corpus/");
  });

  it("/criteria types the class of result once, and the scorers page starts with three grips", async () => {
    const criteria = (await (await SELF.fetch(`${BASE}/criteria`, { headers: { Accept: "application/json" } })).json()) as { result_class: { rules: { class: string }[] } };
    expect(criteria.result_class.rules.map((entry) => entry.class)).toEqual(RESULT_CLASS_RULE.map((entry) => entry.class));
    const html = await (await SELF.fetch(`${BASE}/criteria`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain('id="result-class"');
    const scorers = (await (await SELF.fetch(`${BASE}/scorers`, { headers: { Accept: "application/json" } })).json()) as { start_here: { shell: string[]; cli: string[]; mcp: string[] } };
    expect(scorers.start_here.shell.length).toBe(3);
    expect(scorers.start_here.cli.some((line) => line.includes("scvd reproduce"))).toBe(true);
    expect(scorers.start_here.mcp.some((line) => line.includes("look_at_door"))).toBe(true);
  });
});
