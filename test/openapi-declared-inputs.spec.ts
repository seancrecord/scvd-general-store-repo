import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CONDITIONAL_GET_EXEMPT, NEGOTIATED_REPRESENTATIONS } from "@/routes/openapi";

/**
 * THE INPUT-LESS DOORS, TYPED BY WHAT THEY READ (2026-09-05).
 *
 * A readiness scan counted 72 operations untyped because they
 * declared no parameter. Probed, those doors read three query
 * strings, negotiate on Accept, and honour If-None-Match; the
 * contract now says so, and this file holds the contract to the live
 * doors in both directions: every declared input is honoured, and no
 * brace-less GET negotiates or revalidates without declaring it. The
 * remainder — the doors that genuinely read nothing — is named, not
 * hidden, and it is one door.
 */

const BASE = "https://scvd.store";
type Op = Record<string, any>;

async function spec(): Promise<Record<string, Record<string, Op>>> {
  const response = await SELF.fetch(`${BASE}/openapi.json`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { paths: Record<string, Record<string, Op>> }).paths;
}

function contentType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
}

function params(op: Op): Op[] {
  return (op["parameters"] ?? []) as Op[];
}

/** The URL a door answers 200 on: its required query examples filled in. */
function probeUrl(path: string, op: Op): string {
  const required = params(op).filter((p) => p["in"] === "query" && p["required"]);
  if (required.length === 0) return `${BASE}${path}`;
  const query = required.map((p) => `${p["name"]}=${encodeURIComponent(String(p["example"] ?? ""))}`);
  return `${BASE}${path}?${query.join("&")}`;
}

describe("the three query readers", () => {
  it("/corpus/diff.json requires since, and says so with a 400 when it is missing", async () => {
    const paths = await spec();
    const since = params(paths["/corpus/diff.json"]!["get"]!).find((p) => p["name"] === "since");
    expect(since?.["required"]).toBe(true);
    expect(since?.["in"]).toBe("query");
    const bare = await SELF.fetch(`${BASE}/corpus/diff.json`);
    expect(bare.status).toBe(400);
    const named = await SELF.fetch(`${BASE}/corpus/diff.json?since=${since!["example"]}`);
    // A test chain may not hold that week; a 404 naming the weeks is the honest answer then.
    expect([200, 404]).toContain(named.status);
  });

  it("/doors.json enumerates the verdict filter the route checks", async () => {
    const paths = await spec();
    const verdict = params(paths["/doors.json"]!["get"]!).find((p) => p["name"] === "verdict");
    expect(verdict?.["schema"]?.["enum"]).toEqual(["ready", "not_ready", "unreachable", "not_probed"]);
    expect((await SELF.fetch(`${BASE}/doors.json?verdict=bogus`)).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/doors.json?verdict=ready`)).status).toBe(200);
  });

  it("/ask requires a query and names its modes from the door's own object", async () => {
    const paths = await spec();
    const declared = params(paths["/ask"]!["get"]!);
    expect(declared.find((p) => p["name"] === "query")?.["required"]).toBe(true);
    expect(declared.find((p) => p["name"] === "mode")?.["schema"]?.["enum"]).toContain("list");
    expect((await SELF.fetch(`${BASE}/ask`)).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/ask?query=how%20do%20I%20pay`)).status).toBe(200);
  });
});

describe("Accept is declared exactly where a door negotiates", () => {
  it("serves every representation the table lists, for its Accept", async () => {
    const paths = await spec();
    for (const [path, offered] of Object.entries(NEGOTIATED_REPRESENTATIONS)) {
      const accept = params(paths[path]!["get"]!).find((p) => p["name"] === "Accept");
      expect(accept?.["in"], path).toBe("header");
      expect(accept?.["schema"]?.["enum"], path).toEqual([...offered]);
      for (const media of offered) {
        const response = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: media } });
        expect(response.status, `${path} as ${media}`).toBe(200);
        expect(contentType(response), `${path} as ${media}`).toBe(media);
      }
      const bare = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "*/*" } });
      expect(contentType(bare), `${path} bare wildcard`).toBe(offered[0]);
    }
  });

  it("and nowhere a door does not: no undeclared negotiation on any brace-less GET", async () => {
    const paths = await spec();
    const hidden: string[] = [];
    for (const [path, item] of Object.entries(paths)) {
      if (path.includes("{") || !item["get"]) continue;
      if (path in NEGOTIATED_REPRESENTATIONS) continue;
      if (params(item["get"]!).some((p) => p["name"] === "Accept")) continue;
      const url = probeUrl(path, item["get"]!);
      const bare = await SELF.fetch(url);
      for (const media of ["text/markdown", "text/html"]) {
        const asked = await SELF.fetch(url, { headers: { Accept: media } });
        if (contentType(asked) !== contentType(bare)) hidden.push(`${path} → ${media}`);
      }
    }
    expect(hidden).toEqual([]);
  });
});

