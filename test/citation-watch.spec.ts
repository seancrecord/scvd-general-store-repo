import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { SELF_PUBLISHED_IDS, citationsOn, judgePage } from "@/lib/citations";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { SELF_PUBLISHED_IDS as SELF_PUBLISHED_IDS_NODE, citationsOn as citationsOnNode, judge as judgeNode } from "../scripts/lib/citations.mjs";
import {
  outreachRegister,
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
  const fixture = `<p><a href="${BASE}/api/verify/cert_k2m9v4xwqp">verify</a> ${BASE}/corpus/host/door.example.json {"cites": "${BASE}/corpus/3.json"} ${BASE}/corpus/round/2026-W36</p><a href="${BASE}/menu/hello">shop</a>`;

  it("finds the same citations in the same order", () => {
    expect(citationsOn(fixture, BASE)).toEqual(citationsOnNode(fixture, BASE));
    expect(citationsOn(fixture, BASE)).toEqual([
      `${BASE}/api/verify/cert_k2m9v4xwqp`,
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
    // The sample certificate every listing and the MCP card publish.
    expect(SELF_PUBLISHED_IDS).toContain(SAMPLE_ARTIFACT_ID);
    expect([...SELF_PUBLISHED_IDS_NODE]).toEqual([...SELF_PUBLISHED_IDS]);
    expect(citationsOn(`sample_verify_url: ${BASE}/api/verify/${SAMPLE_ARTIFACT_ID}`, BASE)).toEqual([]);
    // A real certificate on the same page still counts.
    expect(citationsOn(`${BASE}/api/verify/${SAMPLE_ARTIFACT_ID} and ${BASE}/api/verify/cert_real9`, BASE)).toEqual([
      `${BASE}/api/verify/cert_real9`,
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
        listed: [{ system: listed, fetched: { status: 200, text: `${BASE}/api/verify/cert_a` } }],
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
        listed: [{ system: listed, fetched: { status: 200, text: `${BASE}/api/verify/cert_a` } }],
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
  it("watches the written-to rows of the keeper's register, and only those", () => {
    const all = outreachRegister();
    expect(all.length).toBeGreaterThan(50);
    const watched = watchedProspects();
    expect(watched).toEqual(all.filter((entry) => entry.note_sent !== null || entry.cites_since !== null));
    for (const entry of watched) {
      expect(new URL(entry.url).host.endsWith("scvd.store")).toBe(false);
    }
    // Nothing is asserted as citing that the current matcher cannot
    // reproduce: the seven seeded on the first pass were cleared.
    for (const entry of all) {
      if (entry.cites_since !== null) expect(entry.cites_since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
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
