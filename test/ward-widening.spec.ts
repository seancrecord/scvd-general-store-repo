import { env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  EVENT_LIST_CAP,
  takeCensus,
  type SourceResult,
} from "@/services/population";
import { runWardRound } from "@/services/ward-round";
import { readFuchssProviders, UNREAD_DIRECTORIES } from "@/services/ward-sources";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE WIDENING (the keeper's ruling, 2026-08-10): the ward widens to
 * every public directory. Uniform, no favourites — if it is on a
 * public list, we watch it.
 *
 * What these tests hold is the ruling's two honesty clauses. First,
 * a directory the round cannot READ COMPLETELY contributes nothing
 * rather than a partial answer, because a partial enumeration cannot
 * tell "delisted" from "on the page that failed" — the population
 * layer's founding law, applied to a new source. Second, the
 * directories the round cannot read at all are NAMED on the round
 * with reasons, because a uniform widening that quietly skipped the
 * paid doors would be picking favourites by omission.
 */

function fuchssHub(buckets: string[]): string {
  return buckets
    .map((bucket) => `<a href="/providers/${bucket}">${bucket}</a>`)
    .join("\n");
}

function fuchssBucket(hosts: string[]): string {
  return hosts
    .map((host) => `<a href="/provider/${host}">${host}</a>`)
    .join("\n");
}

describe("the fuchss provider directory read", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFuchss(pages: Record<string, string | null>) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const path = new URL(url).pathname;
      const page = pages[path];
      if (page === undefined || page === null) {
        return new Response("gone", { status: 500 });
      }
      return new Response(page, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
  }

  it("walks the hub's buckets and returns every provider host, ours excluded", async () => {
    stubFuchss({
      "/providers": fuchssHub(["a", "s"]),
      "/providers/a": fuchssBucket(["alpha.example", "api.beta.example"]),
      "/providers/s": fuchssBucket(["scvd.store", "shop.example", "alpha.example"]),
    });
    const hosts = await readFuchssProviders("scvd.store");
    expect(hosts?.sort()).toEqual([
      "alpha.example",
      "api.beta.example",
      "shop.example",
    ]);
  });

  it("one failed bucket page makes the whole source unread — partial is unread", async () => {
    stubFuchss({
      "/providers": fuchssHub(["a", "b"]),
      "/providers/a": fuchssBucket(["alpha.example"]),
      "/providers/b": null,
    });
    // 26 of 27 letters is not a smaller answer, it is NO answer: the
    // hosts on the failed page would read as delisted next round.
    expect(await readFuchssProviders("scvd.store")).toBeNull();
  });

  it("a hub whose shape moved is unreadable, never an empty world", async () => {
    stubFuchss({ "/providers": "<html>a redesign with no bucket links</html>" });
    expect(await readFuchssProviders("scvd.store")).toBeNull();
  });
});

describe("the census event lists stay weekly-and-small", () => {
  beforeEach(async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
  });

  it("caps the name lists past the cap and keeps the counts exact", async () => {
    const flood = Array.from(
      { length: EVENT_LIST_CAP + 50 },
      (_, index) => `host-${String(index).padStart(4, "0")}.example`,
    );
    const sources: SourceResult[] = [{ source: "fuchss", hosts: flood }];
    const census = await takeCensus(testEnv, sources, 0);
    /*
     * The census rides every corpus snapshot verbatim, and the corpus
     * graduation trigger is "when snapshots stop being weekly-and-
     * small". A ten-thousand-name appeared list on the widening's
     * first round would be a permanent megabyte in an append-only
     * chain — so the names are capped, the counts are the truth, and
     * the register underneath still holds every host.
     */
    expect(census.appeared).toHaveLength(EVENT_LIST_CAP);
    expect(census.appeared_count).toBe(EVENT_LIST_CAP + 50);
    expect(
      census.what_this_cannot_see.some((line) => line.includes("cap")),
    ).toBe(true);
  });

  it("says nothing about truncation when nothing was truncated", async () => {
    const census = await takeCensus(
      testEnv,
      [{ source: "discovery", hosts: ["a.example"] }],
      1,
    );
    expect(census.appeared_count).toBe(1);
    expect(
      census.what_this_cannot_see.some((line) => line.includes("cap")),
    ).toBe(false);
  });
});

