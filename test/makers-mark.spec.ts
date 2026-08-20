import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  canonicalizeCertificate,
  fieldsOutsideLegacySignature,
} from "@/lib/signing";
import { ITEM_MAKER_MARK, makerMarkFor } from "@/store/provenance";
import { MENU_ITEMS } from "@/store";
import { CAPABILITY_QUERY, SPEC_RETURNS, SPEC_WHY_USE } from "@/store/spec";
import type { Certificate } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE MAKER'S MARK — who actually made the thing you are holding.
 *
 * Scoping this field found a false claim, which is the argument for the
 * field in one sentence: the listing spec said luckies were "graded
 * honestly, by a person" while drawLuckyParts() picked the animal, the
 * note and the strength from a hash of the certificate id, and
 * luckies.ts said so in its own comment. Nothing in the repo tied a
 * capability claim to the code that implements it, so the two drifted
 * apart and stayed apart for five days.
 *
 * These tests are that tie.
 */
describe("the mark is covered by the signature", () => {
  it("is inside the canonical form, not beside it", () => {
    // A provenance claim is the one field where displayed-but-unsigned
    // is indistinguishable from a forgery: change "house" to "keeper"
    // and an unsigned mark still verifies clean. This is the defect CV
    // found on tag and attests, and the reason made_by went into
    // CERT_FIELDS before it was served anywhere.
    const cert: Certificate = {
      cert_id: "cert_test",
      item: "luckies",
      patron_number: 1,
      date: "2026-07-30T00:00:00.000Z",
      made_by: "house",
    };
    expect(canonicalizeCertificate(cert)).toContain('"made_by":"house"');
  });

  it("is named as uncovered on a certificate too old to carry it", () => {
    // Legacy certificates were signed before this field existed. If one
    // somehow served a mark, the verify response has to say the
    // signature does not cover it rather than report a clean valid.
    const legacy: Certificate = {
      cert_id: "cert_old",
      item: "luckies",
      patron_number: 1,
      date: "2026-07-25T00:00:00.000Z",
      made_by: "house",
    };
    expect(fieldsOutsideLegacySignature(legacy)).toContain("made_by");
  });
});

describe("the mark cannot be supplied by a caller", () => {
  it("is derived from the item, one table, every code path", () => {
    // A provenance claim a caller could pass in is a provenance claim a
    // caller could get wrong. The whole point of the field is being the
    // thing nobody has to take on trust.
    expect(makerMarkFor("luckies")).toBe("house");
    // the_drawer carried the only other mark until 2026-08-20; the
    // cards it issued keep theirs, the table no longer names it.
    expect(makerMarkFor("the_drawer")).toBeUndefined();
    expect(makerMarkFor("settlement_attestation")).toBeUndefined();
  });

  it("marks only shelves that are actually on the menu", () => {
    const shelf = new Set(MENU_ITEMS.map((item) => item.id));
    for (const id of Object.keys(ITEM_MAKER_MARK)) {
      expect(shelf, `${id} carries a maker's mark and is not on the menu`).toContain(
        id,
      );
    }
  });
});

/**
 * THE GUARD THAT WOULD HAVE CAUGHT THE LUCKIES LINE.
 *
 * "Be issued a lucky charm, graded honestly, by a person" sat in
 * CAPABILITY_QUERY — which becomes the OpenAPI `summary`, the field a
 * spec reader shows first — describing a shelf whose fulfilment is a
 * hash function. A claim that a person is involved is a capability
 * claim, and this store's whole argument is that its capability claims
 * are checkable.
 *
 * ALL THREE COPY MAPS ARE SCANNED, not the one that happened to carry
 * the bug. Each reaches a different surface — CAPABILITY_QUERY the
 * OpenAPI summary, SPEC_WHY_USE the listing spec in menu.json and the
 * x402 document, SPEC_RETURNS the storefront and the item pages — and
 * fixing the map somebody noticed while leaving its two siblings is
 * exactly how the last four of these got missed.
 */
