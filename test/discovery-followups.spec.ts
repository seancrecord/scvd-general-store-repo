import { SELF } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { ROOMS } from "@/store/rooms";
import { API_CATALOG_PATH } from "@/lib/api-catalog";
import { discoveryCors } from "@/lib/cors";
import { documentDiscovery } from "@/lib/document-discovery";
import type { HonoEnv } from "@/types";

const BASE = "https://scvd.store";
const ORIGIN = "https://reader.example";

interface HeadLink { rel: string; href: string; type: string }
async function headLinks(response: Response): Promise<HeadLink[]> {
  const links: HeadLink[] = [];
  await new HTMLRewriter().on("head link", {
    element(element) {
      links.push({
        rel: element.getAttribute("rel") ?? "",
        href: element.getAttribute("href") ?? "",
        type: element.getAttribute("type") ?? "",
      });
    },
  }).transform(response).text();
  return links;
}

describe("HTML-only readers can discover the same documents", () => {
  it("covers the homepage and every registered room, including custom renderers", async () => {
    const failures: string[] = [];
    for (const path of ["/", ...ROOMS.map((room) => room.path)]) {
      const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } });
      expect(response.status, path).toBe(200);
      const header = response.headers.get("Link") ?? "";
      const links = await headLinks(response);
      for (const [rel, target] of [
        ["api-catalog", API_CATALOG_PATH],
        ["service-desc", "/openapi.json"],
        ["service-doc", "/developers"],
      ]) {
        const matches = links.filter((link) => link.rel.split(/\s+/).includes(rel!) && link.href === `${BASE}${target}`);
        if (matches.length !== 1) failures.push(`${path}: ${rel} occurs ${matches.length} times`);
      }
      const advertised = [...header.matchAll(/<([^>]+)>; rel="alternate"; type="([^"]+)"/g)];
      for (const [, href, type] of advertised) {
        if (!links.some((link) => link.rel === "alternate" && link.href === href && link.type === type)) {
          failures.push(`${path}: header alternate ${href} missing from head`);
        }
      }
      if (links.some((link) => link.rel === "alternate" && ["/openapi.json", "/llms.txt"].some((suffix) => link.href === BASE + suffix))) {
        failures.push(`${path}: API guide mislabeled as a copy of this page`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("preserves existing canonical, feed, script and structured data while escaping query values", async () => {
    const app = new Hono<HonoEnv>();
    app.use("*", documentDiscovery);
    const content = '<!doctype html><html><head><title>Example</title><link rel="canonical" href="/what"><link rel="alternate" type="application/atom+xml" href="/feeds/corpus.xml"><script type="application/ld+json">{"name":"Example"}</script><script src="/webmcp.js" defer></script></head><body><h1>Unchanged</h1></body></html>';
    app.get("/what", () => new Response(content, { headers: {
      "Content-Type": "text/html", ETag: '"old-html"', "Content-Length": String(content.length),
    } }));
    const response = await app.request(`${BASE}/what?q=%22%3E%3Cscript%3E&next=one`, {}, { STORE_BASE_URL: BASE });
    expect(response.headers.get("ETag")).toBeNull();
    expect(response.headers.get("Content-Length")).toBeNull();
    const text = await response.text();
    expect(text).toContain('<link rel="canonical" href="/what">');
    expect(text).toContain('type="application/atom+xml" href="/feeds/corpus.xml"');
    expect(text).toContain('<script type="application/ld+json">{"name":"Example"}</script>');
    expect(text).toContain('<script src="/webmcp.js" defer></script>');
    expect(text).toContain('<body><h1>Unchanged</h1></body>');
    expect(text).toContain('what.md?q=%22%3E%3Cscript%3E&amp;next=one');
  });
});

function preflight(path: string, method = "GET", headers = "if-none-match") {
  return SELF.fetch(`${BASE}${path}`, { method: "OPTIONS", headers: {
    Origin: ORIGIN,
    "Access-Control-Request-Method": method,
    "Access-Control-Request-Headers": headers,
  } });
}

describe("browser scripts can conditionally read public documents", () => {
  it.each(["/atlas.json", "/what.md", "/corpus/trajectory.json", "/feeds/corpus.xml"])("preflights a conditional read of %s", async (path) => {
    const response = await preflight(path);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain("if-none-match");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Vary")).toContain("Access-Control-Request-Headers");
    expect(await response.text()).toBe("");
  });

  it("permits HEAD and case-insensitive cache-validation header names", async () => {
    const response = await preflight("/atlas.json", "HEAD", "If-None-Match, If-Modified-Since");
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("HEAD");
    expect(response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain("if-modified-since");
  });

  it("completes preflight, fetch and 304 with readable validators and discovery links", async () => {
    expect((await preflight("/what.md")).status).toBe(204);
    const first = await SELF.fetch(`${BASE}/what.md`, { headers: { Origin: ORIGIN } });
    const etag = first.headers.get("ETag");
    expect(etag).not.toBeNull();
    await first.text();
    const next = await SELF.fetch(`${BASE}/what.md`, { headers: { Origin: ORIGIN, "If-None-Match": etag! } });
    expect(next.status).toBe(304);
    expect(next.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(next.headers.get("Access-Control-Expose-Headers")).toContain("ETag");
    expect(next.headers.get("Access-Control-Expose-Headers")).toContain("Link");
    expect(next.headers.get("Link")).toContain('rel="api-catalog"');
  });

  it.each([
    { method: "POST", headers: "if-none-match" },
    { method: "DELETE", headers: "if-none-match" },
    { method: "GET", headers: "authorization,if-none-match" },
    { method: "GET", headers: "payment-signature,if-none-match" },
    { method: "GET", headers: "x-payment,if-none-match" },
  ])("does not grant $method with $headers", async ({ method, headers }) => {
    const response = await preflight("/atlas.json", method, headers);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    await response.text();
  });

  it("does not invoke a document handler to classify an OPTIONS request", async () => {
    const app = new Hono<HonoEnv>();
    app.use("*", discoveryCors);
    const handler = vi.fn(() => new Response('{"public":true}', { headers: { "Content-Type": "application/json" } }));
    app.get("/document", handler);
    const response = await app.request(`${BASE}/document`, { method: "OPTIONS", headers: {
      Origin: ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "if-none-match",
    } });
    expect(response.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not expose a response explicitly marked private", async () => {
    const app = new Hono<HonoEnv>();
    app.use("*", discoveryCors);
    app.get("/personal.json", () => new Response("{}", { headers: {
      "Content-Type": "application/json", "Cache-Control": "private, no-cache",
    } }));
    const response = await app.request(`${BASE}/personal.json`, { headers: {
      Origin: ORIGIN, "If-None-Match": '"previous"',
    } });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("still refuses to expose HTML, cookie-bearing responses, admin and paid paths", async () => {
    for (const path of ["/admin/example", "/api/buy/example"]) {
      const app = new Hono<HonoEnv>();
      app.use("*", discoveryCors);
      app.all("*", () => new Response("denied", { status: 403 }));
      const response = await app.request(`${BASE}${path}`, { method: "OPTIONS", headers: {
        Origin: ORIGIN, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "if-none-match",
      } });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect((await preflight("/what")).status).toBe(204);
    const html = await SELF.fetch(`${BASE}/what`, { headers: { Origin: ORIGIN, Accept: "text/html", "If-None-Match": '"old"' } });
    expect(html.headers.get("Access-Control-Allow-Origin")).toBeNull();
    await html.text();
    const app = new Hono<HonoEnv>();
    app.use("*", discoveryCors);
    app.get("/cookie", () => new Response("{}", { headers: { "Content-Type": "application/json", "Set-Cookie": "session=test" } }));
    const cookie = await app.request(`${BASE}/cookie`, { headers: { Origin: ORIGIN, "If-None-Match": '"old"' } });
    expect(cookie.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
