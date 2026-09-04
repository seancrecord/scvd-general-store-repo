import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { RETIRED_EXAMPLE_IDS, SELF_PUBLISHED_IDS, citationsOn, judgePage } from "@/lib/citations";
import WATCHED_PAGES from "@/store/watched-pages.json";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { SELF_PUBLISHED_IDS as SELF_PUBLISHED_IDS_NODE, citationsOn as citationsOnNode, judge as judgeNode } from "../scripts/lib/citations.mjs";
import {
  WATCH_CAP,
  watchThisPass,
  watchedProspects,
  judgeWatch,
  readCitationWatch,
  runCitationWatch,
  type CitationWatchReport,
} from "@/services/citation-watch";
import { listAlerts } from "@/lib/alerts";
import type { Env } from "@/types";

/**
 * THE CITATION WATCH ON THE SUNDAY PRESS (2026-09-04). What this file
 * holds:
 *
 *   - the Worker's reading and the node script's reading are one
 *     reading, on one fixture, so the hand-run check and the cron
 *     never disagree about what counts as a citation;
 *   - the news is the DELTA: a prospect cited for the first time
 *     pages once and a listed system that stops citing pages once;
 *     silent and unreadable never page;
 *   - the desk shows the report behind the keeper's login, and the
 *     button runs the same function the cron runs;
 *   - the prospects file names no page this store operates.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPages(pages: Record<string, { status?: number; text?: string; throws?: string }>) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const page = pages[url];
    if (!page) throw new Error(`unexpected fetch in test: ${url}`);
    if (page.throws) throw new Error(page.throws);
    return new Response(page.text ?? "", { status: page.status ?? 200, headers: { "content-type": "text/html" } });
  });
}

describe("one reading, two runtimes", () => {
  // The id here must be one WE never published: a page quoting our own
  // specimen or a retired placeholder is our words coming back, not a
  // citation, and SELF_PUBLISHED_IDS discounts both.
  const fixture = `<p><a href="${BASE}/api/verify/cert_theirsnotours">verify</a> ${BASE}/corpus/host/door.example.json {"cites": "${BASE}/corpus/3.json"} ${BASE}/corpus/round/2026-W36</p><a href="${BASE}/menu/hello">shop</a>`;

  it("finds the same citations in the same order", () => {
    expect(citationsOn(fixture, BASE)).toEqual(citationsOnNode(fixture, BASE));
    expect(citationsOn(fixture, BASE)).toEqual([
      `${BASE}/api/verify/cert_theirsnotours`,
      `${BASE}/corpus/3.json`,
      `${BASE}/corpus/host/door.example.json`,
      `${BASE}/corpus/round/2026-W36`,
      `"cites": "${BASE}/corpus/3.json"`,
    ]);
  });

  /**
   * THE DEFECT THAT SEEDED SEVEN FALSE CITATIONS (2026-09-04). The
   * first sweep of the outreach register reported seven directories
   * as citing this store. Six carried the sentence from this store's
   * OWN README — "read the dated, Bitcoin-anchored corpus, free, at
   * scvd.store/corpus" — and one carried the sample certificate that
   * every discovery listing publishes. Both are our words on their
   * page, which listing fact 4 excludes by name. A citation points at
   * ONE ROW; an index link points at the front door.
   */
  it("does not count this store's own words quoted back at it", () => {
    const mirroredReadme = `read the dated, Bitcoin-anchored corpus, free, at <a href="${BASE}/corpus">scvd.store/corpus</a>, cite it by DOI`;
    expect(citationsOn(mirroredReadme, BASE)).toEqual([]);
    expect(citationsOnNode(mirroredReadme, BASE)).toEqual([]);
    for (const moving of [`${BASE}/corpus.json`, `${BASE}/corpus/latest.json`, `${BASE}/corpus/tiers.json`, `${BASE}/corpus/diff.json?since=2026-W30`]) {
      expect(citationsOn(moving, BASE), moving).toEqual([]);
    }
    // Both ids this store publishes about itself.
    expect(SELF_PUBLISHED_IDS).toContain(SAMPLE_ARTIFACT_ID);
    for (const retired of RETIRED_EXAMPLE_IDS) {
      expect(SELF_PUBLISHED_IDS).toContain(retired);
      expect(citationsOn(`verify_url: ${BASE}/api/verify/${retired}`, BASE)).toEqual([]);
    }
    expect([...SELF_PUBLISHED_IDS_NODE]).toEqual([...SELF_PUBLISHED_IDS]);
    expect(citationsOn(`sample_verify_url: ${BASE}/api/verify/${SAMPLE_ARTIFACT_ID}`, BASE)).toEqual([]);
    // A real certificate on the same page still counts.
    expect(citationsOn(`${BASE}/api/verify/${SAMPLE_ARTIFACT_ID} and ${BASE}/api/verify/cert_rst2uvwxyz`, BASE)).toEqual([
      `${BASE}/api/verify/cert_rst2uvwxyz`,
    ]);
  });

  it("gives the same verdict words for listed systems and register rows", () => {
    const system = { name: "S", cites_at: "https://s.example/m", since: "2026-09-03" };
    for (const fetched of [{ status: 200, text: fixture }, { status: 200, text: "nothing" }, { status: 503, text: "" }, { error: "ECONNRESET" }] as const) {
      expect(judgePage("S", system.cites_at, fetched, BASE, "gone").verdict).toBe(judgeNode(system, fetched).verdict);
    }
    expect(judgePage("P", "https://p.example/us", { status: 200, text: "nothing" }, BASE, "silent").verdict).toBe("silent");
    expect(judgePage("P", "https://p.example/us", { status: 200, text: fixture }, BASE, "silent").verdict).toBe("cited");
  });
});

