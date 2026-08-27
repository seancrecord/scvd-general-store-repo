import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  ARD_CONTEXT_URL,
  ARD_LINK_REL,
  ARD_PREDECESSOR_LINK_REL,
  ARD_PREDECESSOR_PATH,
  ARD_WELL_KNOWN_PATH,
  ardManifest,
} from "@/lib/ard-catalog";
import { apiCatalog } from "@/lib/api-catalog";
import { API_VERSIONS, isRetiring } from "@/store/api-lifecycle";
import { mcpToolCatalog } from "@/lib/mcp-tools";

const BASE = "https://scvd.store";

/**
 * AGENTIC RESOURCE DISCOVERY, AND THE PATH THE SCANNER ASKED FOR.
 *
 * A readiness pass scored this store 0/1 on a REQUIRED
 * `/.well-known/ai-catalog.json`. The research before any of this was
 * written found two things worth holding in a test rather than in a
 * memory:
 *
 *   1. ARD is a real published specification — v0.91, status
 *      "Proposal", authored at Google, Microsoft and Hugging Face,
 *      Apache-2.0, with an authoritative JSON Schema. Not one
 *      scanner's private convention.
 *   2. The file the scanner names is ARD's PREDECESSOR path. §5.1
 *      makes /.well-known/ard.json the path a consumer MUST fetch,
 *      says a publisher has "no need to serve the predecessor path",
 *      and tells publishers still on it to move.
 *
 * So the canonical document is ard.json and the old path is an alias.
 * These tests hold that ordering, because the cheap mistake here is
 * to satisfy the scanner and quietly become a store whose only ARD
 * surface is the deprecated one.
 */

