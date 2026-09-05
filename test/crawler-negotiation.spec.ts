import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HTML_INDEXERS, MARKDOWN_READERS } from "@/lib/crawlers";

const BASE = "https://scvd.store";

/**
 * WHO GETS THE PAGE (2026-09-02).
 *
 * Probed from outside, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
 * PerplexityBot, Google-Extended and the rest all received JSON from
 * the item pages and the conformance desk, because they send a bare
 * wildcard Accept and the store answers a wildcard with JSON for the
 * agents that transact. The JSON has no title, no description and no
 * JSON-LD. So: a crawler the store names in robots.txt gets the page
 * when it states no preference; a crawler that asks for JSON still
 * gets JSON; an agent with no User-Agent of note is unchanged.
 *
 * AMENDED 2026-09-05, at the keeper's ask: the named list splits by
 * what each agent is FOR (lib/crawlers.ts). An INDEXER — a search or
 * answer engine that cites pages — keeps the page and its JSON-LD,
 * exactly as above. A READER — a training crawler or a user-initiated
 * fetcher — gets markdown where a page genuinely has a markdown
 * representation, and the page everywhere else. Nothing changes for
 * a crawler that states a preference or for an unnamed agent.
 */

/** Rooms that negotiate but serve no markdown: every named crawler gets the page. */
const NEGOTIATED_PAGE_ONLY = ["/conformance", "/what"];
/** Rooms with a real markdown twin: a reader gets it, an indexer gets the page. */
const NEGOTIATED_WITH_MARKDOWN = ["/menu/hello", "/menu/settlement_attestation"];
const NEGOTIATED = [...NEGOTIATED_PAGE_ONLY, ...NEGOTIATED_WITH_MARKDOWN];

async function fetchAs(path: string, userAgent?: string, accept?: string) {
  const headers: Record<string, string> = {};
  if (userAgent) headers["User-Agent"] = userAgent;
  if (accept) headers["Accept"] = accept;
  return SELF.fetch(`${BASE}${path}`, { headers });
}

function contentType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
}

describe("content negotiation for named crawlers", { timeout: 60_000 }, () => {
  it("hands every named indexer the HTML page when it states no preference", async () => {
    for (const token of HTML_INDEXERS) {
      const wildcard = await fetchAs("/menu/hello", `Mozilla/5.0 (compatible; ${token}/1.0)`, "*/*");
      expect(contentType(wildcard), `${token} with */*`).toBe("text/html");
      const bare = await fetchAs("/menu/hello", `${token}/1.0`);
      expect(contentType(bare), `${token} with no Accept`).toBe("text/html");
    }
  });

  it("hands every named reader the markdown twin when it states no preference", async () => {
    for (const token of MARKDOWN_READERS) {
      const wildcard = await fetchAs("/menu/hello", `Mozilla/5.0 (compatible; ${token}/1.0)`, "*/*");
      expect(contentType(wildcard), `${token} with */*`).toBe("text/markdown");
      const bare = await fetchAs("/menu/hello", `${token}/1.0`);
      expect(contentType(bare), `${token} with no Accept`).toBe("text/markdown");
    }
  });

  it("gives a reader the page wherever no markdown exists, on every negotiated room", async () => {
    for (const path of NEGOTIATED_PAGE_ONLY) {
      const response = await fetchAs(path, "GPTBot/1.2", "*/*");
      expect(response.status, path).toBe(200);
      expect(contentType(response), path).toBe("text/html");
      const html = await response.text();
      expect(html, `${path} served a page without a title`).toMatch(/<title>/);
    }
    for (const path of NEGOTIATED_WITH_MARKDOWN) {
      const reader = await fetchAs(path, "GPTBot/1.2", "*/*");
      expect(contentType(reader), path).toBe("text/markdown");
      const indexer = await fetchAs(path, "OAI-SearchBot/1.0", "*/*");
      expect(contentType(indexer), path).toBe("text/html");
      expect(await indexer.text(), `${path} lost its JSON-LD`).toContain("application/ld+json");
    }
  });

  it("still gives a reader the page when it asks for the page", async () => {
    const response = await fetchAs("/menu/hello", "GPTBot/1.2", "text/html");
    expect(contentType(response)).toBe("text/html");
  });

  it("still gives a crawler JSON when it asks for JSON", async () => {
    const response = await fetchAs("/menu/hello", "GPTBot/1.2", "application/json");
    expect(contentType(response)).toBe("application/json");
  });

  it("changes nothing for an agent that states no preference", async () => {
    const bare = await fetchAs("/menu/hello");
    expect(contentType(bare)).toBe("application/json");
    const wildcard = await fetchAs("/menu/hello", "node", "*/*");
    expect(contentType(wildcard)).toBe("application/json");
    const curl = await fetchAs("/conformance", "curl/8.0", "*/*");
    expect(contentType(curl)).toBe("application/json");
  });

  it("says in Vary that the answer depends on the User-Agent", async () => {
    for (const path of NEGOTIATED) {
      const response = await fetchAs(path, "GPTBot/1.2", "*/*");
      expect(response.headers.get("vary") ?? "", path).toContain("User-Agent");
    }
  });
});
