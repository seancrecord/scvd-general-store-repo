import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { longWalkPass, readLongWalk } from "@/services/long-walk";
import { readWellKnownStore } from "@/services/well-known-doors";
import { wardDelta, type WardRound } from "@/services/ward-round";
import { backfillDoorBank, readDoorBank } from "@/services/door-bank";
import type { Env } from "@/types";

/**
 * THE SWEEP (2026-09-04). The register knew 6,367 hosts by name and
 * the walk knew 1,088 doors by URL; the 5,279 between read "listed,
 * not walked" every week. The sweep reads each name-only host's OWN
 * /.well-known/x402 in the firings the roster leaves idle, and every
 * door a host declares for itself joins the roster's tail and gets
 * walked. What this file holds:
 *
 *   - the sweep's list is exactly the name-only hosts, and a
 *     directory that could not be read leaves nothing to sweep and
 *     says so;
 *   - walk before sweep, always: a door the sweep finds is knocked on
 *     by a LATER firing, never by the sweep;
 *   - rule 52 on the counts: found, none, unreadable are three words;
 *   - the consent line holds through the whole machine: a foreign
 *     door never reaches the roster;
 *   - a host's own declaration sits out the listed/gone delta and
 *     never enters the door bank, which holds the directory's word
 *     only;
 *   - what a host declared last week rides next week's roster from
 *     the start.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

const DISCOVERY = ["walk-0.example", "walk-1.example"];
const NAME_ONLY = {
  "declares.example": { resources: ["https://declares.example/api/pay", "https://declares.example/api/other"] },
  "hops.example": null, // agent card → api.hops.example
  "silent.example": "404",
  "broken.example": "500",
  "foreign.example": { resources: ["https://victim.example/door"] },
  "paged.example": "404", // no own file; the directory's page lists its paths (lane C)
} as const;

/**
 * LANE C: the directory's page per host. paged.example has no file of
 * its own and two paths on its page, one of them an absolute URL on
 * somebody else's host (foreign, never walked). broken.example has no
 * page. Everyone else gets the hub's bucket markup, which names no
 * path at all: "none".
 */
const PROVIDER_PAGES: Record<string, string | "404"> = {
  "paged.example":
    '<ul class="results"><li><a class="result" href="/endpoint/1"><span class="r-host">/v1/pay</span><span class="r-path">/v1/pay</span></a></li>' +
    '<li><a class="result" href="/endpoint/2"><span class="r-host">x</span><span class="r-path">https://victim.example/door</span></a></li></ul>',
  "broken.example": "404",
};

let probed: string[] = [];

function stubWorld(options: { directoryReadable: boolean } = { directoryReadable: true }) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const u = new URL(url);
    if (u.host === "api.cdp.coinbase.com") {
      if (url.includes("/discovery/search")) return Response.json({ items: [{ resourceUrl: `${BASE}/api/buy/hello` }] });
      return Response.json({
        items: DISCOVERY.map((h) => ({ resourceUrl: `https://${h}/api/buy/x` })),
        pagination: { limit: 100, offset: 0, total: DISCOVERY.length },
      });
    }
    if (u.host.includes("agent402")) {
      return Response.json({ spec: "x402-leaderboard/1", windowServed: "7d", totalSellers: 0, leaderboard: [] });
    }
    if (u.host.includes("fuchss")) {
      if (!options.directoryReadable) return new Response("gone", { status: 503 });
      if (u.pathname === "/providers") return new Response('<a href="/providers/a">a</a>');
      if (u.pathname.startsWith("/provider/")) {
        const host = decodeURIComponent(u.pathname.slice("/provider/".length));
        const page = PROVIDER_PAGES[host];
        if (page === "404") return new Response("", { status: 404 });
        if (page) return new Response(page);
        // The bucket markup: anchors, no r-path — a page that names no path.
      }
      const all = [...DISCOVERY, ...Object.keys(NAME_ONLY)];
      return new Response(all.map((h) => `<a href="/provider/${encodeURIComponent(h)}">${h}</a>`).join(""));
    }
    // well-known reads
    if (u.pathname === "/.well-known/x402") {
      if (u.host === "api.hops.example") return Response.json({ resources: ["https://api.hops.example/pay"] });
      const spec = NAME_ONLY[u.host as keyof typeof NAME_ONLY];
      if (spec === "500") return new Response("oops", { status: 500 });
      if (spec && typeof spec === "object") return Response.json(spec);
      return new Response("", { status: 404 });
    }
    if (u.pathname === "/.well-known/agent.json") {
      if (u.host === "hops.example") return Response.json({ name: "hops", vendor: { x402Discovery: "https://api.hops.example/.well-known/x402" } });
      return new Response("", { status: 404 });
    }
    // a knock on a door
    probed.push(url);
    return new Response("{}", {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": btoa(
          JSON.stringify({
            x402Version: 2,
            accepts: [{ scheme: "exact", network: "eip155:8453", amount: "1000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111" }],
          }),
        ),
      },
    });
  });
}