describe("the news is the delta", () => {
  const listed = { name: "Example Scores", cites_at: "https://scores.example/method", since: "2026-09-03" };
  const prospect = { name: "Example List", url: "https://list.example/us", note_sent: "2026-09-04", cites_since: null };
  const now = new Date("2026-09-06T11:00:00Z");

  it("a first report counts every cited page as new, and silence as nothing", () => {
    const report = judgeWatch(
      {
        listed: [{ system: listed, fetched: { status: 200, text: `${BASE}/api/verify/cert_abc2defgh` } }],
        prospects: [{ prospect, fetched: { status: 200, text: "about the store" } }],
      },
      null,
      BASE,
      now,
    );
    expect(report.newly_cited).toEqual([listed.cites_at]);
    expect(report.newly_gone).toEqual([]);
    expect(report.rows.map((row) => [row.kind, row.verdict])).toEqual([
      ["listed", "cited"],
      ["prospect", "silent"],
    ]);
  });

  it("a prospect that starts citing is newly cited once; a listed page that stops is newly gone once; unreadable moves nothing", () => {
    const first = judgeWatch(
      {
        listed: [{ system: listed, fetched: { status: 200, text: `${BASE}/api/verify/cert_abc2defgh` } }],
        prospects: [{ prospect, fetched: { status: 200, text: "about the store" } }],
      },
      null,
      BASE,
      now,
    );
    const second = judgeWatch(
      {
        listed: [{ system: listed, fetched: { status: 200, text: "we score things" } }],
        prospects: [{ prospect, fetched: { status: 200, text: `row: ${BASE}/corpus/host/door.example.json` } }],
      },
      first,
      BASE,
      now,
    );
    expect(second.newly_cited).toEqual([prospect.url]);
    expect(second.newly_gone).toEqual([listed.cites_at]);
    const third = judgeWatch(
      {
        listed: [{ system: listed, fetched: { error: "ECONNRESET" } }],
        prospects: [{ prospect, fetched: { status: 200, text: `row: ${BASE}/corpus/host/door.example.json` } }],
      },
      second,
      BASE,
      now,
    );
    expect(third.newly_cited).toEqual([]);
    expect(third.newly_gone).toEqual([]);
    expect(third.rows[0]!.verdict).toBe("unreadable");
  });
});