describe("no shelf claims a person who is not there", () => {
  const CLAIMS_A_HUMAN =
    /\bby a person\b|\bby hand\b|\bby an actual person\b|\bgraded (honestly )?by\b/i;

  const MAPS: [string, Record<string, string>][] = [
    ["CAPABILITY_QUERY", CAPABILITY_QUERY],
    ["SPEC_WHY_USE", SPEC_WHY_USE],
    ["SPEC_RETURNS", SPEC_RETURNS],
  ];

  it("only where the fulfilment path actually has one", () => {
    for (const item of MENU_ITEMS) {
      for (const [mapName, map] of MAPS) {
        const line = map[item.id];
        if (!line || !CLAIMS_A_HUMAN.test(line)) {
          continue;
        }
        // A human claim is allowed when the item is human-fulfilled, or
        // when the shelf is explicitly marked as the keeper's hand. It
        // is never allowed on a "house" shelf, which is a machine
        // drawing from a pool a person wrote, nor on an unmarked
        // instant machine shelf.
        const humanFulfilled = item.fulfillment !== "instant";
        expect(
          humanFulfilled || makerMarkFor(item.id) === "keeper",
          `${mapName}.${item.id} says "${line}" but nothing in its path is a person`,
        ).toBe(true);
      }
    }
  });

  it("and luckies specifically no longer says a person grades it", () => {
    // The instance. Named rather than left to the loop, because the
    // loop passes trivially if somebody deletes the entry instead of
    // fixing the claim.
    expect(CAPABILITY_QUERY["luckies"]).toBeTruthy();
    expect(CAPABILITY_QUERY["luckies"]).not.toMatch(/by a person/i);
  });
});

describe("a holder can read the mark without asking us", () => {
  it("is spelled out on /attestation, gaps included", async () => {
    const page = await (
      await SELF.fetch("https://scvd.store/attestation", {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("Who made it");
    // The absences are stated, because a mark on some artifacts and not
    // others otherwise reads as the unmarked ones hiding something.
    expect(page.toLowerCase()).toContain("settlement_attestation");
  });

  it("serves the marks and the marked shelves as data, not only prose", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/attestation")
    ).json()) as {
      maker_marks: Record<string, { label: string; means: string }>;
      marked_items: Record<string, string>;
    };
    expect(Object.keys(body.maker_marks).sort()).toEqual([
      "house",
      "keeper",
      "machine",
    ]);
    expect(body.marked_items["luckies"]).toBe("house");
  });
});

/**
 * THE MARK HAS TO REACH THE BUYER BEFORE THE MONEY DOES.
 *
 * Shipped 2026-07-30 as a certificate field, which put it on the artifact
 * and on /api/verify — both of which a buyer only reaches AFTER paying.
 * The keeper checked menu.json and a live 402 and found nothing, correctly:
 * the mark was answering "who made this" at the wrong end. A provenance
 * fact a buyer cannot see while deciding is not provenance, it is a receipt.
 *
 * Four pre-purchase surfaces, all fed by listingSpec so they cannot drift
 * apart. The 402 is asserted here rather than by curl because a live 402
 * needs facilitator secrets that a local dev server does not have — the
 * same reason four cold readers saw 500s on /api/buy tonight.
 */
describe("the mark reaches a buyer before they pay", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  const MARKED = "luckies";

  it("rides the 402 challenge, where a buying agent actually looks", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/${MARKED}`);
    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    const body = (await response.json()) as {
      spec?: { outputs?: { made_by?: { mark?: string } } };
    };
    expect(
      body.spec?.outputs?.made_by?.mark,
      "the 402 does not say who made the thing it is charging for",
    ).toBe("house");
  });

  it("rides menu.json, the machine catalogue", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      items: { id: string; spec?: { outputs?: { made_by?: { mark?: string } } } }[];
    };
    const marked = menu.items.find((item) => item.id === MARKED);
    expect(marked?.spec?.outputs?.made_by?.mark).toBe("house");
    // And an unmarked shelf carries nothing rather than an invented mark.
    const plain = menu.items.find((item) => item.id === "hello");
    expect(plain?.spec?.outputs?.made_by).toBeUndefined();
  });

  it("rides the item page and the x402 discovery document", async () => {
    for (const path of [`/menu/${MARKED}`, "/.well-known/x402.json"]) {
      const text = await (await SELF.fetch(`${BASE}${path}`)).text();
      expect(text, `${path} carries no maker's mark`).toContain("made_by");
    }
  });
});