async function reset(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.longWalkState);
  await testEnv.COUNTERS.delete(KV_KEYS.wellKnownDoors);
  await testEnv.COUNTERS.delete(KV_KEYS.wardDoorBank);
  probed = [];
}

beforeAll(async () => {
  const ed25519 = await import("@noble/ed25519");
  const seed = new Uint8Array(32).fill(0x42);
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  const both = new Uint8Array(64);
  both.set(seed);
  both.set(publicKey, 32);
  testEnv.CDP_API_KEY_ID = "test-key-id";
  testEnv.CDP_API_KEY_SECRET = btoa(String.fromCharCode(...both));
});

afterEach(() => vi.unstubAllGlobals());

/** Run passes until the walk reports finished, returning the phases seen. */
async function runWeek(): Promise<string[]> {
  const phases: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const pass = await longWalkPass(testEnv);
    phases.push(pass.phase);
    if (pass.phase === "finished" || pass.phase === "idle") break;
  }
  return phases;
}

describe("the sweep's list", () => {
  it("is exactly the name-only hosts, sorted, and the start says how many", async () => {
    await reset();
    stubWorld();
    const start = await longWalkPass(testEnv);
    expect(start.phase).toBe("started");
    const state = (await readLongWalk(testEnv))!;
    expect(state.sweep?.hosts).toEqual(Object.keys(NAME_ONLY).sort());
    expect(state.sweep?.source_unreadable).toBe(false);
    expect((start as { sweep: number }).sweep).toBe(Object.keys(NAME_ONLY).length);
    // The roster is the feed's doors only, at the start.
    expect(state.roster.map((r) => r.source)).toEqual(["discovery", "discovery"]);
  });

  it("a directory that could not be read leaves nothing to sweep, and says so", async () => {
    await reset();
    stubWorld({ directoryReadable: false });
    await longWalkPass(testEnv);
    const state = (await readLongWalk(testEnv))!;
    expect(state.sweep?.hosts).toEqual([]);
    expect(state.sweep?.source_unreadable).toBe(true);
    const phases = await runWeek();
    // The last walked batch stamps finished_at itself, so the pass
    // after it reads idle; either word means the week is done.
    expect(["finished", "idle"]).toContain(phases.at(-1));
    expect((await readLongWalk(testEnv))!.finished_at).toBeDefined();
  });
});

