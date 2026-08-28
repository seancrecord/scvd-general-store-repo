import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  buildOkfBundle,
  isBundleHost,
  staleAfter,
  validateOkfBundle,
  OKF_VERSION,
} from "@/services/okf";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE EVIDENCE LAYER, IN SOMEBODY ELSE'S FORMAT.
 *
 * Open Knowledge Format v0.2 (Google Cloud, 2026-06) formalizes the
 * LLM-wiki pattern: a directory of markdown concepts with YAML
 * frontmatter, cross-linked, progressively opt-in. Conformance is
 * three rules, and this store checks its own bundle against them
 * rather than trusting a third-party linter — a conformance shop that
 * outsources its own conformance check is telling on itself.
 *
 * THE PART WORTH THE BUILD is the optional trust family. OKF's
 * `verified` list yields three consumer-derived tiers: unverified,
 * machine-confirmed, human-reviewed. The census is machine-confirmed
 * and says so. Nothing in this bundle claims a human looked, because
 * on the weekly rounds nobody did — rule 43 in another vocabulary.
 */

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  extra: Partial<WardHostResult> = {},
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/x`,
    verdict,
    failed: [],
    advisories: [],
    ...extra,
  };
}

function round(hosts: WardHostResult[], extra: Partial<WardRound> = {}): WardRound {
  return {
    week: "2026-W34",
    at: "2026-08-19T17:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
    ...extra,
  };
}

async function seed(r: WardRound): Promise<void> {
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(r));
}

const READY = host("good.example", "ready", {
  offer: {
    networks: ["eip155:8453", "eip155:137"],
    schemes: ["exact"],
    min_usdc: 1,
  },
} as Partial<WardHostResult>);

afterEach(async () => {
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
});

describe("the bundle conforms to OKF v0.2", () => {
  it("passes every conformance rule the spec actually states", async () => {
    await seed(round([READY, host("bad.example", "not_ready")]));
    const bundle = await buildOkfBundle(testEnv);
    expect(bundle).toBeTruthy();
    /*
     * The three v0.2 criteria, checked as the spec words them: every
     * non-reserved file parses frontmatter, every frontmatter carries a
     * non-empty `type`, and the reserved files keep their structure.
     */
    expect(validateOkfBundle(bundle!.files)).toEqual([]);
  });

  it("catches a concept that lost its type, rather than shipping it", async () => {
    const broken = new Map([
      ["/a.md", "---\ntitle: \"no type here\"\n---\n\n# a\n"],
      ["/b.md", "# no frontmatter at all\n"],
    ]);
    const problems = validateOkfBundle(broken);
    expect(problems).toHaveLength(2);
    expect(problems[0]?.problem).toContain("type");
    expect(problems[1]?.problem).toContain("frontmatter");
  });

  it("declares its version in the bundle-root index, the one place the spec allows", async () => {
    await seed(round([READY]));
    const bundle = await buildOkfBundle(testEnv);
    const index = bundle!.files.get("/index.md") ?? "";
    expect(index).toContain(`okf_version: "${OKF_VERSION}"`);
    // And nowhere else — okf_version on a concept is not conformant.
    for (const [path, content] of bundle!.files) {
      if (path === "/index.md") continue;
      expect(content).not.toContain("okf_version");
    }
  });

  it("keeps log.md to ISO date headings, newest first", async () => {
    await seed(round([READY]));
    const bundle = await buildOkfBundle(testEnv);
    const log = bundle!.files.get("/log.md") ?? "";
    expect(log).toMatch(/^## (\d{4}-\d{2}-\d{2}|Pending)$/m);
  });
});

describe("the trust family says only what the census actually did", () => {
  it("marks observations machine-confirmed, never human-reviewed", async () => {
    await seed(round([READY]));
    const bundle = await buildOkfBundle(testEnv);
    const concept = bundle!.files.get("/host/good.example.md") ?? "";
    expect(concept).toContain("verified:");
    /*
     * The actor cites the ROW's battery. This fixture row predates
     * the battery field, so the concept must SAY so rather than
     * stamp whatever version the census runs today — the earlier
     * assertion here pinned "preflight-v1" and kept passing for two
     * days after the census moved to v2, which is the label defect
     * the 2026-08-26 correction recorded.
     */
    expect(concept).toContain("scvd-census/battery-unstated");
    /*
     * THE LINE. OKF derives "human-reviewed" from a `human:` actor in
     * `verified`. Nobody reviewed the weekly rounds by hand, so no
     * concept here may carry one — claiming the top trust tier for an
     * unwatched machine walk is the exact dishonesty this store sells
     * against.
     */
    expect(concept).not.toContain("human:");
  });

  it("cites the row's own battery, derived — a sentinel version proves it is not memorized", async () => {
    const cited = host("good.example", "ready", {
      offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 1 },
      battery: "preflight-v9",
    } as Partial<WardHostResult>);
    await seed(round([cited]));
    const bundle = await buildOkfBundle(testEnv);
    const concept = bundle!.files.get("/host/good.example.md") ?? "";
    // A version no battery has ever shipped under: the only way this
    // passes is by reading the row, which is the contract.
    expect(concept).toContain("scvd-census/preflight-v9");
    expect(concept).not.toContain("battery-unstated");
  });

  it("carries a stale_after so a consumer can expire it without asking us", async () => {
    await seed(round([READY]));
    const bundle = await buildOkfBundle(testEnv);
    const concept = bundle!.files.get("/host/good.example.md") ?? "";
    expect(concept).toContain("stale_after:");
    // Sixteen days is the passport's own aging rule, not a new number.
    expect(concept).toContain(staleAfter("2026-08-19T17:00:00.000Z"));
  });

  it("names only the doors that answered, and counts the rest", async () => {
    await seed(round([READY, host("bad.example", "not_ready")]));
    const bundle = await buildOkfBundle(testEnv);
    expect(bundle!.files.has("/host/good.example.md")).toBe(true);
    // The registry bargain, carried into the new format unchanged.
    expect(bundle!.files.has("/host/bad.example.md")).toBe(false);
    const set = bundle!.files.get("/fresh-set.md") ?? "";
    expect(set).toContain("Answered, but not conformantly: 1");
    expect(set).not.toContain("bad.example");
  });
});

describe("the bundle is served the way the spec expects to read it", () => {
  it("serves index.md as markdown with the version header", async () => {
    await seed(round([READY]));
    const res = await SELF.fetch("https://scvd.store/okf/index.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("vary")).toContain("Accept");
    expect(res.headers.get("x-okf-version")).toBe(OKF_VERSION);
    const body = await res.text();
    expect(body).toContain("[Sean-Claude Van Damme's General Store](store.md)");
    expect(body).toContain("[good.example](host/good.example.md)");
  });

  it("serves a host concept at the path its index promised", async () => {
    await seed(round([READY]));
    const res = await SELF.fetch(
      "https://scvd.store/okf/host/good.example.md",
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('type: "x402 Endpoint"');
    expect(body).toContain("eip155:137");
  });

  it("points a wrong guess back at the index instead of a bare error", async () => {
    await seed(round([READY]));
    const res = await SELF.fetch("https://scvd.store/okf/nope.md");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toContain("/okf/index.md");
  });

  it("refuses a path that could never be a hostname, before reading anything", async () => {
    for (const bad of ["..", "..%2F..%2Fetc", "not_a_host", "-lead.example"]) {
      expect(isBundleHost(bad)).toBe(false);
    }
    expect(isBundleHost("good.example")).toBe(true);
    const res = await SELF.fetch("https://scvd.store/okf/host/..md");
    expect(res.status).toBe(404);
  });
});

/**
 * DISCOVERABILITY. A machine surface nobody is told about is a surface
 * nobody uses — and this store's own audit found six leading
 * indicators unanswerable because the instrument was pointed at the
 * shop instead of the evidence. The bundle gets listed and counted
 * from the day it ships, not a month later.
 */
describe("the bundle is announced and measured", () => {
  it("is named in llms.txt with the two caveats that matter", async () => {
    const res = await SELF.fetch("https://scvd.store/llms-full.txt");
    const body = await res.text();
    expect(body).toContain("/okf/index.md");
    expect(body).toContain("Open Knowledge Format");
    // The honesty, carried into the announcement, not just the file.
    expect(body).toContain("stale_after");
    expect(body).toContain("machine-confirmed");
  });

  it("is linked from the developer portal", async () => {
    const res = await SELF.fetch("https://scvd.store/developers");
    expect(await res.text()).toContain("/okf/index.md");
  });

  it("counts reads without minting a key per stranger's hostname", async () => {
    const { porchSurface } = await import("@/lib/porch-surface");
    expect(porchSurface("/okf/index.md", "GET")).toBe("okf:index");
    expect(porchSurface("/okf/log.md", "GET")).toBe("okf:log");
    expect(porchSurface("/okf/store.md", "GET")).toBe("okf:concept");
    const hosts = ["a.example", "b.example", "c.example"];
    const surfaces = new Set(
      hosts.map((h) => porchSurface(`/okf/host/${h}.md`, "GET")),
    );
    expect(surfaces.size).toBe(1);
    expect([...surfaces][0]).toBe("okf:host");
  });
});

/**
 * THE LINKS ARE THE FORMAT. OKF turns a directory into a graph with
 * ordinary markdown links, so a broken one is not cosmetic — it is the
 * edge that was supposed to carry an agent from a host to the criteria
 * it was judged against. The spec tells consumers to tolerate broken
 * links; that is a reason for a producer to not ship them, not a
 * licence to.
 */
describe("the bundle's own links and templates hold", () => {
  it("never ships an un-interpolated template or an empty field", async () => {
    await seed(round([READY]));
    const bundle = await buildOkfBundle(testEnv);
    for (const [path, content] of bundle!.files) {
      expect(content, `${path} leaked a template`).not.toContain("${");
      expect(content, `${path} has an empty value`).not.toMatch(/^\w+:\s*""$/m);
      expect(content, `${path} says undefined`).not.toContain("undefined");
    }
  });

  it("resolves every bundle-relative link to a file that exists", async () => {
    await seed(round([READY, host("second.example", "ready")]));
    const bundle = await buildOkfBundle(testEnv);
    const files = bundle!.files;
    let checked = 0;
    for (const [path, content] of files) {
      const dir = path.slice(0, path.lastIndexOf("/"));
      for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1] ?? "";
        if (!target || /^https?:/.test(target)) continue;
        // Bundle-relative starts with "/"; anything else is relative
        // to the concept's own directory, exactly as the spec reads it.
        const resolved = target.startsWith("/")
          ? target
          : `${dir}/${target}`.replace(/\/\.\//g, "/");
        checked += 1;
        expect(files.has(resolved), `${path} links to missing ${resolved}`).toBe(
          true,
        );
      }
    }
    // Guard the guard: a matcher that found nothing proves nothing.
    expect(checked).toBeGreaterThan(5);
  });
});

/**
 * THE EMPTY ROUND, PUBLISHED AS EMPTY.
 *
 * Caught 2026-08-22 by the developer portal's own guard, which fetches
 * every door it advertises and refuses a 404. The bundle was returning
 * null before the first census froze, so /developers would have
 * advertised a dead link on any week the round had not run. A
 * knowledge bundle that disappears when its data does is
 * indistinguishable from a broken one — and this store's whole habit
 * is publishing the gap rather than the silence.
 */
describe("a bundle with no census behind it", () => {
  it("still serves, still conforms, and says plainly that it is empty", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    const bundle = await buildOkfBundle(testEnv);
    expect(bundle.week).toBeNull();
    // The doors the portal advertises are all still here.
    expect(bundle.files.has("/index.md")).toBe(true);
    expect(bundle.files.has("/log.md")).toBe(true);
    expect(bundle.files.has("/store.md")).toBe(true);
    expect(bundle.files.has("/criteria.md")).toBe(true);
    // And it is honest about having nothing, rather than implying a round.
    const index = bundle.files.get("/index.md") ?? "";
    expect(index).toContain("No census round has been frozen yet");
    expect(index).not.toContain("undefined");
    // Conformance does not lapse just because the data is thin.
    expect(validateOkfBundle(bundle.files)).toEqual([]);
  });

  it("opens the door the developer portal advertises", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    const res = await SELF.fetch("https://scvd.store/okf/index.md");
    expect(res.status).toBe(200);
  });

  it("omits generated.at rather than inventing an observation date", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
    const bundle = await buildOkfBundle(testEnv);
    const store = bundle.files.get("/store.md") ?? "";
    // OKF's `generated` is optional; a fabricated timestamp is not.
    expect(store).not.toContain("generated:");
    expect(store).toContain('type: "Organization"');
  });
});
