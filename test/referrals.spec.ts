import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { metricsMonth } from "@/lib/metrics";
import { parseReferralMarker, readReferrals } from "@/lib/referrals";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import type { Env } from "@/types";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;

let facilitator: ReturnType<typeof installFacilitatorMock>;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

const CV_WALLET = HOUSE_WALLET_FILE.wallets.find(
  (entry) => entry.who === "CV",
)?.address as string;

/**
 * THE REFERRAL MARKER, MEASURED AND NOTHING MORE.
 *
 * CV proposed a signed certificate recording that one agent referred
 * another. Built as its measuring half only, because we never observe
 * the referral — we observe a marker TYPED BY THE PERSON BEING
 * REFERRED, who can type any number. Signing that would put the
 * store's key on a claim the buyer authored, which is the same thing
 * the gate already refuses to do with the `from` field on a decline.
 *
 * What these tests hold is the shape of an honest instrument: bounded
 * key space, house excluded on both sides, arrivals counted apart from
 * settles, and the limit stated on the report rather than remembered.
 */
describe("the referral marker", () => {
  it("accepts a patron number and refuses everything else", () => {
    // The key space is a query parameter, so an unbounded value is how
    // a metric turns into a bill.
    expect(parseReferralMarker("26")).toBe(26);
    expect(parseReferralMarker("1")).toBe(1);
    expect(parseReferralMarker("0")).toBeUndefined();
    expect(parseReferralMarker("-5")).toBeUndefined();
    expect(parseReferralMarker("26.5")).toBeUndefined();
    expect(parseReferralMarker("ur-mom")).toBeUndefined();
    expect(parseReferralMarker("99999999999")).toBeUndefined();
    expect(parseReferralMarker(undefined)).toBeUndefined();
  });

  it("counts an arrival at a priced door", async () => {
    const before = await readReferrals(testEnv, metricsMonth());
    await SELF.fetch("https://scvd.store/api/buy/hello?ref=26", {
      headers: { "User-Agent": "referral-spec/1.0" },
    });
    const after = await readReferrals(testEnv, metricsMonth());
    expect(after.total_arrived).toBeGreaterThan(before.total_arrived);
    expect(after.rows.some((row) => row.marker === 26)).toBe(true);
  });

  it("counts a settle apart from an arrival, because the gap is the signal", async () => {
    const first = await SELF.fetch("https://scvd.store/api/buy/hello?ref=41");
    const accepted = decodePaymentRequired(first).accepts[0];
    const before = await readReferrals(testEnv, metricsMonth());
    const paid = await SELF.fetch("https://scvd.store/api/buy/hello?ref=41", {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(
          accepted as NonNullable<typeof accepted>,
        ),
      },
    });
    expect(paid.status).toBe(200);
    const after = await readReferrals(testEnv, metricsMonth());
    expect(after.total_settled).toBeGreaterThan(before.total_settled);
  });

  it("counts nothing when the house is on either side of it", async () => {
    // A reward for bringing traffic is an incentive to manufacture
    // traffic, and today the only agents who could refer anyone are the
    // house and CV. Manufacturing social proof is the same family as
    // manufacturing settlements, money or no money (rule 13).
    const before = await readReferrals(testEnv, metricsMonth());
    await SELF.fetch(
      `https://scvd.store/api/buy/hello?ref=77&house=${testEnv.HOUSE_SECRET}`,
    );
    const after = await readReferrals(testEnv, metricsMonth());
    expect(
      after.rows.some((row) => row.marker === 77),
      "a house-flagged request was counted as a referral",
    ).toBe(false);
    expect(after.total_arrived).toBe(before.total_arrived);
  });

  it("excludes a house wallet's settle even with no house header", async () => {
    const first = await SELF.fetch("https://scvd.store/api/buy/hello?ref=88");
    const accepted = decodePaymentRequired(first).accepts[0];
    const header = buildPaymentSignature(
      accepted as NonNullable<typeof accepted>,
    );
    const payload = JSON.parse(atob(header)) as {
      payload: { authorization: { from: string } };
    };
    payload.payload.authorization.from = CV_WALLET;

    // The mock normally echoes its own payer; drop it so the gate falls
    // back to the signed `from`, which is the production shape when a
    // facilitator returns no payer.
    facilitator.settleOmitsPayer = true;
    const before = await readReferrals(testEnv, metricsMonth());
    await SELF.fetch("https://scvd.store/api/buy/hello?ref=88", {
      headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payload)) },
    });
    const after = await readReferrals(testEnv, metricsMonth());
    facilitator.settleOmitsPayer = false;
    const row = after.rows.find((entry) => entry.marker === 88);
    expect(
      row?.settled ?? 0,
      "a house wallet's settle counted as a referred sale",
    ).toBe(before.rows.find((entry) => entry.marker === 88)?.settled ?? 0);
  });

  it("states on the report that it counts claims, not referrals", async () => {
    const report = await readReferrals(testEnv, metricsMonth());
    expect(report.honest_limit).toContain("counts claims, not referrals");
    expect(report.honest_limit).toContain("Nothing is verified");
  });

  it("never touches the venue table, which measures something else", async () => {
    // `?src=` means "how did you hear about us" and feeds channel
    // inference. Overloading it would have put one KV key per referrer
    // per month into a table built for the free-papers measurement.
    await SELF.fetch("https://scvd.store/api/buy/hello?ref=31");
    const venue = await testEnv.COUNTERS.list({
      prefix: `metric:${metricsMonth()}:venue:`,
      limit: 100,
    });
    expect(venue.keys.some((key) => key.name.endsWith(":31"))).toBe(false);
  });
});
