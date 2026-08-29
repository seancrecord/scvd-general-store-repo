import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import { deriveDoorIndex } from "@/services/door-index";
import type { CorpusRecord } from "@/services/corpus";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/** A browser needs BOTH headers, the 2026-08-28 paywall lesson. */
const BROWSER = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/**
 * THE LIST THE CENSUS NEVER PUBLISHED (#26, 2026-08-29).
 *
 * The store served hundreds of per-host histories and no way to learn
 * which hosts it had: /corpus.json indexes SNAPSHOTS and
 * /corpus/host/{host}.json is a template you must already know a
 * hostname to use. Every fact was public; the list of them was not.
 *
 * The task called it a scoreboard and it deliberately is not one, so
 * a good half of this file is about what must NOT appear.
 */

function row(host: string, verdict: string, failed: string[] = []) {
  return { host, url: `https://${host}/x`, verdict, failed, advisories: [] };
}

function round(week: string, rows: ReturnType<typeof row>[]): WardRound {
  return {
    week,
    at: new Date().toISOString(),
    listed_resources: rows.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: rows as unknown as WardRound["hosts"],
  };
}

/** A signed-looking record, for the pure derivation tests. */
function record(sequence: number, week: string, rows: ReturnType<typeof row>[]) {
  return {
    snapshot: {
      version: 1,
      sequence,
      taken_at: new Date().toISOString(),
      previous_digest: null,
      source: "ward_round",
      week,
      round: round(week, rows),
    },
    digest: `digest-${sequence}`,
    signature: "sig",
    public_key: "key",
  } as unknown as CorpusRecord;
}

async function sweep(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(
    listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)),
  );
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
}

beforeEach(sweep);

describe("folding the chain into one entry per door", () => {
  /**
   * THE ORDER-DEPENDENT ONE, and it is the failure most worth
   * catching: a fold that let an OLD row win would publish a stale
   * verdict as the current one, on a page whose entire product is
   * dates. The two rounds disagree deliberately.
   */
  it("takes the most recent observation, never the first", () => {
    const index = deriveDoorIndex([
      record(1, "2026-W30", [row("a.example", "not_ready", ["x402-challenge"])]),
      record(2, "2026-W31", [row("a.example", "ready")]),
    ]);
    expect(index.hosts).toHaveLength(1);
    const entry = index.hosts[0]!;
    expect(entry.latest_verdict).toBe("ready");
    expect(entry.latest_verdict_week).toBe("2026-W31");
    expect(entry.latest_verdict_sequence).toBe(2);
    expect(entry.latest_failed).toEqual([]);
    expect(entry.first_seen).toBe("2026-W30");
    expect(entry.last_seen).toBe("2026-W31");
    expect(entry.rounds_present).toBe(2);
  });

  /**
   * rounds_scored is a DENOMINATOR and it has to mean what it says:
   * rows nobody probed are not rows anybody judged. Counting them
   * would inflate the weight behind every entry — the same defect the
   * battery tally was built to avoid.
   */
  it("counts only rounds that reached a real verdict", () => {
    const index = deriveDoorIndex([
      record(1, "2026-W30", [row("a.example", "not_probed")]),
      record(2, "2026-W31", [row("a.example", "unreachable")]),
      record(3, "2026-W32", [row("a.example", "ready")]),
      record(4, "2026-W33", [row("a.example", "not_ready", ["x402-challenge"])]),
    ]);
    const entry = index.hosts[0]!;
    expect(entry.rounds_present).toBe(4);
    expect(entry.rounds_scored).toBe(2);
  });

  /**
   * ALPHABETICAL IS A RULING, not a default. Any other order is an
   * editorial claim about which door matters most, which is the claim
   * this store exists not to make.
   */
  it("orders the list alphabetically and by nothing else", () => {
    const index = deriveDoorIndex([
      record(1, "2026-W30", [
        row("zeta.example", "ready"),
        row("alpha.example", "not_ready", ["x402-challenge"]),
        row("mid.example", "unreachable"),
      ]),
    ]);
    expect(index.hosts.map((entry) => entry.host)).toEqual([
      "alpha.example",
      "mid.example",
      "zeta.example",
    ]);
  });

  it("counts each door once into its latest bucket", () => {
    const index = deriveDoorIndex([
      record(1, "2026-W30", [row("a.example", "ready"), row("b.example", "ready")]),
      record(2, "2026-W31", [
        row("a.example", "not_ready", ["x402-challenge"]),
        row("b.example", "ready"),
      ]),
    ]);
    expect(index.total_hosts).toBe(2);
    expect(index.by_latest_verdict).toEqual({ ready: 1, not_ready: 1 });
    // The buckets must sum to the population, or one of them is lying.
    const summed = Object.values(index.by_latest_verdict).reduce((a, b) => a + b, 0);
    expect(summed).toBe(index.total_hosts);
  });

  it("invents nothing when the chain is empty", () => {
    const index = deriveDoorIndex([]);
    expect(index).toMatchObject({ total_hosts: 0, weeks_read: 0, latest_week: null });
    expect(index.hosts).toEqual([]);
  });

  it("ignores rows with no host rather than inventing an empty one", () => {
    const index = deriveDoorIndex([
      record(1, "2026-W30", [
        { url: "x", verdict: "ready", failed: [], advisories: [] } as never,
        row("a.example", "ready"),
      ]),
    ]);
    expect(index.hosts.map((entry) => entry.host)).toEqual(["a.example"]);
  });
});

