import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import { buildOperatorNotice } from "@/services/operator-notice";
import { takeCensus } from "@/services/population";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE NOTICE DESK — telling an operator what we found, with no mailbox.
 *
 * A free check that finds a defect and tells nobody has done half a
 * job, and the operator is the one party who cannot see the problem:
 * a payTo with no token account 402s perfectly and simply never gets
 * paid. From their logs it looks like a shop with no customers.
 *
 * We have no mail server, and cold outbound about somebody's broken
 * endpoint is the exact shape spam filters punish. So the carriage is
 * the calling card already in their access log. These tests hold the
 * three properties that make that defensible: the page is DERIVED
 * (never probes on read), it is HONEST about a host we never walked,
 * and it obeys the naming law by staying out of every index.
 */

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () =>
    new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  failed: string[] = [],
  advisories: string[] = [],
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/x402`,
    verdict,
    failed,
    advisories,
    source: "discovery",
  };
}

function round(week: string, hosts: WardHostResult[]): WardRound {
  return {
    week,
    at: "2026-08-19T00:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

async function chain(rounds: WardRound[], at: Date[] = []): Promise<void> {
  for (const [index, entry] of rounds.entries()) {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(entry));
    const when = at[index];
    const pass = await takeCorpusSnapshot(testEnv, {
      ...okCalendar,
      ...(when ? { now: when } : {}),
    });
    if (!pass.taken) throw new Error(`seed failed: ${pass.reason}`);
  }
}

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(
    listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)),
  );
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
});

describe("what the notice tells an operator", () => {
  it("attaches the published defect class to every raw check name", async () => {
    /*
     * A bare string like `solana-rail-receivable` in somebody else's
     * log is a riddle. The class is what turns it into an actionable
     * claim WITH the sentence that would prove us wrong attached —
     * which is the only reason an operator should believe a stranger.
     */
    await chain([
      round("2026-W01", [
        host("broken.example", "not_ready", ["solana-rail-receivable"], [
          "no-signed-offers",
        ]),
      ]),
    ]);
    const notice = await buildOperatorNotice(testEnv, "broken.example", BASE);

    expect(notice).not.toBeNull();
    const finding = notice!.last_observation!.findings[0]!;
    expect(finding.signal).toBe("solana-rail-receivable");
    expect(finding.defect_class).toBe("rail-cannot-receive");
    expect(finding.asserts).toBeTruthy();
    expect(finding.falsified_by).toBeTruthy();
    // Our census never pays, so nothing it reports may claim otherwise.
    expect(finding.seen_unpaid).toBe(true);
    // The door we knocked on, named — a host can serve several.
    expect(notice!.last_observation!.url).toBe("https://broken.example/x402");
    expect(notice!.last_observation!.advisories).toEqual(["no-signed-offers"]);
  });

  it("says we never knocked rather than implying a verdict", async () => {
    // The failure the corpus fix was about, pointed at the operator:
    // "we have nothing on you" must never read as "you passed".
    await takeCensus(
      testEnv,
      [{ source: "fuchss", hosts: ["listed.example"] }],
      1,
      new Date("2026-08-11T00:00:00.000Z"),
    );
    await chain(
      [round("2026-W01", [host("other.example", "ready")])],
      [new Date("2026-08-19T00:00:00.000Z")],
    );
    const notice = await buildOperatorNotice(testEnv, "listed.example", BASE);

    expect(notice).not.toBeNull();
    expect(notice!.last_observation).toBeNull();
    expect(notice!.our_coverage.rounds_we_probed).toBe(0);
    expect(notice!.our_coverage.first_seen).toBe("2026-08-11T00:00:00.000Z");
  });

  it("returns nothing at all for a host no source ever named", async () => {
    // Inventing a page for any hostname typed at it would make this a
    // directory of every domain on the internet.
    await chain([round("2026-W01", [host("a.example", "ready")])]);
    expect(
      await buildOperatorNotice(testEnv, "stranger.example", BASE),
    ).toBeNull();
  });

  it("makes no outbound request while assembling a notice", async () => {
    /*
     * The abuse guard. If a GET here probed the host it names, anyone
     * could point the store at a third party and have us knock on
     * their behalf. Everything comes from the signed chain instead.
     */
    await chain([
      round("2026-W01", [host("quiet.example", "not_ready", ["status-402"])]),
    ]);
    const spy = vi.spyOn(globalThis, "fetch");
    await buildOperatorNotice(testEnv, "quiet.example", BASE);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("publishes no ratio, because a ratio is a score on an operator", async () => {
    await chain([
      round("2026-W01", [host("scored.example", "not_ready", ["status-402"])]),
    ]);
    const notice = await buildOperatorNotice(testEnv, "scored.example", BASE);
    const flat = JSON.stringify(notice);
    expect(flat).not.toContain("observation_coverage_pct");
    expect(flat).not.toContain("reliability");
    // Both raw counts are present; the division is deliberately absent.
    expect(notice!.our_coverage).toHaveProperty("rounds_we_probed");
    expect(notice!.our_coverage).toHaveProperty("rounds_since_we_met_you");
  });
});

describe("the naming law, enforced at the door", () => {
  it("serves a per-host notice noindex, including the miss", async () => {
    /*
     * An indexable 404 still tells a crawler the URL shape exists, and
     * the shape is the part the naming law cares about.
     */
    const miss = await SELF.fetch(`${BASE}/notice/nobody.example`);
    expect(miss.status).toBe(404);
    expect(miss.headers.get("X-Robots-Tag")).toContain("noindex");

    await chain([round("2026-W01", [host("seen.example", "ready")])]);
    const hit = await SELF.fetch(`${BASE}/notice/seen.example`);
    expect(hit.status).toBe(200);
    expect(hit.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("leaves the landing indexable, because the desk itself is public", async () => {
    const landing = await SELF.fetch(`${BASE}/notice`, {
      headers: { Accept: "application/json" },
    });
    expect(landing.status).toBe(200);
    expect(landing.headers.get("X-Robots-Tag")).toBeNull();
    const body = (await landing.json()) as Record<string, unknown>;
    // The calling card is the whole delivery mechanism; if the landing
    // stops naming it, an operator cannot get from their log to here.
    expect(JSON.stringify(body)).toContain("scvd-general-store");
    expect(JSON.stringify(body)).toContain("scvd-walkabout");
  });

  it("tells the operator plainly that unlisted is not secret", async () => {
    await chain([round("2026-W01", [host("frank.example", "ready")])]);
    const notice = await buildOperatorNotice(testEnv, "frank.example", BASE);
    expect(notice!.listing_status).toContain("not the same as secret");
    expect(notice!.listing_status).toContain("never named");
  });

  it("refuses a host name that is not one", async () => {
    const bad = await SELF.fetch(`${BASE}/notice/not a hostname`);
    expect(bad.status).toBe(400);
  });
});
