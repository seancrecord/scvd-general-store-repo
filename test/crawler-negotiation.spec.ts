import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { NAMED_AI_CRAWLERS, SEARCH_CRAWLERS } from "@/lib/crawlers";

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
 */

const NEGOTIATED = ["/menu/hello", "/conformance", "/what", "/menu/settlement_attestation"];

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
  it("hands every named crawler the HTML page when it states no preference", async () => {
    for (const token of [...NAMED_AI_CRAWLERS, ...SEARCH_CRAWLERS]) {
      const wildcard = await fetchAs("/menu/hello", `Mozilla/5.0 (compatible; ${token}/1.0)`, "*/*");
      expect(contentType(wildcard), `${token} with */*`).toBe("text/html");
      const bare = await fetchAs("/menu/hello", `${token}/1.0`);
      expect(contentType(bare), `${token} with no Accept`).toBe("text/html");
    }
  });

  it("does it on every negotiated room, not only the shelf", async () => {
    for (const path of NEGOTIATED) {
      const response = await fetchAs(path, "GPTBot/1.2", "*/*");
      expect(response.status, path).toBe(200);
      expect(contentType(response), path).toBe("text/html");
      const html = await response.text();
      expect(html, `${path} served a page without a title`).toMatch(/<title>/);
    }
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
