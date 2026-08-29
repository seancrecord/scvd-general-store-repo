import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * WHAT A PAID DOOR HANDS BACK, BOUND TO WHAT IT ACTUALLY HANDS BACK.
 *
 * Every buy door declared its 200 as `{type: "object"}` — true, and
 * the most expensive place on the whole contract to say nothing. A
 * client that cannot see the response shape discovers it by calling,
 * and calling these costs real USDC. Every undeclared field on a
 * paid door is a field somebody pays to find out about.
 *
 * There are two shapes, and the operation descriptions have always
 * said so in prose: an instant shelf delivers the goods and a signed
 * certificate; a human shelf hands back a queue ticket with an id to
 * poll. Now the schema says it too, picked by the same
 * `item.fulfillment` flag the sentence reads.
 *
 * THE SET WALKED HERE IS DERIVED, NOT LISTED. Hand-listing which
 * doors to check would rot the first time a shelf was added — the
 * new door would go untested and nobody would notice, which is the
 * exact failure this file exists to prevent one level down. So the
 * test asks the MENU which items are instant and buyable without
 * inputs, and walks all of them. Add such an item tomorrow and it is
 * checked tomorrow.
 *
 * WHAT IT CANNOT WALK, stated rather than quietly skipped: doors
 * that need parameters (there is no honest generic value for someone
 * else's transaction hash), and human-queue doors, which can decline
 * a sale outright when the week's inventory is spent — 503 is a
 * correct answer there, not a delivery. Those keep the schema the
 * generator gives them; this file is the evidence for the instant
 * envelope, and says so rather than implying more coverage than it has.
 */

/** Instant shelves a test can buy with no invented inputs. */
const WALKABLE = MENU_ITEMS.filter((item) => {
  if (item.fulfillment !== "instant") return false;
  const schema = buyInputSchema(item);
  return (schema.required ?? []).length === 0;
});

const ENVELOPE_REQUIRED = [
  "message",
  "item_id",
  "deliverable",
  "paid_usdc",
  "certificate",
  "signature",
  "public_key",
  "algorithm",
  "verify_url",
  "verification",
] as const;

async function buy(itemId: string): Promise<Record<string, unknown>> {
  const url = `${BASE}/api/buy/${itemId}`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status, `${itemId} did not offer a challenge`).toBe(402);
  const headerName = [...challenge.headers.keys()].find((key) =>
    key.toLowerCase().includes("payment-required"),
  );
  expect(headerName, `${itemId} sent no PAYMENT-REQUIRED header`).toBeTruthy();
  const required = JSON.parse(atob(challenge.headers.get(headerName!)!)) as {
    accepts: Array<Record<string, unknown>>;
  };
  const paid = await SELF.fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never),
    },
  });
  expect(paid.status, `${itemId} did not deliver`).toBe(200);
  return (await paid.json()) as Record<string, unknown>;
}

describe("the instant shelves deliver the envelope the contract promises", () => {
  it("has doors to walk at all", () => {
    // A guard on the guard: if the derivation ever returns nothing,
    // every test below would pass vacuously and this file would be
    // decoration.
    expect(WALKABLE.length).toBeGreaterThan(2);
  });

  it.each(WALKABLE.map((item) => item.id))(
    "%s sends every field the envelope requires",
    async (itemId) => {
      const body = await buy(itemId);
      for (const field of ENVELOPE_REQUIRED) {
        expect(
          field in body,
          `${itemId} delivered without "${field}", which the contract promises on every instant shelf`,
        ).toBe(true);
      }
    },
  );

  it.each(WALKABLE.map((item) => item.id))(
    "%s hands back something anyone can verify without us",
    async (itemId) => {
      /*
       * The one field worth asserting beyond presence. A paid
       * artifact whose verify_url did not point at this store's own
       * free verification door would make the store's central promise
       * — free forever, for anyone, including people who did not buy
       * it — unkeepable from inside the very response that makes it.
       */
      const body = await buy(itemId);
      expect(String(body["verify_url"])).toContain("/api/verify/");
      expect(String(body["algorithm"])).toContain("ed25519");
    },
  );
});

/**
 * THE WATCH HISTORIES, BOUND TO A REAL WATCH.
 *
 * The keeper's porch table (2026-08-29) showed 262 organic reads on
 * /api/watch/{id} and 111 on its conformance sibling. I had argued
 * for skipping the per-artifact readers on the grounds that nobody
 * browses to them — you arrive holding an id you were given. The
 * traffic says people come back to their watches repeatedly, which
 * makes these two of the better-read doors on the store and makes
 * "some JSON" an expensive thing to have said about them.
 *
 * Buying a watch here rather than asserting the shape from the type
 * definition, because a type says what the code intends and a
 * purchase says what a reader receives.
 */
describe("a purchased watch reads back the way the contract says", () => {
  async function buyWatch(
    itemId: string,
    query: string,
  ): Promise<Record<string, any>> {
    const url = `${BASE}/api/buy/${itemId}?${query}`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status, `${itemId} offered no challenge`).toBe(402);
    const headerName = [...challenge.headers.keys()].find((key) =>
      key.toLowerCase().includes("payment-required"),
    );
    const required = JSON.parse(atob(challenge.headers.get(headerName!)!)) as {
      accepts: Array<Record<string, unknown>>;
    };
    const paid = await SELF.fetch(url, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(
          required.accepts[0] as never,
        ),
      },
    });
    expect(paid.status, `${itemId} did not sell`).toBe(200);
    return (await paid.json()) as Record<string, any>;
  }

  it("an hourly watch's history carries its denominator", async () => {
    const sale = await buyWatch(
      "standing_watch",
      "url=https://example.com/api/thing",
    );
    const watchId = String(
      sale["watch_id"] ?? sale["deliverable"]?.["watch_id"] ?? "",
    );
    expect(watchId, "the sale did not name a watch id").toBeTruthy();
    const history = (await (
      await SELF.fetch(`${BASE}/api/watch/${watchId}`)
    ).json()) as Record<string, any>;
    for (const field of [
      "watch_id",
      "url",
      "started_at",
      "ends_at",
      "complete",
      "summary",
      "probes",
      "how_to_verify",
      "what_this_is_not",
    ]) {
      expect(field in history, `the watch history omits "${field}"`).toBe(true);
    }
    /*
     * The one field that makes this evidence rather than a claim: the
     * denominator. Coverage without "out of how many" is a percentage
     * with its divisor hidden, which is the shape this store refuses
     * everywhere else.
     */
    expect("probes_expected" in history["summary"]).toBe(true);
    expect("hours_unprobed" in history["summary"]).toBe(true);
  });

  it("a conformance watch's record counts the days it missed", async () => {
    const sale = await buyWatch(
      "conformance_watch",
      "url=https://example.com/api/thing",
    );
    const watchId = String(
      sale["watch_id"] ?? sale["deliverable"]?.["watch_id"] ?? "",
    );
    expect(watchId, "the sale did not name a watch id").toBeTruthy();
    const history = (await (
      await SELF.fetch(`${BASE}/api/conformance-watch/${watchId}`)
    ).json()) as Record<string, any>;
    for (const field of [
      "watch_id",
      "url",
      "started_at",
      "ends_at",
      "complete",
      "summary",
      "passes",
      "how_to_verify",
    ]) {
      expect(field in history, `the conformance history omits "${field}"`).toBe(
        true,
      );
    }
    expect("days_unchecked" in history["summary"]).toBe(true);
  });
});
