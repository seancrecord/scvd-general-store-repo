import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import { DEPTH_HOLD_SECONDS, DEPTH_ITEMS, archiveWideDepth, depthLine } from "@/services/archive-depth";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";
import { isRecord } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * DEPTH BEFORE YOU BUY (roadmap S7, 2026-09-02). The three items that
 * sell this store's own history print, before the money, how much of
 * it stands behind the subject asked about — on the 402 when the
 * subject is named, on the item page and menu.json as the archive's
 * own depth when it is not. Zero prints as zero; a subject the chain
 * never met is stated as never met; and the depth is never a preview
 * of the answer.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function host(name: string, verdict: WardHostResult["verdict"]): WardHostResult {
  return { host: name, url: `https://${name}/x402`, verdict, failed: [], advisories: [], source: "discovery" };
}

function round(week: string, hosts: WardHostResult[]): WardRound {
  return { week, at: "2026-08-01T00:00:00.000Z", listed_resources: hosts.length, coverage_suspect: false, capped: false, our_search_presence: true, hosts };
}

async function chain(rounds: WardRound[]): Promise<void> {
  for (const [index, entry] of rounds.entries()) {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(entry));
    const pass = await takeCorpusSnapshot(testEnv, { ...okCalendar, now: new Date(Date.UTC(2026, 7, index + 1, 12)) });
    if (!pass.taken) throw new Error(`seed failed: ${pass.reason}`);
  }
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Expected a JSON object body");
  return body;
}

beforeAll(() => {
  // The 402 is built by the till, which asks the facilitator what it supports.
  installFacilitatorMock();
});

async function forgetHeldDepth(): Promise<void> {
  const held = await testEnv.COUNTERS.list({ prefix: KV_KEYS.archiveDepthPrefix });
  await Promise.all(held.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
}

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  await forgetHeldDepth();
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
});

describe("the 402 says how much history stands behind the subject", () => {
  it("spot_check: the host's rounds, counted, with the rows linked", async () => {
    await chain([
      round("2026-W31", [host("door.example", "ready")]),
      round("2026-W32", [host("door.example", "not_ready")]),
      round("2026-W33", [host("other.example", "ready")]),
    ]);
    const body = await json(await SELF.fetch(`${BASE}/api/buy/spot_check?host=door.example`));
    const depth = body.archive_depth as Record<string, unknown>;
    expect(depth.kind).toBe("host");
    expect(depth.never_observed).toBe(false);
    expect(depth.rounds_probed).toBe(2);
    expect(depth.rounds_since_first_sighting).toBe(3);
    expect(depth.verdict_changes).toBe(1);
    expect(depth.rows_url).toBe(`${BASE}/corpus/host/door.example.json`);
    // Never a preview: no verdict, no tier, no ratio on the depth block.
    const flat = JSON.stringify(depth).toLowerCase();
    expect(flat).not.toContain('"verdict"');
    expect(flat).not.toContain('"tier"');
    expect(String(depth.what_this_is_not)).toContain("Not a preview");
  });

  it("a host the chain never met is stated as never met, with zeros", async () => {
    await chain([round("2026-W31", [host("door.example", "ready")])]);
    const body = await json(await SELF.fetch(`${BASE}/api/buy/spot_check?host=never.example`));
    const depth = body.archive_depth as Record<string, unknown>;
    expect(depth.never_observed).toBe(true);
    expect(depth.rounds_probed).toBe(0);
    expect(depth.first_observed).toBeNull();
  });

  it("trust_profile reads the host off the url; provenance_check counts weeks and doors for an address", async () => {
    await chain([round("2026-W31", [host("door.example", "ready")])]);
    const profile = await json(await SELF.fetch(`${BASE}/api/buy/trust_profile?url=https://door.example/x402`));
    expect((profile.archive_depth as Record<string, unknown>).subject).toBe("door.example");
    const provenance = await json(
      await SELF.fetch(`${BASE}/api/buy/provenance_check?address=0x000000000000000000000000000000000000dEaD`),
    );
    const depth = provenance.archive_depth as Record<string, unknown>;
    expect(depth.kind).toBe("address");
    expect(depth.never_seen).toBe(true);
    expect(depth.weeks_seen).toBe(0);
    expect(depth.doors_seen).toBe(0);
  });

  it("with no subject named, the 402 carries the archive's own depth; other items carry none", async () => {
    await chain([round("2026-W31", [host("a.example", "ready"), host("b.example", "ready")])]);
    const bare = await json(await SELF.fetch(`${BASE}/api/buy/spot_check`));
    const depth = bare.archive_depth as Record<string, unknown>;
    expect(depth.kind).toBe("archive");
    expect(depth.weeks_in_chain).toBe(1);
    expect(depth.hosts_seen).toBe(2);
    const hello = await json(await SELF.fetch(`${BASE}/api/buy/hello`));
    expect(hello.archive_depth).toBeUndefined();
  });
});

