import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import { subjectHistory } from "@/services/subject-history";
import { takeCensus } from "@/services/population";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE PER-SUBJECT HISTORY — "what has this store observed about X."
 *
 * The timeline is the easy half and nobody would get it wrong. THE
 * GAPS ARE THE PRODUCT, so that is what these tests are about: every
 * round with no verdict has to carry a reason, the reasons have to be
 * told apart from each other, and the one aggregate everybody wants
 * has to stay unpublished.
 */

/** Calendars answer instantly and locally; no network, no flake. */
const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () =>
    new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  failed: string[] = [],
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/x402`,
    verdict,
    failed,
    advisories: [],
    source: "discovery",
  };
}

function round(
  week: string,
  hosts: WardHostResult[],
  extra: Partial<WardRound> = {},
): WardRound {
  return {
    week,
    at: `2026-0${week.slice(-1)}-01T00:00:00.000Z`,
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
    ...extra,
  };
}

/**
 * Freeze one round into the chain. Week is the identity, so each
 * differs. `at` dates the freezes when a test needs the chain and the
 * population register to sit at known distances from each other.
 */
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

describe("replaying one host out of the chain", () => {
  it("puts every observation on a timeline that points back at the signed entry it came from", async () => {
    await chain([
      round("2026-W01", [host("a.example", "ready")]),
      round("2026-W02", [host("a.example", "not_ready", ["accepts_shape"])]),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);

    expect(history.timeline).toHaveLength(2);
    expect(history.rounds_probed).toBe(2);
    expect(history.timeline[1]!.verdict).toBe("not_ready");
    expect(history.timeline[1]!.failed).toEqual(["accepts_shape"]);
    // Every row names the entry it was derived from, so a reader who
    // does not trust this view can rebuild it from the signed record.
    expect(history.timeline[0]!.entry_url).toBe(`${BASE}/corpus/1.json`);
    expect(history.timeline[0]!.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records verdict changes as dated transitions", async () => {
    await chain([
      round("2026-W01", [host("a.example", "ready")]),
      round("2026-W02", [host("a.example", "unreachable")]),
      round("2026-W03", [host("a.example", "ready")]),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);
    expect(history.verdict_changes).toHaveLength(2);
    expect(history.verdict_changes[0]).toMatchObject({
      from: "ready",
      to: "unreachable",
      week: "2026-W02",
    });
    expect(history.verdict_changes[1]).toMatchObject({
      from: "unreachable",
      to: "ready",
    });
  });

  it("matches a host case-insensitively, because a host name is not case-sensitive", async () => {
    await chain([round("2026-W01", [host("a.example", "ready")])]);
    expect((await subjectHistory(testEnv, "A.Example", BASE)).rounds_probed).toBe(1);
  });

  it("answers for a host it has never seen without inventing a record", async () => {
    await chain([round("2026-W01", [host("a.example", "ready")])]);
    const history = await subjectHistory(testEnv, "stranger.example", BASE);
    expect(history.rounds_in_chain).toBe(1);
    expect(history.rounds_since_first_sighting).toBe(0);
    expect(history.observation_coverage_pct).toBeNull();
    expect(history.first_observed).toBeNull();
    // The one round IS in the timeline, marked as predating our first
    // sight — an empty answer would look like a lookup failure.
    expect(history.timeline[0]!.gap).toBe("before_first_sighting");
  });
});

describe("the gaps, which are the whole product", () => {
  it("does not count rounds before it ever saw the host against its coverage", async () => {
    await chain([
      round("2026-W01", [host("other.example", "ready")]),
      round("2026-W02", [host("other.example", "ready")]),
      round("2026-W03", [host("a.example", "ready")]),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);

    expect(history.timeline).toHaveLength(3);
    expect(history.gaps_by_reason.before_first_sighting).toBe(2);
    // Denominator is rounds since we met, not rounds in the chain.
    // Otherwise a host met last week looks like one we spent a year
    // failing to watch.
    expect(history.rounds_since_first_sighting).toBe(1);
    expect(history.observation_coverage_pct).toBe(100);
  });

  it("tells NOT LISTED apart from LISTED BUT NOT WALKED", async () => {
    /*
     * The distinction the enumeration/observation split exists for.
     * One says the directories stopped naming it; the other says we
     * chose not to spend a request. Collapsing them into one blank is
     * what the large monitors do.
     */
    await chain([
      round("2026-W01", [host("a.example", "ready")]),
      round("2026-W02", []),
      round("2026-W03", [host("a.example", "not_probed")]),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);

    expect(history.gaps_by_reason.not_listed).toBe(1);
    expect(history.gaps_by_reason.listed_not_walked).toBe(1);
    expect(history.timeline[1]!.listed).toBe(false);
    expect(history.timeline[2]!.listed).toBe(true);
    expect(history.timeline[2]!.probed).toBe(false);
    expect(history.rounds_probed).toBe(1);
    expect(history.rounds_gapped).toBe(2);
    expect(history.observation_coverage_pct).toBeCloseTo(33.3, 1);
  });

  /**
   * FOUND LIVE 2026-08-24, ON OUR OWN PUBLISHED SURFACE.
   *
   * /corpus/host/hypernatt.com.json served `rounds_probed: 0` with all
   * three rounds marked "Not a miss — we had not met", inside the same
   * document whose `listing` block said first_seen 2026-08-11 and
   * last_seen 2026-08-23. Two adjacent fields, one of them false.
   *
   * The cause was reading first sight from the chain alone. A ward
   * round walks a few dozen hosts out of thousands enumerated — that
   * round had walked 40 of 5,873 — so for all but the walked handful
   * the chain has no sighting, and the fallback stamped the friendliest
   * possible reason across every round. The true reason was
   * LISTED_NOT_WALKED the whole time, which is a fact about our cadence
   * and not about the operator.
   *
   * A gap surface that mislabels its own gaps is worse than no gap
   * surface, because it is believed.
   */
  it("does not say WE HAD NOT MET about a host the register has been listing", async () => {
    // Enumerated on the 11th, still enumerated on the 23rd — exactly
    // hypernatt's listing block.
    for (const day of ["2026-08-11", "2026-08-23"]) {
      await takeCensus(
        testEnv,
        [{ source: "fuchss", hosts: ["listed.example"] }],
        1,
        new Date(`${day}T00:00:00.000Z`),
      );
    }
    // And in between, a round that walked somebody else entirely.
    await chain(
      [round("2026-W01", [host("other.example", "ready")])],
      [new Date("2026-08-19T00:00:00.000Z")],
    );
    const history = await subjectHistory(testEnv, "listed.example", BASE);

    expect(history.gaps_by_reason.before_first_sighting).toBe(0);
    expect(history.gaps_by_reason.listed_not_walked).toBe(1);
    expect(history.timeline[0]!.listed).toBe(true);
    expect(history.timeline[0]!.listing_source).toBe("register");
    expect(history.timeline[0]!.note).toContain("not knocked on");
    // And the denominator counts it, so the coverage figure stops
    // flattering us for the rounds we skipped.
    expect(history.rounds_since_first_sighting).toBe(1);
    expect(history.observation_coverage_pct).toBe(0);
  });

  it("still says WE HAD NOT MET for the rounds that truly predate both records", async () => {
    await chain(
      [round("2026-W01", [host("other.example", "ready")])],
      [new Date("2026-08-19T00:00:00.000Z")],
    );
    await takeCensus(
      testEnv,
      [{ source: "fuchss", hosts: ["late.example"] }],
      1,
      // Dated after the round above was frozen, so nothing knew of it.
      new Date("2026-08-20T00:00:00.000Z"),
    );
    const history = await subjectHistory(testEnv, "late.example", BASE);

    expect(history.gaps_by_reason.before_first_sighting).toBe(1);
    expect(history.rounds_since_first_sighting).toBe(0);
    expect(history.observation_coverage_pct).toBeNull();
  });

  /**
   * LEDGER H2 — A REVISIT WAS PUBLISHED AS A LISTING.
   *
   * Every probed row carried `listed: true`, but `source: "revisit"`
   * means, in the door bank's own words, "no feed named it THIS
   * round" — the probe walked a resource URL a PAST discovery round
   * declared, to keep breadth when a feed's coverage is suspect.
   *
   * So a host delisted from every directory but still in the bank
   * read as continuously listed in its own published history. PROBED
   * was silently converted into LISTED, which is the same substitution
   * this file was already caught making in the other direction on
   * 2026-08-24 — a derived label asserting more than the record
   * behind it.
   *
   * It matters because the listing side is a fact about the
   * DIRECTORIES, not the host. Reporting a revisit as a listing hides
   * a host's disappearance from the feeds behind our own decision to
   * keep knocking.
   */
  it("does not report a revisit probe as a listing", async () => {
    await chain([
      round("2026-W01", [
        { ...host("gone.example", "ready"), source: "revisit" },
      ]),
    ]);
    const history = await subjectHistory(testEnv, "gone.example", BASE);
    const row = history.timeline[0]!;

    expect(row.probed).toBe(true);
    expect(row.verdict).toBe("ready");
    // We knocked and it answered — but nobody listed it that round.
    expect(row.listed).toBe(false);
    expect(row.source).toBe("revisit");
  });

  it("still reports a discovery probe as a listing", async () => {
    await chain([round("2026-W01", [host("named.example", "ready")])]);
    const history = await subjectHistory(testEnv, "named.example", BASE);
    expect(history.timeline[0]!.listed).toBe(true);
  });

  it("prefers the round's own walked set as the listing source when it has one", async () => {
    await takeCensus(
      testEnv,
      [{ source: "fuchss", hosts: ["a.example"] }],
      1,
      new Date("2026-08-11T00:00:00.000Z"),
    );
    await chain(
      [round("2026-W01", [host("a.example", "not_probed")])],
      [new Date("2026-08-19T00:00:00.000Z")],
    );
    const history = await subjectHistory(testEnv, "a.example", BASE);

    expect(history.timeline[0]!.listed).toBe(true);
    expect(history.timeline[0]!.listing_source).toBe("round");
    expect(history.gaps_by_reason.listed_not_walked).toBe(1);
  });

  it("blames the instrument, not the host, when the round hit its cap", async () => {
    await chain([
      round("2026-W01", [host("a.example", "ready")]),
      round("2026-W02", [], { capped: true }),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);
    expect(history.gaps_by_reason.possibly_beyond_cap).toBe(1);
    expect(history.gaps_by_reason.not_listed).toBe(0);
    expect(history.timeline[1]!.note).toContain("will not guess");
  });

  it("blames the instrument when the round recorded coverage trouble", async () => {
    await chain([
      round("2026-W01", [host("a.example", "ready")]),
      round("2026-W02", [], { coverage_suspect: true }),
      round("2026-W03", [], {
        coverage_drop: {
          previous_hosts: 100,
          this_round: 12,
          previous_at: "2026-02-01T00:00:00.000Z",
        },
      }),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);
    expect(history.gaps_by_reason.instrument_degraded).toBe(2);
    expect(history.gaps_by_reason.not_listed).toBe(0);
  });

  it("says a not-listed round is about the DIRECTORIES, in those words", async () => {
    await chain([
      round("2026-W01", [host("a.example", "ready")]),
      round("2026-W02", []),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);
    const note = history.timeline[1]!.note;
    expect(note).toContain("DIRECTORIES");
    expect(note).toContain("not 'went down'");
  });
});

describe("what it refuses to publish", () => {
  it("publishes no reliability figure, and says the refusal out loud", async () => {
    /*
     * Rule 43, at the exact point where breaking it would be most
     * useful. Ready-in-2-of-3 is one division away and it is an
     * accumulating score on an operator. The dated observations are
     * all here; the ratio is not, and the document says why rather
     * than leaving a reader to assume we forgot.
     */
    await chain([
      round("2026-W01", [host("a.example", "ready")]),
      round("2026-W02", [host("a.example", "unreachable")]),
      round("2026-W03", [host("a.example", "ready")]),
    ]);
    const history = await subjectHistory(testEnv, "a.example", BASE);

    const keys = Object.keys(history);
    expect(keys).not.toContain("ready_pct");
    expect(keys).not.toContain("reliability");
    expect(keys).not.toContain("uptime_pct");

    const said = history.what_this_cannot_see.join(" ");
    expect(said).toContain("refusal rather than a limitation");
    // 2026-09-02: the refusal is of the bare quotient, not the division.
    expect(said).toContain("verdict without its derivation");
    // The only percentage on the object is about OUR coverage.
    expect(history.observation_coverage_pct).toBe(100);
  });

  it("does not claim a ready verdict means more than one GET at one moment", async () => {
    await chain([round("2026-W01", [host("a.example", "ready")])]);
    const history = await subjectHistory(testEnv, "a.example", BASE);
    expect(history.timeline[0]!.note).toContain("nothing about the minute before or after");
    expect(history.what_this_cannot_see.join(" ")).toContain("Anything between rounds");
  });
});

describe("the door it is served through", () => {
  it("serves one host at /corpus/host/{host}.json without colliding with the sequence route", async () => {
    await chain([round("2026-W01", [host("a.example", "ready")])]);

    const subject = await SELF.fetch(`${BASE}/corpus/host/a.example.json`);
    expect(subject.status).toBe(200);
    const body = (await subject.json()) as Record<string, unknown>;
    expect(body["host"]).toBe("a.example");
    expect(body["rounds_probed"]).toBe(1);

    // The numeric entry route still answers; the two patterns are
    // distinct and this is the test that keeps them that way.
    const entry = await SELF.fetch(`${BASE}/corpus/1.json`);
    expect(entry.status).toBe(200);
    expect((await entry.json() as Record<string, unknown>)["digest"]).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("refuses a host name that is not one, and points at the index instead", async () => {
    const response = await SELF.fetch(
      `${BASE}/corpus/host/${encodeURIComponent("../secrets")}.json`,
    );
    expect(response.status).toBe(400);
    expect(
      ((await response.json()) as Record<string, string>)["error"],
    ).toContain("/corpus.json");
  });

  it("advertises the per-subject read on the index, as a template rather than a list", async () => {
    // A crawler has to be able to find this without being told, and
    // enumerating every host would bloat the index for no reader.
    const index = (await (await SELF.fetch(`${BASE}/corpus.json`)).json()) as {
      per_subject: Record<string, string>;
    };
    expect(index.per_subject["url_template"]).toBe(
      `${BASE}/corpus/host/{host}.json`,
    );
    expect(index.per_subject["what_it_will_not_answer"]).toContain(
      "figure without its working",
    );
  });
});

describe("the enumeration layer rides alongside", () => {
  it("carries the population register's listing record when there is one", async () => {
    await takeCensus(
      testEnv,
      [{ source: "discovery", hosts: ["a.example"] }],
      1,
      new Date("2026-08-01T00:00:00.000Z"),
    );
    await chain([round("2026-W01", [host("a.example", "ready")])]);
    const history = await subjectHistory(testEnv, "a.example", BASE);
    expect(history.listing?.first_seen).toBe("2026-08-01T00:00:00.000Z");
    expect(history.listing?.sources).toEqual(["discovery"]);
  });

  it("still answers when the register knows nothing, and says the chain is the longer record", async () => {
    // The register began the day the population layer shipped, so
    // every host observed before then has chain history and no
    // listing record. That must not read as a lookup failure.
    await chain([round("2026-W01", [host("a.example", "ready")])]);
    const history = await subjectHistory(testEnv, "a.example", BASE);
    expect(history.listing).toBeNull();
    expect(history.rounds_probed).toBe(1);
    expect(history.what_this_cannot_see.join(" ")).toContain(
      "began with the population layer",
    );
  });
});
