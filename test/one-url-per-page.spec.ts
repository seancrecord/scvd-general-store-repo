import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * ONE URL PER PAGE (2026-09-02, from the Search Console pre-read).
 * A trailing slash on a human path is one 301 to the path without
 * it; /api/ is left alone so a machine caller gets its answer, or
 * its 410, at the URL it used.
 */
describe("trailing slashes", () => {
  it("redirects a human path once, keeping the query", async () => {
    const response = await SELF.fetch(`${BASE}/what/?src=test`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${BASE}/what?src=test`);
  });

  it("collapses a run of slashes to one redirect", async () => {
    const response = await SELF.fetch(`${BASE}/menu/hello///`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${BASE}/menu/hello`);
  });

  it("leaves the root and the API alone", async () => {
    const root = await SELF.fetch(`${BASE}/`, { redirect: "manual" });
    expect(root.status).toBe(200);
    const api = await SELF.fetch(`${BASE}/api/preflight/v1/`, { redirect: "manual", method: "POST" });
    expect(api.status).not.toBe(301);
  });

  it("does not redirect a POST", async () => {
    const response = await SELF.fetch(`${BASE}/what/`, { redirect: "manual", method: "POST" });
    expect(response.status).not.toBe(301);
  });
});

/**
 * A TRAILING DOT (2026-09-03, the first crawl reading): the guide ends
 * sentences with a URL and a full stop, and some crawlers keep the
 * stop. No door ends in a dot, so the dot goes, /api/ included.
 */
describe("trailing dots", () => {
  it("redirects a human path, keeping the query", async () => {
    const response = await SELF.fetch(`${BASE}/criteria.?src=test`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${BASE}/criteria?src=test`);
  });

  it("redirects an API path too, because only a crawler reading prose sends one", async () => {
    const response = await SELF.fetch(`${BASE}/api/preflight/v1.`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${BASE}/api/preflight/v1`);
  });

  it("strips a dot after a slash in one hop", async () => {
    const response = await SELF.fetch(`${BASE}/what/.`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${BASE}/what`);
  });

  it("leaves a dot inside the path alone", async () => {
    const response = await SELF.fetch(`${BASE}/menu.json`, { redirect: "manual" });
    expect(response.status).toBe(200);
  });

  it("leaves the MCP door to its own rule", async () => {
    const response = await SELF.fetch(`${BASE}/mcp.`, { redirect: "manual" });
    expect(response.status).not.toBe(301);
  });
});

/**
 * THE INDEXNOW KEY FILE. Bing verifies a ping by fetching the key
 * back from the host; the test binding is a fixed key, and any other
 * thirty-two hex characters are a 404 rather than a hint. At the root
 * since 2026-09-03: IndexNow scopes a key to its directory and below,
 * and the first live ping from /indexnow/ was refused for exactly that.
 */
describe("the IndexNow key file", () => {
  it("serves the configured key as plain text", async () => {
    const response = await SELF.fetch(`${BASE}/0123456789abcdef0123456789abcdef.txt`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("0123456789abcdef0123456789abcdef");
  });

  it("no longer answers under the folder it first lived in", async () => {
    const response = await SELF.fetch(`${BASE}/indexnow/0123456789abcdef0123456789abcdef.txt`);
    expect(response.status).toBe(404);
  });

  it("answers 404 for any other key", async () => {
    const response = await SELF.fetch(`${BASE}/ffffffffffffffffffffffffffffffff.txt`);
    expect(response.status).toBe(404);
  });
});