async function fetchManifest(path: string): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`);
}

describe("the ARD manifest is served at the path the spec makes normative", () => {
  it("answers on /.well-known/ard.json", async () => {
    const response = await fetchManifest(ARD_WELL_KNOWN_PATH);
    expect(ARD_WELL_KNOWN_PATH).toBe("/.well-known/ard.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("answers identically on the predecessor path, and points home", async () => {
    const canonical = await fetchManifest(ARD_WELL_KNOWN_PATH);
    const predecessor = await fetchManifest(ARD_PREDECESSOR_PATH);
    expect(ARD_PREDECESSOR_PATH).toBe("/.well-known/ai-catalog.json");
    expect(predecessor.status).toBe(200);

    // One document, two addresses — never two documents that can drift.
    expect(await predecessor.text()).toBe(await canonical.text());
  });

  it("names the canonical path in the link relation, from both paths", async () => {
    /*
     * §5.1 makes `rel="ard"` normative for consumers. Emitting it from
     * the predecessor path too is how a reader that arrived at the old
     * address learns the new one — the alias exists to be found, not
     * to be settled on.
     */
    for (const path of [ARD_WELL_KNOWN_PATH, ARD_PREDECESSOR_PATH]) {
      const link = (await fetchManifest(path)).headers.get("Link") ?? "";
      expect(link, path).toContain(`rel="${ARD_LINK_REL}"`);
      expect(link, path).toContain(`${BASE}${ARD_WELL_KNOWN_PATH}`);
      // Never advertises the old path as the destination.
      expect(link, path).not.toContain(ARD_PREDECESSOR_PATH);
    }
  });
});

describe("every entry satisfies what ARD requires of one", () => {
  it("carries identifier, displayName, type, and exactly one of url/data", async () => {
    const body = (await (await fetchManifest(ARD_WELL_KNOWN_PATH)).json()) as {
      entries: Array<Record<string, unknown>>;
    };
    // The one field the ArdManifest schema requires of the document.
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeGreaterThan(0);

    for (const entry of body.entries) {
      const where = String(entry["identifier"]);
      expect(typeof entry["identifier"], where).toBe("string");
      expect(typeof entry["displayName"], where).toBe("string");
      expect(typeof entry["type"], where).toBe("string");
      // "exactly one" — the schema's oneOf, asserted as written.
      expect(
        ("url" in entry) !== ("data" in entry),
        `${where} must carry exactly one of url/data`,
      ).toBe(true);
    }
  });

  it("anchors every identifier to this origin's own domain", async () => {
    /*
     * Appendix C requires `urn:air:<publisher>:<namespace>:<name>`
     * with publisher an FQDN, and §4.5.1 binds that domain to the
     * trust domain in trustManifest.identity — a registry REJECTS an
     * entry whose identifier claims a domain its attestation cannot
     * back. So the two are checked against each other here rather
     * than each against a literal.
     */
    const host = new URL(BASE).host;
    const body = (await (await fetchManifest(ARD_WELL_KNOWN_PATH)).json()) as {
      entries: Array<Record<string, unknown>>;
    };
    for (const entry of body.entries) {
      /*
       * PARSED, NOT PATTERN-MATCHED. This built a RegExp out of the
       * host and escaped dots but not backslashes, which CodeQL
       * flagged — correctly, and the deeper problem is that a regex
       * assembled from a value is the wrong instrument for a
       * five-field colon-delimited URN. Splitting says what Appendix C
       * actually requires: urn, air, the publisher FQDN, a namespace,
       * a name, and nothing after it.
       */
      const identifier = String(entry["identifier"]);
      const parts = identifier.split(":");
      expect(parts.length, identifier).toBe(5);
      expect(parts[0], identifier).toBe("urn");
      expect(parts[1], identifier).toBe("air");
      expect(parts[2], identifier).toBe(host);
      expect(parts[3], identifier).toBeTruthy();
      expect(parts[4], identifier).toBeTruthy();
      const trust = entry["trustManifest"] as { identity?: string } | undefined;
      expect(trust?.identity, identifier).toBe(`did:web:${host}`);
    }
  });

  it("points every entry at a URL this origin actually serves", async () => {
    /*
     * A discovery manifest is consumed by machines that follow every
     * href in it. A dead link here is worse than an absent entry: the
     * registry has fetched us, indexed us, and cached a 404.
     */
    const body = (await (await fetchManifest(ARD_WELL_KNOWN_PATH)).json()) as {
      entries: Array<{ url: string; identifier: string }>;
    };
    for (const entry of body.entries) {
      /*
       * ORIGIN, NOT PREFIX. `startsWith(BASE)` would accept
       * https://scvd.store.evil.com/... — the host is a prefix of the
       * attacker's, and the assertion reads as though it pinned the
       * origin. CodeQL flagged it on the day this shipped and it was
       * right: in a document a discovery registry crawls, "the URL is
       * ours" is exactly the claim that has to be exact.
       */
      expect(new URL(entry.url).origin, entry.identifier).toBe(BASE);
      const response = await SELF.fetch(entry.url);
      expect(response.status, `${entry.identifier} -> ${entry.url}`).toBe(200);
    }
  });

  it("claims no rating, score, endorsement or certification", async () => {
    /*
     * The same rule the item pages' JSON-LD follows, applied to the
     * document a discovery registry ranks us from — which is the
     * surface where the temptation is strongest and the store's own
     * position ("never a score, never a ranking") is most load-bearing.
     */
    const text = await (await fetchManifest(ARD_WELL_KNOWN_PATH)).text();
    for (const forbidden of [
      "aggregateRating",
      "ratingValue",
      "reviewCount",
      "certified",
      "endorse",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("it cannot disagree with what the store already declares", () => {
  it("lists no resource the api-catalog has never heard of", async () => {
    /*
     * The two documents answer different questions and are allowed to
     * differ in shape — but not in FACTS. Every ARD entry's URL must
     * be a string the RFC 9727 catalog already carries, so the two
     * cannot come to describe different origins.
     */
    const catalog = JSON.stringify(apiCatalog(BASE));
    for (const entry of ardManifest(BASE).entries) {
      if (entry.type === "application/ai-skill+md") continue; // skills are not APIs
      expect(catalog, `${entry.identifier}: ${entry.url}`).toContain(entry.url);
    }
  });

  it("advertises only versions the lifecycle rows call current", () => {
    /*
     * DERIVED, so a battery retired in one place cannot be sold as
     * current here — the defect the api-catalog's own docblock names.
     */
    const api = ardManifest(BASE).entries.find((entry) =>
      entry.identifier.endsWith(":api:http"),
    );
    expect(api).toBeTruthy();
    const expected = API_VERSIONS.filter((row) => !isRetiring(row)).map(
      (row) => `${row.api} ${row.version}`,
    );
    expect(api!.capabilities).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("names only MCP tools the server really serves", () => {
    /*
     * `capabilities` is what a registry filters on BEFORE fetching the
     * artifact, so a token naming a tool that does not exist is a
     * promise broken at the cheapest possible moment.
     */
    const mcp = ardManifest(BASE).entries.find((entry) =>
      entry.identifier.endsWith(":server:general-store"),
    );
    expect(mcp).toBeTruthy();
    expect(mcp!.capabilities).toEqual(
      mcpToolCatalog(BASE).map((tool) => tool.name),
    );
  });

  it("gives its discovery entries 2-5 representative queries", () => {
    // §4.2: SHOULD contain 2-5. Not schema-enforced; the conformance
    // tester flags a miss, and an entry without them cannot be found
    // by search at all, which is the whole point of publishing one.
    for (const entry of ardManifest(BASE).entries) {
      if (!entry.representativeQueries) continue;
      expect(
        entry.representativeQueries.length,
        entry.identifier,
      ).toBeGreaterThanOrEqual(2);
      expect(
        entry.representativeQueries.length,
        entry.identifier,
      ).toBeLessThanOrEqual(5);
      for (const query of entry.representativeQueries) {
        expect(query.length, entry.identifier).toBeGreaterThan(10);
      }
    }
  });

  it("stays a different document from the RFC 9727 api-catalog", async () => {
    /*
     * The finding that started this named ai-catalog.json and
     * api-catalog in the same breath, and they are not the same thing.
     * If one ever starts answering for the other, this fails.
     */
    const ard = await (await fetchManifest(ARD_WELL_KNOWN_PATH)).json();
    const rfc9727 = await (
      await SELF.fetch(`${BASE}/.well-known/api-catalog`)
    ).json();
    expect(ard).not.toEqual(rfc9727);
    expect(Object.keys(ard as object)).toContain("entries");
    expect(Object.keys(rfc9727 as object)).toContain("linkset");
  });
});

describe("all four mechanisms this origin can serve, and the fifth named", () => {
  /**
   * ARD §5.1 lists five discovery mechanisms. Four are things a Worker
   * can serve and all four are served; the fifth is DNS, which no code
   * in this repository can set. That one is stated here rather than
   * quietly omitted, because a checklist with an unexplained gap reads
   * as a checklist somebody stopped filling in.
   */

  it("1. hosts the manifest at the well-known URI", async () => {
    expect((await fetchManifest(ARD_WELL_KNOWN_PATH)).status).toBe(200);
  });

  it("2. embeds the entries as in-page markup, with the base context", async () => {
    /*
     * §4.1: an entry SHOULD name the base context "when it may be read
     * by generic JSON-LD tooling that has not been told to apply the
     * base context — most importantly when embedded as in-page
     * markup". A crawler that found these by ordinary web crawling is
     * exactly that reader, so the in-page copies carry @context and
     * the manifest's copies deliberately do not.
     */
    const html = await (
      await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })
    ).text();
    const blocks = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].map((match) => JSON.parse(match[1]!.replace(/\\u003c/g, "<")) as unknown);

    const embedded = blocks.find(
      (node): node is Array<Record<string, unknown>> =>
        Array.isArray(node) &&
        node.length > 0 &&
        typeof node[0] === "object" &&
        node[0] !== null &&
        "identifier" in (node[0] as object),
    );
    expect(embedded, "no ARD entries embedded on the storefront").toBeTruthy();

    for (const entry of embedded!) {
      expect(entry["@context"]).toBe(ARD_CONTEXT_URL);
      expect(typeof entry["identifier"]).toBe("string");
    }
    // The same entries, not a second set that can drift.
    expect(embedded!.map((entry) => entry["identifier"])).toEqual(
      ardManifest(BASE).entries.map((entry) => entry.identifier),
    );
  });

  it("3. names the manifest in robots.txt as an Agentmap directive", async () => {
    const robots = await (await SELF.fetch(`${BASE}/robots.txt`)).text();
    expect(robots).toContain(`Agentmap: ${BASE}${ARD_WELL_KNOWN_PATH}`);
    // Points at the canonical path, never the predecessor.
    expect(robots).not.toContain(ARD_PREDECESSOR_PATH);
  });

  it("4. carries the HTML link tag in the head of every rendered page", async () => {
    /*
     * The mechanism for a crawler that arrived at some deep page with
     * an HTML document in hand and no reason to probe well-known
     * paths. Checked on the storefront and on a small room, because
     * those are two different renderers and a tag in one is not a tag
     * in the other.
     */
    for (const path of ["/", "/try", "/menu/hello"]) {
      const html = await (
        await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } })
      ).text();
      expect(html, path).toContain(
        `<link rel="${ARD_LINK_REL}" href="${BASE}${ARD_WELL_KNOWN_PATH}">`,
      );
      // The predecessor relation too, for a consumer built against the
      // older revision — same reasoning as the predecessor path.
      expect(html, path).toContain(
        `<link rel="${ARD_PREDECESSOR_LINK_REL}" href="${BASE}${ARD_PREDECESSOR_PATH}">`,
      );
    }
  });

  it("5. does not pretend to publish the DNS mechanism", () => {
    /*
     * §5.1's fifth mechanism is Service Binding records at
     * `_entries._agents.<domain>`. That is a zone file, not a route:
     * nothing in this Worker can create it, and nothing here should
     * claim it exists. The keeper adds it at the DNS provider or it
     * does not exist — and either way this store's own documents must
     * not say otherwise.
     *
     * Asserted as an ABSENCE derived from the fact that would change
     * it: if a record is ever published, the string naming it will
     * appear in the code that publishes it, and this fails then rather
     * than quietly continuing to be true.
     */
    const manifest = JSON.stringify(ardManifest(BASE));
    expect(manifest).not.toContain("_agents.");
    expect(manifest).not.toContain("_entries.");
  });
});
