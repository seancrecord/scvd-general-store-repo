import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { WardRound } from "@/services/ward-round";
import { ROOMS } from "@/store/rooms";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const HTML = { headers: { Accept: "text/html" } };

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function hostRow(host: string, verdict: string, extra: Record<string, unknown> = {}) {
  return { host, url: `https://${host}/api/buy/x`, verdict, failed: [], advisories: [], ...extra };
}

async function seedWeek(week: string, hosts: Record<string, unknown>[]): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify({
      week,
      at: "2026-08-20T00:00:00.000Z",
      listed_resources: hosts.length,
      coverage_suspect: false,
      hosts,
    } as unknown as WardRound),
  );
  const pass = await takeCorpusSnapshot(testEnv, okCalendar);
  expect(pass.taken).toBe(true);
}

async function clearCorpus(): Promise<void> {
  for (const ns of [testEnv.ORDERS, testEnv.COUNTERS]) {
    let cursor: string | undefined;
    do {
      const page = await ns.list({ cursor });
      for (const key of page.keys) await ns.delete(key.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
}

/**
 * ROADMAP S1 — THE WEEK'S DOORS (the keeper's name, 2026-09-01). One
 * derived page per signed week that a stranger can quote: counts with
 * their denominators, defects by name, our gaps against ourselves.
 * Never a host named beside its verdict, never a ratio, never a rank.
 */
describe("The Week's Doors", () => {
  beforeEach(clearCorpus);

  it("is a room, with the week on the buyer's own door as its deeper rung", () => {
    const room = ROOMS.find((candidate) => candidate.path === "/corpus/brief");
    expect(room?.name).toBe("The Week's Doors");
    expect(room?.deeper).toEqual(["conformance_watch"]);
  });

  it("says the chain is empty rather than inventing a week, and still answers as a room", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/brief`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { week: null; known_weeks: string[]; note: string };
    expect(body.week).toBeNull();
    expect(body.known_weeks).toEqual([]);
    expect(body.note).toContain("no signed week yet");
    const page = await (await SELF.fetch(`${BASE}/corpus/brief`, HTML)).text();
    expect(page).toContain("no signed week yet");
  });

  it("derives the latest week's counts, defects and gaps from the signed snapshot", async () => {
    await seedWeek("2026-W33", [
      hostRow("alpha.example", "ready", { offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.005 } }),
      hostRow("beta.example", "not_ready", { failed: ["accepts"] }),
      hostRow("gamma.example", "not_ready", { failed: ["accepts", "x402-version"] }),
      hostRow("delta.example", "unreachable"),
      hostRow("omitted.example", "not_probed"),
    ]);
    await seedWeek("2026-W34", [
      hostRow("alpha.example", "ready", { offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.005 } }),
      hostRow("beta.example", "ready", { offer: { networks: ["eip155:137"], schemes: ["exact"], min_usdc: 1 } }),
      hostRow("gamma.example", "not_ready", { failed: ["accepts"] }),
    ]);
    const body = (await (await SELF.fetch(`${BASE}/corpus/brief`)).json()) as Record<string, any>;
    expect(body.artifact).toBe("weekly_brief");
    expect(body.name).toBe("The Week's Doors");
    expect(body.week).toBe("2026-W34");
    expect(body.sequence).toBe(2);
    expect(body.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(body.doors).toMatchObject({ listed: 3, probed: 3, payable: 2, not_payable: 1, unreachable: 0, offers_seen: 2 });
    expect(body.networks).toEqual({ "eip155:8453": 1, "eip155:137": 1 });
    expect(body.defects).toEqual([{ id: "accepts", title: expect.any(String), count: 1 }]);
    expect(body.our_gaps).toEqual({ not_probed: 0, observer_degraded: 0, coverage_suspect: false });
    expect(body.previous).toEqual({ week: "2026-W33", payable: 1, not_payable: 2, probed: 4 });
    expect(body.weeks_held).toEqual(["2026-W33", "2026-W34"]);
    expect(String(body.not_a_ranking)).toContain("No host is ranked");
    expect(String(body.how_to_rederive)).toContain(`${BASE}/corpus/2.json`);
    // Never a host named beside a verdict.
    expect(JSON.stringify(body)).not.toContain("gamma.example");
  });

  it("names an earlier week on request and refuses one it does not hold", async () => {
    await seedWeek("2026-W33", [hostRow("alpha.example", "ready"), hostRow("omitted.example", "not_probed")]);
    await seedWeek("2026-W34", [hostRow("alpha.example", "ready")]);
    const earlier = (await (await SELF.fetch(`${BASE}/corpus/brief?week=2026-W33`)).json()) as Record<string, any>;
    expect(earlier.week).toBe("2026-W33");
    expect(earlier.our_gaps.not_probed).toBe(1);
    expect(earlier.previous).toBeUndefined();
    const missing = await SELF.fetch(`${BASE}/corpus/brief?week=2026-W99`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { known_weeks: string[] }).known_weeks).toEqual(["2026-W33", "2026-W34"]);
  });

  it("renders the same numbers for a person, with the gaps and the refusal on the page", async () => {
    await seedWeek("2026-W34", [
      hostRow("alpha.example", "ready"),
      hostRow("beta.example", "not_ready", { failed: ["accepts"] }),
      hostRow("omitted.example", "not_probed"),
    ]);
    const page = await (await SELF.fetch(`${BASE}/corpus/brief`, HTML)).text();
    expect(page).toContain("The Week&#39;s Doors — 2026-W34");
    expect(page).toContain("<strong>3 doors named</strong>");
    expect(page).toContain("<strong>2 knocked on</strong>");
    expect(page).toContain("<strong>1 answered with a challenge a buyer could pay</strong>");
    expect(page).toContain("Defects, by name");
    expect(page).toContain("The gaps, counted against us");
    expect(page).toContain("1 doors a feed named that this round never reached");
    expect(page).toContain("No host is ranked");
    expect(page).not.toContain("beta.example");
    // The room contract: the free path first, the deeper rung priced off the shelf.
    expect(page).toContain("What you can do with this");
    expect(page).toContain("/menu/conformance_watch");
  });

  it("is linked from the corpus landing, both dialects", async () => {
    const json = (await (await SELF.fetch(`${BASE}/corpus`)).json()) as Record<string, string>;
    expect(json.weekly_brief).toBe(`${BASE}/corpus/brief`);
    const page = await (await SELF.fetch(`${BASE}/corpus`, HTML)).text();
    expect(page).toContain('href="/corpus/brief"');
  });
});
