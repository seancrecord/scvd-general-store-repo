import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveRegister,
  registerFindings,
  type SourceLiveness,
} from "@/services/source-liveness";
import {
  READ_SOURCES,
  SOURCE_ROSTER,
  UNREAD_DIRECTORIES,
  hostFromUrl,
  readAgenticMarket,
  readX402List,
} from "@/services/ward-sources";
import type { WardRound } from "@/services/ward-round";

/**
 * THE SOURCE REGISTER holds one promise: it states no fact of its own.
 * Every field is read out of stored rounds, so the way to break it is
 * to hand it a history that contradicts the roster and check that the
 * HISTORY wins. A register that could be talked round by its own
 * roster would be the hand-maintained list again, wearing a table.
 */

function round(
  week: string,
  per_source: { source: string; hosts: number | null }[],
  shape: { listed_resources?: number; coverage_suspect?: boolean } = {},
): WardRound {
  return {
    week,
    at: `${week}-taken`,
    listed_resources: shape.listed_resources ?? 1,
    coverage_suspect: shape.coverage_suspect ?? false,
    capped: false,
    our_search_presence: true,
    population: {
      at: `${week}-taken`,
      population_known: 1,
      population_walked: 1,
      coverage_pct: 100,
      per_source,
      sources_failed: per_source.filter((r) => r.hosts === null).map((r) => r.source),
      carried_forward: 0,
      appeared: [],
      disappeared: [],
      returned: [],
      collapse_suspect: false,
      what_this_cannot_see: [],
    },
    hosts: [],
  } as unknown as WardRound;
}

function rowFor(sources: SourceLiveness[], id: string): SourceLiveness {
  const row = sources.find((entry) => entry.source === id);
  if (!row) throw new Error(`no row for ${id}`);
  return row;
}

/**
 * THE REGISTER'S FIRST LIVE FINDING WAS HALF WRONG (2026-09-04). On
 * production the CDP discovery feed read never_answered with five
 * failed rounds and a roster disagreement, beside a heartbeat saying
 * the round had probed a thousand hosts off that same feed. The census
 * records a page-capped listing as null on principle — a partial
 * enumeration cannot tell a delisting from a page never reached — and
 * the first cut of this file read that null as a feed that never
 * spoke. Both readings were true and the word was wrong.
 */
describe("a feed the census refuses to count is partial, not dead", () => {
  const capped = { listed_resources: 6000, coverage_suspect: true };

  it("reads a page-capped discovery round as partial, never as a failure", () => {
    const register = deriveRegister(
      [
        round("2026-W36", [{ source: "discovery", hosts: null }], capped),
        round("2026-W35", [{ source: "discovery", hosts: null }], capped),
      ],
      false,
    );
    const row = rowFor(register.sources, "discovery");
    expect(row.status).toBe("partial");
    expect(row.consecutive_failures).toBe(0);
    expect(row.partial_rounds).toBe(2);
    expect(row.last_answered_week).toBe("2026-W36");
    // A feed we decline to count is not a reader that got nothing.
    expect(row.roster_disagrees).toBe(false);
    expect(registerFindings(register).join(" ")).toContain("would not count it");
  });

  it("keeps last_successful_read for countable reads only", () => {
    const register = deriveRegister(
      [round("2026-W36", [{ source: "discovery", hosts: null }], capped)],
      false,
    );
    const row = rowFor(register.sources, "discovery");
    expect(row.last_successful_read).toBeNull();
    expect(row.hosts_on_last_read).toBeNull();
  });

  it("is stale, not partial, when it answered uncountably before and not now", () => {
    const register = deriveRegister(
      [
        round("2026-W36", [{ source: "discovery", hosts: null }], { listed_resources: 0, coverage_suspect: false }),
        round("2026-W35", [{ source: "discovery", hosts: null }], capped),
      ],
      false,
    );
    const row = rowFor(register.sources, "discovery");
    expect(row.status).toBe("stale");
    expect(row.consecutive_failures).toBe(1);
    expect(row.roster_disagrees).toBe(false);
  });

  it("does not extend the grace to a source the round carries no evidence for", () => {
    const register = deriveRegister(
      [round("2026-W36", [{ source: "fuchss", hosts: null }], capped)],
      false,
    );
    const row = rowFor(register.sources, "fuchss");
    expect(row.status).toBe("never_answered");
    expect(row.consecutive_failures).toBe(1);
  });
});