describe("the run: reads the register, stores one report, pages on a change", () => {
  /**
   * THE ONE HAND-KEPT LIST (2026-09-04). The Worker watch and
   * `npm run outreach:check` read the SAME file — the keeper's
   * outreach register — so a page added for one is watched by both.
   * The cron fetches only the rows we wrote to, plus any already
   * carrying a row; the CLI sweeps all of them from a machine with no
   * subrequest budget.
   */
  it("carries only the written-to rows to the edge, and no research", () => {
    const watched = watchedProspects();
    for (const entry of watched) {
      expect(new URL(entry.url).host.endsWith("scvd.store")).toBe(false);
      expect(entry.note_sent !== null || entry.cites_since !== null).toBe(true);
    }
    // THE REGRESSION THIS PINS: the 101-row register used to ride to
    // every isolate to fetch, on the day it landed, zero pages.
    const shipped = JSON.stringify(WATCHED_PAGES);
    expect(shipped.length).toBeLessThan(4000);
    expect(shipped).not.toContain("category");
    expect(shipped).not.toContain("why");
  });

  /**
   * THE HEADROOM. A hundred sends must not mean a hundred subrequests
   * on one tick, and a pass that could not read everything must never
   * imply it did.
   */
  it("reads everything under the cap, and walks a window over the weeks above it", () => {
    const few = Array.from({ length: 5 }, (_, i) => ({ name: `n${i}`, url: `https://e${i}.example/`, note_sent: "2026-09-04", cites_since: null }));
    const under = watchThisPass(new Date("2026-09-06T11:00:00Z"), few);
    expect(under.slice).toEqual(few);
    expect(under.capped).toBe(false);
    expect(under.not_read).toBe(0);

    const many = Array.from({ length: WATCH_CAP * 3 }, (_, i) => ({ name: `n${i}`, url: `https://e${i}.example/`, note_sent: "2026-09-04", cites_since: null }));
    const seen = new Set<string>();
    let capped = false;
    for (let week = 0; week < 4; week += 1) {
      const pass = watchThisPass(new Date(Date.UTC(2026, 8, 6 + week * 7, 11)), many);
      expect(pass.slice.length).toBe(WATCH_CAP);
      expect(pass.not_read).toBe(many.length - WATCH_CAP);
      capped = capped || pass.capped;
      for (const row of pass.slice) seen.add(row.url);
    }
    expect(capped).toBe(true);
    // The window walks, so a long list is swept rather than starved.
    expect(seen.size).toBe(many.length);
  });

  it("stays silent on silence, and pages when a written-to page starts carrying a row", async () => {
    const prospects = [
      { name: "Example List", url: "https://list.example/us", note_sent: "2026-09-04", cites_since: null },
      { name: "Other List", url: "https://other.example/us", note_sent: "2026-09-04", cites_since: null },
    ];
    await testEnv.COUNTERS.delete(KV_KEYS.citationWatch);
    const alertsBefore = (await listAlerts(testEnv, 50)).filter((row) => row.condition === "citation_seen").length;

    const quiet = judgeWatch(
      { listed: [], prospects: prospects.map((prospect) => ({ prospect, fetched: { status: 200, text: `a page quoting ${BASE}/corpus, no row` } })) },
      null,
      BASE,
      new Date("2026-09-06T11:00:00Z"),
    );
    expect(quiet.rows.every((row) => row.verdict === "silent")).toBe(true);
    expect(quiet.newly_cited).toEqual([]);

    // The live path, against the real register's watched set.
    stubPages(Object.fromEntries(watchedProspects().map((entry) => [entry.url, { text: "no row" }])));
    const ran = await runCitationWatch(testEnv, new Date("2026-09-06T11:00:00Z"));
    expect(ran.newly_cited).toEqual([]);
    expect((await listAlerts(testEnv, 50)).filter((row) => row.condition === "citation_seen").length).toBe(alertsBefore);
    const stored = (await readCitationWatch(testEnv)) as CitationWatchReport;
    expect(stored.checked_at).toBe("2026-09-06T11:00:00.000Z");
  });

  it("pages once, naming the register row to set, when a row appears", async () => {
    const prospect = { name: "Example List", url: "https://list.example/us", note_sent: "2026-09-04", cites_since: null };
    const first = judgeWatch(
      { listed: [], prospects: [{ prospect, fetched: { status: 200, text: "no row" } }] },
      null,
      BASE,
      new Date("2026-09-06T11:00:00Z"),
    );
    const second = judgeWatch(
      { listed: [], prospects: [{ prospect, fetched: { status: 200, text: `row: ${BASE}/corpus/host/door.example.json` } }] },
      first,
      BASE,
      new Date("2026-09-13T11:00:00Z"),
    );
    expect(second.newly_cited).toEqual([prospect.url]);
    const third = judgeWatch(
      { listed: [], prospects: [{ prospect, fetched: { status: 200, text: `row: ${BASE}/corpus/host/door.example.json` } }] },
      second,
      BASE,
      new Date("2026-09-20T11:00:00Z"),
    );
    expect(third.newly_cited).toEqual([]);
  });
});