describe("the round carries the widening whole", () => {
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

  beforeEach(async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fuchss hosts widen the denominator without joining the probe list", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.cdp.coinbase.com")) {
        return Response.json({
          items: [{ resourceUrl: "https://probed.example/api/buy/x" }],
        });
      }
      if (url.includes("agent402.tools")) {
        return new Response("down", { status: 500 });
      }
      if (url.includes("x402.fuchss.app/providers/")) {
        return new Response(
          fuchssBucket(["probed.example", "listed-only-1.example", "listed-only-2.example"]),
          { status: 200 },
        );
      }
      if (url.includes("x402.fuchss.app/providers")) {
        return new Response(fuchssHub(["p"]), { status: 200 });
      }
      // The one probe: the discovery-listed host answering its 402.
      return new Response("{}", { status: 402 });
    });
    const round = await runWardRound(testEnv);
    // The probe list is discovery's; a fuchss row is a homepage, and
    // the leaderboard already taught this round what probing a
    // homepage for a 402 manufactures.
    expect(round.hosts.map((entry) => entry.host)).toEqual(["probed.example"]);
    // But the DENOMINATOR knows all three.
    expect(round.population?.population_known).toBe(3);
    expect(round.population?.population_walked).toBe(1);
  });

  it("names the directories it cannot read, with reasons, on the round itself", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.cdp.coinbase.com")) {
        return Response.json({ items: [] });
      }
      return new Response("down", { status: 500 });
    });
    const round = await runWardRound(testEnv);
    const named = round.directories_unread?.map((entry) => entry.source);
    expect(named).toEqual(UNREAD_DIRECTORIES.map((entry) => entry.source));
    /*
     * NO EXCLUSION MAY READ AS PERMANENT. Every unread entry has to
     * carry the condition that would dissolve it, so a reader can
     * tell a gap we are working on from a gap we have accepted.
     *
     * The assertion used to be "every entry names the wallet law",
     * which held only while both unread directories happened to be
     * paid ones. The roster widened on 2026-09-04 and the new
     * entries are blocked on a captured response shape, not on
     * money — so the test now holds the INVARIANT (a stated
     * unblock) rather than one era's version of it, and pins the
     * wallet law to the two directories it actually governs.
     */
    for (const entry of round.directories_unread ?? []) {
      expect(entry.why.length).toBeGreaterThan(80);
      const dissolvable =
        /wallet law|hand-run|hand-captured|capture/i.test(entry.why);
      expect(dissolvable).toBe(true);
    }
    /*
     * The two paid directories the widening ruling named left this
     * list on 2026-09-04, the day the keeper priced them by hand and
     * the walks were built. They are read now; the census row says
     * whether the last pass stood.
     */
    for (const paid of ["402index.io", "x402scan.com"]) {
      expect(round.directories_unread?.some((row) => row.source === paid)).toBe(false);
      expect(round.population?.per_source.some((row) => row.source === paid)).toBe(true);
    }
  });

  it("a dark fuchss is a failed source on the census, never an empty one", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.cdp.coinbase.com")) {
        return Response.json({
          items: [{ resourceUrl: "https://probed.example/api/buy/x" }],
        });
      }
      return new Response("down", { status: 500 });
    });
    const round = await runWardRound(testEnv);
    expect(round.population?.sources_failed).toContain("fuchss");
  });
});

describe("the readout shows the widening", () => {
  it("prints exact counts and the unread directories", async () => {
    const { renderWardPage } = await import("@/pages/admin/ward-page");
    const html = renderWardPage(
      {
        week: "2026-W33",
        at: "2026-08-10T11:00:00.000Z",
        listed_resources: 40,
        coverage_suspect: false,
        capped: false,
        our_search_presence: true,
        directories_unread: [...UNREAD_DIRECTORIES],
        population: {
          at: "2026-08-10T11:00:00.000Z",
          population_known: 9000,
          population_walked: 180,
          coverage_pct: 2,
          per_source: [
            { source: "discovery", hosts: 40 },
            { source: "fuchss", hosts: 8990 },
          ],
          sources_failed: [],
          carried_forward: 0,
          appeared: ["capped-list.example"],
          appeared_count: 8990,
          disappeared: [],
          disappeared_count: 0,
          returned: [],
          returned_count: 0,
          collapse_suspect: false,
          what_this_cannot_see: [],
        },
        hosts: [],
      },
      null,
      null,
    );
    // The count is the truth, not the capped list's length.
    expect(html).toContain("8990 newly listed");
    /*
     * The unread line names what the round could not read. The two
     * paid directories left it on 2026-09-04 when their walks were
     * built; the hand-capture-pending ones remain, and the line must
     * name those and not the read ones.
     */
    expect(html).toContain("endpoint.x402jp.com");
    expect(html).toContain("agent-tools.cloud");
    expect(html).not.toContain("cannot read: <strong>402index.io");
  });
});
