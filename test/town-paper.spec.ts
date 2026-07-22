import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assembleDraft,
  getDraft,
  publishEdition,
} from "@/services/town-paper";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * The Town Gazette: logbook with manners. Facts only, house never
 * reported, emptiness reported, keeper's pen before print.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
  "Content-Type": "application/x-www-form-urlencoded",
};

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function payFor(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const challenge = await SELF.fetch(url, { headers });
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  return SELF.fetch(url, {
    headers: {
      ...headers,
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!),
    },
  });
}

describe("the threshold", () => {
  it("declines to draft a week that earned nothing", async () => {
    expect(await assembleDraft(testEnv)).toBeNull();
    expect(await getDraft(testEnv)).toBeNull();
  });
});

describe("the paper itself", () => {
  it("reports facts exactly, reports emptiness, never reports the house", async () => {
    // The period's record: one organic settle, one house settle (never
    // printed), one signature, one letter, one 404 at the door.
    const organic = await payFor(`${BASE}/api/buy/small_blessing`);
    expect(organic.status).toBe(200);
    const house = await payFor(`${BASE}/api/buy/dibs`, {
      "X-House": "test-house-secret",
    });
    expect(house.status).toBe(200);
    await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A Passing Reader", message: "Fine paper you have here." }),
    });
    await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter: "Private words for the keeper.", from_name: "Paper Test" }),
    });
    await SELF.fetch(`${BASE}/api/buy/weather_from_next_thursday`);

    const draft = await assembleDraft(testEnv);
    expect(draft).not.toBeNull();
    const page = draft!.markdown;

    // Facts, exact.
    expect(page).toContain("1 purchase settled: small_blessing (1)");
    expect(page).toContain("1 new signature");
    expect(page).toContain("A Passing Reader");
    expect(page).toContain("1 letter arrived. Contents remain letters.");
    expect(page).toContain(
      '"weather_from_next_thursday" was asked for once. Store had none.',
    );
    // Every section present; emptiness reported, not skipped.
    expect(page).toContain("## CORRECTIONS");
    expect(page).toContain("The record stands uncorrected.");
    expect(page).toContain("No confession reached the counter.");
    // The house never makes the paper.
    expect(page).not.toContain("dibs");
    // The letter's contents never make anything.
    expect(page).not.toContain("Private words");
  });

  it("publishes through the keeper's pen, strips the slots, sells for a penny", async () => {
    const draft = await getDraft(testEnv);
    expect(draft).not.toBeNull();
    // Keeper leaves the bracketed slots untouched; publish strips them.
    const edition = await publishEdition(testEnv, draft!.markdown);
    expect(edition.edition_number).toBe(1);
    expect(edition.markdown).not.toContain("[Weather line");
    expect(edition.markdown).not.toContain("[Mina");
    expect(edition.markdown).not.toContain("[Inez");

    // The free index lists it; the copy costs a penny, markdown, no-store.
    const index = await json(await SELF.fetch(`${BASE}/paper`));
    const editions = index["editions"] as Array<Record<string, unknown>>;
    expect(editions[0]?.["url"]).toBe(`${BASE}/paper/edition-1`);
    const copy = await payFor(`${BASE}/paper/edition-1`);
    expect(copy.status).toBe(200);
    expect(copy.headers.get("Cache-Control")).toBe("no-store");
    const text = await copy.text();
    expect(text).toContain("The Town Gazette of Smokewire Crossing");
    expect(text).toContain("small_blessing (1)");
  });

  it("404s an edition that never printed, before the gate", async () => {
    const response = await SELF.fetch(`${BASE}/paper/edition-99`);
    expect(response.status).toBe(404);
  });

  it("carries a filed correction into the next draft", async () => {
    const filed = await SELF.fetch(`${BASE}/admin/paper/correction`, {
      method: "POST",
      headers: adminAuth,
      body: new URLSearchParams({
        correction:
          "Edition No. 1 reported 1 letter. The correct total was 1, but the flag deserved mention.",
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(filed.status);
    const draft = await assembleDraft(testEnv, true);
    expect(draft!.markdown).toContain("The correct total was 1");
    expect(draft!.markdown).not.toContain("The record stands uncorrected.");
  });
});
