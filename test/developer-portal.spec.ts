import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { USE_WHEN } from "@/store/spec";
import { OPERATOR } from "@/store/trust-signals";
import { CLI_PACKAGE, CLI_PUBLISHED } from "@/store/cli";

/**
 * THE LIBRARY WAS ALWAYS OPEN. NOBODY COULD FIND THE DOOR.
 *
 * Every fact on /developers was published before the page existed:
 * the contract at /openapi.json, the manual at /agents.md, the
 * briefing at /llms.txt, the server at /mcp, the criteria at
 * /api/preflight/v1. A readiness audit on 2026-08-21 searched for
 * this store's developer resources by name, found nothing relevant,
 * then probed the three paths every other API has taught a developer
 * to type — /developers, /docs, /api — and got three 404s.
 *
 * That is an ADDRESSING failure, not a documentation one, and the
 * distinction matters: the fix is an index at a guessable path, not
 * more prose. These tests hold the door open.
 */

const PATHS = ["/developers", "/docs", "/api"] as const;

describe("the three paths a developer types", () => {
  for (const path of PATHS) {
    it(`answers at ${path}`, async () => {
      const page = await SELF.fetch(`https://scvd.store${path}`, {
        headers: { Accept: "text/html" },
      });
      expect(page.status).toBe(200);
      const html = await page.text();
      // The audit's other finding: the product name has to be IN the
      // heading, or a name-based search has nothing to match.
      expect(html).toContain("<h1");
      expect(html.toLowerCase()).toContain("general store");
      expect(html.toLowerCase()).toContain("developer documentation");
    });
  }

  /**
   * THE DIALECT A CRAWLER ACTUALLY SPEAKS.
   *
   * The route used to pick its representation by asking whether the
   * Accept header CONTAINED "text/html" — so `* / *`, which is what
   * curl and most crawlers send, fell through to JSON. The homepage
   * link was found, followed, and the page behind it reported as
   * "thin or unreachable" on the strength of 6KB of JSON. A client
   * with no stated preference asking a documentation page gets the
   * documentation.
   */
  for (const path of PATHS) {
    it(`serves the page, not the JSON, to a client with no preference at ${path}`, async () => {
      for (const accept of [undefined, "*/*", "text/plain, */*"]) {
        const page = await SELF.fetch(`https://scvd.store${path}`, {
          headers: accept ? { Accept: accept } : {},
        });
        expect(page.status).toBe(200);
        expect(
          page.headers.get("content-type"),
          `Accept: ${accept ?? "(none)"}`,
        ).toContain("text/html");
        expect(page.headers.get("vary")).toContain("Accept");
      }
    });
  }

  it("still hands JSON to anything that asks for JSON", async () => {
    // The other half of the same rule: a stated preference is
    // obeyed exactly, so nothing built against the old default moves.
    const json = await SELF.fetch("https://scvd.store/developers", {
      headers: { Accept: "application/json" },
    });
    expect(json.headers.get("content-type")).toContain("application/json");
  });

  it("points every representation at the API catalog", async () => {
    // RFC 9727: the api-catalog link relation is how a client that
    // landed on one API resource finds the rest of the surface.
    const page = await SELF.fetch("https://scvd.store/developers", {
      headers: { Accept: "text/html" },
    });
    expect(page.headers.get("link")).toContain('rel="api-catalog"');
    expect(page.headers.get("link")).toContain("/.well-known/api-catalog");
  });

  it("names one canonical URL so three paths are not three pages", async () => {
    for (const path of PATHS) {
      const page = await SELF.fetch(`https://scvd.store${path}`, {
        headers: { Accept: "text/html" },
      });
      expect(page.headers.get("link")).toContain('rel="canonical"');
      expect(page.headers.get("link")).toContain("/developers");
    }
  });

  it("serves the same index as JSON and as markdown", async () => {
    const json = (await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "application/json" },
      })
    ).json()) as Record<string, unknown>;
    expect(String(json["openapi"])).toContain("/openapi.json");
    expect(String(json["mcp"])).toContain("/.well-known/mcp");
    /*
     * THE OFFICIAL ONE IS `scvd`, and `scvd-tab` moved under `also`
     * on 2026-08-26. The distinction is the point of the change: the
     * tab is a useful package that happens to be ours and works
     * against any x402 store, and an audit reading this field found
     * "a CLI tool mentioned" rather than a command line for THIS
     * store. Both are asserted, so neither can quietly vanish.
     */
    const cli = json["cli"] as {
      npm: string;
      published: boolean;
      install_available: boolean;
      source: string;
      commands: string[];
      also: { npm: string };
    };
    expect(cli.npm).toBe(CLI_PACKAGE);
    expect(cli.commands).toContain("scvd preflight <url>");
    expect(cli.also.npm).toBe("scvd-tab");
    /*
     * PUBLISHED IS A FIELD, NOT AN INFERENCE. `npm publish` is the
     * keeper's hand and an agent reading this decides whether to try
     * an install — "we intend to" and "you can" are different answers.
     * Both halves are held: the flag tells the truth, and there is
     * always a way to run the thing whichever way the flag reads.
     */
    expect(cli.published).toBe(CLI_PUBLISHED);
    expect(cli.install_available).toBe(CLI_PUBLISHED);
    expect(cli.source).toContain("/cli");

    const md = await SELF.fetch("https://scvd.store/developers", {
      headers: { Accept: "text/markdown" },
    });
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(md.headers.get("vary")).toContain("Accept");
    expect(await md.text()).toContain("# ");
  });
});