describe("If-None-Match is declared exactly where a door revalidates", () => {
  it("answers 304 to its own ETag on every door that declares it", async () => {
    const paths = await spec();
    const declared: string[] = [];
    for (const [path, item] of Object.entries(paths)) {
      const op = item["get"];
      if (path.includes("{") || !op) continue;
      if (!params(op).some((p) => p["name"] === "If-None-Match")) continue;
      declared.push(path);
      expect(op["responses"]?.["304"], `${path} declares the header and no 304`).toBeTruthy();
      // The machine-readable representation, where the door negotiates.
      const negotiated = NEGOTIATED_REPRESENTATIONS[path];
      const accept = negotiated?.find((m) => m !== "text/html") ?? "*/*";
      const url = probeUrl(path, op);
      const first = await SELF.fetch(url, { headers: { Accept: accept } });
      if (first.status === 404 && path === "/corpus/diff.json") {
        // An empty test chain holds no baseline week; the door says so
        // with a 404, and a 404 is outside conditional GET by rule.
        continue;
      }
      expect(first.status, path).toBe(200);
      const etag = first.headers.get("ETag");
      expect(etag, `${path} declares If-None-Match and serves no ETag`).toBeTruthy();
      const again = await SELF.fetch(url, { headers: { Accept: accept, "If-None-Match": etag! } });
      /*
       * 304, or a 200 carrying a DIFFERENT tag because the document
       * moved between the two reads (the catalog's root carries the
       * live books). What can never happen is a 200 with the same
       * tag: that would be a header read and ignored.
       */
      if (again.status !== 304) {
        expect(again.status, path).toBe(200);
        expect(again.headers.get("ETag"), `${path} ignored its own ETag`).not.toBe(etag);
      }
    }
    expect(declared.length).toBeGreaterThan(60);
  });

  it("and every brace-less free GET that does not declare it serves no ETag, for a stated reason", async () => {
    const paths = await spec();
    for (const [path, item] of Object.entries(paths)) {
      const op = item["get"];
      if (path.includes("{") || !op) continue;
      if (params(op).some((p) => p["name"] === "If-None-Match")) continue;
      if (op["x-payment"]) continue;
      expect(CONDITIONAL_GET_EXEMPT[path], `${path} declares no If-None-Match and no reason`).toBeTruthy();
      const response = await SELF.fetch(probeUrl(path, op));
      expect(response.headers.get("ETag"), `${path} is exempt yet serves an ETag`).toBeNull();
    }
    for (const path of Object.keys(CONDITIONAL_GET_EXEMPT)) {
      expect(paths[path]?.["get"], `${path} is exempt but not a door`).toBeTruthy();
    }
  });
});

describe("Idempotency-Key rides every paid door inline, for the reader that does not resolve $ref", () => {
  it("is a parameter with a schema on every operation carrying x-payment", async () => {
    const paths = await spec();
    let paid = 0;
    for (const [path, item] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (typeof op !== "object" || op === null || !op["x-payment"]) continue;
        paid += 1;
        const key = params(op).find((p) => String(p["name"]).toLowerCase() === "idempotency-key");
        expect(key, `${method.toUpperCase()} ${path} carries no inline Idempotency-Key`).toBeTruthy();
        expect(key!["$ref"]).toBeUndefined();
        expect(key!["in"]).toBe("header");
        expect(key!["schema"]).toBeTruthy();
      }
    }
    expect(paid).toBeGreaterThan(30);
  });
});

describe("what the scan counts, after", () => {
  it("leaves exactly one operation with no declared input, and names it", async () => {
    const paths = await spec();
    const bare: string[] = [];
    for (const [path, item] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (typeof op !== "object" || op === null) continue;
        if (op["requestBody"]) continue;
        if (params(op).length > 0) continue;
        bare.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(bare).toEqual(["GET /health"]);
  });
});
