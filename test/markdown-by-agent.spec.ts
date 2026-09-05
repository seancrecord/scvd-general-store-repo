import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  HTML_INDEXERS,
  MARKDOWN_READERS,
  NAMED_AI_CRAWLERS,
  SEARCH_CRAWLERS,
  isMarkdownReader,
} from "@/lib/crawlers";
import { prefersMarkdown, statesNoPreference } from "@/lib/accept";
import { agentsMd } from "@/routes/agents-md";

/**
 * MARKDOWN FOR THE READERS (2026-09-05, at the keeper's ask).
 *
 * A probe found GPTBot and a browser receiving byte-identical HTML
 * from the front door. What this file holds: the named list splits
 * into readers and indexers with nobody in both and nobody in
 * neither; a reader that states no preference gets the markdown the
 * page already had; any Accept that names a type still wins; an
 * unnamed agent is unchanged; and the answer says it varies on the
 * User-Agent.
 */

const BASE = "https://scvd.store";
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

async function fetchAs(path: string, userAgent?: string, accept?: string) {
  const headers: Record<string, string> = {};
  if (userAgent) headers["User-Agent"] = userAgent;
  if (accept) headers["Accept"] = accept;
  return SELF.fetch(`${BASE}${path}`, { headers });
}

function contentType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
}

describe("the named list splits by purpose, exactly once", () => {
  it("puts every named crawler in one class and no crawler in both", () => {
    const named = new Set([...NAMED_AI_CRAWLERS, ...SEARCH_CRAWLERS]);
    for (const token of [...MARKDOWN_READERS, ...HTML_INDEXERS]) {
      expect(named.has(token), `${token} is classed but not named`).toBe(true);
    }
    expect(MARKDOWN_READERS.length + HTML_INDEXERS.length).toBe(named.size);
    expect(MARKDOWN_READERS.filter((token) => HTML_INDEXERS.includes(token))).toEqual([]);
    // The engines that cite pages stay indexers; the corpora and the
    // one-page fetchers are readers.
    expect(HTML_INDEXERS).toContain("OAI-SearchBot");
    expect(HTML_INDEXERS).toContain("Claude-SearchBot");
    expect(HTML_INDEXERS).toContain("Googlebot");
    expect(MARKDOWN_READERS).toContain("GPTBot");
    expect(MARKDOWN_READERS).toContain("ChatGPT-User");
    expect(MARKDOWN_READERS).toContain("Claude-User");
  });

  it("reads the User-Agent as a substring, case-insensitively, and never a blank", () => {
    expect(isMarkdownReader("Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2)")).toBe(true);
    expect(isMarkdownReader("gptbot")).toBe(true);
    expect(isMarkdownReader("Mozilla/5.0 (compatible; OAI-SearchBot/1.0)")).toBe(false);
    expect(isMarkdownReader("curl/8.0")).toBe(false);
    expect(isMarkdownReader(undefined)).toBe(false);
    expect(isMarkdownReader("")).toBe(false);
  });
});

describe("the rule, on the header alone", () => {
  it("knows silence from a preference", () => {
    expect(statesNoPreference(undefined)).toBe(true);
    expect(statesNoPreference("")).toBe(true);
    expect(statesNoPreference("*/*")).toBe(true);
    expect(statesNoPreference("text/*, */*;q=0.5")).toBe(true);
    expect(statesNoPreference("text/html")).toBe(false);
    expect(statesNoPreference("application/json;q=0.2, */*")).toBe(false);
  });

  it("lets a reader in only where the header is silent, and never over an Accept", () => {
    expect(prefersMarkdown("*/*", "text/html", "GPTBot/1.2")).toBe(true);
    expect(prefersMarkdown(undefined, "text/html", "ChatGPT-User/1.0")).toBe(true);
    expect(prefersMarkdown("text/html", "text/html", "GPTBot/1.2")).toBe(false);
    expect(prefersMarkdown("application/json", "application/json", "GPTBot/1.2")).toBe(false);
    expect(prefersMarkdown("*/*", "text/html", "OAI-SearchBot/1.0")).toBe(false);
    expect(prefersMarkdown("*/*", "text/html", "curl/8.0")).toBe(false);
    expect(prefersMarkdown("*/*", "text/html")).toBe(false);
    // The first clause is untouched: a stated markdown preference wins for anyone.
    expect(prefersMarkdown("text/markdown", "text/html", "curl/8.0")).toBe(true);
  });
});

describe("the front door, probed as the scan probed it", () => {
  it("gives a reader the operational manual and a browser the storefront", async () => {
    const reader = await fetchAs("/", "GPTBot/1.2", "*/*");
    expect(reader.status).toBe(200);
    expect(contentType(reader)).toBe("text/markdown");
    expect(await reader.text()).toBe(agentsMd(BASE));
    expect(reader.headers.get("vary") ?? "").toContain("User-Agent");

    const browser = await fetchAs("/", "Mozilla/5.0 (Macintosh) Chrome/128", BROWSER);
    expect(contentType(browser)).toBe("text/html");
    const html = await browser.text();
    expect(html).toContain("<title>");
    expect(html).not.toBe(agentsMd(BASE));
  });

  it("changes nothing for an indexer, a stated preference, or an unnamed agent", async () => {
    const indexer = await fetchAs("/", "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)", "*/*");
    expect(contentType(indexer)).toBe("text/html");
    const asked = await fetchAs("/", "GPTBot/1.2", "text/html");
    expect(contentType(asked)).toBe("text/html");
    const curl = await fetchAs("/", "curl/8.0", "*/*");
    expect(contentType(curl)).toBe("text/html");
    const menuAsAgent = await fetchAs("/menu.json", "node", "*/*");
    expect(contentType(menuAsAgent)).toBe("application/json");
    const menuAsReader = await fetchAs("/menu.json", "Claude-User/1.0", "*/*");
    expect(contentType(menuAsReader)).toBe("text/markdown");
  });
});
