import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  FIRST_SCREEN_PATHS,
  OPERATED_BY,
  POSITION_OPENING,
  VALUE_PROPOSITION,
  VALUE_PROPOSITION_DATED,
} from "@/store/copy/position";

const BASE = "https://scvd.store";

/**
 * ROADMAP N2 — THE FIRST SCREEN, ONE PARAGRAPH, EVERY SURFACE
 * (2026-09-01).
 *
 * The keeper inked sixty words that say what the store does in the
 * order it happens: before a payment, after it, over time. Before
 * this sweep, the surfaces a stranger meets first opened with three
 * DIFFERENT paragraphs about the same place — the homepage and the
 * handshakes read one constant, llms.txt typed its own twin above
 * that constant, the README typed a third — and rule 44 is exactly
 * the rule against that. A routing model learns whichever copy it
 * happens to fetch; three copies is three answers.
 *
 * So: the sixty words are one constant, and every first screen
 * carries them verbatim, ahead of the lore, ahead of any retired
 * noun. A surface that paraphrases them fails here.
 */

async function text(path: string, accept?: string): Promise<string> {
  const response = await SELF.fetch(
    `${BASE}${path}`,
    accept ? { headers: { Accept: accept } } : undefined,
  );
  expect(response.status, `${path} did not answer 200`).toBe(200);
  return response.text();
}

/** The nouns N2 struck. They may survive in /becoming, quoted and dated — never on a first screen ahead of the sixty words. */
const RETIRED_LEADS = ["trust layer", "verification layer"];

function expectLeadsWith(surface: string, body: string): void {
  const at = body.indexOf(VALUE_PROPOSITION);
  expect(at, `${surface} does not carry the sixty words verbatim`).toBeGreaterThan(-1);
  for (const noun of RETIRED_LEADS) {
    const retired = body.toLowerCase().indexOf(noun);
    if (retired === -1) continue;
    expect(
      retired,
      `${surface} says "${noun}" before the sixty words`,
    ).toBeGreaterThan(at);
  }
}

describe("the sixty words are one constant", () => {
  it("is the keeper's ink, dated, and opens the shared opening", () => {
    expect(VALUE_PROPOSITION_DATED).toBe("2026-09-03");
    // Roughly sixty words: the name is a promise about length too.
    // The inked draft runs a little over; a paragraph is the ceiling.
    // Raised from 80 on 2026-09-03 when the keeper ruled the category
    // clause into the first sentence (eight words, every one a noun
    // people type). Still one paragraph.
    const words = VALUE_PROPOSITION.split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(50);
    expect(words).toBeLessThanOrEqual(90);
    expect(VALUE_PROPOSITION).toContain("independent verification of x402 endpoints, payments and receipts");
    expect(POSITION_OPENING.startsWith(VALUE_PROPOSITION)).toBe(true);
    // What the sixty words leave out, the opening still carries.
    expect(POSITION_OPENING).toContain(OPERATED_BY);
    expect(POSITION_OPENING).toContain("conformance desk");
    expect(POSITION_OPENING).toContain("Bitcoin-anchored corpus");
  });

  it("names three paths into rooms that already exist, in the words' own order", async () => {
    expect(FIRST_SCREEN_PATHS.map((entry) => entry.when)).toEqual([
      "Before you pay",
      "After you pay",
      "Over time",
    ]);
    for (const entry of FIRST_SCREEN_PATHS) {
      const response = await SELF.fetch(`${BASE}${entry.path}`, {
        headers: { Accept: "text/html" },
      });
      expect(response.status, `${entry.path} is not a room`).toBe(200);
    }
  });
});

describe("every first screen opens with the sixty words", () => {
  it("the homepage, ahead of the shelves, with the three paths linked", async () => {
    const page = await text("/", "text/html");
    expectLeadsWith("/", page);
    expect(page.indexOf(VALUE_PROPOSITION)).toBeLessThan(
      page.indexOf("ON THE SHELVES"),
    );
    for (const entry of FIRST_SCREEN_PATHS) {
      expect(page).toContain(`href="${entry.path}"`);
    }
    // The social card unfurls the same sentence.
    expect(page).toContain(
      `<meta property="og:description" content="${VALUE_PROPOSITION}">`,
    );
  });

  it("llms.txt, once — the hand-typed twin above the constant is gone", async () => {
    const guide = await text("/llms.txt");
    expectLeadsWith("/llms.txt", guide);
    expect(guide.indexOf(VALUE_PROPOSITION)).toBeLessThan(
      guide.indexOf("Well well. Come in then."),
    );
    // One opening. The blockquote IS the constant, and the hand-typed
    // twin that used to sit above it (its tell: "checkable offline
    // without us") is gone. The dated /becoming register further down
    // may still say "evidence observatory" — that is a quote of the
    // reversal, not a second opening.
    expect(guide).toContain(`> ${POSITION_OPENING}`);
    expect(guide).not.toContain("checkable offline without us");
    for (const entry of FIRST_SCREEN_PATHS) {
      expect(guide).toContain(`${BASE}${entry.path}`);
    }
  });

  it("agents.md", async () => {
    expectLeadsWith("/agents.md", await text("/agents.md"));
  });

  it("the skill", async () => {
    expectLeadsWith("/skill.md", await text("/skill.md"));
  });

  it("the OpenAPI contract's description", async () => {
    const spec = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      info: { description: string };
    };
    expectLeadsWith("openapi.json info.description", spec.info.description);
  });

  it("the MCP handshake", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "first-screen-spec", version: "0" },
        },
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: { instructions: string };
    };
    expectLeadsWith("mcp initialize.instructions", body.result.instructions);
  });

  it("the repository README", async () => {
    const readme = (await import("../README.md?raw")).default;
    expectLeadsWith("README.md", readme.replace(/\n/g, " ").replace(/\*\*/g, ""));
  });
});
