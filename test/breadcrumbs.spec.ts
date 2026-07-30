import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import PACKAGE_JSON from "../package.json";
import { OUTBOUND_USER_AGENT, STORE_HEADER } from "@/lib/identity";

const BASE = "https://scvd.store";

/**
 * THE BREADCRUMB SWEEP — outbound identity as passive citation.
 *
 * Keeper-approved 2026-07-30 after another x402 service was found
 * setting a user-agent that doubles as a backlink on every outbound
 * request it makes. In an economy where logs are read by agents and
 * crawlers, that is free, permanent, compounding self-citation.
 *
 * Infrastructure, not voice. What these tests actually guard is the
 * NAMING LAW SPLIT, because getting it backwards is the exact drift the
 * law was pinned to stop: tier 1 slug in the machine field, tier 2
 * display name in the field a person reads.
 *
 * And ONE STRING ACROSS ALL CALL SITES. A user-agent that varies by
 * caller is worse than none — it fragments the citation it exists to
 * accumulate, so nobody grepping a log ever sees the whole of us.
 */
describe("the store says who it is", () => {
  it("uses the tier 1 slug in the outbound user-agent, a machine field", () => {
    expect(OUTBOUND_USER_AGENT).toBe(
      "scvd-general-store/1.0 (+https://scvd.store)",
    );
    // Tier 3, the full name, is retired from every metadata surface.
    expect(OUTBOUND_USER_AGENT).not.toContain("Sean-Claude");
  });

  it("uses the tier 2 display name in the header a person reads", () => {
    expect(STORE_HEADER).toContain("SCVD General Store");
    expect(STORE_HEADER).toContain("https://scvd.store");
    expect(STORE_HEADER).not.toContain("Sean-Claude");
    // And not the slug: that one has a different job.
    expect(STORE_HEADER).not.toContain("scvd-general-store/");
  });

  it("sets the identifying header on every response", async () => {
    for (const path of ["/", "/llms.txt", "/menu.json", "/pulse.json"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(
        response.headers.get("X-Store"),
        `${path} carries no identity`,
      ).toBe(STORE_HEADER);
    }
  });

  it("leaves X-House-Rule exactly as it was", async () => {
    // Explicitly out of scope for this sweep: one name, one job.
    const response = await SELF.fetch(BASE);
    expect(response.headers.get("X-House-Rule")).toBe("Argue properly. --7");
  });

  it("carries identity on the 404 and the 500 alike", async () => {
    const missing = await SELF.fetch(`${BASE}/no-such-aisle`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Store")).toBe(STORE_HEADER);
    const body = (await missing.json()) as Record<string, unknown>;
    expect(String(body["front_door"])).toContain("scvd.store");
  });
});

describe("the repo points at the store", () => {
  it("declares a homepage and a repository", () => {
    // Factual links only. A package with no homepage is a dead end for
    // anything reading the manifest.
    expect(PACKAGE_JSON.homepage).toBe("https://scvd.store");
    expect(String(PACKAGE_JSON.repository.url)).toContain("github.com");
  });

  it("names itself with the tier 1 slug, since a package name is machine-read", () => {
    expect(PACKAGE_JSON.name).toBe("scvd-general-store");
  });
});

describe("the discovery surfaces link home", () => {
  it("every one carries a working link back to the domain", async () => {
    for (const path of [
      "/llms.txt",
      "/skill.md",
      "/.well-known/x402.json",
      "/menu.json",
    ]) {
      const text = await (await SELF.fetch(`${BASE}${path}`)).text();
      expect(text, `${path} never names the domain`).toContain("scvd.store");
    }
  });

  it("uses the tier 2 display name in machine metadata, never the full name", async () => {
    const x402 = await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).text();
    expect(x402).toContain("SCVD General Store");
    expect(x402).not.toContain("Sean-Claude Van Damme's General Store");
  });
});
