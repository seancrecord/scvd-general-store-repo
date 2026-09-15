import { describe, expect, it } from "vitest";
import {
  advertisedVersionDetail,
  advertisedVersionUnpayable,
  materialTerms,
} from "@/services/advertised-version";

const OFFER = {
  scheme: "exact",
  network: "eip155:8453",
  payTo: "0xAbC0000000000000000000000000000000000001",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  amount: "1000",
  extra: { nonce: "one", validBefore: 111 },
};

describe("advertised-version-unpayable, the paid-side reading", () => {
  it("is PRESENT when a refusal re-serves the same material terms", () => {
    const reading = advertisedVersionUnpayable({
      paymentSubmitted: true,
      paidStatus: 402,
      unpaidAccepts: [OFFER],
      paidAccepts: [OFFER],
    });
    expect(reading).toMatchObject({ checked: true, present: true });
    expect(advertisedVersionDetail(reading)).toContain("PRESENT");
    // The buyer-facing line has to say what it does NOT establish.
    expect(advertisedVersionDetail(reading)).toContain("no failed payment to investigate");
  });

  it("a rotating nonce or expiry does not let a door escape the class", () => {
    // v15's correction, and the direction of it matters. Comparing
    // accepts[] WHOLE would have scored clean on every door carrying a
    // per-request nonce, expiry or rotating timeout — the careful half
    // of the ecosystem — because the bytes differ on each serve. That
    // is a FALSE NEGATIVE, so the comparator reads the five material
    // terms alone and the rotation does not clear anybody.
    const rotated = { ...OFFER, extra: { nonce: "two", validBefore: 222 } };
    expect(
      advertisedVersionUnpayable({
        paymentSubmitted: true, paidStatus: 402,
        unpaidAccepts: [OFFER], paidAccepts: [rotated],
      }),
    ).toMatchObject({ checked: true, present: true });

    // A changed MATERIAL term is a re-quote: the door read the payment
    // and answered with different terms, which is not this class.
    const requoted = { ...OFFER, amount: "2000" };
    const reading = advertisedVersionUnpayable({
      paymentSubmitted: true, paidStatus: 402,
      unpaidAccepts: [OFFER], paidAccepts: [requoted],
    });
    expect(reading).toMatchObject({ checked: true, present: false });
    expect(reading.reason).toContain("re-quoted rather than ignoring the payment");
  });

  it("never returns a quiet clean: what it could not ask is not a pass", () => {
    const cases = [
      { paymentSubmitted: false, paidStatus: 402, unpaidAccepts: [OFFER], paidAccepts: [OFFER] },
      { paymentSubmitted: true, paidStatus: null, unpaidAccepts: [OFFER], paidAccepts: [OFFER] },
      { paymentSubmitted: true, paidStatus: 402, unpaidAccepts: null, paidAccepts: [OFFER] },
    ];
    for (const input of cases) {
      const reading = advertisedVersionUnpayable(input);
      expect(reading.checked).toBe(false);
      expect(reading.present).toBeNull();
      // checked:false must never render as a clean bill of health.
      const line = advertisedVersionDetail(reading);
      expect(line).toContain("not checked");
      expect(line).toContain("not a clean reading of the door");
    }
  });

  it("does not fire on a 2xx, or on a refusal that carried no offer", () => {
    expect(
      advertisedVersionUnpayable({
        paymentSubmitted: true, paidStatus: 200,
        unpaidAccepts: [OFFER], paidAccepts: [OFFER],
      }),
    ).toMatchObject({ checked: true, present: false });

    // A door that said something ABOUT the payment is behaving; it is
    // the silent re-service that this class names.
    const spoke = advertisedVersionUnpayable({
      paymentSubmitted: true, paidStatus: 400,
      unpaidAccepts: [OFFER], paidAccepts: [],
    });
    expect(spoke).toMatchObject({ checked: true, present: false });
    expect(spoke.reason).toContain("said something about the payment");
  });

  it("reads the five material terms and nothing else, case-insensitively", () => {
    const terms = materialTerms({ ...OFFER, network: "EIP155:8453" });
    expect(Object.keys(terms).sort()).toEqual(["amount", "asset", "network", "payTo", "scheme"]);
    expect(terms.network).toBe("eip155:8453");
    expect(terms.payTo).toBe(OFFER.payTo.toLowerCase());
    // v1's maxAmountRequired is the same material term as v2's amount.
    expect(materialTerms({ maxAmountRequired: "1000" }).amount).toBe("1000");
  });
});
