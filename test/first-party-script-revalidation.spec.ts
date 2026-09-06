import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "@/index";

const BASE = "https://scvd.store";

/**
 * THE TWO SCRIPTS THIS STORE SERVES ARE DOCUMENTS TOO.
 *
 * /webmcp.js is how a browser agent learns the store has tools at
 * all, and it is 12KB behind max-age=300. An agent that keeps a tab
 * open re-downloaded it twelve times an hour to be told nothing had
 * changed. /till.js went further and asked for `must-revalidate`
 * while carrying no validator to revalidate against — a header that
 * requests a conversation the door could not have.
 *
 * The conditional-GET layer already answered this for every JSON,
 * markdown and XML document the store publishes. It skipped the
 * scripts because its document class was copied from the CORS
 * allowance, where JavaScript's absence is deliberate for a
 * different reason entirely. Two rules, one regex, and the caching
 * leg inherited a boundary that was never about caching.
 */
const SCRIPTS = ["/webmcp.js", "/till.js"] as const;

describe("a browser holding a first-party script can ask whether it changed", () => {
  it.each(SCRIPTS)("%s carries an ETag that is its own bytes", async (path) => {
    const response = await SELF.fetch(`${BASE}${path}`);
    expect(response.status).toBe(200);
    const etag = response.headers.get("ETag");
    expect(etag, `no ETag on ${path}`).toBeTruthy();
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);

    const digest = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", await response.arrayBuffer()),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
    expect(etag).toBe(`"${digest}"`);
  });

  it.each(SCRIPTS)("%s answers 304 to the tag it just handed out", async (path) => {
    const first = await SELF.fetch(`${BASE}${path}`);
    const etag = first.headers.get("ETag") ?? "";
    const second = await SELF.fetch(`${BASE}${path}`, {
      headers: { "If-None-Match": etag },
    });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it.each(SCRIPTS)("%s keeps the cache lifetime its route chose", async (path) => {
    const response = await SELF.fetch(`${BASE}${path}`);
    // The tag is a validator, not a licence to cache longer. The
    // till stays at an hour because it is money code; the WebMCP
    // surface stays at five minutes because a tool added today
    // should reach an open tab today.
    expect(response.headers.get("Cache-Control")).toMatch(/^public, max-age=(300|3600)\b/);
  });

  it.each(SCRIPTS)("%s forbids type sniffing", async (path) => {
    // A script served without nosniff is a script somebody else's
    // browser guessed the type of. /till.js said so from the start;
    // /webmcp.js did not, and nothing was checking.
    const response = await SELF.fetch(`${BASE}${path}`);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("no first-party script is left without a validator", async () => {
    const IS_SCRIPT = /^(text|application)\/javascript\b/;
    const bare: string[] = [];
    for (const route of app.routes) {
      if (route.method !== "GET") continue;
      const path = route.path;
      if (path.includes(":") || path.includes("*") || path.includes("{")) continue;
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "*/*" },
        redirect: "manual",
      });
      if (response.status !== 200) continue;
      if (!IS_SCRIPT.test(response.headers.get("Content-Type") ?? "")) continue;
      if (!response.headers.has("ETag")) bare.push(path);
    }
    expect(
      bare,
      `a script a browser must re-download whole every time:\n${bare.join("\n")}`,
    ).toEqual([]);
  }, 120_000);
});