describe("the questions a developer portal exists to answer", () => {
  it("says there is no auth rather than leaving it to be discovered", async () => {
    const json = (await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "application/json" },
      })
    ).json()) as { authentication: string; conventions: Array<{ q: string; a: string }> };
    /*
     * The interesting half: the usual portal exists to issue keys.
     * This one exists to say there is nothing to issue, which a
     * developer otherwise spends twenty minutes failing to find.
     */
    expect(json.authentication.toLowerCase()).toContain("none");
    const topics = json.conventions.map((row) => row.q.toLowerCase());
    for (const required of ["errors", "rate limits", "versioning and deprecation"]) {
      expect(topics).toContain(required);
    }
  });

  it("documents the deprecation policy the contract points at", async () => {
    const json = (await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "application/json" },
      })
    ).json()) as { conventions: Array<{ q: string; a: string }> };
    const versioning = json.conventions.find((row) =>
      row.q.toLowerCase().includes("versioning"),
    );
    // A versioning claim without a sunset promise is what the audit
    // flagged: an agent will not integrate against a surface that can
    // change without warning.
    expect(versioning?.a).toMatch(/Sunset/);
    expect(versioning?.a).toMatch(/90 days/);
  });

  it("links only doors that actually open", async () => {
    const json = (await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      sections: Array<{ entries: Array<{ href: string; label: string }> }>;
    };
    /*
     * ORIGIN COMPARED, NOT PREFIX-MATCHED (CodeQL, 2026-08-22).
     * `startsWith("https://scvd.store")` is also true of
     * https://scvd.store.example.com/, so a link that had drifted to a
     * lookalike host would be treated as ours and probed as ours —
     * the test would vouch for a door it had never checked. Parsing
     * and comparing the origin is both the documented remediation and
     * the stricter assertion.
     */
    const isOurs = (href: string): boolean => {
      try {
        return new URL(href).origin === "https://scvd.store";
      } catch {
        return false;
      }
    };
    const local = json.sections
      .flatMap((section) => section.entries)
      .filter((entry) => isOurs(entry.href))
      // A path template is documentation, not a resource; the store
      // learned that from x402scan probing `{item_id}` literally.
      .filter((entry) => !entry.href.includes("{"));
    expect(local.length).toBeGreaterThan(4);
    for (const entry of local) {
      /*
       * The label states the method, so the probe uses it. A GET at a
       * POST-only door answers 405, and accepting 405 here would let
       * this test pass over a link that genuinely does not work.
       */
      const method = entry.label.startsWith("POST") ? "POST" : "GET";
      const probe = await SELF.fetch(entry.href, {
        method,
        ...(method === "POST"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
            }
          : {}),
      });
      // 400 is a door that opened and disliked an empty body, which
      // is a working endpoint; 404 and 405 are not.
      expect([200, 400, 402]).toContain(probe.status);
    }
  });
});

