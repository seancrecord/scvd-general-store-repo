import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/** The three strings, and nothing else, ever. */
const TIER_1_MACHINE_ID = "scvd-general-store";
const TIER_2_DISPLAY = "SCVD General Store";
const TIER_3_FULL = "Sean-Claude Van Damme's General Store";

/**
 * THE NAMING LAW, pinned 2026-07-28. Audit credit: CV.
 *
 * Identity mismatch is a top machine-fraud trigger, and inconsistent
 * names split entity corroboration across discovery systems. The audit
 * that found the gap: MCP and skill.md agreed on the machine
 * identifier, while x402.json and menu.json carried two different
 * display strings.
 *
 * These tests are the enforcement. A future surface that reaches for
 * a name by taste in the moment fails here rather than shipping.
 *
 * THE LAW ITSELF IS DOCUMENTED IN src/lib/identity.ts, which now
 * enumerates every governed surface and points back here. The two
 * files did not reference each other until 2026-08-02, and the cost
 * of that showed up exactly as you would expect: a review read the
 * law, saw only the outbound pair enumerated, and reported
 * openapi.info.title / site.webmanifest name / mcp serverInfo.title as
 * an untested gap. All three were already asserted in this file — see
 * "files us under the display name on every metadata surface" and
 * "keeps the tier-1 identifier and tier-2 title side by side on MCP".
 *
 * If you are adding a name-bearing surface: assert it HERE, and add
 * it to the enumeration THERE. One without the other is how the next
 * person loses an afternoon proving something that was already true.
 *
 * THE OUTBOUND PAIR (OUTBOUND_USER_AGENT, STORE_HEADER) is covered in
 * test/breadcrumbs.spec.ts rather than here, because those are the
 * store speaking as a client rather than as a catalog entry.
 */
describe("the naming law", () => {
  it("keeps the three strings exactly as pinned", () => {
    expect(STORE_SERVICE_NAME).toBe(TIER_2_DISPLAY);
    expect(STORE_METADATA.name).toBe(TIER_3_FULL);
    // Changing a tier string requires a keeper ruling, a version note
    // in PROJECT_LOG, and every surface in that tier moving together.
    // This assertion is the tripwire on that promise.
  });

  it("puts the display name on every discovery document, identically", async () => {
    const wellKnown: unknown = await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json();
    if (!isRecord(wellKnown)) throw new Error("no x402.json");
    expect(wellKnown.name).toBe(TIER_2_DISPLAY);
    expect(wellKnown.serviceName).toBe(TIER_2_DISPLAY);

    const menu: unknown = await (await SELF.fetch(`${BASE}/menu.json`)).json();
    if (!isRecord(menu) || !isRecord(menu.store)) throw new Error("no menu");
    expect(menu.store.name).toBe(TIER_2_DISPLAY);

    // Character for character, across surfaces. That is the whole law.
    expect(wellKnown.name).toBe(menu.store.name);
  });

  it("keeps the full name out of the discovery documents entirely", async () => {
    for (const path of ["/.well-known/x402.json", "/menu.json"]) {
      const body: unknown = await (await SELF.fetch(`${BASE}${path}`)).json();
      if (!isRecord(body)) throw new Error(`no body for ${path}`);
      const name = isRecord(body.store) ? body.store.name : body.name;
      expect(name, `${path} still files us under the full name`).not.toBe(
        TIER_3_FULL,
      );
    }
  });

  it("files us under the display name on every metadata surface a discovery system reads", async () => {
    // The four the first pass flagged rather than fixed. Keeper ruling
    // 2026-07-28: all tier 2, because every one is a human-readable
    // metadata field somebody else's index will read.
    const openapi: unknown = await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json();
    if (!isRecord(openapi) || !isRecord(openapi.info)) {
      throw new Error("no openapi info");
    }
    expect(openapi.info.title).toBe(TIER_2_DISPLAY);

    const manifest: unknown = await (
      await SELF.fetch(`${BASE}/site.webmanifest`)
    ).json();
    if (!isRecord(manifest)) throw new Error("no manifest");
    expect(manifest.name).toBe(TIER_2_DISPLAY);

    // Inside the signed payload, which is why it was flagged before it
    // was changed. Signed at serve time, so the signature still covers
    // what is served.
    const trustList: unknown = await (
      await SELF.fetch(`${BASE}/trust-list.json`)
    ).json();
    if (!isRecord(trustList)) throw new Error("no trust list");
    expect(trustList.issuer).toBe(TIER_2_DISPLAY);
  });

  it("keeps the tier-1 identifier and tier-2 title side by side on MCP", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {} },
      }),
    });
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.result)) throw new Error("no result");
    const info = body.result.serverInfo;
    if (!isRecord(info)) throw new Error("no serverInfo");
    // The identifier a client keys on, and the name it shows a human.
    expect(info.name).toBe(TIER_1_MACHINE_ID);
    expect(info.title).toBe(TIER_2_DISPLAY);
  });

  it("uses the machine identifier where a machine identifier belongs", async () => {
    const skill = await (await SELF.fetch(`${BASE}/skill.md`)).text();
    expect(skill).toContain(`name: ${TIER_1_MACHINE_ID}`);
    // And never the display or full name in that slot.
    expect(skill).not.toContain(`name: ${TIER_2_DISPLAY}`);
  });

  it("files the JSON-LD entity under the display name, full name as an alias", async () => {
    const html = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain(`"name":"${TIER_2_DISPLAY}"`);
    // The full name survives as lore where an entity resolver can still
    // corroborate it — it just stops being the string we are filed under.
    expect(html).toContain("alternateName");
    expect(html).toContain(`"alternateName":["${TIER_3_FULL}"`);
  });
});
