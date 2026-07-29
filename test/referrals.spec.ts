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

/**
 * REFERRERS BY HOST — CV's #3, built with his framing rather than
 * against it.
 *
 * He pulled the live census before answering and predicted mostly
 * nulls, for a real reason: `Referer` is a browser artifact, HTTP
 * libraries and x402 signing clients do not set one, and the two
 * heaviest clients on this store right now are literally no user-agent
 * at all and a named bot. He also refused to be merely dismissive —
 * headless-browser directory scanners and any human clicking a listing
 * WILL populate it, and one confirmed hit from a directory's own domain
 * would be the first evidence ever that a listing sends anybody here.
 *
 * So the requirement is not "make it work." It is: scope the claim so a
 * mostly-empty table is never misread as broken instrumentation, the way
 * the decline reasons nearly were.
 */
describe("referrers by host", () => {
  it("counts a real browser referrer by host, not by URL", async () => {
    const { readReferrerHosts } = await import("@/lib/referrals");
    const before = await readReferrerHosts(testEnv);
    await SELF.fetch("https://scvd.store/api/buy/hello", {
      headers: {
        Referer: "https://www.x402scan.com/some/listing/page?utm=whatever",
        "User-Agent": "Mozilla/5.0 (referrer-spec)",
      },
    });
    const after = await readReferrerHosts(testEnv);
    const host = after.hosts.find((row) => row.host === "www.x402scan.com");
    expect(host, "a real referrer was not counted").toBeTruthy();
    expect(after.with_referrer).toBeGreaterThan(before.with_referrer);
    // The path is deliberately dropped: a full URL is unbounded key
    // space, and the question is which SITE sends traffic.
    expect(
      after.hosts.some((row) => row.host.includes("/")),
      "a path leaked into the host table",
    ).toBe(false);
  });

  it("ignores the house, same as every other organic count", async () => {
    const { readReferrerHosts } = await import("@/lib/referrals");
    const before = await readReferrerHosts(testEnv);
    await SELF.fetch(
      `https://scvd.store/api/buy/hello?house=${testEnv.HOUSE_SECRET}`,
      { headers: { Referer: "https://keeper.example/private" } },
    );
    const after = await readReferrerHosts(testEnv);
    expect(
      after.hosts.some((row) => row.host === "keeper.example"),
      "house traffic reached the referrer table",
    ).toBe(false);
    expect(after.with_referrer).toBe(before.with_referrer);
  });

  it("scopes its own claim so an empty table is never read as broken", async () => {
    const { readReferrerHosts } = await import("@/lib/referrals");
    const report = await readReferrerHosts(testEnv);
    expect(report.honest_limit).toContain("NOT GENERAL ATTRIBUTION");
    // The sentence that stops the decline-reasons misreading happening
    // again: empty means no clicks, not a broken instrument.
    expect(report.honest_limit).toContain("does NOT mean the instrument is broken");
  });

  it("keeps the two mechanisms apart on the page that shows both", async () => {
    const page = await (
      await SELF.fetch("https://scvd.store/admin/referrals", {
        headers: { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` },
      })
    ).text();
    // A typed marker and a browser header answer the same instinct by
    // different means; adding them together would be nonsense.
    expect(page).toContain("a DIFFERENT mechanism");
    expect(page).toContain("do not add these numbers together");
  });
});
