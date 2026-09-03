import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import { DEFECT_CLASSES } from "@/store/defect-vocabulary";
import { delisting } from "@/store/delisted";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE EVIDENCE AS PAGES (2026-09-03, the AEO plan's PR 3). The store
 * held hundreds of dated, signed observations and published them as
 * JSON only; a crawler reads pages. One page per observed host, one
 * per signed week, one per defect class, every one derived from the
 * same rows or vocabulary as its JSON twin and every one in the
 * sitemap. A host the chain never met is a 404, not a page anyone can
 * mint; a delisted host keeps its record and loses its page.
 */

function round(week: string): WardRound {
  return {
    week,
    at: new Date().toISOString(),
    listed_resources: 2,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: [
      { host: "ready-door.example", resources: 1, verdict: "ready" },
      { host: "shut-door.example", resources: 1, verdict: "not_ready", failed: ["challenge-parse"] },
    ] as unknown as WardRound["hosts"],
  };
}

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

async function seed(weeks: string[]): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  for (const week of weeks) {
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round(week)));
    const pass = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(pass.taken, week).toBe(true);
  }
}

async function page(path: string): Promise<{ status: number; html: string; jsonLd: Record<string, unknown>[] }> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } });
  const html = await response.text();
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]!) as Record<string, unknown>,
  );
  return { status: response.status, html, jsonLd };
}

describe("one page per observed host", () => {
  beforeEach(() => seed(["2026-W31", "2026-W32"]));

  it("titles the page with the host, the tier and its fraction, and carries a Dataset", async () => {
    const { status, html, jsonLd } = await page("/corpus/host/ready-door.example");
    expect(status).toBe(200);
    const title = /<title>(.*?)<\/title>/s.exec(html)![1]!;
    expect(title).toContain("x402 endpoint readiness: ready-door.example");
    expect(title).toMatch(/\d+ of \d+/);
    expect(html).toContain("Every round, including the ones we missed");
    expect(html).toContain("2026-W31");
    expect(html).toContain("/corpus/host/ready-door.example.json");
    const dataset = jsonLd.find((b) => b["@type"] === "Dataset")!;
    expect(dataset["sameAs"]).toBe(`${BASE}/corpus/host/ready-door.example.json`);
    expect((dataset["about"] as { url: string }).url).toBe("https://ready-door.example/");
  });

  it("agrees with its JSON twin on the tier", async () => {
    const { html } = await page("/corpus/host/shut-door.example");
    const json = (await (await SELF.fetch(`${BASE}/corpus/host/shut-door.example.json`)).json()) as {
      tier: { line: string };
    };
    expect(html).toContain(json.tier.line.replace(/&/g, "&amp;"));
  });

  it("refuses a host the chain never met", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/host/never-seen.example`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(404);
  });

  it("lists every observed host, every signed week and every defect class in the sitemap", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(xml).toContain(`<loc>${BASE}/corpus/host/ready-door.example</loc>`);
    expect(xml).toContain(`<loc>${BASE}/corpus/host/shut-door.example</loc>`);
    expect(xml).toContain(`<loc>${BASE}/corpus/round/2026-W31</loc>`);
    expect(xml).toContain(`<loc>${BASE}/corpus/round/2026-W32</loc>`);
    for (const klass of DEFECT_CLASSES) expect(xml).toContain(`<loc>${BASE}/defects/${klass.id}</loc>`);
  });
});

describe("one page per signed week", () => {
  beforeEach(() => seed(["2026-W31"]));

  it("answers at a stable address with the week's numbers in the title", async () => {
    const { status, html, jsonLd } = await page("/corpus/round/2026-W31");
    expect(status).toBe(200);
    expect(/<title>(.*?)<\/title>/s.exec(html)![1]!).toMatch(/week 2026-W31: \d+ of \d+ probed doors payable/);
    const dataset = jsonLd.find((b) => b["@type"] === "Dataset")!;
    expect(dataset["temporalCoverage"]).toBe("2026-W31");
    // The corpus by @id and by its concept DOI (2026-09-03), so a
    // round resolves to the dataset and the dataset to its citation.
    const parent = dataset["isPartOf"] as { "@id": string; identifier: { value: string } };
    expect(parent["@id"]).toBe(`${BASE}/corpus.json`);
    expect(parent.identifier.value).toMatch(/^10\.5281\/zenodo\./);
  });

  it("serves the brief as JSON to a caller that asks for JSON, and 404s a week it does not hold", async () => {
    const json = await SELF.fetch(`${BASE}/corpus/round/2026-W31`, { headers: { Accept: "application/json" } });
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(((await json.json()) as { week: string }).week).toBe("2026-W31");
    const missing = await SELF.fetch(`${BASE}/corpus/round/2031-W01`);
    expect(missing.status).toBe(404);
  });
});

describe("one page per defect class", () => {
  it("answers for every class with its id in the title and a DefinedTerm node", async () => {
    for (const klass of DEFECT_CLASSES) {
      const { status, html, jsonLd } = await page(`/defects/${klass.id}`);
      expect(status, klass.id).toBe(200);
      expect(/<title>(.*?)<\/title>/s.exec(html)![1]!, klass.id).toContain(klass.id);
      const term = jsonLd.find((b) => b["@type"] === "DefinedTerm")!;
      expect(term["termCode"], klass.id).toBe(klass.id);
    }
  });

  it("404s a class the vocabulary does not hold", async () => {
    expect((await SELF.fetch(`${BASE}/defects/not-a-class`)).status).toBe(404);
  });
});

describe("delisting", () => {
  it("matches by host, case-insensitively, against a decision list", () => {
    const list = [{ host: "Some-Door.example", on: "2026-09-03", reason: "operator asked" }];
    expect(delisting("some-door.example", list)?.on).toBe("2026-09-03");
    expect(delisting("other.example", list)).toBeUndefined();
  });
});

describe("the other schema PR 3 adds", () => {
  it("declares the MCP server, the CLI and the two packages as software", async () => {
    const { jsonLd } = await page("/developers");
    const graph = jsonLd.flatMap((b) => (b["@graph"] as Record<string, unknown>[] | undefined) ?? []);
    const names = graph.filter((n) => n["@type"] === "SoftwareApplication").map((n) => n["name"]);
    expect(names).toContain("scvd-cli");
    expect(names).toContain("x402-verify");
    expect(names).toContain("x402-sign");
    expect(names.some((n) => String(n).includes("MCP server"))).toBe(true);
  });

  it("declares the inflows reading as a Dataset", async () => {
    const { jsonLd } = await page("/inflows");
    expect(jsonLd.some((b) => b["@type"] === "Dataset")).toBe(true);
  });
});
