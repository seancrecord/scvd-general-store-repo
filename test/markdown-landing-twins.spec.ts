import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { Env } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE NINE LANDING PAGES THAT SPOKE HTML AND JSON AND NOTHING ELSE.
 *
 * Each of these answered a browser with HTML and an agent with JSON.
 * Ask for `text/markdown` and the negotiation picked JSON, because
 * markdown was not on offer; ask for the `.md` twin and index.ts
 * returned an honest 404, because that handler is derived and there
 * was nothing to derive from. An outside scan sampled the suffix and
 * graded the fallback partial, which it was.
 *
 * lib/json-markdown.ts renders them from the SAME document the JSON
 * serves, which is the property these tests are really guarding: not
 * that markdown exists, but that it cannot say anything the JSON does
 * not.
 */
const LANDING_PAGES = [
  "/corpus",
  "/doors",
  "/criteria",
  "/conformance",
  "/scorers",
  "/bounties",
  "/rights",
  "/notice",
  "/corrections",
] as const;

describe("the landing pages' markdown representation", () => {
  it("serves markdown to a caller that asks for it", async () => {
    for (const path of LANDING_PAGES) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/markdown" },
      });
      expect(response.status, `${path} does not answer markdown`).toBe(200);
      expect(
        response.headers.get("content-type"),
        `${path} answered the wrong type`,
      ).toContain("text/markdown");

      const body = await response.text();
      expect(body.length, `${path} markdown is too thin to be real`).toBeGreaterThan(400);

      // Front matter first, because the readers that go looking for a
      // markdown twin are the readers that parse it.
      expect(body.startsWith("---\n"), `${path} has no front matter`).toBe(true);
      expect(body, `${path} front matter has no canonical`).toContain(
        `canonical: "${BASE}${path}"`,
      );
      // One h1, and it is the page's title.
      expect(body.split("\n").filter((line) => line.startsWith("# ")).length).toBe(1);
    }
  });

  it("keeps a CDN from handing one caller's markdown to the next caller's browser", async () => {
    for (const path of LANDING_PAGES) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/markdown" },
      });
      expect(response.headers.get("Vary"), `${path} sends no Vary`).toContain("Accept");
    }
  });

  it("answers the .md suffix now that a representation exists", async () => {
    for (const path of LANDING_PAGES) {
      const twin = await SELF.fetch(`${BASE}${path}.md`);
      expect(twin.status, `${path}.md does not answer`).toBe(200);
      expect(twin.headers.get("content-type")).toContain("text/markdown");
      expect(twin.headers.get("Link")).toContain(`<${BASE}${path}>; rel="canonical"`);

      // The twin IS the negotiated representation, not a second text.
      const negotiated = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/markdown" },
      });
      expect(await twin.text()).toBe(await negotiated.text());
    }
  });

  it("still answers HTML to a browser and JSON to an agent", async () => {
    for (const path of LANDING_PAGES) {
      const html = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      expect(html.status, `${path} broke for a browser`).toBe(200);
      expect(html.headers.get("content-type"), `${path} stopped serving HTML`).toContain(
        "text/html",
      );

      const json = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
      });
      expect(json.status, `${path} broke for an agent`).toBe(200);
      expect(json.headers.get("content-type"), `${path} stopped serving JSON`).toContain(
        "application/json",
      );
    }
  });

  it("renders the same facts the JSON carries, not a second document", async () => {
    // /criteria is the check because its JSON is prose under keys: if
    // the markdown ever stops carrying a sentence the JSON carries,
    // the two have drifted and one of them is now wrong.
    const json = (await (
      await SELF.fetch(`${BASE}/criteria`, { headers: { Accept: "application/json" } })
    ).json()) as Record<string, unknown>;
    const markdown = await (
      await SELF.fetch(`${BASE}/criteria`, { headers: { Accept: "text/markdown" } })
    ).text();

    const standfirst = json["standfirst"];
    expect(typeof standfirst).toBe("string");
    expect(markdown).toContain(standfirst as string);

    // A key that exists in the JSON becomes a heading in the markdown.
    expect(markdown).toContain("## What a badge is");
  });
});

/**
 * THE PER-HOST PAGES, the store's widest route: one page per host the
 * chain has ever met. They were the largest block of content here with
 * no markdown representation, and the `.md` sample that found the gap
 * only ever saw three of them.
 */
describe("one host's history as markdown", () => {
  const testEnv = env as unknown as Env;
  beforeEach(async () => {
    const entries = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
    await Promise.all(entries.keys.map((entry) => testEnv.COUNTERS.delete(entry.name)));
    await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
    const hosts = ["markdown.example", "observed.md"].map((host) => ({
      host, url: `https://${host}/x402`, verdict: "ready",
      failed: [], advisories: [], source: "discovery",
    }));
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify({
      week: "2026-W01", at: "2026-01-01T00:00:00.000Z",
      listed_resources: hosts.length, coverage_suspect: false, capped: false,
      our_search_presence: true, hosts,
    }));
    const snapshot = await takeCorpusSnapshot(testEnv, {
      now: new Date("2026-01-02T00:00:00.000Z"),
      calendars: ["https://calendar.test"],
      fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch,
    });
    expect(snapshot.taken).toBe(true);
  });

  it("serves markdown for a host the chain has met", async () => {
    const host = "markdown.example";

    const response = await SELF.fetch(`${BASE}/corpus/host/${host}`, {
      headers: { Accept: "text/markdown" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");

    const body = await response.text();
    expect(body).toContain(`canonical: "${BASE}/corpus/host/${host}"`);
    expect(body).toContain(`data: "${BASE}/corpus/host/${host}.json"`);
    // The timeline is the point of the page, gaps included.
    expect(body).toContain("## Every round, including the ones we missed");
    expect(body).toContain("## What this cannot see");

    // And the suffix now resolves to the same bytes.
    const twin = await SELF.fetch(`${BASE}/corpus/host/${host}.md`);
    expect(twin.status).toBe(200);
    expect(twin.headers.get("content-type")).toContain("text/markdown");
    expect(twin.headers.get("link")).toContain(`<${BASE}/corpus/host/${host}>; rel="canonical"`);
    expect(await twin.text()).toBe(body);
  });

  it("preserves a recorded hostname ending in .md and its own markdown twin", async () => {
    const page = await SELF.fetch(`${BASE}/corpus/host/observed.md`, {
      headers: { Accept: "text/html" },
    });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("observed.md");
    const direct = await SELF.fetch(`${BASE}/corpus/host/observed.md`, {
      headers: { Accept: "text/markdown" },
    });
    const twin = await SELF.fetch(`${BASE}/corpus/host/observed.md.md`);
    expect(twin.status).toBe(200);
    expect(await twin.text()).toBe(await direct.text());
  });

  it("keeps an unknown host's markdown suffix a missing page", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/host/never-seen.invalid.md`);
    expect(response.status).toBe(404);
  });

  it("still 404s for a host the chain has never carried", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/host/never-seen.invalid`, {
      headers: { Accept: "text/markdown" },
    });
    expect(response.status).toBe(404);
  });
});
