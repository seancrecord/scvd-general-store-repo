import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { API_VERSIONS, headersForRow, isRetiring } from "@/store/api-lifecycle";
import { LINKSET_MEDIA_TYPE } from "@/lib/api-catalog";
import { PROTOCOL_VERSIONS } from "@/routes/mcp";
import { isRecord } from "@/types";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import { FEEDS } from "@/routes/feeds";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * THE FIXED PATHS, AND THE PROMISE WITH A MECHANISM UNDER IT.
 *
 * Three findings from the 2026-08-26 readiness pass share one shape.
 * The developer resources were unfindable BY NAME; the MCP server was
 * listed in a registry and no handshake could be completed; the
 * versioning was real and no deprecation policy could be found. In
 * every case the thing existed and the ADDRESS did not — a scanner
 * either knows a fixed path or it knows nothing, and "it is somewhere
 * you did not look" files as "it is not there".
 *
 * So: RFC 9727 for the API catalog, both spellings of the MCP
 * manifest, and a room for the deprecation policy. These tests hold
 * the doors open and, in the lifecycle's case, hold the mechanism to
 * its promise on a day when no version is actually being retired.
 */

describe("the API catalog, at the path RFC 9727 fixes", () => {
  it("serves a linkset, in the media type the spec registers", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/api-catalog`);
    expect(response.status).toBe(200);
    /*
     * The media type is not decoration. A client that content-sniffs
     * for application/linkset+json and finds application/json has,
     * correctly, not found a linkset.
     */
    expect(response.headers.get("content-type")).toContain(LINKSET_MEDIA_TYPE);
    const body: unknown = await response.json();
    expect(isRecord(body)).toBe(true);
    const linkset = (body as { linkset: unknown[] }).linkset;
    expect(Array.isArray(linkset)).toBe(true);
    expect(linkset.length).toBeGreaterThan(3);
  });

  it("anchors the store's own API and points at the contract", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/api-catalog`)
    ).json()) as { linkset: Array<Record<string, unknown>> };
    const root = body.linkset.find((entry) => entry["anchor"] === `${BASE}/`);
    expect(root, "the catalog does not name the API at the origin").toBeTruthy();
    const desc = root?.["service-desc"] as Array<{ href: string }>;
    expect(desc[0]?.href).toBe(`${BASE}/openapi.json`);
    const doc = root?.["service-doc"] as Array<{ href: string }>;
    expect(doc.map((link) => link.href)).toContain(`${BASE}/developers`);
  });

  it("lists the MCP server, which is the surface an agent host can speak", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/api-catalog`)
    ).json()) as { linkset: Array<Record<string, unknown>> };
    const mcp = body.linkset.find((entry) => entry["anchor"] === `${BASE}/mcp`);
    expect(mcp).toBeTruthy();
    const desc = mcp?.["service-desc"] as Array<{ href: string }>;
    expect(desc[0]?.href).toBe(`${BASE}/.well-known/mcp`);
  });

  it("names every version the lifecycle table serves, and nothing it does not", async () => {
    // Derived on both sides, so this is a real agreement rather than
    // two lists that happen to match today.
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/api-catalog`)
    ).json()) as { linkset: Array<Record<string, unknown>> };
    const anchors = new Set(body.linkset.map((entry) => entry["anchor"]));
    for (const row of API_VERSIONS) {
      expect(anchors, `${row.path} is served and absent from the catalog`).toContain(
        `${BASE}${row.path}`,
      );
    }
  });

  it("lists the verifier door, every published dataset and every feed (2026-09-04, roadmap C3)", async () => {
    /*
     * The ARD manifest names every record and its cross-check requires
     * this catalog to know each URL first, so the two cannot drift:
     * a dataset in the roster is a row here and an entry there.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/api-catalog`)
    ).json()) as { linkset: Array<Record<string, unknown>> };
    const anchors = new Set(body.linkset.map((entry) => entry["anchor"]));
    expect(anchors).toContain(`${BASE}/mcp/verifier`);
    for (const dataset of PUBLISHED_DATASETS) {
      expect(anchors, `${dataset.path} is a published dataset and absent from the catalog`).toContain(`${BASE}${dataset.path}`);
    }
    const feeds = body.linkset.find((entry) => entry["anchor"] === `${BASE}/feeds`);
    const alternates = (feeds?.["alternate"] as Array<{ href: string; type: string }>) ?? [];
    expect(alternates.map((link) => link.href).sort()).toEqual(FEEDS.map((feed) => `${BASE}${feed.path}`).sort());
    for (const link of alternates) expect(link.type).toBe("application/atom+xml");
    // The index context lists each of them as an item, derived.
    const items = (body.linkset[0]?.["item"] as Array<{ href: string }>).map((item) => item.href);
    expect(items).toContain(`${BASE}/mcp/verifier`);
    expect(items).toContain(`${BASE}/feeds`);
  });

  it("every href it publishes is a URL, never a bare path", async () => {
    /*
     * A linkset is consumed by things that will not resolve a
     * relative reference against a well-known URI. One bare path in
     * here is a dead link in somebody else's client.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/api-catalog`)
    ).json()) as { linkset: Array<Record<string, unknown>> };
    for (const entry of body.linkset) {
      expect(String(entry["anchor"])).toMatch(/^https?:\/\//);
      for (const [relation, value] of Object.entries(entry)) {
        if (!Array.isArray(value)) continue;
        for (const link of value as Array<{ href: string }>) {
          expect(link.href, `${relation} on ${String(entry["anchor"])}`).toMatch(
            /^https?:\/\//,
          );
        }
      }
    }
  });
});

describe("the MCP manifest, at both spellings", () => {
  it("answers at /.well-known/mcp and at /.well-known/mcp.json", async () => {
    /*
     * The audit reported "no live MCP protocol handshake" four days
     * after /.well-known/mcp shipped, and the handshake was never the
     * problem — POST /mcp has answered initialize since the server
     * opened. What a scanner does with a well-known path is guess,
     * and half of them append .json, which returned a 404
     * indistinguishable from having no MCP server at all.
     */
    const [plain, dotted] = await Promise.all([
      SELF.fetch(`${BASE}/.well-known/mcp`),
      SELF.fetch(`${BASE}/.well-known/mcp.json`),
    ]);
    expect(plain.status).toBe(200);
    expect(dotted.status).toBe(200);
    expect(await dotted.text()).toBe(await plain.text());
  });

  it("carries everything needed to complete a handshake without guessing", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/mcp`)
    ).json()) as Record<string, unknown>;
    expect(body["endpoint"]).toBe(`${BASE}/mcp`);
    expect(body["url"]).toBe(body["endpoint"]);
    expect(body["transport"]).toBe("streamable-http");
    expect(body["methods"]).toEqual(["POST"]);
    // Derived from the server's own list: a manifest advertising a
    // version the server refuses is worse than one with no versions.
    expect(body["protocol_versions"]).toEqual([...PROTOCOL_VERSIONS]);
    const auth = body["authentication"] as Record<string, unknown>;
    expect(auth["required"]).toBe(false);
  });

  it("publishes a handshake body the server actually accepts", async () => {
    /*
     * THE POINT OF THE WHOLE FILE, TESTED END TO END. The manifest
     * prints an initialize call; this takes that exact object and
     * sends it. A manifest whose example does not work is a manifest
     * that fails the one reader it was written for.
     */
    const manifest = (await (
      await SELF.fetch(`${BASE}/.well-known/mcp`)
    ).json()) as {
      handshake: { method: string; url: string; body: Record<string, unknown> };
    };
    const response = await SELF.fetch(manifest.handshake.url, {
      method: manifest.handshake.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest.handshake.body),
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as Record<string, unknown>;
    expect(isRecord(result["result"])).toBe(true);
    const negotiated = (result["result"] as Record<string, unknown>)[
      "protocolVersion"
    ];
    expect(PROTOCOL_VERSIONS).toContain(negotiated);
  });

  it("answers a bare GET on /mcp with Allow and the way in", async () => {
    // RFC 9110 §15.5.6 makes Allow mandatory on a 405, and a prober
    // that gets a 405 with no Allow has hit the same dead end as a 404.
    const response = await SELF.fetch(`${BASE}/mcp`);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("link")).toContain("/.well-known/mcp");
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["handshake"])).toContain("initialize");
  });
});

describe("the deprecation policy, as a page rather than a vendor extension", () => {
  it("answers at /deprecation in all three dialects", async () => {
    const page = await SELF.fetch(`${BASE}/deprecation`, { headers: HTML });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("<h1");

    const json = await SELF.fetch(`${BASE}/deprecation`, {
      headers: { Accept: "application/json" },
    });
    expect(json.headers.get("content-type")).toContain("application/json");

    const markdown = await SELF.fetch(`${BASE}/deprecation`, {
      headers: { Accept: "text/markdown" },
    });
    expect(markdown.headers.get("content-type")).toContain("text/markdown");
    expect(markdown.headers.get("vary")).toContain("Accept");
  });

  it("gives a client with no stated preference the page, not the JSON", async () => {
    const page = await SELF.fetch(`${BASE}/deprecation`, {
      headers: { Accept: "*/*" },
    });
    expect(page.headers.get("content-type")).toContain("text/html");
  });

  it("prints every version served, with its status and its sunset", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/deprecation`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      versions: Array<Record<string, unknown>>;
      currently_deprecated: string[];
      minimum_notice_days: number;
    };
    expect(body.versions.length).toBe(API_VERSIONS.length);
    for (const row of body.versions) {
      expect(String(row["url"])).toMatch(/^https:\/\//);
      expect(["current", "supported", "deprecated"]).toContain(row["status"]);
    }
    expect(body.minimum_notice_days).toBeGreaterThanOrEqual(90);
  });

  it("says the same thing here as in the contract, because both derive", async () => {
    const [page, spec] = await Promise.all([
      (
        await SELF.fetch(`${BASE}/deprecation`, {
          headers: { Accept: "application/json" },
        })
      ).json() as Promise<{ currently_deprecated: string[] }>,
      (await SELF.fetch(`${BASE}/openapi.json`)).json() as Promise<{
        "x-versioning": { currently_deprecated: string[]; policy_url: string };
      }>,
    ]);
    expect(page.currently_deprecated).toEqual(
      spec["x-versioning"].currently_deprecated,
    );
    expect(spec["x-versioning"].policy_url).toBe(`${BASE}/deprecation`);
  });
});