describe("walk before sweep, then walk what the sweep found", () => {
  it("phases run walked → swept → walked → finished, and the sweep itself knocks on nobody", async () => {
    await reset();
    stubWorld();
    await longWalkPass(testEnv); // start
    const phases = await runWeek();
    expect(phases[0]).toBe("walked"); // the two discovery doors
    expect(phases[1]).toBe("swept"); // five files read
    expect(phases[2]).toBe("walked"); // the doors the sweep declared
    expect(["finished", "idle"]).toContain(phases.at(-1));
    expect((await readLongWalk(testEnv))!.finished_at).toBeDefined();
    // The sweep read files; it did not knock. Every knock is a door.
    for (const url of probed) expect(url).not.toContain("/.well-known/");
  });

  it("counts found, none and unreadable as three words, and adds one door per declaring host", async () => {
    await reset();
    stubWorld();
    await longWalkPass(testEnv);
    await runWeek();
    const state = (await readLongWalk(testEnv))!;
    const sweep = state.sweep!;
    expect(sweep.read).toBe(6);
    expect(sweep.found).toBe(3); // declares, hops (via card), foreign (readable, declares something)
    expect(sweep.none).toBe(2); // silent, paged
    expect(sweep.unreadable).toBe(1); // broken
    expect(sweep.doors_added).toBe(2); // declares + hops; foreign adds nothing
    expect(sweep.capped).toBe(false);
    expect(sweep.finished_at).toBeDefined();
    const added = state.roster.filter((r) => r.source === "well-known");
    expect(added.map((r) => r.host).sort()).toEqual(["api.hops.example", "declares.example"]);
    expect(added.find((r) => r.host === "declares.example")?.url).toBe("https://declares.example/api/pay");
    // Foreign never reaches the roster.
    expect(state.roster.some((r) => r.host === "victim.example" || r.url.includes("victim"))).toBe(false);
  });

  /**
   * LANE C. The directory's page is read only where the host's own
   * file gave no door: silent (no file), paged (no file), broken
   * (unreadable file) and foreign (a file naming only somebody else's
   * door). Its three words are kept apart from the file's.
   */
  it("reads the directory's page where the host's own file gave no door, and keeps the counts apart", async () => {
    await reset();
    stubWorld();
    await longWalkPass(testEnv);
    await runWeek();
    const state = (await readLongWalk(testEnv))!;
    const dir = state.sweep!.directory!;
    expect(dir.read).toBe(4); // silent, broken, foreign, paged
    expect(dir.found).toBe(1); // paged
    expect(dir.none).toBe(3); // silent and foreign (a page naming no path), broken (no page)
    expect(dir.unreadable).toBe(0);
    expect(dir.doors_added).toBe(1);
    const row = state.roster.find((r) => r.source === "directory");
    expect(row).toEqual({ host: "paged.example", url: "https://paged.example/v1/pay", source: "directory", catalog: null });
    // The absolute URL on the page pointed at another host: counted, never walked.
    expect(state.roster.some((r) => r.url.includes("victim"))).toBe(false);
    const store = await readWellKnownStore(testEnv);
    expect(store.hosts["paged.example"]).toMatchObject({
      via: "directory",
      declaring_host: "paged.example",
      doors: ["https://paged.example/v1/pay"],
      foreign: 1,
    });
    // A host whose own file spoke keeps that record; the page does not overwrite it.
    expect(store.hosts["foreign.example"]).toMatchObject({ via: "x402", foreign: 1 });
    // Walked, with a real verdict, under its own word.
    const walked = state.results.find((r) => r.host === "paged.example");
    expect(walked?.source).toBe("directory");
    expect(walked?.verdict).toBe("ready");
    expect(probed).toContain("https://paged.example/v1/pay");
  });

  it("the store keeps every door the file named, and the hop's declaring host is the pointer's target", async () => {
    await reset();
    stubWorld();
    await longWalkPass(testEnv);
    await runWeek();
    const store = await readWellKnownStore(testEnv);
    expect(store.hosts["declares.example"]?.doors).toEqual(["https://declares.example/api/pay", "https://declares.example/api/other"]);
    expect(store.hosts["hops.example"]).toMatchObject({ declaring_host: "api.hops.example", via: "agent-card" });
    expect(store.hosts["foreign.example"]).toMatchObject({ doors: [], foreign: 1 });
    expect(store.hosts["silent.example"]).toBeUndefined();
    expect(store.hosts["broken.example"]).toBeUndefined();
  });

  it("swept doors are walked with a real verdict and source well-known", async () => {
    await reset();
    stubWorld();
    await longWalkPass(testEnv);
    await runWeek();
    const state = (await readLongWalk(testEnv))!;
    const rows = state.results.filter((r) => r.source === "well-known");
    expect(rows.map((r) => r.host).sort()).toEqual(["api.hops.example", "declares.example"]);
    for (const row of rows) expect(row.verdict).toBe("ready");
    expect(probed).toContain("https://declares.example/api/pay");
    expect(probed).toContain("https://api.hops.example/pay");
  });
});

