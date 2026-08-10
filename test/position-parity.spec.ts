import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { POSITION_LINE } from "@/store/copy/position";

const BASE = "https://scvd.store";

/**
 * EVERY SURFACE SAYS THE SAME THING, OR THIS GOES RED.
 *
 * The AEO sweep on 2026-08-10 found two classes of rot, and both were
 * invisible from inside: a position the keeper reversed on 2026-08-07
 * that reached NO served surface, and an ordering claim — "the store
 * settles first" — that eleven surfaces made after the gate had
 * stopped doing it.
 *
 * Neither was a writing problem. Both were the same structural one:
 * the same sentence typed into eleven files drifts, and the drift is
 * only ever caught by an outside reader quoting a stale copy back at
 * us. That is precisely how the "refund is automatic" incident
 * surfaced — an outside model read our public pages and repeated a
 * five-day-old falsehood to us as fact.
 *
 * So the words live in one module and these tests check that the
 * documents a machine actually reads agree with it. Rule 44 says the
 * AEO sweep is a stop after changes, not a chore for later; a test is
 * how a stop becomes enforceable.
 */

async function text(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, `${path} did not answer 200`).toBe(200);
  return response.text();
}

/** The documents an entity resolver or an agent meets us through. */
const MACHINE_SURFACES = [
  "/llms.txt",
  "/skill.md",
  "/agents.md",
  "/menu.json",
  "/openapi.json",
  "/.well-known/a2a.json",
  "/.well-known/trust.json",
];

describe("the position reaches the surfaces a machine reads", () => {
  it("says 'trust layer of the x402 economy' on every one of them", async () => {
    for (const path of MACHINE_SURFACES) {
      const body = (await text(path)).toLowerCase();
      expect(
        body.includes("trust layer of the x402 economy"),
        `${path} does not carry the position. A model trained six months from now learns whatever is on that page today.`,
      ).toBe(true);
    }
  });

  it("says what the store is NOT, which gets louder as the ecosystem fills in", async () => {
    /*
     * Escrow, guarantees and dispute courts all ABSORB the gap between
     * payment and delivery. We observe it. Being mistaken for the
     * first kind is the expensive sort of wrong — it implies a balance
     * sheet this store does not have.
     */
    for (const path of ["/llms.txt", "/agents.md", "/openapi.json", "/.well-known/a2a.json"]) {
      const body = (await text(path)).toLowerCase();
      expect(body, `${path} does not draw the escrow boundary`).toMatch(
        /not an escrow|escrow, a guarantor/,
      );
    }
  });

  it("keeps one canonical wording rather than eleven paraphrases", () => {
    // The constant is the point. If somebody re-types the sentence
    // into a surface instead of importing it, the next reversal has
    // to find every copy again.
    expect(POSITION_LINE).toContain("trust layer of the x402 economy");
  });
});

describe("nothing still claims the store settles first", () => {
  it("is absent from every served machine surface", async () => {
    /*
     * The gate flipped on 2026-08-10 (rule 9, amended). A surface
     * still describing the old ordering is not a stale sentence — it
     * tells a buyer that a failed delivery leaves them owed a refund,
     * when in fact they were never charged. That sends them chasing
     * money nobody took.
     */
    for (const path of [...MACHINE_SURFACES, "/what", "/try"]) {
      const body = (await text(path)).toLowerCase();
      for (const stale of ["settles first", "settle first", "we settle first"]) {
        expect(
          body.includes(stale),
          `${path} still says "${stale}" — the gate has delivered first since 2026-08-10.`,
        ).toBe(false);
      }
    }
  });

  it("says the new ordering where the buying instructions live", async () => {
    for (const path of ["/skill.md", "/agents.md"]) {
      const body = (await text(path)).toLowerCase();
      expect(body, `${path} does not state the delivery ordering`).toMatch(
        /delivers first|deliver first/,
      );
    }
  });

  it("and the published ClawHub bundle says it too", async () => {
    // The bundle is in someone else's catalogue the moment it is
    // published, out of our hands until a human republishes it. It is
    // the surface where a stale claim lives longest.
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    expect(bundle.toLowerCase()).not.toContain("settles first, then hands over");
    expect(bundle.toLowerCase()).toContain("delivers first and settles after");
  });
});

describe("the ClawHub bundle carries what the store actually has", () => {
  it("names the verification tier, not just the shelf", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    for (const capability of [
      "service_audit",
      "conformance_watch",
      "settlement_reconciliation",
      "attestation_bundle",
      "bitcoin_anchor",
      "/api/preflight",
    ]) {
      expect(bundle, `bundle does not mention ${capability}`).toContain(
        capability,
      );
    }
  });

  it("names the corpus and the per-subject query", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    expect(bundle).toContain("/corpus/host/{host}.json");
    // The gap vocabulary is the differentiator, so it ships with it.
    expect(bundle).toContain("listed_not_walked");
  });

  it("names the second MCP server, which was on no listing anywhere", async () => {
    const bundle = (await import("../registry/clawhub/SKILL.md?raw")).default;
    expect(bundle).toContain("scvd-tab");
    // And is honest that the pooled layer is direction, not stock.
    expect(bundle.toLowerCase()).toContain("not built");
  });
});