describe("the register reads history, not prose", () => {
  it("dates the last successful pull off the round that actually answered", () => {
    const register = deriveRegister(
      [
        round("2026-W36", [{ source: "fuchss", hosts: null }]),
        round("2026-W35", [{ source: "fuchss", hosts: null }]),
        round("2026-W34", [{ source: "fuchss", hosts: 9000 }]),
      ],
      false,
    );
    const fuchss = rowFor(register.sources, "fuchss");
    expect(fuchss.status).toBe("stale");
    expect(fuchss.last_successful_week).toBe("2026-W34");
    expect(fuchss.hosts_on_last_read).toBe(9000);
    // Two rounds have failed since; the count is the alarm's whole basis.
    expect(fuchss.consecutive_failures).toBe(2);
    expect(fuchss.rounds_since_answer).toBe(2);
  });

  it("calls a source live only when the newest round got an answer", () => {
    const register = deriveRegister(
      [
        round("2026-W36", [{ source: "fuchss", hosts: 10 }]),
        round("2026-W35", [{ source: "fuchss", hosts: null }]),
      ],
      false,
    );
    const fuchss = rowFor(register.sources, "fuchss");
    expect(fuchss.status).toBe("live");
    expect(fuchss.consecutive_failures).toBe(0);
    expect(registerFindings(register)).toEqual([]);
  });

  /**
   * THE DISAGREEMENT IS THE PRODUCT. A reader built against a shape
   * that never existed answers null forever, and the roster keeps
   * calling it readable — which is precisely the "configured and
   * silently records nothing" failure. It has to surface as a finding
   * rather than as a slightly low number.
   */
  it("flags a source the roster calls readable that no round has ever read", () => {
    const register = deriveRegister(
      [
        round("2026-W36", [{ source: "agentic_market", hosts: null }]),
        round("2026-W35", [{ source: "agentic_market", hosts: null }]),
      ],
      false,
    );
    const row = rowFor(register.sources, "agentic_market");
    expect(row.status).toBe("never_answered");
    expect(row.roster_disagrees).toBe(true);
    expect(registerFindings(register).join(" ")).toContain("agentic_market");
  });

  /**
   * A fresh store has no evidence against its own roster. Accusing
   * itself on day one would make the finding meaningless on day two.
   */
  it("does not accuse a reader before any round has asked it anything", () => {
    const register = deriveRegister([], false);
    for (const row of register.sources) {
      expect(row.roster_disagrees).toBe(false);
    }
    expect(registerFindings(register)).toEqual([]);
  });

  /**
   * Rounds recorded before the population layer existed carry no
   * census. Counting those as failures would score a source down for
   * a question nobody put to it — the same error as calling an
   * unprobed host dead.
   */
  it("skips rounds where nobody asked, rather than counting them as failures", () => {
    const noCensus = { week: "2026-W30", at: "x", hosts: [] } as unknown as WardRound;
    const register = deriveRegister(
      [noCensus, round("2026-W29", [{ source: "fuchss", hosts: 5 }])],
      false,
    );
    const fuchss = rowFor(register.sources, "fuchss");
    expect(fuchss.rounds_seen).toBe(1);
    expect(fuchss.consecutive_failures).toBe(0);
    expect(fuchss.status).toBe("live");
  });

  it("carries the reason and the unblock for every source it does not read", () => {
    const register = deriveRegister([], false);
    const unread = register.sources.filter((row) => row.status === "unread");
    expect(unread.length).toBeGreaterThan(0);
    for (const row of unread) {
      expect(row.why_unread).toBeTruthy();
      expect(row.unblock).toBeTruthy();
      expect(row.last_successful_read).toBeNull();
    }
  });
});

/**
 * The published `directories_unread` field rides the hash-chained,
 * Bitcoin-anchored corpus. Deriving it from the roster was a
 * refactor; changing its shape would have been rewriting history.
 */
