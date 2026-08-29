import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { app } from "@/index";

const BASE = "https://scvd.store";

/**
 * CONDITIONAL GET ON THE PUBLISHED DOCUMENTS.
 *
 * This store's readers are pollers. The datasets change weekly,
 * /openapi.json changes only on deploy, and until 2026-08-29 an agent
 * had no way to ask "has it changed?" — every poll re-downloaded
 * bytes it already held, /openapi.json's 1.3MB among them.
 *
 * The tests below hold the two things that make an ETag safe: it is
 * the digest of the bytes actually served (so it cannot go stale),
 * and the money paths never get one (so no client can be handed a
 * cached payment challenge).
 */
describe("a poller can ask whether the document changed", () => {
  it("hands back an ETag on a published document, and 304 when it matches", async () => {
    const first = await SELF.fetch(`${BASE}/corpus.json`);
    expect(first.status).toBe(200);
    const etag = first.headers.get("ETag");
    expect(etag, "no ETag on the signed corpus").toBeTruthy();
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);

    const second = await SELF.fetch(`${BASE}/corpus.json`, {
      headers: { "If-None-Match": etag ?? "" },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });

  it("the tag IS the body, so a stranger can recompute it", async () => {
    const response = await SELF.fetch(`${BASE}/doors.json`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
    expect(response.headers.get("ETag")).toBe(`"${digest}"`);
  });

  it("a different document gets a different tag", async () => {
    const [a, b] = await Promise.all([
      SELF.fetch(`${BASE}/corpus.json`),
      SELF.fetch(`${BASE}/doors.json`),
    ]);
    expect(a.headers.get("ETag")).not.toBe(b.headers.get("ETag"));
  });

  it("a stale tag gets the whole document, not a 304", async () => {
    const response = await SELF.fetch(`${BASE}/atlas.json`, {
      headers: { "If-None-Match": '"0000000000000000000000000000ffff"' },
    });
    expect(response.status).toBe(200);
    expect((await response.text()).length).toBeGreaterThan(0);
  });

  it("If-None-Match: * revalidates too, per RFC 9110", async () => {
    const response = await SELF.fetch(`${BASE}/defects.json`, {
      headers: { "If-None-Match": "*" },
    });
    expect(response.status).toBe(304);
  });

  it("a weak tag matches its strong twin, which is the safe direction", async () => {
    const first = await SELF.fetch(`${BASE}/coverage.json`);
    const etag = first.headers.get("ETag") ?? "";
    const response = await SELF.fetch(`${BASE}/coverage.json`, {
      headers: { "If-None-Match": `W/${etag}` },
    });
    expect(response.status).toBe(304);
  });

  it("caches may store a published document but must revalidate it", async () => {
    // max-age on dated evidence is how a cache serves last week's
    // corpus as this week's. no-cache stores and revalidates.
    const response = await SELF.fetch(`${BASE}/corpus.json`);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("leaves a route's own deliberate Cache-Control alone", async () => {
    const response = await SELF.fetch(
      `${BASE}/.well-known/http-message-signatures-directory`,
    );
    expect(response.headers.get("Cache-Control")).toBe("max-age=86400");
    expect(response.headers.get("ETag")).toBeTruthy();
  });
});

describe("the money paths never carry one", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("a payment challenge is not cacheable and gets no tag", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    expect(response.status).toBe(402);
    expect(response.headers.get("ETag")).toBeNull();
  });

  it("nothing marked no-store carries a tag, on any door", async () => {
    const tagged: string[] = [];
    for (const route of app.routes) {
      if (route.method !== "GET") continue;
      const path = route.path;
      if (path.startsWith("/admin")) continue;
      if (path.includes(":") || path.includes("*") || path.includes("{")) continue;
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: path.includes(".") ? "*/*" : "text/html" },
        redirect: "manual",
      });
      const cacheControl = response.headers.get("Cache-Control") ?? "";
      if (cacheControl.includes("no-store") && response.headers.has("ETag")) {
        tagged.push(path);
      }
    }
    expect(
      tagged,
      `a no-store response carries an ETag — a client may revalidate it:\n${tagged.join("\n")}`,
    ).toEqual([]);
  });
});

describe("the boundary holds", () => {
  it("HTML rooms are not tagged: they are read once, not polled", async () => {
    // The same door asked for in the other dialect IS tagged — /what
    // answers JSON to a machine and HTML to a browser, and only one
    // of those is a document somebody polls.
    const room = await SELF.fetch(`${BASE}/what`, {
      headers: { Accept: "text/html" },
    });
    expect(room.status).toBe(200);
    expect(room.headers.get("Content-Type")).toContain("text/html");
    expect(room.headers.get("ETag")).toBeNull();

    const document = await SELF.fetch(`${BASE}/what`, {
      headers: { Accept: "application/json" },
    });
    expect(document.headers.get("ETag")).toBeTruthy();
  });

  it("every machine-readable public document carries one", async () => {
    const MACHINE_READABLE =
      /^(application\/(json|xml|[\w.+-]+\+json)|text\/(markdown|plain|xml))$/;
    const untagged: string[] = [];
    for (const route of app.routes) {
      if (route.method !== "GET") continue;
      const path = route.path;
      if (path.startsWith("/admin")) continue;
      if (path.includes(":") || path.includes("*") || path.includes("{")) continue;
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: path.includes(".") ? "*/*" : "text/html" },
        redirect: "manual",
      });
      if (response.status !== 200) continue;
      const type = (response.headers.get("Content-Type") ?? "").split(";")[0] ?? "";
      if (!MACHINE_READABLE.test(type)) continue;
      if ((response.headers.get("Cache-Control") ?? "").includes("no-store")) continue;
      if (!response.headers.has("ETag")) untagged.push(`${path} (${type})`);
    }
    expect(
      untagged,
      `a published document a poller must re-download whole every time:\n${untagged.join("\n")}`,
    ).toEqual([]);
  });
});
