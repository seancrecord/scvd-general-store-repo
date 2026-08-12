import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  readPageFacts,
  runOnpageChecks,
} from "@/services/onpage-checks";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

/**
 * THE ON-PAGE BATTERY — the judgment half aimed at synthetic pages
 * (the preflight's testing discipline), plus the free desk's doors
 * and refusals. The paid item's suite is test/onpage-audit.spec.ts.
 */

beforeAll(() => {
  installFacilitatorMock();
});

const GOOD_PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>A well-shaped page</title>
  <meta name="description" content="One sentence a machine can quote.">
  <link rel="canonical" href="https://site.example/page">
  <script type="application/ld+json">{"@type":"WebPage","name":"A well-shaped page"}</script>
</head>
<body>
  <h1>The one heading</h1>
  <a href="/elsewhere">a real link</a>
</body>
</html>`;

async function judge(html: string, contentType = "text/html; charset=utf-8") {
  const facts = await readPageFacts(html);
  return runOnpageChecks(200, contentType, facts, false);
}

describe("the parse reads what the page serves", () => {
  it("collects title, metas, canonical, JSON-LD, headings, links and lang", async () => {
    const facts = await readPageFacts(GOOD_PAGE);
    expect(facts.titles).toEqual(["A well-shaped page"]);
    expect(facts.metaDescriptions).toEqual([
      "One sentence a machine can quote.",
    ]);
    expect(facts.canonicals).toEqual(["https://site.example/page"]);
    expect(facts.jsonLdBlocks).toHaveLength(1);
    expect(JSON.parse(facts.jsonLdBlocks[0]!)).toMatchObject({
      "@type": "WebPage",
    });
    expect(facts.h1Count).toBe(1);
    expect(facts.anchorCount).toBe(1);
    expect(facts.anchorsWithoutDestination).toBe(0);
    expect(facts.htmlLang).toBe("en");
  });

  it("keeps a JSON-LD buffer apart from ordinary scripts", async () => {
    const facts = await readPageFacts(
      `<html><head>
        <script>var notData = 1;</script>
        <script type="application/ld+json">{"a":1}</script>
        <script>var alsoNot = 2;</script>
      </head></html>`,
    );
    expect(facts.jsonLdBlocks).toEqual(['{"a":1}']);
  });
});

describe("the checks judge the shape, and the advisories never fail it", () => {
  it("a well-shaped page passes every check", async () => {
    const { checks } = await judge(GOOD_PAGE);
    for (const check of checks) {
      expect(check.ok, `${check.name}: ${check.detail}`).toBe(true);
    }
    const names = checks.map((check) => check.name);
    expect(names).toContain("serves-html");
    expect(names).toContain("title");
    expect(names).toContain("meta-description");
    expect(names).toContain("canonical");
    expect(names).toContain("structured-data");
  });

  it("a missing title fails, plainly", async () => {
    const { checks } = await judge(
      '<html><head><meta name="description" content="x"></head></html>',
    );
    const title = checks.find((check) => check.name === "title");
    expect(title?.ok).toBe(false);
    expect(title?.detail).toContain("no non-empty <title>");
  });

  it("two titles fail, because the page does not choose which is read", async () => {
    const { checks } = await judge(
      "<html><head><title>One</title><title>Two</title></head></html>",
    );
    const title = checks.find((check) => check.name === "title");
    expect(title?.ok).toBe(false);
    expect(title?.detail).toContain("2 <title>");
  });

  it("a missing description fails with what a machine does instead", async () => {
    const { checks } = await judge("<html><head><title>t</title></head></html>");
    const description = checks.find(
      (check) => check.name === "meta-description",
    );
    expect(description?.ok).toBe(false);
    expect(description?.detail).toContain("write their own");
  });

  it("a relative canonical fails; an absent one is only an advisory", async () => {
    const relative = await judge(
      '<html><head><title>t</title><meta name="description" content="d"><link rel="canonical" href="/page"></head></html>',
    );
    const canonical = relative.checks.find(
      (check) => check.name === "canonical",
    );
    expect(canonical?.ok).toBe(false);
    expect(canonical?.detail).toContain("absolute");

    const absent = await judge(
      '<html><head><title>t</title><meta name="description" content="d"></head></html>',
    );
    expect(
      absent.checks.find((check) => check.name === "canonical"),
    ).toBeUndefined();
    expect(
      absent.advisories.map((advisory) => advisory.name),
    ).toContain("no-canonical");
  });

  it("broken JSON-LD fails; absent structured data is only an advisory", async () => {
    const broken = await judge(
      '<html><head><title>t</title><meta name="description" content="d"><script type="application/ld+json">{not json</script></head></html>',
    );
    const structured = broken.checks.find(
      (check) => check.name === "structured-data",
    );
    expect(structured?.ok).toBe(false);
    expect(structured?.detail).toContain("not parseable");

    const absent = await judge(
      '<html><head><title>t</title><meta name="description" content="d"></head></html>',
    );
    expect(
      absent.advisories.map((advisory) => advisory.name),
    ).toContain("no-structured-data");
  });

  it("noindex is reported as working, not as wrong", async () => {
    const { checks, advisories } = await judge(
      '<html lang="en"><head><title>t</title><meta name="description" content="d"><meta name="robots" content="noindex, nofollow"></head><body><h1>h</h1></body></html>',
    );
    expect(checks.every((check) => check.ok)).toBe(true);
    const robots = advisories.find(
      (advisory) => advisory.name === "robots-noindex",
    );
    expect(robots?.detail).toContain("Fine if intended");
  });

  it("heading shape, missing lang and dead anchors are advisories with counts", async () => {
    const { advisories } = await judge(
      '<html><head><title>t</title><meta name="description" content="d"></head><body><a href="#">x</a><a href="">y</a><a href="/real">z</a></body></html>',
    );
    const names = advisories.map((advisory) => advisory.name);
    expect(names).toContain("heading-shape");
    expect(names).toContain("no-lang");
    const dead = advisories.find(
      (advisory) => advisory.name === "dead-anchors",
    );
    expect(dead?.detail).toContain("2 of 3");
  });

  it("a redirect is reported, not followed", async () => {
    const facts = await readPageFacts("");
    const { checks } = runOnpageChecks(301, "", facts, false);
    expect(checks[0]?.ok).toBe(false);
    expect(checks[0]?.detail).toContain("redirect");
  });

  it("a JSON answer is sent to the right desk", async () => {
    const facts = await readPageFacts("{}");
    const { checks } = runOnpageChecks(200, "application/json", facts, false);
    const serves = checks.find((check) => check.name === "serves-html");
    expect(serves?.ok).toBe(false);
    expect(serves?.detail).toContain("/api/preflight");
  });
});

describe("the free desk at /api/onpage", () => {
  it("the GET is the document, and it states the script blind spot", async () => {
    const response = await SELF.fetch(`${BASE}/api/onpage/v1`);
    expect(response.status).toBe(200);
    const doc = (await response.json()) as Record<string, unknown>;
    expect(doc["what_it_checks"]).toBeTruthy();
    expect(JSON.stringify(doc["what_it_cannot_check"])).toContain("script");
    expect(JSON.stringify(doc["the_ladder"])).toContain("onpage_audit");
  });

  it("refuses a missing url with the request shape", async () => {
    const response = await SELF.fetch(`${BASE}/api/onpage/v1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(400);
  });

  it("refuses our own hostname with the reason", async () => {
    const response = await SELF.fetch(`${BASE}/api/onpage/v1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `${BASE}/` }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("own hostname");
  });

  it("refuses plain http under the shared probe-target law", async () => {
    const response = await SELF.fetch(`${BASE}/api/onpage/v1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://site.example/page" }),
    });
    expect(response.status).toBe(400);
  });

  it("reads a stubbed page and reports in the house schema, blind spots included", async () => {
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.startsWith("https://site.example/")) {
          return new Response(GOOD_PAGE, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return inner(input as never, init as never);
      },
    );
    try {
      const response = await SELF.fetch(`${BASE}/api/onpage/v1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://site.example/page" }),
      });
      expect(response.status).toBe(200);
      const report = (await response.json()) as Record<string, unknown>;
      expect(report["verdict"]).toBe("ready");
      expect(Array.isArray(report["checks"])).toBe(true);
      // The blind spots ride the report itself, not just the doc.
      expect(JSON.stringify(report["what_this_cannot_tell_you"])).toContain(
        "script",
      );
      expect(report["our_conflict_of_interest"]).toBeTruthy();
      expect(JSON.stringify(report["next_steps"])).toContain(
        "/api/buy/onpage_audit",
      );
    } finally {
      vi.unstubAllGlobals();
      installFacilitatorMock();
    }
  });
});
