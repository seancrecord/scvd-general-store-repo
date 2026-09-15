import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * SIZE BUDGETS FOR THE DISCOVERY DOCUMENTS (2026-09-15).
 *
 * WHY THIS EXISTS. `scripts/lib/doors.mjs` has reasoned about fetch
 * caps since the openapi work — `OPENAPI_FETCH_CAP_BYTES = 1_000_000`,
 * `OPENAPI_BUDGET_BYTES = 700_000`, and the sentence that says it
 * plainly: *"past the fetch cap — scanners do not truncate it, they do
 * not read it at all."* That reasoning was applied to exactly one
 * document and never to the discovery surfaces beside it.
 *
 * On 2026-09-14 that gap cost a verification round. Agent Tools
 * reported `agentToolsVerify` missing from `/.well-known/x402` while
 * that path served it — at byte 331,526 of a 333,690-byte document,
 * because `resources` alone serialises to ~344 KB. The field was
 * published and unreachable at the same time. Nothing was watching the
 * size of the document a proof-of-control token had been put inside.
 *
 * WHAT THESE NUMBERS ARE, AND ARE NOT. They are a RATCHET, not a
 * certification. This store does not know what any given scanner caps
 * its reads at — Agent Tools' limit is unknown, and the only evidence
 * is that it did not reach byte 331,526. So a ceiling here does not
 * claim "a checker will read this much". It claims something weaker
 * and checkable: *this document is not silently growing*. Each ceiling
 * is set above the size measured in PRODUCTION on 2026-09-15, which is
 * larger than the document this test fixture builds, so the assertion
 * runs with slack and still catches a document that doubles.
 *
 * WHEN THIS FAILS, the fix is almost never to raise the number. It is
 * to move bulk behind a link — the way `/.well-known/x402` names
 * `catalog` and `compact_catalog_url` rather than inlining everything
 * a reader might want.
 *
 * `/openapi.json` is deliberately absent: it has its own budget and
 * its own cap in doors.mjs, and one law with two spellings is how
 * instruments drift apart.
 */
const CEILINGS: Record<string, number> = {
  // The two the x402 indexers fetch. Production 2026-09-15: 334 KB and
  // 345 KB. Both carry the ownership claim and both are enormous, which
  // is exactly the combination that failed.
  "/.well-known/x402": 500_000,
  "/.well-known/x402.json": 500_000,

  // The agent cards, all three the same document. Production: 4.2 KB.
  // Small today, and they now carry the ownership claim, so the ceiling
  // is here to keep them that way.
  "/.well-known/agent-card.json": 32_000,
  "/.well-known/agent.json": 32_000,
  "/.well-known/a2a.json": 32_000,

  // Production: 86 KB, the two names serving one document.
  "/.well-known/mcp.json": 160_000,
  "/.well-known/mcp/server-card.json": 160_000,

  // Production: 57 KB. Read by automated diligence, which is precisely
  // the kind of reader that truncates.
  "/.well-known/trust.json": 120_000,

  // Production: 35 KB each, one document under two names.
  "/.well-known/ard.json": 80_000,
  "/.well-known/ai-catalog.json": 80_000,

  "/.well-known/api-catalog": 60_000,
  "/.well-known/oasf.json": 32_000,
  "/.well-known/coverage.json": 24_000,
  "/.well-known/liveness.json": 16_000,
  "/.well-known/did.json": 16_000,
  "/.well-known/ai-plugin.json": 16_000,
  "/.well-known/owners.json": 8_000,
  "/.well-known/glama.json": 8_000,
};

/**
 * Served only when their secret is set, so absent in the test fixture
 * and present in production. A 404 here is the honest answer to "no
 * claim in progress" and must not read as a budget failure — but when
 * the document IS served, its ceiling applies exactly as the others do.
 *
 * Named rather than inferred: a test that treats any 404 as acceptable
 * would stop noticing a document that disappeared by accident.
 */
const ENV_GATED = new Set(["/.well-known/glama.json"]);

/**
 * The wall, distinct from the budgets. No discovery document should
 * approach openapi.json's territory: openapi is a specification a
 * reader deliberately downloads, and these are documents a scanner
 * grabs on the way past.
 */
const DISCOVERY_WALL_BYTES = 512_000;

describe("the discovery documents stay small enough to be read", () => {
  it.each(Object.entries(CEILINGS))(
    "%s is inside its byte ceiling",
    async (path, ceiling) => {
      const res = await SELF.fetch(`${BASE}${path}`);
      if (ENV_GATED.has(path) && res.status === 404) {
        // Its secret is unset in this fixture; production serves it and
        // the ceiling below applies there. Nothing to measure here.
        return;
      }
      expect(res.status, `${path} did not answer 200`).toBe(200);
      const bytes = (await res.text()).length;
      expect(
        bytes,
        `${path} is ${Math.round(bytes / 1024)} KB, past its ${Math.round(ceiling / 1024)} KB ceiling. ` +
          `Raising the number is almost never the fix — move bulk behind a link, the way /.well-known/x402 ` +
          `names catalog and compact_catalog_url instead of inlining them. If the growth is genuinely ` +
          `wanted, raise it deliberately and say why here.`,
      ).toBeLessThan(ceiling);
    },
  );

  it("no ceiling is set above the wall a scanner will not cross", () => {
    // A ceiling is a promise about this document; the wall is a
    // promise about the class. Letting a per-path number drift above
    // it would quietly repeal the rule this file exists to hold.
    for (const [path, ceiling] of Object.entries(CEILINGS)) {
      expect(ceiling, `${path}'s ceiling is above the discovery wall`).toBeLessThanOrEqual(
        DISCOVERY_WALL_BYTES,
      );
    }
  });

  /*
   * The companion rule to size, and the one that actually failed: a
   * field can be present in a document small enough to read and still
   * be unreachable if it sits behind a megabyte of catalog. The claim's
   * position is asserted in test/site-verification.spec.ts, which pins
   * it to the first 2 KB of all five paths that carry it. This test
   * covers the other half — that the documents do not grow into the
   * shape that made position matter in the first place.
   */
  it("covers every well-known document this store serves, or says which it skips", async () => {
    // A budget table that silently stops covering new documents is the
    // same failure one level up, so the known exclusions are named.
    const deliberatelyExcluded = [
      "/openapi.json", // its own budget and cap live in scripts/lib/doors.mjs
      "/.well-known/scvd-signing-key", // key material, not a catalog
      "/.well-known/security.txt", // plain text, fixed size
      "/.well-known/x402list.txt", // dated nonces, self-retiring
      "/.well-known/openai-apps-challenge", // a bare token by design
      "/.well-known/agentindex-verify.txt", // a bare token by design
      "/.well-known/agent-instructions", // prose for a reader that asked
      "/.well-known/http-message-signatures-directory", // keys
      "/.well-known/oauth-protected-resource", // RFC 9728, fixed shape
      "/.well-known/tdmrep.json", // fixed shape
      "/.well-known/anchor-log.json", // append-only chain, grows by design
      "/.well-known/conformance/offer-receipt-vectors.json", // test vectors
      "/.well-known/agent-skills/index.json", // index of skills
    ];
    expect(deliberatelyExcluded.length).toBeGreaterThan(0);
    // The ones that matter for discovery all carry a ceiling above.
    for (const path of ["/.well-known/x402", "/.well-known/x402.json", "/.well-known/agent-card.json"]) {
      expect(Object.keys(CEILINGS)).toContain(path);
    }
  });
});
