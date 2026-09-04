import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COLLAPSE_FLOOR,
  populationHistory,
  takeCensus,
  type SourceResult,
} from "@/services/population";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE POPULATION LAYER — enumeration held apart from observation.
 *
 * These tests are mostly about ONE failure: a directory that goes down
 * looks exactly like every host in it dying at once. The corpus is
 * append-only, so a fabricated mass extinction is permanent. Every
 * guard below exists to make the layer choose "I could not tell" over
 * "they are gone."
 */

const T1 = new Date("2026-08-01T00:00:00.000Z");
const T2 = new Date("2026-08-08T00:00:00.000Z");
const T3 = new Date("2026-08-15T00:00:00.000Z");

function source(name: string, hosts: string[] | null): SourceResult {
  return { source: name, hosts };
}

beforeEach(async () => {
  await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
});

describe("counting the population", () => {
  it("unions the sources, dates every host, and states coverage as a fraction of what it knows", async () => {
    const census = await takeCensus(
      testEnv,
      [source("discovery", ["a.example", "b.example"]), source("leaderboard", ["b.example", "c.example"])],
      2,
      T1,
    );
    expect(census.population_known).toBe(3);
    expect(census.population_walked).toBe(2);
    // The whole point of the split: a number beside the verdict saying
    // how much of the world it speaks for.
    expect(census.coverage_pct).toBeCloseTo(66.7, 1);
    expect(census.appeared).toEqual(["a.example", "b.example", "c.example"]);

    const b = await populationHistory(testEnv, "B.Example");
    expect(b?.first_seen).toBe(T1.toISOString());
    // Provenance: both feeds named it, so both are on the record.
    expect(b?.sources).toEqual(["discovery", "leaderboard"]);
  });

  it("keeps first_seen fixed while last_seen moves, which is what makes age a fact rather than a guess", async () => {
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T1);
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T2);
    const record = await populationHistory(testEnv, "a.example");
    expect(record?.first_seen).toBe(T1.toISOString());
    expect(record?.last_seen).toBe(T2.toISOString());
  });
});

describe("a source going dark is not a mass extinction", () => {
  it("carries forward the hosts of an UNREADABLE source instead of burying them", async () => {
    await takeCensus(
      testEnv,
      [source("discovery", ["a.example", "b.example", "c.example"])],
      3,
      T1,
    );
    // Same round shape, except the feed 500s.
    const census = await takeCensus(testEnv, [source("discovery", null)], 0, T2);

    expect(census.sources_failed).toEqual(["discovery"]);
    expect(census.carried_forward).toBe(3);
    expect(census.population_known).toBe(3);
    // Nobody died. We just could not ask.
    expect(census.disappeared).toEqual([]);
    expect((await populationHistory(testEnv, "a.example"))?.gone_at).toBeUndefined();
  });

  it("tells an unreadable source apart from one that answered with nothing", async () => {
    /*
     * The distinction the whole interface is built on. A directory
     * that answers `[]` has made a real and alarming statement about
     * itself; a directory that 500s has made none. Collapsing the two
     * into "no hosts" is how the record learns a lie.
     */
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T1);
    const census = await takeCensus(testEnv, [source("discovery", [])], 0, T2);

    expect(census.sources_failed).toEqual([]);
    expect(census.carried_forward).toBe(0);
    expect(census.disappeared).toEqual(["a.example"]);
  });

  it("suppresses EVERY disappearance when the union collapses past the floor", async () => {
    const many = Array.from({ length: 20 }, (_, index) => `h${index}.example`);
    await takeCensus(testEnv, [source("discovery", many)], 20, T1);

    // A feed that answers, but with a fraction of the world. Nothing
    // marked it unreadable, so carry-forward cannot save us here —
    // the floor has to.
    const survivors = many.slice(0, 5);
    const census = await takeCensus(testEnv, [source("discovery", survivors)], 5, T2);

    expect(census.collapse_suspect).toBe(true);
    expect(census.disappeared).toEqual([]);
    expect(census.what_this_cannot_see.join(" ")).toContain("SUPPRESSED");
    // And nothing was written off on the register either, so a good
    // round next week still gets to raise it — once.
    expect((await populationHistory(testEnv, "h19.example"))?.gone_at).toBeUndefined();

    /*
     * ONE ROUND OF GRACE, AND ONLY ONE — pinned here because the
     * alternative is worse and it is not obvious which way to go.
     *
     * If the floor were measured against the register's live records
     * rather than the last census, suppression would be permanent: a
     * suppressed round writes nobody off, the baseline never falls,
     * and a genuine ecosystem contraction could never be recorded at
     * all. So the instrument gets the benefit of the doubt once, and a
     * union that is STILL small next round is taken as the world.
     *
     * The cost of getting that wrong is bounded, which is what makes
     * it affordable: delisting is reversible here, and a host that
     * comes back is recorded as `returned` with its first_seen intact.
     */
    const recovered = await takeCensus(testEnv, [source("discovery", survivors)], 5, T3);
    expect(recovered.collapse_suspect).toBe(false);
    expect(recovered.disappeared).toHaveLength(15);
  });

  it("does not cry collapse for a drop that stays above the floor", async () => {
    const many = Array.from({ length: 20 }, (_, index) => `h${index}.example`);
    await takeCensus(testEnv, [source("discovery", many)], 20, T1);
    // 14 of 20 = 70%, comfortably over the 60% floor.
    const census = await takeCensus(testEnv, [source("discovery", many.slice(0, 14))], 14, T2);
    expect(COLLAPSE_FLOOR).toBe(0.6);
    expect(census.collapse_suspect).toBe(false);
    expect(census.disappeared).toHaveLength(6);
  });
});

