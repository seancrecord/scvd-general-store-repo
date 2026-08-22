import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { USE_WHEN } from "@/store/spec";

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
      await SELF.fetch("https://scvd.store/developers")
    ).json()) as Record<string, unknown>;
    expect(String(json["openapi"])).toContain("/openapi.json");
    expect(String(json["mcp"])).toContain("/.well-known/mcp");
    expect((json["cli"] as { npm: string }).npm).toBe("scvd-tab");

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
      await SELF.fetch("https://scvd.store/developers")
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
      await SELF.fetch("https://scvd.store/developers")
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
      await SELF.fetch("https://scvd.store/developers")
    ).json()) as {
      sections: Array<{ entries: Array<{ href: string; label: string }> }>;
    };
    const local = json.sections
      .flatMap((section) => section.entries)
      .filter((entry) => entry.href.startsWith("https://scvd.store"))
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

  it("does not invent a postal address it does not have", async () => {
    /*
     * The audit asked for `address` too. There is one address here
     * and it is where the keeper lives. schema.org has no vocabulary
     * for "one person, no premises" except declining to claim
     * premises, and an invented PostalAddress is exactly the kind of
     * flattering placeholder /corrections exists to catch. Declined
     * on the record, and pinned so nobody quietly adds one later.
     */
    const page = await SELF.fetch("https://scvd.store/");
    const html = await page.text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1] ?? "{}") as Record<string, unknown>);
    const org = blocks.find((block) => block["@type"] === "Organization");
    expect(org?.["address"]).toBeUndefined();
  });
});
