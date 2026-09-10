import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  HTML_INDEXERS,
  MARKDOWN_READERS,
  NAMED_AI_CRAWLERS,
  SEARCH_CRAWLERS,
  isMarkdownReader,
} from "@/lib/crawlers";
import { prefersMarkdown, statesNoPreference } from "@/lib/accept";
import type { Env } from "@/types";
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

  it("names every major model builder by name, not only under the wildcard", () => {
    /*
     * THE ROSTER, WALKED 2026-09-06. A crawler is welcome under the
     * wildcard whether or not it is listed; what the list decides is
     * whether the store SAYS so by name, which is the only permission
     * a crawler reads. This holds the roster to the field as it stood
     * that day — every vendor a reader of this store would name.
     */
    const named = new Set([...NAMED_AI_CRAWLERS, ...SEARCH_CRAWLERS]);
    for (const token of [
      // OpenAI, Anthropic, Google, Microsoft, Amazon, Perplexity, Meta,
      // ByteDance, Mistral, Cohere, Apple, Common Crawl.
      "GPTBot", "ChatGPT-User", "OAI-SearchBot",
      "ClaudeBot", "Claude-User", "Claude-SearchBot",
      "Googlebot", "Google-Extended", "GoogleOther", "Google-CloudVertexBot",
      "bingbot", "Amazonbot", "PerplexityBot", "Perplexity-User",
      "Meta-ExternalAgent", "Meta-ExternalFetcher", "Bytespider",
      "MistralAI-User", "cohere-ai", "Applebot", "Applebot-Extended", "CCBot",
      // The answer engines and corpora added the same day.
      "DuckAssistBot", "YouBot", "PetalBot", "AI2Bot",
      // xAI: named though the vendor publishes no bots page.
      "GrokBot", "xAI-Grok", "Grok-DeepSearch",
      // The third walk, 2026-09-10: every token below was read off its
      // operator's own bots page, never off a third-party directory.
      "Google-Agent", "Google-NotebookLM", "Amzn-SearchBot", "Amzn-User",
      "Meta-WebIndexer", "MistralAI-Index", "KimiBot", "Kimi-SearchBot",
      "Diffbot-User", "bedrockbot", "Bravebot",
      // The keeper's same-day ruling: the eight with no bots page.
      "DeepSeekBot", "QwenBot", "DoubaoBot", "MistralAI-Training",
      "FirecrawlAgent", "ExaSearchBot", "TavilyBot", "Claude-Code",
    ]) {
      expect(named.has(token), `${token} is not named anywhere`).toBe(true);
    }
  });

  it("names no crawler its operator has retired", () => {
    /*
     * Anthropic retired `anthropic-ai` and `Claude-Web` in favour of
     * ClaudeBot; its support page lists ClaudeBot, Claude-User and
     * Claude-SearchBot and nothing else. A stanza for a retired string
     * is a false claim by the file's own rule, and the store carried
     * one from 2026-08-30 to 2026-09-10. Held here so it cannot creep
     * back from a directory that still lists it.
     */
    const named = new Set([...NAMED_AI_CRAWLERS, ...SEARCH_CRAWLERS]);
    for (const retired of ["anthropic-ai", "Claude-Web"]) {
      expect(named.has(retired), `${retired} was retired by its operator`).toBe(false);
    }
  });

  it("classes the 2026-09-10 additions on their published purpose", () => {
    for (const reader of ["KimiBot", "Google-NotebookLM", "Amzn-User", "Diffbot-User"]) {
      expect(MARKDOWN_READERS).toContain(reader);
    }
    // A browser agent keeps the page it came to press buttons on; the
    // indexes keep the JSON-LD they came to cite.
    for (const indexer of [
      "Google-Agent", "Amzn-SearchBot", "Meta-WebIndexer", "MistralAI-Index",
      "Kimi-SearchBot", "bedrockbot", "Bravebot",
    ]) {
      expect(HTML_INDEXERS).toContain(indexer);
    }
    // The substring match must not let a sibling token class its
    // neighbour: Diffbot-User is a reader, plain Diffbot is not.
    expect(isMarkdownReader("Mozilla/5.0 (compatible; Diffbot-User/1.0)")).toBe(true);
    expect(isMarkdownReader("Mozilla/5.0 (compatible; Diffbot/1.0)")).toBe(false);
    expect(isMarkdownReader("Mozilla/5.0 (compatible; Kimi-SearchBot/1.0)")).toBe(false);
    expect(isMarkdownReader("Mozilla/5.0 (compatible; KimiBot/1.0)")).toBe(true);
  });

  it("leaves a vendor with no published purpose as an indexer, never a reader", () => {
    /*
     * The classification rule is the vendor's own stated purpose. xAI
     * publishes none, so its three strings cannot be classed as
     * readers by it — and unsure defaults to the answer that loses
     * least, which is the page and its structured data.
     */
    for (const token of [
      "GrokBot", "xAI-Grok", "Grok-DeepSearch", "GoogleOther", "Google-CloudVertexBot",
      // The keeper's 2026-09-10 eight, named on the xAI precedent.
      "DeepSeekBot", "QwenBot", "DoubaoBot", "MistralAI-Training",
      "FirecrawlAgent", "ExaSearchBot", "TavilyBot", "Claude-Code",
    ]) {
      expect(MARKDOWN_READERS, `${token} was classed on a purpose nobody published`).not.toContain(token);
      expect(HTML_INDEXERS).toContain(token);
    }
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
    expect(await reader.text()).toBe(agentsMd(BASE, env as unknown as Env));
    expect(reader.headers.get("vary") ?? "").toContain("User-Agent");

    const browser = await fetchAs("/", "Mozilla/5.0 (Macintosh) Chrome/128", BROWSER);
    expect(contentType(browser)).toBe("text/html");
    const html = await browser.text();
    expect(html).toContain("<title>");
    expect(html).not.toBe(agentsMd(BASE, env as unknown as Env));
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