describe("when to reach for this store, at a guessable path", () => {
  it("publishes the when-to-use guidance as its own document", async () => {
    const doc = await SELF.fetch(
      "https://scvd.store/.well-known/agent-instructions",
    );
    expect(doc.status).toBe(200);
    const body = (await doc.json()) as {
      when_to_use: Array<{ situation: string; items: string[]; example_request: string }>;
      when_not_to_use: string;
    };
    expect(body.when_to_use.length).toBe(USE_WHEN.length);
    // Job-shaped, with the actual call — the audit's own standard is
    // that generic marketing copy does not read as guidance.
    for (const entry of body.when_to_use) {
      expect(entry.situation.length).toBeGreaterThan(30);
      expect(entry.items.length).toBeGreaterThan(0);
      expect(entry.example_request).toBeTruthy();
    }
    // And the half nobody publishes: when NOT to call.
    expect(body.when_not_to_use.toLowerCase()).toContain("do not need");
  });

  it("derives from the same array llms.txt renders, so they cannot disagree", async () => {
    const doc = await SELF.fetch(
      "https://scvd.store/.well-known/agent-instructions",
    );
    const body = (await doc.json()) as {
      when_to_use: Array<{ situation: string }>;
    };
    expect(body.when_to_use.map((entry) => entry.situation)).toEqual(
      USE_WHEN.map((entry) => entry.when),
    );
  });
});

describe("the organization, to an entity resolver", () => {
  it("carries a contactPoint in the Organization block", async () => {
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1] ?? "{}") as Record<string, unknown>);
    const org = blocks.find((block) => block["@type"] === "Organization");
    expect(org).toBeTruthy();
    const contacts = org?.["contactPoint"] as Array<Record<string, string>>;
    expect(contacts.length).toBeGreaterThan(0);
    for (const contact of contacts) {
      expect(contact["@type"]).toBe("ContactPoint");
      expect(contact["email"]).toContain("@");
      expect(contact["contactType"]).toBeTruthy();
    }
  });

  it("names the town it is in, and no closer than that", async () => {
    /*
     * THE FIELD THAT WAS DECLINED, AND WHY IT IS HERE NOW. The audit
     * asked for `address`; the store refused, on the grounds that the
     * only address it has is where the keeper lives. That reasoning
     * holds for a STREET, and it never held for the town — which is
     * printed on the sign, the badges, the stamps and /trust, and has
     * been since July.
     *
     * So this asserts BOTH halves, because either one alone is the
     * wrong guard: a locality-level PostalAddress is present, and no
     * streetAddress or postalCode has quietly joined it later.
     */
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1] ?? "{}") as Record<string, unknown>);
    const org = blocks.find((block) => block["@type"] === "Organization");
    const address = org?.["address"] as Record<string, unknown> | undefined;
    expect(address).toBeTruthy();
    expect(address?.["@type"]).toBe("PostalAddress");
    expect(address?.["addressCountry"]).toBe("US");
    // Derived from OPERATOR.location, never retyped: the two have to
    // agree by construction rather than by anyone remembering.
    const [locality, region] = OPERATOR.location.split(",").map((part) => part.trim());
    expect(address?.["addressLocality"]).toBe(locality);
    expect(address?.["addressRegion"]).toBe(region);
    expect(address?.["streetAddress"]).toBeUndefined();
    expect(address?.["postalCode"]).toBeUndefined();
  });

  it("says the three names are one WEBSITE, not only one company", async () => {
    /*
     * A readiness audit searched the brand by name and this domain did
     * not appear in ten results. Most of that is off-site and no
     * markup fixes it. The half that IS ours: an engine deciding
     * whether the string somebody typed refers to this site had the
     * three names scattered across an Organization's alternateName, a
     * page title and an og tag, with nothing saying they name the same
     * site at the same URL. schema.org has WebSite for exactly that.
     */
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1] ?? "{}") as Record<string, unknown>);
    const site = blocks.find((block) => block["@type"] === "WebSite");
    expect(site, "the storefront declares no WebSite").toBeTruthy();
    expect(site?.["url"]).toBe("https://scvd.store/");
    const names = site?.["alternateName"] as string[];
    expect(names).toContain("scvd.store");
    expect(names).toContain("Sean-Claude Van Damme's General Store");
    // Joined to the Organization rather than repeating its fields,
    // which would be a second copy free to drift from the first.
    const publisher = site?.["publisher"] as Record<string, unknown>;
    const org = blocks.find((block) => block["@type"] === "Organization");
    expect(publisher["name"]).toBe(org?.["name"]);
  });
});