describe("the roster keeps the corpus's wire shape", () => {
  it("derives UNREAD_DIRECTORIES as {source, why} and nothing else", () => {
    expect(UNREAD_DIRECTORIES.length).toBeGreaterThan(0);
    for (const entry of UNREAD_DIRECTORIES) {
      expect(Object.keys(entry).sort()).toEqual(["source", "why"]);
      expect(typeof entry.why).toBe("string");
      expect(entry.why.length).toBeGreaterThan(0);
    }
  });

  it("still names both paid directories the widening ruling named", () => {
    const named = UNREAD_DIRECTORIES.map((entry) => entry.source);
    expect(named).toContain("402index.io");
    expect(named).toContain("x402scan.com");
  });

  it("never lists a source as both read and unread", () => {
    const unread = new Set(UNREAD_DIRECTORIES.map((entry) => entry.source));
    for (const id of READ_SOURCES) expect(unread.has(id)).toBe(false);
    expect(READ_SOURCES.length + unread.size).toBe(SOURCE_ROSTER.length);
  });

  it("gives every roster entry a home and a description a stranger can use", () => {
    for (const entry of SOURCE_ROSTER) {
      expect(entry.home).toMatch(/^https:\/\//);
      expect(entry.what.length).toBeGreaterThan(20);
    }
  });
});

describe("hostFromUrl refuses to manufacture a host", () => {
  it("takes a host out of a URL or a bare hostname", () => {
    expect(hostFromUrl("https://Example.com/path")).toBe("example.com");
    expect(hostFromUrl("example.com")).toBe("example.com");
  });

  it("returns null rather than a phantom row", () => {
    for (const bad of ["", "   ", null, undefined, 42, {}, "not a host"]) {
      expect(hostFromUrl(bad)).toBeNull();
    }
  });
});

/**
 * Both new readers obey the population layer's founding law: a read
 * that is partial, or a 200 whose shape moved, is UNREAD. Returning a
 * short list instead would let one bad Sunday write a mass extinction
 * into a chain that does not rewrite.
 */
describe("the x402-list reader", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(pages: Record<string, unknown>) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const page = new URL(url).searchParams.get("page") ?? "1";
      const body = pages[page];
      if (body === undefined) return new Response("no", { status: 500 });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  }

  it("walks every page and returns the hosts", async () => {
    stub({
      "1": {
        meta: { total_pages: 2 },
        data: [{ base_url: "https://alpha.example" }, { base_url: "https://beta.example" }],
      },
      "2": { meta: { total_pages: 2 }, data: [{ base_url: "https://gamma.example" }] },
    });
    const hosts = await readX402List("scvd.store");
    expect(hosts?.sort()).toEqual(["alpha.example", "beta.example", "gamma.example"]);
  });

  it("drops our own host without dropping the read", async () => {
    stub({
      "1": {
        meta: { total_pages: 1 },
        data: [{ base_url: "https://scvd.store" }, { base_url: "https://alpha.example" }],
      },
    });
    expect(await readX402List("scvd.store")).toEqual(["alpha.example"]);
  });

  it("is unread when any page fails, not short", async () => {
    stub({
      "1": { meta: { total_pages: 3 }, data: [{ base_url: "https://alpha.example" }] },
      "2": { meta: { total_pages: 3 }, data: [{ base_url: "https://beta.example" }] },
    });
    expect(await readX402List("scvd.store")).toBeNull();
  });

  it("is unread when the shape moves under us", async () => {
    stub({ "1": { meta: { total_pages: 1 }, rows: [{ base_url: "https://alpha.example" }] } });
    expect(await readX402List("scvd.store")).toBeNull();
  });

  it("is unread when the page count runs past the ceiling", async () => {
    stub({ "1": { meta: { total_pages: 5000 }, data: [] } });
    expect(await readX402List("scvd.store")).toBeNull();
  });

  /**
   * A directory that answered with an empty list has told us
   * something real and alarming about itself. That is distinct from
   * being unreadable, and the census keeps the two apart.
   */
  it("reports an empty directory as empty, not as unreadable", async () => {
    stub({ "1": { meta: { total_pages: 1 }, data: [] } });
    expect(await readX402List("scvd.store")).toEqual([]);
  });
});

describe("the agentic.market reader", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(body: unknown, status = 200) {
    vi.stubGlobal("fetch", async () =>
      status === 200
        ? new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          })
        : new Response("no", { status }),
    );
  }

  it("reads hosts out of the shape the check script already parses", async () => {
    stub({
      services: [
        { domain: "alpha.example" },
        { endpoints: [{ url: "https://beta.example/api/buy" }] },
      ],
    });
    expect((await readAgenticMarket("scvd.store"))?.sort()).toEqual([
      "alpha.example",
      "beta.example",
    ]);
  });

  /**
   * The shape here is BORROWED from a search endpoint, never captured
   * from an enumeration one. So every unrecognised answer must fail
   * loudly — a silent empty read is how a source ends up looking
   * configured while recording nothing, which is the exact failure
   * the register above exists to catch.
   */
  it("is unread on an unrecognised shape rather than silently empty", async () => {
    for (const body of [{}, { data: [] }, { services: [] }, { services: [{ nope: 1 }] }]) {
      stub(body);
      expect(await readAgenticMarket("scvd.store")).toBeNull();
    }
  });

  it("is unread when the host refuses", async () => {
    stub(null, 503);
    expect(await readAgenticMarket("scvd.store")).toBeNull();
  });
});