describe("the item page and menu.json carry the archive's depth on the history items", () => {
  it("prints the depth line as a fact, derived, and menu.json carries the same numbers", async () => {
    await chain([round("2026-W31", [host("a.example", "ready")]), round("2026-W32", [host("a.example", "ready"), host("b.example", "unreachable")])]);
    const wide = await archiveWideDepth(testEnv);
    if (wide.kind !== "archive") throw new Error("not the archive's depth");
    expect(wide.weeks_in_chain).toBe(2);
    expect(wide.hosts_seen).toBe(2);
    const line = depthLine(wide);
    expect(line).toContain("2 signed weeks over 2 hosts");
    for (const id of Object.keys(DEPTH_ITEMS)) {
      const page = await (await SELF.fetch(`${BASE}/menu/${id}`, { headers: { Accept: "text/html" } })).text();
      expect(page, `${id} page carries no depth`).toContain("Archive depth");
      expect(page).toContain("2 signed weeks over 2 hosts");
    }
    const menu = await json(await SELF.fetch(`${BASE}/menu.json`));
    const items = menu.items as Array<Record<string, unknown>>;
    const spot = items.find((item) => item.id === "spot_check")!;
    expect((spot.archive_depth as Record<string, unknown>).weeks_in_chain).toBe(2);
    expect(items.find((item) => item.id === "hello")?.archive_depth).toBeUndefined();
  });

  it("zero is printed as zero, not omitted", async () => {
    const wide = await archiveWideDepth(testEnv);
    if (wide.kind !== "archive") throw new Error("not the archive's depth");
    expect(wide.weeks_in_chain).toBe(0);
    expect(wide.hosts_seen).toBe(0);
    expect(depthLine(wide)).toContain("0 signed weeks over 0 hosts");
  });
});

describe("the depth is held, not redone on every knock (2026-09-02)", () => {
  it("serves the same derivation inside the hold, and a fresh one once it is forgotten", async () => {
    await chain([round("2026-W31", [host("door.example", "ready")])]);
    const first = await archiveWideDepth(testEnv);
    if (first.kind !== "archive") throw new Error("expected the archive's own depth");
    expect(first.weeks_in_chain).toBe(1);
    expect(Date.parse(first.derived_at)).toBeGreaterThan(0);
    expect(String(first.what_this_is)).toContain(`${DEPTH_HOLD_SECONDS / 60} minutes`);

    // The chain grows; inside the hold the 402 still says what it
    // said, with the same derived_at, which is the honest reading of
    // a held figure — and why derived_at is printed on it.
    await chain([round("2026-W32", [host("door.example", "ready"), host("other.example", "ready")])]);
    const heldStill = await archiveWideDepth(testEnv);
    if (heldStill.kind !== "archive") throw new Error("expected the archive's own depth");
    expect(heldStill.weeks_in_chain).toBe(1);
    expect(heldStill.derived_at).toBe(first.derived_at);

    await forgetHeldDepth();
    const fresh = await archiveWideDepth(testEnv);
    if (fresh.kind !== "archive") throw new Error("expected the archive's own depth");
    expect(fresh.weeks_in_chain).toBe(2);
    expect(fresh.derived_at >= first.derived_at).toBe(true);
  });

  it("holds per subject: one host's depth never answers for another", async () => {
    await chain([round("2026-W31", [host("door.example", "ready")])]);
    const known = await SELF.fetch(`${BASE}/api/buy/spot_check?host=door.example`);
    const knownDepth = (await json(known))["archive_depth"] as Record<string, unknown>;
    expect(knownDepth["never_observed"]).toBe(false);
    const stranger = await SELF.fetch(`${BASE}/api/buy/spot_check?host=stranger.example`);
    const strangerDepth = (await json(stranger))["archive_depth"] as Record<string, unknown>;
    expect(strangerDepth["never_observed"]).toBe(true);
    expect(strangerDepth["subject"]).toBe("stranger.example");
  });
});
