import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FREE_DOORS } from "@/store/atlas";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * RULE 57 ON THE DOORS AN AGENT MEETS BEFORE IT PAYS.
 *
 * docs/SURFACE_CONTRACT_2026-08.md recorded, the evening the rule was
 * adopted, exactly how far it reached: "57.2, 57.4 and 57.5 are held
 * against /doors and nowhere else", with the sweep owed and its order
 * named — the free instruments first, because they are what an agent
 * meets before it has spent anything on us.
 *
 * This is that sweep, held. The roster is the atlas's own FREE_DOORS,
 * not a list written here: the atlas is what an arriving agent reads
 * to find what is free, so a door advertised there that cannot answer
 * the five questions is precisely the gap rule 57 exists to close. A
 * free instrument added to the atlas tomorrow is held to this
 * tomorrow, with nothing to remember.
 *
 * WHAT IT WALKS AND WHAT IT CANNOT. The instruments that publish a
 * JSON self-description on GET are checked field by field. /try is a
 * room for a person and /api/verify/{id} takes an id in its path —
 * neither has a doc body to read, and both are named below so the
 * scope is stated rather than implied.
 */

const NO_DOC_BODY: Record<string, string> = {
  "/try": "a room a person reads, held by rule 58 in test/surface-contract.spec.ts rather than by a JSON doc",
  "/api/verify/{id}":
    "takes an id in the path and answers with the signed bytes themselves; there is no doc body, and inventing an id to fetch one would test a 404",
};

/** The instruments whose GET serves the self-description. */
function documentedDoors(): string[] {
  return FREE_DOORS.map((door) => door.path).filter(
    (path) => !(path in NO_DOC_BODY),
  );
}

async function doc(path: string): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  expect(response.status, `${path} does not answer a GET`).toBe(200);
  return (await response.json()) as Record<string, any>;
}

describe("the roster is the atlas, and it is not empty", () => {
  it("walks every free instrument the atlas advertises", () => {
    // A guard over an empty roster passes for the wrong reason.
    expect(documentedDoors().length).toBeGreaterThanOrEqual(3);
    for (const path of Object.keys(NO_DOC_BODY)) {
      expect(
        FREE_DOORS.some((door) => door.path === path),
        `${path} is excused from a roster it is no longer on`,
      ).toBe(true);
    }
  });
});

describe.each(documentedDoors())("%s answers the five questions", (path) => {
  it("57.2 — says what it is and what it is for, without narrowing it", async () => {
    const json = await doc(path);
    expect(String(json.summary ?? "").length).toBeGreaterThan(80);
    const forWhat = String(json.what_you_can_use_it_for ?? "");
    expect(forWhat.length, `${path} never says what it is FOR`).toBeGreaterThan(120);
    // The clause's real test: it must not foreclose uses, and the only
    // way a check can tell an open description from a closed one is
    // that the sentence says so.
    expect(forWhat).toContain("no use case we are reserving");
  });

  it("57.3 — says free, with the cadence, and prices any rung off the shelf", async () => {
    const json = await doc(path);
    expect(json.price.this_surface).toBe("free");
    expect(json.price.amount).toBe("$0.00");
    expect(String(json.price.cadence).length).toBeGreaterThan(40);
    const rungs = json.price.if_you_want_it_signed as Array<Record<string, any>>;
    expect(Array.isArray(rungs)).toBe(true);
    for (const rung of rungs) {
      const item = MENU_ITEMS.find((candidate) => candidate.id === rung.id);
      expect(item, `${path} names a rung the menu does not carry: ${rung.id}`).toBeTruthy();
      // Derived, never typed: the amount here must be the shelf's.
      expect(rung.price_usdc).toBe(item?.price_usdc);
      expect(["one_off", "term"]).toContain(rung.cadence);
      if (rung.cadence === "term") expect(rung.term_days).toBeGreaterThan(0);
      expect(rung.buy_url).toBe(`${BASE}/api/buy/${rung.id}`);
      expect(String(rung.instead).length).toBeGreaterThan(40);
    }
    // A door with no paid rung must say the rung is absent rather
    // than leave a reader to assume one exists.
    if (rungs.length === 0) {
      expect(String(json.price.what_is_not_sold ?? "").length).toBeGreaterThan(80);
    }
  });

  it("57.4 — hands a small model the call, the outcome and the errors by name", async () => {
    const json = await doc(path);
    expect(json.method).toBeTruthy();
    expect(String(json.url)).toContain(BASE);
    expect(json.request, `${path} does not say what to send`).toBeTruthy();
    expect(String(json.expected_outcome ?? "")).toContain("200");
    const errors = json.errors as Array<Record<string, any>>;
    expect(
      Array.isArray(errors) && errors.length > 1,
      `${path} names no error categories`,
    ).toBe(true);
    for (const error of errors) {
      expect(error.code, "an error with no name is not a category").toBeTruthy();
      expect(typeof error.http).toBe("number");
      expect(String(error.means).length).toBeGreaterThan(30);
      // The half that makes it actionable rather than merely labelled.
      expect(
        String(error.what_to_do).length,
        `${error.code} on ${path} says what it is and not what to do`,
      ).toBeGreaterThan(40);
    }
  });

  it("57.5 — says what it reads, what it never keeps, and what we are kept to", async () => {
    const json = await doc(path);
    const security = (json.security ?? {}) as Record<string, string>;
    expect(
      Object.keys(security).length,
      `${path} has no security paragraph`,
    ).toBeGreaterThan(0);
    expect(String(security.what_this_surface_reads).length).toBeGreaterThan(80);
    expect(String(security.what_it_stores_about_you).length).toBeGreaterThan(60);
    expect(String(security.what_the_data_is).length).toBeGreaterThan(60);
    expect(security.standards).toContain("private-first");
    expect(security.reporting).toContain("security.txt");
  });

  it("charges nothing, which is checked rather than asserted", async () => {
    /*
     * "free" and "$0.00" are the two claims on these doors a reader
     * cannot verify by reading, so they are bound to behaviour here:
     * a bare POST with no payment attached must not come back 402 or
     * 401. It may well come back 400 — an empty body is a bad
     * request — and that is the proof: the door refused the SHAPE of
     * the call, having never asked who was paying.
     */
    const response = await SELF.fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(
      [402, 401, 403].includes(response.status),
      `${path} is published as free and answered ${response.status} to an unpaid, unauthenticated call`,
    ).toBe(false);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
  });

  it("never lets a free live read be mistaken for a signed artifact", async () => {
    /*
     * The specific dishonesty available to a free instrument: a
     * reader quoting its answer to somebody else as evidence. None
     * of these responses is signed and every one of them says so,
     * because the paid rungs are the ones that sell a signature and
     * a free door that blurred the line would be selling by
     * confusion.
     */
    const json = await doc(path);
    expect(String(json.security.integrity)).toMatch(/NOT SIGNED/);
  });
});