describe("what a declaration is not", () => {
  const roundWith = (hosts: WardRound["hosts"]): WardRound =>
    ({ week: "2026-W36", at: "2026-09-06T11:00:00.000Z", listed_resources: 2, coverage_suspect: false, capped: false, our_search_presence: true, hosts }) as WardRound;
  const row = (host: string, source: "discovery" | "well-known" | "directory"): WardRound["hosts"][number] =>
    ({ host, url: `https://${host}/x`, source, verdict: "ready", failed: [], advisories: [] }) as WardRound["hosts"][number];

  it("sits out the listed/gone delta — a host declaring itself is not a directory listing it", () => {
    const before = roundWith([row("a.example", "discovery")]);
    const after = roundWith([row("a.example", "discovery"), row("self.example", "well-known")]);
    expect(wardDelta(after, before).new_hosts).toEqual([]);
    expect(wardDelta(after, null).new_hosts).toEqual(["a.example"]);
    const gone = roundWith([row("a.example", "discovery")]);
    expect(wardDelta(gone, after).gone_hosts).toEqual([]);
    // Lane C rows sit it out the same way: a directory's page for one
    // host is not the discovery feed listing or dropping it.
    const withPage = roundWith([row("a.example", "discovery"), row("paged.example", "directory")]);
    expect(wardDelta(withPage, before).new_hosts).toEqual([]);
    expect(wardDelta(before, withPage).gone_hosts).toEqual([]);
  });

  it("never enters the door bank, which holds the directory's word only", async () => {
    await reset();
    await testEnv.COUNTERS.put(
      "ward:2026-W36",
      JSON.stringify(roundWith([row("feed.example", "discovery"), row("self.example", "well-known"), row("paged.example", "directory")])),
    );
    await backfillDoorBank(testEnv);
    const bank = await readDoorBank(testEnv);
    expect(Object.keys(bank.doors)).toEqual(["feed.example"]);
    await testEnv.COUNTERS.delete("ward:2026-W36");
  });
});

describe("next week", () => {
  it("what a host declared last week rides the new roster from the start", async () => {
    await reset();
    stubWorld();
    await longWalkPass(testEnv);
    await runWeek();
    // Age the state so the next pass starts a fresh week; the store persists.
    const old = (await readLongWalk(testEnv))!;
    await testEnv.COUNTERS.put(KV_KEYS.longWalkState, JSON.stringify({ ...old, week: "2000-W01" }));
    const start = await longWalkPass(testEnv);
    expect(start.phase).toBe("started");
    const fresh = (await readLongWalk(testEnv))!;
    const seeded = fresh.roster.filter((r) => r.source === "well-known").map((r) => r.host).sort();
    expect(seeded).toEqual(["api.hops.example", "declares.example"]);
    // What the directory's page named last week rides too, under its own word.
    expect(fresh.roster.filter((r) => r.source === "directory").map((r) => r.host)).toEqual(["paged.example"]);
    // And those hosts are not swept again this week; the others are.
    expect(fresh.sweep?.hosts).not.toContain("declares.example");
    expect(fresh.sweep?.hosts).toContain("silent.example");
  });
});