/**
 * THE SURFACE. A fold nobody can call is not a published list — the
 * mistake this repository made twice in one day on 2026-08-29, first
 * with a storefront line wired to nothing and then with a battery
 * tally that no route served.
 */
describe("the list is served, at its own door", () => {
  async function seed(week: string, rows: ReturnType<typeof row>[]): Promise<void> {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round(week, rows)));
    const pass = await takeCorpusSnapshot(testEnv, {
      calendars: ["https://calendar.test"],
      fetch: (async () =>
        new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
    });
    expect(pass.taken).toBe(true);
  }

  it("answers with every door and the shape a caller needs", async () => {
    await seed("2026-W35", [
      row("beta.example", "not_ready", ["x402-challenge"]),
      row("alpha.example", "ready"),
    ]);
    const body = (await (await SELF.fetch(`${BASE}/doors.json`)).json()) as any;
    expect(body.total_hosts).toBe(2);
    expect(body.hosts.map((entry: any) => entry.host)).toEqual([
      "alpha.example",
      "beta.example",
    ]);
    // Absolute, so a caller can follow it without knowing our origin.
    expect(body.hosts[0].url).toBe(`${BASE}/corpus/host/alpha.example.json`);
    // Rule 55: the path to check us without trusting us.
    expect(body.how_to_rederive).toContain("/corpus.json");
  });

  /**
   * THE ONE THAT DECIDES WHETHER THIS IS THE THING THE TASK ASKED FOR
   * OR THE THING THE STORE FORBIDS. /llms.txt has published since the
   * beginning: "Nothing here is a score, a rating, or a ranking."
   * #26's own title says "scoreboard". This is the guard that keeps
   * the build on the right side of that sentence — a ratio field
   * appearing here is the whole store changing its mind, and it
   * should have to do that on purpose.
   */
  it("publishes no ratio, no score and no standing", async () => {
    /*
     * TWO WEEKS, AND ONE OF THEM UNSCORED, ON PURPOSE. The first
     * draft of this fixture gave every host rounds_scored ===
     * rounds_present, which makes every ratio you could compute
     * exactly 1 — an integer. A deliberately planted
     * `rounds_scored / rounds_present` field sailed through the
     * fractional check on that fixture. A guard that cannot fail is
     * the thing this store keeps catching in its own work, and it
     * caught this one.
     */
    await seed("2026-W34", [
      row("alpha.example", "not_probed"),
      row("beta.example", "not_ready", ["x402-challenge"]),
    ]);
    await seed("2026-W35", [
      row("alpha.example", "ready"),
      row("beta.example", "not_ready", ["x402-challenge"]),
    ]);
    const response = await SELF.fetch(`${BASE}/doors.json`);
    const body = (await response.json()) as any;
    const keys = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          keys.add(key);
          walk(value);
        }
      }
    };
    walk(body.hosts);
    walk(body.by_latest_verdict);
    /*
     * `rounds_scored` is deliberately allowed and is not the thing
     * being banned. It counts rounds in which a battery reached a
     * verdict — the census's existing word, the same one
     * battery-delta.ts uses for its denominator. What is forbidden is
     * an accumulated judgment OF THE OPERATOR, which is a different
     * object entirely.
     */
    const allowed = new Set(["rounds_scored"]);
    for (const banned of ["score", "rating", "rank", "ratio", "percent", "reliability", "uptime", "grade"]) {
      expect(
        [...keys].filter((key) => key.includes(banned) && !allowed.has(key)),
        `a field named for ${banned} appeared in the door list. This store publishes dated observations and no accumulated judgment of any operator; shipping one means amending the sentence in /llms.txt that says so, in public, on purpose.`,
      ).toEqual([]);
    }

    /*
     * THE STRONGER HALF, because a ratio could arrive under an
     * innocent name. Every number an entry carries is a COUNT — a
     * week index, a tally of rounds, a sequence. A fractional value
     * anywhere in a host row is arithmetic somebody performed on an
     * operator's record, which is the one operation this store does
     * not do.
     */
    const fractional: string[] = [];
    for (const entry of body.hosts as Record<string, unknown>[]) {
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === "number" && !Number.isInteger(value)) {
          fractional.push(`${key}=${value}`);
        }
      }
    }
    expect(
      fractional,
      "a host entry carries a fractional number. Every figure here is a count; a fraction is a rate or a ratio, which is a score on an operator whatever it is called.",
    ).toEqual([]);
    // And it says so in words, where a reader will actually meet it.
    expect(body.what_this_is_not).toContain("Not a scoreboard");
  });

  it("filters to one verdict, and refuses an invented one by name", async () => {
    await seed("2026-W35", [
      row("alpha.example", "ready"),
      row("beta.example", "not_ready", ["x402-challenge"]),
    ]);
    const filtered = (await (
      await SELF.fetch(`${BASE}/doors.json?verdict=not_ready`)
    ).json()) as any;
    expect(filtered.returned).toBe(1);
    expect(filtered.hosts[0].host).toBe("beta.example");
    // The denominator survives the filter: a caller must still be able
    // to see how much of the population it just narrowed away.
    expect(filtered.total_hosts).toBe(2);

    const bad = await SELF.fetch(`${BASE}/doors.json?verdict=excellent`);
    expect(bad.status).toBe(400);
    const error = (await bad.json()) as any;
    expect(error.error).toBe("unknown_verdict");
    // Rule 57.4: an error a small model can act on names the options.
    expect(error.valid_verdicts).toContain("not_ready");
  });

  /**
   * THE SENTENCE THAT CANNOT BE CHECKED FROM PUBLISHED BYTES.
   *
   * Everything else on this surface can be recomputed by a stranger
   * from the signed chain. "We keep nothing about you" cannot: a
   * reader has to take our word for it, which is precisely the shape
   * rule 55 exists to refuse. The claims register caught the sentence
   * unbound and it was right to.
   *
   * So the sentence is dated AND this is the standing test it names.
   * It goes red the day either door sets a cookie or writes a single
   * key — which is the day the sentence stops being true.
   */
  it("keeps nothing about a caller, which is what the page promises", async () => {
    await seed("2026-W35", [row("alpha.example", "ready")]);
    const before = (await testEnv.COUNTERS.list()).keys.map((key) => key.name).sort();

    for (const url of [`${BASE}/doors.json`, `${BASE}/doors`, `${BASE}/doors?verdict=ready`]) {
      const response = await SELF.fetch(url);
      expect(
        response.headers.get("set-cookie"),
        `${url} set a cookie, and the page says it never does`,
      ).toBeNull();
    }

    const after = (await testEnv.COUNTERS.list()).keys.map((key) => key.name).sort();
    expect(
      after,
      "reading the door list wrote to the store. The page tells a caller it keeps no log entry keyed to them; a write here is that sentence going false.",
    ).toEqual(before);
    // A guard over an empty store is a guard that cannot fail.
    expect(before.length).toBeGreaterThan(0);
  });

  it("serves an empty chain as a fact, not as a failure", async () => {
    const response = await SELF.fetch(`${BASE}/doors.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.total_hosts).toBe(0);
    expect(body.hosts).toEqual([]);
  });
});

describe("the room a person walks into", () => {
  async function seed(): Promise<void> {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(
        round("2026-W35", [
          row("alpha.example", "ready"),
          row("beta.example", "not_ready", ["x402-challenge"]),
        ]),
      ),
    );
    await takeCorpusSnapshot(testEnv, {
      calendars: ["https://calendar.test"],
      fetch: (async () =>
        new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
    });
  }

  /**
   * THE ASSERTION THAT KEEPS THE TWO SURFACES HONEST, borrowed from
   * the wallet-facts weave: the page and the JSON run the same fold,
   * so they can never come to quote different totals. A test that
   * merely found SOME number on the page would pass while they drifted.
   */
  it("quotes the same figures the JSON does", async () => {
    await seed();
    const html = await (await SELF.fetch(`${BASE}/doors`, { headers: BROWSER })).text();
    const body = (await (await SELF.fetch(`${BASE}/doors.json`)).json()) as any;
    expect(html).toContain(`${body.total_hosts} doors observed`);
    expect(html).toContain("alpha.example");
    expect(html).toContain("beta.example");
  });

  it("says what it is not, in the first screen and in its own words", async () => {
    await seed();
    const html = await (await SELF.fetch(`${BASE}/doors`, { headers: BROWSER })).text();
    expect(html).toContain("Those buckets are not standings");
    expect(html).toContain("Not a scoreboard");
  });

  it("fills with the round rather than quoting a number it does not have", async () => {
    const html = await (await SELF.fetch(`${BASE}/doors`, { headers: BROWSER })).text();
    expect(html).toContain("The chain holds no signed week yet");
    expect(html).not.toMatch(/\d+ doors observed/);
  });

  it("hands an agent the JSON at the same URL", async () => {
    await seed();
    const response = await SELF.fetch(`${BASE}/doors`);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as any;
    expect(body.total_hosts).toBe(2);
  });

  /**
   * EVERY LINK WALKED. The first draft of the commission paywall
   * pointed at a page that has never existed; it read plausibly and
   * typechecked. Rule 55 is cheap to hold and this is how.
   */
  it("walks every link it promises", async () => {
    await seed();
    const html = await (await SELF.fetch(`${BASE}/doors`, { headers: BROWSER })).text();
    const hrefs = [...html.matchAll(/href="(\/[^"#]*)"/g)].map((match) => match[1]!);
    const targets = [...new Set(hrefs)].filter((href) => !href.includes("{"));
    expect(targets.length).toBeGreaterThan(5);
    const dead: string[] = [];
    for (const href of targets) {
      const response = await SELF.fetch(`${BASE}${href}`);
      if (response.status >= 400) dead.push(`${href} -> ${response.status}`);
    }
    expect(dead, "the door list points somewhere that does not answer").toEqual([]);
  });
});
