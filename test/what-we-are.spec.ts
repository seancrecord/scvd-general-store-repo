import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { whatFaq } from "@/store/copy/what";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * THE IDENTITY ANSWERS, AND THE ONLY GUARD THAT ACTUALLY HOLDS THEM.
 *
 * /what is the most liftable document this store publishes: its
 * FAQPage JSON-LD is built from these pairs, and an answer engine
 * quotes a Q&A pair more readily than any prose we write. So it is
 * also the surface where a claim nothing verifies does the most
 * damage.
 *
 * A test cannot judge whether a sentence is true. It CAN hold the
 * thing that makes a sentence checkable: every URL an answer offers as
 * proof has to answer. That is the whole failure mode — pointing a
 * skeptical reader at evidence that 404s is worse than not pointing at
 * anything, because it converts "unproven" into "caught lying."
 *
 * CV's standard, 2026-07-30, after the luckies line: the question is
 * not "should we disclose more," it is "does anything we currently say
 * make a claim nothing verifies." This file asks that of /what.
 */
describe("every proof /what offers actually answers", () => {
  it("resolves every store URL cited in an answer", async () => {
    const cited = new Set<string>();
    for (const pair of whatFaq(BASE)) {
      // Dots are legal inside these paths (/llms.txt, /menu.json,
      // /house-ledger.json) and also end sentences, so the match runs
      // through dots but may not END on one.
      for (const match of pair.answer.matchAll(
        /https:\/\/scvd\.store(\/[^\s,;)]*[^\s,.;)])/g,
      )) {
        const path = match[1] ?? "";
        // Placeholders are templates, not links: {id} is the shape of a
        // URL, and asserting it resolves would assert a certificate id
        // that does not exist yet.
        if (path.includes("{")) {
          continue;
        }
        cited.add(path);
      }
    }
    expect(cited.size, "no answer cites any evidence at all").toBeGreaterThan(5);
    for (const path of cited) {
      const response = await SELF.fetch(`${BASE}${path}`, { headers: HTML });
      // 404 is the failure that matters: a cited proof that is not
      // there. 405 is not — /mcp is POST-only, and a method mismatch
      // still proves the route exists. A 5xx is a broken page, which
      // is as bad as a missing one for a reader checking us.
      expect(
        response.status,
        `/what points a skeptical reader at ${path}, which does not exist`,
      ).not.toBe(404);
      expect(
        response.status,
        `/what cites ${path}, which errors`,
      ).toBeLessThan(500);
    }
  });

  it("states no count that expires", () => {
    // Same defect deleted from the skill bundle ("twenty-one items"
    // against a shelf of twenty-three) and from llms.txt. A number
    // written into a static answer is a lie with a timer on it, and
    // this page is the one most likely to be quoted back at us.
    const answers = whatFaq(BASE)
      .map((pair) => pair.answer)
      .join(" ");
    expect(answers).not.toMatch(
      /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty[- ]\w+)\s+(items|corrections|entries|goods|surfaces|shelves|rooms)\b/i,
    );
  });
});

/**
 * THE HALF THAT COSTS SOMETHING. An identity page that only says what
 * a store HAS is marketing; the reason this one is worth quoting is
 * that it says what the store has not got, in the vocabulary an
 * evaluator checks for, without being asked.
 */
describe("the store says what it is not", () => {
  const MUST_ADMIT = [
    "no escrow",
    "no rotation",
    "no recovery",
    "no third-party audit",
    "reputation score",
  ];

  it("admits the absences by name", () => {
    const answers = whatFaq(BASE)
      .map((pair) => pair.answer)
      .join(" ")
      .toLowerCase();
    for (const phrase of MUST_ADMIT) {
      expect(answers, `/what never admits "${phrase}"`).toContain(phrase);
    }
  });

  it("scopes itself out of what one key cannot carry", () => {
    // The openapi cold reader's caveat, which was fair and is now the
    // store's own sentence: a single-key single-operator root of trust
    // is the wrong instrument for a compliance or dispute need, and
    // saying so is what makes the rest of the page credible.
    const answers = whatFaq(BASE)
      .map((pair) => pair.answer)
      .join(" ")
      .toLowerCase();
    expect(answers).toContain("compliance");
  });

  it("carries the absences into the structured data, not just the page", async () => {
    // The pairs are what an answer engine lifts. A limitation living
    // only in the surrounding HTML is a limitation that does not
    // travel — the same trap the visitors' register and /pulse.json
    // both hit, in its identity-page form.
    const body = (await (await SELF.fetch(`${BASE}/what`)).json()) as {
      faq: Array<{ question: string; answer: string }>;
    };
    const joined = body.faq.map((pair) => pair.answer).join(" ").toLowerCase();
    expect(joined).toContain("no escrow");
    expect(joined).toContain("no rotation");
  });
});
