import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { askIndex, askRank, scoreEntry } from "@/store/ask-index";

const BASE = "https://scvd.store";

/**
 * /ask — and the two ways an index door lies.
 *
 * It can return something that is not there (a URL nobody can open),
 * and it can return a score nobody can check. This file holds both:
 * every entry in the index is fetched, and the published scoring rule
 * is recomputed against the numbers the endpoint returns.
 */
describe("the NLWeb surfaces", () => {
  it("ranks the store's own entries against a question", async () => {
    const response = await SELF.fetch(
      `${BASE}/ask?query=${encodeURIComponent("how do I pay for a conformance audit")}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      count: number;
      site: string;
      mode: string;
      results: { url: string; score: number; schema_object: { "@type": string } }[];
    };
    expect(body.site).toBe("scvd.store");
    expect(body.mode).toBe("list");
    expect(body.count).toBeGreaterThan(0);
    for (const result of body.results) {
      expect(result.url.startsWith(BASE)).toBe(true);
      expect(result.schema_object["@type"]).toBeTruthy();
    }
    // Best first, and the ordering is the promise the score makes.
    const scores = body.results.map((result) => result.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("returns a score the reader can recompute", () => {
    // The rule /ask publishes, applied by hand to the top hit. If this
    // drifts, the endpoint is publishing a number it cannot justify.
    const query = "conformance";
    const [top] = askRank(query, 1);
    expect(top).toBeDefined();
    expect(top!.score).toBe(scoreEntry(top!.entry, query));
  });

  it("asks for a query rather than guessing at one", async () => {
    const response = await SELF.fetch(`${BASE}/ask`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { example: string };
    expect(body.example).toContain("/ask?query=");
  });

  it("refuses the modes it has not built, by name", async () => {
    const response = await SELF.fetch(`${BASE}/ask?query=refund&mode=generate`);
    /*
     * 501 rather than 400: the request is well-formed and the mode is
     * real NLWeb. The gap is ours, and the status says so.
     */
    expect(response.status).toBe(501);
    const body = (await response.json()) as { why: string };
    expect(body.why).toContain("Not implemented");
  });

  it("speaks event-stream when a client asks it to", async () => {
    const response = await SELF.fetch(`${BASE}/ask?query=refund&streaming=true`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    const types = [...body.matchAll(/"message_type":"([a-z_]+)"/g)].map(
      (match) => match[1],
    );
    expect(types).toEqual(["query_analysis", "result_batch", "complete"]);
  });

  it("names the one site it answers for", async () => {
    const response = await SELF.fetch(`${BASE}/sites`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sites: string[] };
    expect(body.sites).toEqual(["scvd.store"]);
  });

  it("publishes the whole index as a schema.org feed", async () => {
    const response = await SELF.fetch(`${BASE}/ask/feed.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      "@type": string;
      dataFeedElement: { item: { url: string } }[];
    };
    expect(body["@type"]).toBe("DataFeed");
    // The feed IS the index, not a selection from it. A feed that
    // showed a subset would make /ask's results unauditable.
    expect(body.dataFeedElement).toHaveLength(askIndex().length);
  });

  /**
   * A browser-resident NLWeb client reaches for SSE first and POSTs
   * when it does not. Neither is a shape lib/cors.ts can derive an
   * allowance from — an event-stream is not one of its document types
   * and a POST is not a GET — so the door sets its own, and this holds
   * it. A cross-origin fetch that fails here fails in the browser with
   * nothing in our logs to show for it.
   */
  it("is reachable from a browser on every one of its three answers", async () => {
    const stream = await SELF.fetch(`${BASE}/ask?query=refund&streaming=true`);
    expect(stream.headers.get("access-control-allow-origin")).toBe("*");

    const preflight = await SELF.fetch(`${BASE}/ask`, {
      method: "OPTIONS",
      headers: { "Access-Control-Request-Headers": "content-type" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");

    const posted = await SELF.fetch(`${BASE}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "refund" }),
    });
    expect(posted.status).toBe(200);
    expect(posted.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("sends nobody to a door that is not there", async () => {
    const dead: string[] = [];
    for (const entry of askIndex()) {
      // A fragment addresses a place on a page, not a page.
      const path = entry.path.split("#")[0]!;
      const response = await SELF.fetch(`${BASE}${path}`);
      // 402 is a paid door quoting its price; 400 is an intake door
      // saying what it needs. Both exist. 404 is the failure.
      if (![200, 400, 402, 405].includes(response.status)) {
        dead.push(`${path} → ${response.status}`);
      }
    }
    expect(
      dead.join("\n"),
      "the /ask index offers these paths and they do not answer",
    ).toBe("");
  });
});
