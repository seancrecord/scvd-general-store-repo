import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ROOMS } from "@/store/rooms";
import { API_CATALOG_PATH } from "@/lib/api-catalog";
import { documentDiscovery } from "@/lib/document-discovery";
import { Hono } from "hono";
import type { HonoEnv } from "@/types";

const BASE = "https://scvd.store";
const catalogLink = `<${BASE}${API_CATALOG_PATH}>; rel="api-catalog"`;

describe("discovery from a document instead of the homepage", () => {
  it("every registered room has the machine representation we advertise", async () => {
    const failures: string[] = [];
    for (const { path, machineFormat } of ROOMS) {
      const type = machineFormat === "json" ? "application/json" : "text/markdown";
      const target = machineFormat === "json" ? path : `${path}.md`;
      const response = await SELF.fetch(`${BASE}${target}`, {
        headers: { Accept: type },
      });
      if (!response.ok || !response.headers.get("Content-Type")?.includes(type)) {
        failures.push(`${path}: ${response.status} ${response.headers.get("Content-Type")}`);
      }
      await response.text();
    }
    expect(failures).toEqual([]);
  });

  it("every registered room advertises the catalog and its machine representation", async () => {
    const failures: string[] = [];
    for (const { path, machineFormat } of ROOMS) {
      const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } });
      const links = response.headers.get("Link") ?? "";
      if (!links.includes(catalogLink)) failures.push(`${path}: no catalog`);
      const type = machineFormat === "json" ? "application/json" : "text/markdown";
      const target = machineFormat === "json" ? path : `${path}.md`;
      if (!links.includes(`<${BASE}${target}>; rel="alternate"; type="${type}"`)) {
        failures.push(`${path}: no ${type} alternate`);
      }
      await response.text();
    }
    expect(failures).toEqual([]);
  });

  it("keeps the catalog discoverable in every homepage representation", async () => {
    for (const accept of ["text/html", "text/markdown", "application/json"]) {
      const response = await SELF.fetch(BASE, { headers: { Accept: accept } });
      const links = response.headers.get("Link") ?? "";
      expect(links, accept).toContain(catalogLink);
      expect(links.match(/rel="api-catalog"/g), accept).toHaveLength(1);
      expect(links, accept).toContain(`rel="canonical"`);
      await response.text();
    }
  });

  it("answers a headers-only catalog lookup with its catalog link", async () => {
    const response = await SELF.fetch(`${BASE}${API_CATALOG_PATH}`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Link")).toContain(catalogLink);
    expect(await response.text()).toBe("");
  });

  it("preserves document selection in alternate links and answers HEAD", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/brief?weeks=2`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Link")).toContain(
      `<${BASE}/corpus/brief.md?weeks=2>; rel="alternate"; type="text/markdown"`,
    );
    expect(await response.text()).toBe("");
    const copy = await SELF.fetch(`${BASE}/corpus/brief.md?weeks=2`);
    expect(copy.status).toBe(200);
    expect(copy.headers.get("Content-Type")).toContain("text/markdown");
    await copy.text();
  });

  it("keeps exposed discovery links on conditional responses", async () => {
    const first = await SELF.fetch(`${BASE}/what.md`);
    const links = first.headers.get("Link");
    expect(links).toContain(catalogLink);
    expect(links).toContain(`<${BASE}/what>; rel="canonical"`);
    const etag = first.headers.get("ETag");
    expect(etag).not.toBeNull();
    await first.text();
    const cached = await SELF.fetch(`${BASE}/what.md`, {
      headers: { "If-None-Match": etag!, Origin: "https://reader.example" },
    });
    expect(cached.status).toBe(304);
    expect(cached.headers.get("Link")).toBe(links);
    expect(cached.headers.get("Access-Control-Expose-Headers")).toContain("Link");
  });
});

describe("the document discovery boundary", () => {
  const cases = [
    { path: "/admin/example", status: 200, type: "text/html" },
    { path: "/api/buy/example", status: 200, type: "application/json" },
    { path: "/missing", status: 404, type: "application/json" },
    { path: "/challenge", status: 402, type: "application/json" },
    { path: "/asset.png", status: 200, type: "image/png" },
    { path: "/cookie", status: 200, type: "text/html", cookie: "session=example" },
    { path: "/private", status: 200, type: "application/json", cache: "private" },
    { path: "/delivery", status: 200, type: "application/json", cache: "no-store" },
    { path: "/mutation", status: 200, type: "application/json", method: "POST" },
  ];
  it.each(cases)("leaves $path alone", async ({ path, status, type, cookie, cache, method }) => {
    const app = new Hono<HonoEnv>();
    app.use("*", documentDiscovery);
    app.all("*", () => {
      const headers = new Headers({ "Content-Type": type, Link: '</existing>; rel="canonical"' });
      if (cookie) headers.set("Set-Cookie", cookie);
      if (cache) headers.set("Cache-Control", cache);
      return new Response("unchanged", { status, headers });
    });
    const response = await app.request(`${BASE}${path}`, { method: method ?? "GET" }, { STORE_BASE_URL: BASE });
    expect(response.headers.get("Link")).toBe('</existing>; rel="canonical"');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("unchanged");
  });
});
