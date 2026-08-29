import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "@/index";

const BASE = "https://scvd.store";

/**
 * CORS ON THE DISCOVERY SURFACE (scanner finding C1, 2026-08-27; house
 * rule 53's browser buyer, one door earlier).
 *
 * The server card at /.well-known/mcp.json went out with no
 * Access-Control-Allow-Origin header, so a browser-based MCP client
 * could not READ it — the fetch dies in the browser regardless of what
 * the server answered. Every surface here is public, read-only, and
 * identical for every caller; an absent ACAO header on such a surface
 * protects nothing and only breaks the browser caller.
 *
 * The boundary matters as much as the header: the allowance is not
 * app-wide. /admin and every HTML room stay outside it, and a test
 * below pins that.
 *
 * AND THE ROSTER IS THE ROUTER NOW (2026-08-29). This file listed
 * thirteen paths by hand, which meant it tested the doors somebody
 * remembered on 2026-08-27 and nothing built since. When the list was
 * finally measured against the whole router it was covering 34 public
 * doors out of 131 — and among the 97 with no header were
 * /corpus.json, the signed record this store's argument rests on, and
 * /atlas.json, whose only purpose is telling an arriving agent where
 * things are. Neither was a decision; they were just built after the
 * list was written.
 *
 * So the walk below is derived: every static GET door the app
 * registers, fetched, and held to the rule. A new published document
 * is covered the day it ships, and a room that starts answering JSON
 * is noticed rather than assumed.
 */

/**
 * Every static GET door, with its status, content type and ACAO —
 * fetched once, read by every test in this file.
 */
interface Probe {
  path: string;
  status: number;
  type: string;
  acao: string | null;
}

let PROBES: Probe[] | undefined;
async function probes(): Promise<Probe[]> {
  if (PROBES) return PROBES;
  const paths = new Set<string>();
  for (const route of app.routes) {
    if (route.method !== "GET") continue;
    const path = route.path;
    if (path.startsWith("/admin")) continue;
    if (path.includes(":") || path.includes("*") || path.includes("{")) continue;
    paths.add(path);
  }
  const seen: Probe[] = [];
  for (const path of [...paths].sort()) {
    const response = await SELF.fetch(`${BASE}${path}`, {
      headers: {
        Origin: "https://example-agent-host.test",
        Accept: path.includes(".") ? "*/*" : "text/html",
      },
      redirect: "manual",
    });
    seen.push({
      path,
      status: response.status,
      type: (response.headers.get("Content-Type") ?? "").split(";")[0] ?? "",
      acao: response.headers.get("Access-Control-Allow-Origin"),
    });
  }
  PROBES = seen;
  return seen;
}

/** The same class the middleware derives, restated independently. */
const MACHINE_READABLE =
  /^(application\/(json|xml|[\w.+-]+\+json)|text\/(markdown|plain|xml))$/;

describe("every published document is readable from a browser, not just the ones somebody listed", () => {
  it("holds across every static GET door the router registers", async () => {
    const unreadable = (await probes())
      .filter((p) => p.status === 200 && MACHINE_READABLE.test(p.type))
      .filter((p) => p.acao !== "*")
      .map((p) => `${p.path} (${p.type})`);
    expect(
      unreadable,
      `a published document a browser-based agent cannot read — the fetch dies in the browser whatever we answered:\n${unreadable.join("\n")}`,
    ).toEqual([]);
  });

  it("covers the doors the typed list never reached", async () => {
    // Named because they are the concrete cost of the typed list, not
    // as a new list to maintain: the assertion above is the guard.
    const byPath = new Map((await probes()).map((p) => [p.path, p]));
    for (const path of ["/corpus.json", "/atlas.json", "/doors.json", "/AGENTS.md"]) {
      expect(byPath.get(path)?.acao, `${path} is unreadable cross-origin`).toBe(
        "*",
      );
    }
  });

  it("does not leak past the boundary: HTML rooms stay same-origin", async () => {
    const leaked = (await probes())
      .filter((p) => p.status === 200 && p.type === "text/html")
      .filter((p) => p.acao === "*")
      .map((p) => p.path);
    expect(
      leaked,
      `an HTML room answered any origin — the allowance is for published documents, not rooms:\n${leaked.join("\n")}`,
    ).toEqual([]);
  });
});

describe("the discovery surface answers browsers from any origin", () => {
  const DISCOVERY_GETS = [
    "/.well-known/mcp.json",
    "/.well-known/agent-card.json",
    "/.well-known/x402.json",
    "/.well-known/ai-catalog.json",
    "/.well-known/ard.json",
    "/openapi.json",
    "/llms.txt",
    "/menu.json",
    "/index.md",
    "/sitemap.xml",
    "/agents.md",
    "/skill.md",
    // The area files are the same derived class as /llms.txt itself.
    "/menu/llms.txt",
  ];

  for (const path of DISCOVERY_GETS) {
    it(`GET ${path} carries Access-Control-Allow-Origin: *`, async () => {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Origin: "https://example-agent-host.test" },
      });
      expect(response.status).toBeLessThan(400);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  }

  it("POST /mcp answers with CORS, so a browser MCP client can read the RPC reply", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example-agent-host.test",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    // The headers a browser client is allowed to read off the reply.
    expect(
      response.headers.get("Access-Control-Expose-Headers") ?? "",
    ).toContain("mcp-session-id");
  });

  it("the OPTIONS preflight on the MCP door says yes to POST and the mcp-* headers", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example-agent-host.test",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, mcp-protocol-version",
      },
    });
    expect([200, 204]).toContain(response.status);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods") ?? "").toContain(
      "POST",
    );
    const allowedHeaders = (
      response.headers.get("Access-Control-Allow-Headers") ?? ""
    ).toLowerCase();
    expect(allowedHeaders).toContain("content-type");
    expect(allowedHeaders).toContain("mcp-protocol-version");
  });

  it("the well-known MCP alias preflights too — the card readable but the door unreachable is the same failure one hop later", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example-agent-host.test",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect([200, 204]).toContain(response.status);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("/admin never carries the header — the boundary is the point", async () => {
    const response = await SELF.fetch(`${BASE}/admin`, {
      headers: { Origin: "https://example-agent-host.test" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("a paid door never carries it either — the till is same-origin by design", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { Origin: "https://example-agent-host.test" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