describe("the desk", () => {
  const auth = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` };

  it("keeps the button behind the login", async () => {
    expect((await SELF.fetch(`${BASE}/admin/citations/run`, { method: "POST" })).status).toBe(401);
  });

  it("shows the report beside the queue, and the button runs the watch", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify({
        week: "2026-W36",
        at: "2026-09-06T11:00:00.000Z",
        listed_resources: 0,
        coverage_suspect: false,
        capped: false,
        our_search_presence: true,
        hosts: [],
      }),
    );
    await testEnv.COUNTERS.delete(KV_KEYS.citationWatch);
    const empty = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    expect(empty).toContain("Citations — who carries a row");
    expect(empty).toContain("No report yet");
    expect(empty).toContain('action="/admin/citations/run"');

    const report: CitationWatchReport = {
      version: 1,
      checked_at: "2026-09-06T11:00:00.000Z",
      base: BASE,
      rows: [
        { kind: "prospect", dated: "2026-09-04", name: "Example List", url: "https://list.example/us", verdict: "cited", citations: [`${BASE}/corpus/3.json`] },
        { kind: "listed", dated: "2026-09-03", name: "Example Scores", url: "https://scores.example/m", verdict: "gone", citations: [] },
      ],
      newly_cited: ["https://list.example/us"],
      newly_gone: ["https://scores.example/m"],
    };
    await testEnv.COUNTERS.put(KV_KEYS.citationWatch, JSON.stringify(report));
    const html = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    expect(html).toContain("Example List");
    expect(html).toContain("newly cited: <code>https://list.example/us</code>");
    expect(html).toContain("fix the register");
    const json = (await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "application/json" } })).json()) as {
      citations: CitationWatchReport;
      citation_prospects: unknown[];
    };
    expect(json.citations.newly_gone).toEqual(["https://scores.example/m"]);
    expect(json.citation_prospects.length).toBe(watchedProspects().length);
  });
});

/**
 * WHAT THE FIRST REAL SWEEP FOUND (2026-09-04). 101 pages, three
 * "citations", and all three false. Two directories were showing the
 * example purchase output this store publishes into bazaar discovery,
 * and one was showing a truncated URL. These are those three pages,
 * as they actually read, kept so the matcher can never call them
 * citations again.
 */
describe("the three false positives the first sweep produced", () => {
  it("does not count the bazaar example purchase two directories mirror", () => {
    // x402-bazaar and x402scan, verbatim shape.
    const listing = `"certificate":{"cert_id":"${RETIRED_EXAMPLE_IDS[0]}"},"verify_url":"${BASE}/api/verify/${RETIRED_EXAMPLE_IDS[0]}"`;
    expect(citationsOn(listing, BASE)).toEqual([]);
    expect(citationsOnNode(listing, BASE)).toEqual([]);
  });

  it("does not count a truncated verify URL that resolves to nothing", () => {
    // socketcat displayed the URL clipped: /api/verify/ce
    for (const clipped of [`${BASE}/api/verify/ce`, `${BASE}/api/verify/cert`, `${BASE}/api/verify/cert_`, `${BASE}/api/verify/x`]) {
      expect(citationsOn(clipped, BASE), clipped).toEqual([]);
      expect(citationsOnNode(clipped, BASE), clipped).toEqual([]);
    }
  });

  it("still counts a real certificate somebody else published", () => {
    const real = `${BASE}/api/verify/cert_9pq2rstuvw`;
    expect(citationsOn(real, BASE)).toEqual([real]);
    expect(citationsOnNode(real, BASE)).toEqual([real]);
  });
});

/**
 * THE PAGE THAT ACTUALLY PRODUCED THE FALSE POSITIVE (2026-09-04).
 *
 * SELF_PUBLISHED_IDS discounted the CURRENT specimen, which is right
 * and was not enough: a directory's copy of our listing does not
 * refresh when ours does. x402-list.com renders `cert_k2m9v4xwqp` —
 * the placeholder buyOutputExample carried until that day — 62 times
 * on its page for this store, against zero occurrences of the live
 * specimen. So the keeper's row still read `cited` and still clicked
 * through to "No certificate by that name on the wall."
 *
 * The bytes below are theirs, trimmed: the bazaar discovery extension
 * we broadcast on every 402, harvested and rendered. Note the shape —
 * escaped inside markup, never a clickable link, which is why nobody
 * caught it by browsing.
 */
describe("a retired example id is still our own words", () => {
  const theirPage = `{ "extensions": { "bazaar": { "info": { "output": { "type": "json", "example": {
    "item_id": "the_statement",
    "badge_url": "${BASE}/badges/41.svg",
    "signature": "&lt;128 hex chars, ed25519&gt;",
    "verify_url": "${BASE}/api/verify/cert_k2m9v4xwqp"
  } } } } } }`;

  it("reads the live x402-list page as silent, not cited", () => {
    expect(citationsOn(theirPage, BASE)).toEqual([]);
    expect(
      judgePage("x402-list", "https://x402-list.com/services/x", { status: 200, text: theirPage }, BASE, "silent")
        .verdict,
    ).toBe("silent");
  });

  it("keeps the retired ids in both runtimes, so the CLI agrees with the cron", () => {
    expect(SELF_PUBLISHED_IDS).toContain("cert_k2m9v4xwqp");
    expect([...SELF_PUBLISHED_IDS_NODE]).toEqual([...SELF_PUBLISHED_IDS]);
  });

  /**
   * The line this must not cross. Discounting our own placeholders
   * must never discount an artifact somebody actually holds — that is
   * the news the whole watch exists for.
   */
  it("still calls any other artifact id a citation", () => {
    const theirs = `<a href="${BASE}/api/verify/cert_theirsnotours">receipt</a>`;
    expect(citationsOn(theirs, BASE)).toEqual([`${BASE}/api/verify/cert_theirsnotours`]);
    expect(
      judgePage("P", "https://p.example/us", { status: 200, text: theirs }, BASE, "silent").verdict,
    ).toBe("cited");
  });

  it("does not mask a real corpus row sitting beside our boilerplate", () => {
    const both = `${theirPage} and ${BASE}/corpus/3.json`;
    expect(citationsOn(both, BASE)).toContain(`${BASE}/corpus/3.json`);
    expect(
      judgePage("P", "https://p.example/us", { status: 200, text: both }, BASE, "silent").verdict,
    ).toBe("cited");
  });
});
