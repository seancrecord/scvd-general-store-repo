import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { NOVELTY_ONLY, SPEC_WHY_USE } from "@/store/spec";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE OBVIOUSNESS PASS. An outside model, given room to reason over
 * our public surfaces, derived each item's value and the thesis under
 * it unprompted. The problem was never the reasoning — it was that
 * our purchase-time surfaces made reasoning necessary. why_use states
 * it instead, at the decision moment, in machine-readable form.
 */
describe("why_use", () => {
  it("accounts for every item: a stated value or a declared novelty", () => {
    for (const item of MENU_ITEMS) {
      const stated = item.id in SPEC_WHY_USE;
      const novelty = NOVELTY_ONLY.includes(item.id);
      // Exactly one. An item in neither list is one nobody decided about.
      expect(stated !== novelty, `${item.id} is in neither list or both`).toBe(
        true,
      );
    }
  });

  it("keeps novelty items free of invented value", () => {
    for (const id of NOVELTY_ONLY) {
      expect(SPEC_WHY_USE[id], `${id} should state no capability gap`).toBeUndefined();
    }
  });

  it("stays in the evaluator's register: one line, no sales adjectives", () => {
    for (const [id, line] of Object.entries(SPEC_WHY_USE)) {
      expect(line.length, `${id} too long to parse at a glance`).toBeLessThan(
        320,
      );
      expect(line.includes("\n"), `${id} must be one line`).toBe(false);
      for (const word of [
        "amazing",
        "incredible",
        "unique",
        "best",
        "delightful",
        "revolutionary",
        "simply",
      ]) {
        expect(
          line.toLowerCase().includes(word),
          `${id} reaches for "${word}"`,
        ).toBe(false);
      }
    }
  });

  it("rides the 402 challenge, where the decision actually gets made", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/context_anchor`);
    expect(response.status).toBe(402);
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.spec)) throw new Error("no spec");
    expect(body.spec.why_use).toBe(SPEC_WHY_USE["context_anchor"]);

    // And second in the object, because key order is the primacy lever.
    expect(Object.keys(body.spec)[0]).toBe("capability");
    expect(Object.keys(body.spec)[1]).toBe("why_use");
  });

  it("rides the catalog, and says what the signature is for", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/menu.json`)).json();
    if (!isRecord(body) || !Array.isArray(body.items)) throw new Error("no items");

    for (const entry of body.items) {
      if (!isRecord(entry) || !isRecord(entry.spec)) continue;
      const id = String(entry.id);
      expect(entry.spec.why_use).toBe(SPEC_WHY_USE[id]);
      // The storewide claim: the certificate is signed by us, not by
      // the holder, which is the whole reason it settles anything.
      const verification = entry.spec.verification;
      expect(isRecord(verification)).toBe(true);
      if (!isRecord(verification)) continue;
      expect(String(verification.attestation)).toContain("not yours");
    }
  });
});