describe("delisting and coming back", () => {
  it("raises a disappearance ONCE, not every week forever", async () => {
    await takeCensus(testEnv, [source("discovery", ["a.example", "b.example"])], 2, T1);
    const gone = await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T2);
    expect(gone.disappeared).toEqual(["b.example"]);

    /*
     * Without gone_at this is where the layer would turn into a
     * broken clock: b.example is still on the register and still not
     * listed, so a naive read reports it dead again every round until
     * the end of time, and the delta becomes noise nobody reads.
     */
    const later = await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T3);
    expect(later.disappeared).toEqual([]);
    expect(later.population_known).toBe(1);
  });

  it("records a host that comes back, which nothing else we run would notice", async () => {
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T1);
    await takeCensus(testEnv, [source("discovery", [])], 0, T2);
    const back = await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T3);

    expect(back.returned).toEqual(["a.example"]);
    // Not a new host — it kept its original first_seen, so its age
    // survives the gap.
    expect(back.appeared).toEqual([]);
    const record = await populationHistory(testEnv, "a.example");
    expect(record?.first_seen).toBe(T1.toISOString());
    expect(record?.gone_at).toBeUndefined();
  });

  it("does not carry a written-off host forward when its source later fails", async () => {
    // Otherwise a dark feed would resurrect everything it ever listed.
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T1);
    await takeCensus(testEnv, [source("discovery", [])], 0, T2);
    const census = await takeCensus(testEnv, [source("discovery", null)], 0, T3);
    expect(census.carried_forward).toBe(0);
    expect(census.returned).toEqual([]);
    expect(census.population_known).toBe(0);
  });
});