/**
 * THE DECLINED POSITIONS, PUBLISHED (P12, 2026-08-27). The store
 * refuses several scanner recommendations on purpose, and the
 * reasoning lived only in internal docs where no scorecard reader
 * could see it. Same practice as /corrections: the gap publishes
 * beside the finding, in every dialect, from one array.
 */
describe("what we don't do, on purpose", () => {
  it("renders the section in all three dialects, from the one array", async () => {
    const { declinedPositions } = await import("@/store/copy/declined");
    const positions = declinedPositions("https://scvd.store");
    expect(positions.length).toBeGreaterThanOrEqual(3);

    const html = await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "text/html" },
      })
    ).text();
    const md = await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "text/markdown" },
      })
    ).text();
    const json = (await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "application/json" },
      })
    ).json()) as { declined_on_purpose?: Array<{ heading: string }> };

    for (const position of positions) {
      expect(html, `HTML missing: ${position.heading}`).toContain(
        position.heading,
      );
      expect(md, `markdown missing: ${position.heading}`).toContain(
        position.heading,
      );
    }
    expect(json.declined_on_purpose?.map((p) => p.heading)).toEqual(
      positions.map((p) => p.heading),
    );
  });

  it("the ai-train sentence and robots.txt serve the same policy line", async () => {
    // One constant renders both (CONTENT_SIGNAL); this reads the two
    // live surfaces and refuses the day anybody forks them.
    const { CONTENT_SIGNAL } = await import("@/routes/site-meta");
    const robots = await (
      await SELF.fetch("https://scvd.store/robots.txt")
    ).text();
    const md = await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "text/markdown" },
      })
    ).text();
    expect(robots).toContain(`Content-Signal: ${CONTENT_SIGNAL}`);
    expect(md).toContain(CONTENT_SIGNAL);
  });

  it("the WebMCP sentence derives from the live browser-tool catalog", async () => {
    const { webmcpTools } = await import("@/routes/webmcp");
    const md = await (
      await SELF.fetch("https://scvd.store/developers", {
        headers: { Accept: "text/markdown" },
      })
    ).text();
    for (const tool of webmcpTools()) {
      expect(md, `section missing browser tool ${tool.name}`).toContain(
        tool.name,
      );
    }
  });

  it("files the same section under the developers llms area", async () => {
    const area = await (
      await SELF.fetch("https://scvd.store/developers/llms.txt")
    ).text();
    expect(area).toContain("What we don't do, on purpose");
    expect(area).toContain("Training is distribution here, not leakage");
  });
});
