import { describe, expect, it } from "vitest";
import { inferChannel, isInfrastructureUserAgent, readerClass } from "@/lib/channel";
import {
  AGENT_CLIENTS,
  MACHINERY_CRAWLERS,
  NAMED_AI_CRAWLERS,
  SEARCH_CRAWLERS,
  SOCIAL_UNFURLERS,
  USER_INITIATED_FETCHERS,
} from "@/lib/crawlers";

/**
 * ONE CLASSIFIER (2026-09-21). For a month /observatory and
 * /admin/signals filed the same request two ways: forty-three
 * crawlers named in lib/crawlers.ts were "crawler" on the signals
 * page and organic "direct" on the observatory, because each
 * instrument read its own table. This file holds both to one answer
 * for every name the store prints in robots.txt, and holds a buyer's
 * client where it always was.
 */

const NAMED = [...NAMED_AI_CRAWLERS, ...SEARCH_CRAWLERS, ...SOCIAL_UNFURLERS];

function ua(token: string): string {
  return `Mozilla/5.0 (compatible; ${token}/1.0; +https://example.invalid/bot)`;
}

describe("one reader classifier", () => {
  it("lands every named crawler in exactly one counter class", () => {
    for (const token of NAMED) {
      const classes = [
        USER_INITIATED_FETCHERS.includes(token),
        AGENT_CLIENTS.includes(token),
        MACHINERY_CRAWLERS.includes(token),
      ].filter(Boolean).length;
      expect(classes, token).toBe(1);
    }
  });

  it("files machinery as infrastructure on the channel and crawler on the page, for every name", () => {
    for (const token of MACHINERY_CRAWLERS) {
      expect(inferChannel({ userAgent: ua(token) }), token).toBe("infrastructure");
      expect(inferChannel({ viaMcp: true, userAgent: ua(token) }), token).toBe("infrastructure");
      expect(readerClass(ua(token), "text/html"), token).toBe("crawler");
      expect(readerClass(ua(token), "*/*"), token).toBe("crawler");
    }
  });

  it("files a person's errand as fetcher on both instruments, never as machinery", () => {
    for (const token of USER_INITIATED_FETCHERS) {
      expect(isInfrastructureUserAgent(ua(token)), token).toBe(false);
      expect(inferChannel({ userAgent: ua(token) }), token).toBe("fetcher");
      expect(readerClass(ua(token), "*/*"), token).toBe("fetcher");
      expect(readerClass(ua(token), "text/html"), token).toBe("fetcher");
    }
    // Diffbot-User contains Diffbot; the errand wins over the crawler it names.
    expect(readerClass(ua("Diffbot-User"), "*/*")).toBe("fetcher");
    expect(readerClass(ua("Diffbot"), "*/*")).toBe("crawler");
  });

  it("leaves a buyer's client where it was", () => {
    for (const token of AGENT_CLIENTS) {
      expect(inferChannel({ userAgent: ua(token) }), token).toBe("direct");
      expect(readerClass(ua(token), "application/json"), token).toBe("agent");
    }
    expect(inferChannel({ userAgent: "curl/8.4.0" })).toBe("direct");
    expect(inferChannel({ userAgent: "node" })).toBe("direct");
    expect(inferChannel({ userAgent: "axios/1.7.2" })).toBe("direct");
    expect(readerClass("curl/8.4.0", "application/json")).toBe("agent");
    expect(readerClass("Mozilla/5.0 (Macintosh) Safari/605.1.15", "text/html,*/*")).toBe("browser");
  });

  it("agrees with itself on the observatory's own two tables", () => {
    // The self-describing machinery table still classes as before.
    expect(inferChannel({ userAgent: "uptimerobot/2.0" })).toBe("infrastructure");
    expect(readerClass("uptimerobot/2.0", "text/html")).toBe("crawler");
    // And the names the pitch counted as organic last month do not any more.
    for (const name of ["PetalBot", "Amazonbot", "Applebot", "OAI-SearchBot", "Meta-ExternalAgent"]) {
      expect(inferChannel({ userAgent: ua(name) }), name).toBe("infrastructure");
    }
  });
});
