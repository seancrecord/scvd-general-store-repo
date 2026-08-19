import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { pendingPaymentStub } from "./helpers/payment";

const BASE = "https://scvd.store";
const testEnv = env as never as import("@/types").Env;

/**
 * THE RECEIPT CHAIN (built 2026-08-19): the buyer's why signed into
 * the certificate, the store's word beside it, a human-readable
 * rendering of the same URL, and a forwardable copy in the purchase
 * response. These pin each link — and, per the cross_ref lesson, pin
 * that a purpose STAPLED onto a signed certificate breaks the
 * signature instead of downgrading to a clean legacy pass.
 */

const ITEM = {
  id: "hello",
  name: "A Signed Hello",
  price_usdc: 0.5,
  pricing: "fixed",
  fulfillment: "instant",
  description: "d",
  note_402: "n",
  listed_week: "2026-W30",
} as never;

async function buyWithPurpose(purpose?: string) {
  const { fulfillPurchase } = await import("@/services/fulfillment");
  const payment = pendingPaymentStub({ paidUsdc: 0.5 }) as unknown as Parameters<
    typeof fulfillPurchase
  >[2];
  return fulfillPurchase(testEnv, ITEM, payment, purpose ? { purpose } : {});
}

describe("the buyer's why rides the certificate, signed", () => {
  it("records purpose verbatim inside the signature, on any item", async () => {
    const { canonicalizeCertificate } = await import("@/lib/signing");
    const response = await buyWithPurpose("smoke test of our payment path before launch");
    const cert = response["certificate"] as import("@/types").Certificate;
    expect(cert.purpose).toBe("smoke test of our payment path before launch");
    // Inside the signed bytes, not decoration beside them.
    expect(canonicalizeCertificate(cert)).toContain(
      '"purpose":"smoke test of our payment path before launch"',
    );
  });

  it("omits the key entirely when no purpose was given", async () => {
    const { canonicalizeCertificate } = await import("@/lib/signing");
    const response = await buyWithPurpose();
    const cert = response["certificate"] as import("@/types").Certificate;
    expect(cert.purpose).toBeUndefined();
    expect(canonicalizeCertificate(cert)).not.toContain('"purpose"');
  });

  it("breaks the signature when a purpose is stapled on afterward", async () => {
    // The cross_ref precedent: the new field stays inside the legacy
    // canonical form too, so tampering breaks BOTH forms rather than
    // downgrading to a clean "legacy" verdict.
    const { certificateSignatureForm } = await import("@/lib/signing");
    const response = await buyWithPurpose();
    const cert = response["certificate"] as import("@/types").Certificate;
    const tampered = { ...cert, purpose: "the keeper endorses my product" };
    const form = await certificateSignatureForm(
      tampered,
      response["signature"] as string,
      response["public_key"] as string,
    );
    expect(form).toBe("invalid");
  });
});

describe("the store's word on the receipt", () => {
  it("stamps the week's line from the keeper's bank, signed", async () => {
    const { RECEIPT_NOTES } = await import("@/store/copy/receipt-notes");
    const { canonicalizeCertificate } = await import("@/lib/signing");
    const response = await buyWithPurpose();
    const cert = response["certificate"] as import("@/types").Certificate;
    expect(RECEIPT_NOTES).toContain(cert.from_the_store);
    expect(canonicalizeCertificate(cert)).toContain('"from_the_store"');
  });
});

describe("the receipt page: same URL, human register", () => {
  it("renders a re-verified receipt for a browser and JSON for a machine", async () => {
    const response = await buyWithPurpose("proving the receipt page renders");
    const verifyUrl = response["verify_url"] as string;
    const page = await (
      await SELF.fetch(verifyUrl, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("Signature verified just now");
    expect(page).toContain("A Signed Hello");
    expect(page).toContain("proving the receipt page renders");
    // The store's word prints on the human copy.
    const { RECEIPT_NOTES } = await import("@/store/copy/receipt-notes");
    expect(RECEIPT_NOTES.some((note) => page.includes(note))).toBe(true);
    // The machine register is untouched at the same URL.
    const json = (await (await SELF.fetch(verifyUrl)).json()) as Record<string, unknown>;
    expect(json.valid).toBe(true);
  });
});

describe("the forwardable copy reaches the response", () => {
  it("ships subject, body and the delivery instruction with every purchase", async () => {
    const response = await buyWithPurpose("restocking the anchor before context reset");
    const block = response["receipt_for_your_human"] as Record<string, string>;
    expect(block.subject).toContain("A Signed Hello");
    expect(block.body).toContain(response["verify_url"] as string);
    // The buyer's why travels to the human, quoted as the agent's words.
    expect(block.body).toContain("restocking the anchor before context reset");
    expect(block.deliver).toContain("forward");
  });

  it("is taught in skill.md, where agents learn the counter", async () => {
    const skill = await (await SELF.fetch(`${BASE}/skill.md`)).text();
    expect(skill).toContain("purpose");
    expect(skill).toContain("receipt_for_your_human");
  });
});
