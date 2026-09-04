import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DOCTRINE_DATED,
  DOCTRINE_NOTE,
  NEVER_A_RANKING,
  RETIRED_DOCTRINE_FORMS,
} from "@/store/copy/doctrine";
import { isRecord } from "@/types";
import clawhubBundle from "../registry/clawhub/SKILL.md?raw";
import readme from "../README.md?raw";

/**
 * THE DOCTRINE SENTENCE CHANGED ON 2026-09-02, and a sentence that
 * governs every surface has to change on every surface at once or
 * the store contradicts itself in public. "Never a score, a rating
 * or a ranking" became, in the keeper's words, "never a ranking, and
 * never a verdict without its derivation and denominator beside it."
 *
 * Two guards. The retired forms must be absent from every public
 * surface a reader or a machine meets — not only the seven the
 * ruling named, but everything served — and the new sentence must be
 * present on the seven the ruling named: storefront, /what,
 * /attestation, the listing description, llms.txt, skill.md, and the
 * ClawHub bundle standing in for the x402-list row, which is the
 * keeper's press and cannot be tested from here.
 *
 * Signed rows and paid artifacts issued before the date keep their
 * bytes. This file reads only served surfaces, never the corpus.
 */

const BASE = "https://scvd.store";

async function text(path: string, accept = "text/html"): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: accept },
  });
  expect(response.status, path).toBe(200);
  return response.text();
}

/** Every public surface a reader or a machine meets, both faces. */
const PUBLIC_SURFACES: ReadonlyArray<[string, string]> = [
  ["/", "text/html"],
  ["/what", "text/html"],
  ["/what", "application/json"],
  ["/attestation", "text/html"],
  ["/attestation", "application/json"],
  ["/criteria", "text/html"],
  ["/criteria", "application/json"],
  ["/corpus", "text/html"],
  ["/corpus", "application/json"],
  ["/doors", "text/html"],
  ["/doors.json", "application/json"],
  ["/defects", "text/html"],
  ["/defects", "application/json"],
  ["/registry", "text/html"],
  ["/how-it-works", "application/json"],
  ["/menu.json", "application/json"],
  ["/llms.txt", "text/plain"],
  ["/llms-full.txt", "text/plain"],
  ["/skill.md", "text/markdown"],
  ["/openapi.json", "application/json"],
  ["/agents.md", "text/markdown"],
  ["/developers", "text/html"],
  ["/scorers", "text/html"],
  ["/scorers", "application/json"],
  ["/mcp.md", "text/markdown"],
  ["/.well-known/x402", "application/json"],
];

describe("the retired doctrine sentence is gone from every public surface", () => {
  for (const [path, accept] of PUBLIC_SURFACES) {
    it(`${path} (${accept})`, async () => {
      // /criteria quotes the retired sentence once, on purpose, in the
      // dated note that records the change; that quotation is the
      // record, not a surface still making the claim.
      const body = (await text(path, accept))
        .toLowerCase()
        .split(DOCTRINE_NOTE.was.toLowerCase())
        .join("");
      const found = RETIRED_DOCTRINE_FORMS.filter((form) =>
        body.includes(form.toLowerCase()),
      );
      expect(found, `${path} still carries the retired sentence`).toEqual([]);
    });
  }

  it("the ClawHub bundle and the README", () => {
    for (const source of [clawhubBundle, readme]) {
      const body = source.toLowerCase();
      const found = RETIRED_DOCTRINE_FORMS.filter((form) =>
        body.includes(form.toLowerCase()),
      );
      expect(found).toEqual([]);
    }
  });
});

describe("the keeper's sentence is present on the surfaces the ruling named", () => {
  const NAMED: ReadonlyArray<[string, string]> = [
    ["/", "text/html"],
    ["/what", "text/html"],
    ["/what", "application/json"],
    ["/attestation", "text/html"],
    ["/llms.txt", "text/plain"],
    ["/llms-full.txt", "text/plain"],
    ["/skill.md", "text/markdown"],
    ["/criteria", "application/json"],
  ];
  for (const [path, accept] of NAMED) {
    it(`${path} (${accept})`, async () => {
      const body = (await text(path, accept)).toLowerCase();
      expect(body).toContain(NEVER_A_RANKING.toLowerCase());
    });
  }

  it("the listing description (metadata) and the MCP lead carry it", async () => {
    const menu: unknown = await (await SELF.fetch(`${BASE}/menu.json`)).json();
    if (!isRecord(menu)) throw new Error("menu.json is not an object");
    const flat = JSON.stringify(menu).toLowerCase();
    expect(flat).toContain(NEVER_A_RANKING.toLowerCase());
    // The MCP handshake instructions are the identity lead, verbatim.
    const init = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "doctrine-spec", version: "1" },
        },
      }),
    });
    const handshake = (await init.text()).toLowerCase();
    expect(handshake).toContain("never a ranking, and never a verdict without its derivation");
  });

  it("the ClawHub bundle carries it, standing in for the x402-list row", () => {
    expect(clawhubBundle.toLowerCase()).toContain(NEVER_A_RANKING.toLowerCase());
  });
});

describe("/criteria carries the dated note", () => {
  it("says what changed, why, and that nothing was resigned", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/criteria`, { headers: { Accept: "application/json" } })
    ).json();
    if (!isRecord(body) || !isRecord(body.doctrine)) throw new Error("no doctrine note");
    const note = body.doctrine;
    expect(note.dated).toBe(DOCTRINE_DATED);
    expect(String(note.was).toLowerCase()).toContain("never a score, a rating or a ranking");
    expect(String(note.now).toLowerCase()).toContain(NEVER_A_RANKING.toLowerCase());
    expect(String(note.what_changed).toLowerCase()).toContain("rankings stay forbidden");
    expect(String(note.what_keeps_its_bytes).toLowerCase()).toContain("nothing is resigned");
    const html = await text("/criteria");
    expect(html).toContain(`The sentence changed on ${DOCTRINE_DATED}`);
  });
});