describe("the RFC 8594 headers, held to their shape before they are needed", () => {
  it("sends nothing at all while nothing is being retired", async () => {
    /*
     * The honest state today, asserted in both directions. A version
     * with no end date must not carry Sunset — a header that says
     * "this ends" when nothing does is the same class of error as a
     * rate limit nothing enforces.
     */
    for (const row of API_VERSIONS) {
      expect(isRetiring(row), `${row.path} claims to be retiring`).toBe(false);
      expect(headersForRow(row, BASE)).toEqual({});
    }
    const live = await SELF.fetch(`${BASE}/api/conformance/v1`);
    expect(live.headers.get("sunset")).toBeNull();
    expect(live.headers.get("deprecation")).toBeNull();
  });

  it("produces the right headers the day a row does carry a date", async () => {
    /*
     * THE MECHANISM, EXERCISED. Every "we will announce it properly
     * when the time comes" promise has the same failure mode: the
     * announcing code has never run. This runs it, against a
     * fabricated row, so the shape is right before it matters.
     */
    const retiring = {
      api: "A fabricated instrument, for this test only",
      path: "/api/example/v1",
      version: "v1",
      status: "deprecated" as const,
      since: "2026-01-01",
      deprecated: "2026-09-01",
      sunset: "2026-12-01",
      successor: "/api/example/v2",
      note: "Not served; this row exists to exercise the header builder.",
    };
    const headers = headersForRow(retiring, BASE);
    // RFC 8594 wants an HTTP-date, not the ISO string the table keeps.
    expect(headers["Sunset"]).toBe(new Date("2026-12-01").toUTCString());
    expect(headers["Deprecation"]).toBe(new Date("2026-09-01").toUTCString());
    expect(headers["Link"]).toContain(`<${BASE}/deprecation>; rel="sunset"`);
    expect(headers["Link"]).toContain(
      `<${BASE}/api/example/v2>; rel="successor-version"`,
    );
  });

  it("omits the successor link when there is nowhere to send anyone", async () => {
    const headers = headersForRow(
      {
        api: "A fabricated instrument, for this test only",
        path: "/api/example/v1",
        version: "v1",
        status: "deprecated",
        since: "2026-01-01",
        deprecated: null,
        sunset: "2026-12-01",
        successor: null,
        note: "Not served.",
      },
      BASE,
    );
    expect(headers["Link"]).not.toContain("successor-version");
    // A deprecation with no announced effective date still gets its
    // Sunset: the two headers answer different questions.
    expect(headers["Deprecation"]).toBeUndefined();
    expect(headers["Sunset"]).toBeTruthy();
  });
});
