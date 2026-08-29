import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";
const JSON_HEADERS = { Accept: "application/json" };

/**
 * CAN AN AGENT ACTUALLY READ THIS? (the keeper's question, 2026-08-29:
 * "is it readable to agents? dumb models? do we list it clearly in a
 * way they can find it, understand what it is, and consume it with
 * clear instruction?")
 *
 * THE ANSWER WAS PARTLY, AND THE GAP WAS INVERTED. /registry has
 * carried careful schema.org JSON-LD in its MARKUP since the
 * corrections that fixed its vocabulary — counts beside every
 * percentage, "shape only, one vantage". Ask the same URL for JSON,
 * which is what an agent does, and it answered `{version, weeks}`:
 * the numbers with every caveat stripped away.
 *
 * So the reader most likely to quote a figure verbatim, and least
 * able to see a paragraph beside it, was the one handed the naked
 * ratio. This store's own H1 note says the machine-readable half
 * matters MORE for exactly that reason.
 *
 * WHAT THIS GUARD HOLDS. Every published data surface answers a JSON
 * request with: what it is, how it was measured, what each field
 * means, how to read it, and — the one this store cannot omit —
 * what it must NOT be read as, AS A FIELD rather than as prose a
 * parser has no reason to open.
 */

/** Every public surface that serves numbers to a machine. */
const DATA_SURFACES = [
  { path: "/registry", mustMention: ["not a score", "shape"] },
  { path: "/inflows", mustMention: ["NOT sales", "facilitator"] },
] as const;

describe("a published number carries its caveat to the machine, not just the page", () => {
  for (const surface of DATA_SURFACES) {
    describe(surface.path, () => {
      it("answers JSON with a self-description a stranger can read", async () => {
        const response = await SELF.fetch(`${BASE}${surface.path}`, {
          headers: JSON_HEADERS,
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, unknown>;
        for (const key of [
          "@context",
          "@type",
          "name",
          "description",
          "measurementTechnique",
          "variableMeasured",
          "conditionsOfAccess",
        ]) {
          expect(body[key], `${surface.path} JSON has no ${key}`).toBeTruthy();
        }
      });

      it("states what it is NOT, as a field", async () => {
        const body = (await (
          await SELF.fetch(`${BASE}${surface.path}`, { headers: JSON_HEADERS })
        ).json()) as Record<string, unknown>;
        const hedge = String(body["what_this_is_not"] ?? "");
        expect(
          hedge.length,
          `${surface.path} hands a machine numbers with no statement of what they are not`,
        ).toBeGreaterThan(80);
        for (const phrase of surface.mustMention) {
          // Case-insensitive: these hedges SHOUT the important word
          // ("NOT a score"), and the guard is about the warning being
          // present, not about how loudly it is typed.
          expect(
            hedge.toLowerCase(),
            `${surface.path} never warns about "${phrase}"`,
          ).toContain(phrase.toLowerCase());
        }
      });

      it("tells a weak reader how to read it", async () => {
        const body = (await (
          await SELF.fetch(`${BASE}${surface.path}`, { headers: JSON_HEADERS })
        ).json()) as Record<string, unknown>;
        expect(String(body["how_to_read"] ?? "").length).toBeGreaterThan(60);
      });

      it("binds every described variable to the field it describes", async () => {
        const body = (await (
          await SELF.fetch(`${BASE}${surface.path}`, { headers: JSON_HEADERS })
        ).json()) as Record<string, unknown>;
        const variables = body["variableMeasured"] as Array<
          Record<string, unknown>
        >;
        expect(variables.length).toBeGreaterThan(3);
        for (const variable of variables) {
          // A glossary with no dictionary is not machine-readable:
          // the reader must be able to find the value being described.
          expect(
            variable["propertyID"],
            `a described variable on ${surface.path} names no path`,
          ).toBeTruthy();
          expect(String(variable["name"]).length).toBeGreaterThan(10);
        }
      });

      it("keeps the raw payload intact, so existing parsers still work", async () => {
        const body = (await (
          await SELF.fetch(`${BASE}${surface.path}`, { headers: JSON_HEADERS })
        ).json()) as Record<string, unknown>;
        // The envelope is additive. Anything already reading `weeks`
        // must not have been broken by making the data honest.
        expect(Array.isArray(body["weeks"])).toBe(true);
        expect(body["version"]).toBe(1);
      });
    });
  }

  it("serves the same numbers to a browser and to a machine", async () => {
    // The failure this whole guard exists for: two readers, two
    // different pictures of the same week.
    const json = (await (
      await SELF.fetch(`${BASE}/registry`, { headers: JSON_HEADERS })
    ).json()) as { weeks: Array<{ week: string }> };
    const html = await (
      await SELF.fetch(`${BASE}/registry`, { headers: { Accept: "text/html" } })
    ).text();
    for (const week of json.weeks) {
      expect(html, `${week.week} is in the JSON and not on the page`).toContain(
        week.week,
      );
    }
  });
});
