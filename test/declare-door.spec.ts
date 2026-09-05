import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { readLongWalk } from "@/services/long-walk";
import { readWellKnownStore } from "@/services/well-known-doors";
import type { Env } from "@/types";

/**
 * DECLARE A DOOR (2026-09-04). What this file holds:
 *
 *   - the desk reads only the named host's own file: a URL, a path,
 *     a port, this store's own host and a private target are refused
 *     before any read;
 *   - the three words come back as earned — doors, none, unreadable;
 *   - a declared door joins THIS week's roster when a walk is open,
 *     and is on record for next week's when none is;
 *   - a file declaring doors only for another host adds nothing to
 *     the roster;
 *   - one read by hand per host per day, and the answer says when.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const JSON_HEADERS = { "content-type": "application/json" };
const post = (body: unknown) =>
  SELF.fetch(`${BASE}/api/declare-door`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

function stubFiles(files: Record<string, unknown | "500">) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const spec = files[url];
    if (spec === undefined) return new Response("", { status: 404 });
    if (spec === "500") return new Response("oops", { status: 500 });
    return Response.json(spec);
  });
}

async function reset(...hosts: string[]) {
  for (const host of hosts) await testEnv.COUNTERS.delete(`declare_door:${host}`);
  await testEnv.COUNTERS.delete(KV_KEYS.wellKnownDoors);
  await testEnv.COUNTERS.delete(KV_KEYS.longWalkState);
}

afterEach(() => vi.unstubAllGlobals());

describe("the explanation", () => {
  it("GET says how, the consent line, the file, the three words and the errors", async () => {
    const body = (await (await SELF.fetch(`${BASE}/api/declare-door`)).json()) as Record<string, unknown>;
    for (const key of ["what_this_is", "the_consent_line", "the_file", "how_to_call", "the_words_that_come_back", "errors", "one_per_day", "what_happens_next", "example"]) {
      expect(body[key], key).toBeDefined();
    }
    expect(JSON.stringify(body)).toContain("/.well-known/x402");
  });
});

describe("what the desk refuses before reading anything", () => {
  it("a URL, a path, a port, nonsense, this store, and a private target", async () => {
    stubFiles({});
    for (const host of ["https://door.example", "door.example/api", "door.example:8443", "not a host", "scvd.store", "10.0.0.5", "localhost"]) {
      const response = await post({ host });
      expect(response.status, host).toBe(400);
    }
    expect((await post({})).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/api/declare-door`, { method: "POST", body: "nope" })).status).toBe(400);
  });
});

describe("the three words", () => {
  it("none: no file, on record nowhere, and how to be found rides the answer", async () => {
    await reset("silent.example");
    stubFiles({});
    const response = await post({ host: "silent.example" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["read"]).toMatchObject({ kind: "none" });
    expect(body["how_to_be_found"]).toBeDefined();
    expect((await readWellKnownStore(testEnv)).hosts["silent.example"]).toBeUndefined();
  });

  it("unreadable: a broken file is a fact about the read, not the host", async () => {
    await reset("broken.example");
    stubFiles({ "https://broken.example/.well-known/x402": "500" });
    const body = (await (await post({ host: "broken.example" })).json()) as Record<string, unknown>;
    expect(body["read"]).toMatchObject({ kind: "unreadable", reason: "HTTP 500" });
  });

  it("doors: the file is on record, and with no walk open the answer says it seeds next week", async () => {
    await reset("declares.example");
    stubFiles({ "https://declares.example/.well-known/x402": { resources: ["https://declares.example/api/pay", "https://declares.example/api/two"] } });
    const body = (await (await post({ host: "declares.example" })).json()) as Record<string, unknown>;
    expect(body["read"]).toMatchObject({ kind: "doors", declaring_host: "declares.example", via: "x402" });
    expect(body["walk"]).toMatchObject({ this_week: "no-walk-this-week", door_the_census_will_knock_on: "https://declares.example/api/pay" });
    const store = await readWellKnownStore(testEnv);
    expect(store.hosts["declares.example"]?.doors).toEqual(["https://declares.example/api/pay", "https://declares.example/api/two"]);
  });

  it("doors, while this week's walk is still reading the feed: on record, roster not frozen yet", async () => {
    await reset("declares.example");
    await testEnv.COUNTERS.put(
      KV_KEYS.longWalkState,
      JSON.stringify({ version: 1, week: currentWeekKey(), started_at: new Date().toISOString(), listed_resources: 20000, coverage_suspect: false, feed: { resume: { offset: 20000, rows_read: 20000 }, passes: 1, declared_total: 20050 }, leaderboard: null, claims: {}, roster: [], cursor: 0, results: [], batches: 0 }),
    );
    stubFiles({ "https://declares.example/.well-known/x402": { resources: ["https://declares.example/api/pay"] } });
    const body = (await (await post({ host: "declares.example" })).json()) as Record<string, unknown>;
    expect(body["walk"]).toMatchObject({ this_week: "roster-not-frozen-yet" });
    expect(String((body["walk"] as Record<string, unknown>)["then"])).toContain("still reading");
    const state = (await readLongWalk(testEnv))!;
    expect(state.roster).toEqual([]);
  });

  it("doors, with a walk open this week: the door joins the roster now, and again is already there", async () => {
    await reset("declares.example");
    await testEnv.COUNTERS.put(
      KV_KEYS.longWalkState,
      JSON.stringify({ version: 1, week: currentWeekKey(), started_at: new Date().toISOString(), listed_resources: 0, coverage_suspect: false, leaderboard: null, claims: {}, roster: [], cursor: 0, results: [], batches: 0 }),
    );
    stubFiles({ "https://declares.example/.well-known/x402": { resources: ["https://declares.example/api/pay"] } });
    const body = (await (await post({ host: "declares.example" })).json()) as Record<string, unknown>;
    expect(body["walk"]).toMatchObject({ this_week: "appended" });
    const state = (await readLongWalk(testEnv))!;
    expect(state.roster).toEqual([{ host: "declares.example", url: "https://declares.example/api/pay", source: "well-known", catalog: null }]);
  });

  it("a file declaring doors only for another host adds nothing to the roster", async () => {
    await reset("foreign.example");
    stubFiles({ "https://foreign.example/.well-known/x402": { resources: ["https://victim.example/door"] } });
    const body = (await (await post({ host: "foreign.example" })).json()) as Record<string, unknown>;
    expect(body["read"]).toMatchObject({ kind: "doors", doors: [], foreign: 1 });
    expect(body["walk"]).toMatchObject({ this_week: "no-door-on-own-host", door_the_census_will_knock_on: null });
  });
});

describe("one read by hand per host per day", () => {
  it("the second read within the day is 429 and says when", async () => {
    await reset("once.example");
    stubFiles({});
    expect((await post({ host: "once.example" })).status).toBe(200);
    const again = await post({ host: "once.example" });
    expect(again.status).toBe(429);
    const body = (await again.json()) as Record<string, unknown>;
    expect(body["try_after"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