describe("what the census refuses to claim", () => {
  it("says out loud that being listed is not being payable", async () => {
    const census = await takeCensus(testEnv, [source("discovery", ["a.example"])], 0, T1);
    const said = census.what_this_cannot_see.join(" ");
    expect(said).toContain("Enumeration says a host EXISTS");
    expect(said).toContain("never 'dead'");
    // coverage_pct is the honest half of the claim: enumerated one,
    // probed none.
    expect(census.coverage_pct).toBe(0);
  });

  it("reports a per-source breakdown with null for the ones it could not read", async () => {
    const census = await takeCensus(
      testEnv,
      [source("discovery", ["a.example"]), source("leaderboard", null)],
      1,
      T1,
    );
    expect(census.per_source).toEqual([
      { source: "discovery", hosts: 1 },
      { source: "leaderboard", hosts: null },
    ]);
  });

  it("writes the reason beside a null, and never beside an answer", async () => {
    const census = await takeCensus(
      testEnv,
      [
        { source: "discovery", hosts: null, why: "capped" },
        { source: "fuchss", hosts: ["a.example"], why: "capped" },
      ],
      1,
      T1,
    );
    expect(census.per_source).toEqual([
      { source: "discovery", hosts: null, why: "capped" },
      { source: "fuchss", hosts: 1 },
    ]);
    // Short is still unread to the census: no delisting gets written.
    expect(census.sources_failed).toEqual(["discovery"]);
  });

  it("has no coverage figure at all when it knows of nobody, rather than reporting 0% or 100%", async () => {
    const census = await takeCensus(testEnv, [source("discovery", [])], 0, T1);
    expect(census.population_known).toBe(0);
    expect(census.coverage_pct).toBeNull();
  });
});

describe("what CV's red team found", () => {
  it("does NOT advance last_seen for a host nobody actually saw", async () => {
    /*
     * The half of the carry-forward finding that made it urgent rather
     * than a note-for-later: carried-forward hosts landed in seenNow,
     * and the update loop stamped today's date on everything in
     * seenNow. So a host kept alive because its directory went dark
     * reported a last_seen of THIS round — on a round where nobody
     * listed it at all.
     *
     * populationHistory feeds the `listing` block on
     * /corpus/host/{host}.json, so that was a published claim to have
     * observed something that did not happen. Exactly what this file
     * exists to refuse.
     */
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T1);
    await takeCensus(testEnv, [source("discovery", null)], 0, T2);
    await takeCensus(testEnv, [source("discovery", null)], 0, T3);

    const record = await populationHistory(testEnv, "a.example");
    // Last actually SEEN at T1, however long we carry it.
    expect(record?.last_seen).toBe(T1.toISOString());
    // And the register says since when it has been taken on trust.
    expect(record?.carried_since).toBe(T2.toISOString());
    expect(record?.gone_at).toBeUndefined();
  });

  it("clears carried_since the moment the source answers again", async () => {
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T1);
    await takeCensus(testEnv, [source("discovery", null)], 0, T2);
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T3);

    const record = await populationHistory(testEnv, "a.example");
    expect(record?.last_seen).toBe(T3.toISOString());
    expect(record?.carried_since).toBeUndefined();
  });

  it("says on the census when hosts are being counted on trust", async () => {
    await takeCensus(testEnv, [source("discovery", ["a.example"])], 1, T1);
    const census = await takeCensus(testEnv, [source("discovery", null)], 0, T2);
    expect(census.carried_forward).toBe(1);
    expect(census.what_this_cannot_see.join(" ")).toContain("by CARRY-FORWARD");
  });

  it("treats one host as one host however the feed spells it", async () => {
    /*
     * Live in our own ingest, not hypothetical: ward-round builds its
     * list from `new URL(url).host`, which keeps the PORT and
     * preserves a TRAILING DOT. Three spellings of one seller became
     * three register entries and inflated the denominator with
     * duplicates of itself.
     */
    const census = await takeCensus(
      testEnv,
      [source("d", ["example.com", "example.com.", "example.com:8443", "EXAMPLE.com"])],
      1,
      T1,
    );
    expect(census.population_known).toBe(1);
    expect(census.appeared).toEqual(["example.com"]);
    expect(census.coverage_pct).toBe(100);
  });

  it("does not mistake an IPv6 literal's colons for a port", async () => {
    // "[::1]:443" has colons inside the brackets; the port is only
    // what follows the closing one.
    const census = await takeCensus(
      testEnv,
      [source("d", ["[2606:4700::1111]", "[2606:4700::1111]:8443"])],
      0,
      T1,
    );
    expect(census.population_known).toBe(1);
    expect(census.appeared).toEqual(["[2606:4700::1111]"]);
  });
});
