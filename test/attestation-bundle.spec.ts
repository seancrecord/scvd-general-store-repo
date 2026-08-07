import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;

/**
 * THE SHEAF — the first marketplace-era item (MARKETPLACE_AUDIT Part
 * 6, step 3; the keeper's "work those bit by bit"). Deliberately
 * STATELESS: one payment, every observation delivered in the response,
 * no stored balance — so it is rule-23a observation with nothing for
 * even the bounded-watch carve-out to carry.
 *
 * What is testable without paying: the shelf placement, the schema,
 * and the pre-gate refusals — every one of which must cost nothing,
 * because the whole contract of the validators is that money only
 * moves once the input could actually be fulfilled.
 */
describe("a sheaf of attestations", () => {
  it("sits on the shelf in price order with its constraints stated", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "attestation_bundle");
    expect(item, "the sheaf is not on the menu").toBeTruthy();
    expect(item?.price_usdc).toBe(0.05);
    expect(item?.fulfillment).toBe("instant");
    // The cheap door ascends; the sheaf lands between the pennies and
    // the handshake by construction, not by hand-placement.
    const prices = MENU_ITEMS.filter((entry) => entry.price_usdc <= 1).map(
      (entry) => entry.price_usdc,
    );
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    // The description makes no claim past what the single makes: Base,
    // settlement only, no human, no dispute resolution.
    expect(item?.description).toContain("no human in the loop");
    expect(item?.description).toContain("resolves no dispute");
  });

  it("declares tx_hashes as its one required input, machine-readably", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "attestation_bundle")!;
    const schema = buyInputSchema(item);
    expect(schema.required).toContain("tx_hashes");
    const property = (schema.properties ?? {})["tx_hashes"] as {
      pattern?: string;
    };
    // The pattern itself encodes the bounds: 2 to 20 hashes.
    expect(property.pattern).toBeTruthy();
    expect(new RegExp(property.pattern!).test(`${HASH_A},${HASH_B}`)).toBe(true);
    expect(new RegExp(property.pattern!).test(HASH_A)).toBe(false);
  });

  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses an empty sheaf before any money is asked for", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/attestation_bundle`, {
      headers: buying,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    // The refusal routes a one-hash buyer to the cheaper right door.
    expect(body.error).toContain("settlement_attestation");
  });

  it("refuses one hash, pointing at the single attestation", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/attestation_bundle?tx_hashes=${HASH_A}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("settlement_attestation");
  });

  it("refuses twenty-one hashes by count, not by silently truncating", async () => {
    const hashes = Array.from(
      { length: 21 },
      (_, index) => `0x${index.toString(16).padStart(64, "0")}`,
    ).join(",");
    const response = await SELF.fetch(
      `${BASE}/api/buy/attestation_bundle?tx_hashes=${hashes}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("21");
  });

  it("refuses a malformed hash by name", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/attestation_bundle?tx_hashes=${HASH_A},not-a-hash`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("not-a-hash");
  });

  it("refuses duplicates rather than quietly deduplicating", async () => {
    // A silent dedupe charges for observations the buyer already had.
    const response = await SELF.fetch(
      `${BASE}/api/buy/attestation_bundle?tx_hashes=${HASH_A},${HASH_A}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("duplicate");
  });

  it("answers a bare probe with a price, never a refusal — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/attestation_bundle`);
    expect(response.status).toBe(402);
  });

  it("answers a valid sheaf with a 402, not a refusal", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/attestation_bundle?tx_hashes=${HASH_A},${HASH_B}`,
      { headers: buying },
    );
    // The till's turn: terms in the challenge, nothing charged yet.
    expect(response.status).toBe(402);
  });
});
