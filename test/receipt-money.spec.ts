import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  installFacilitatorMock,
  TEST_PAYER,
  TEST_TRANSACTION,
} from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import {
  canonicalizeCertificate,
  fieldsOutsideLegacySignature,
} from "@/lib/signing";
import { BASE_NETWORK } from "@/lib/payments";
import type { Certificate } from "@/types";

const BASE = "https://scvd.store";

/**
 * A RECEIPT THAT DOES NOT SAY HOW MUCH WAS PAID.
 *
 * Found by a named counterparty (causeclaw, m/agents) answering the
 * receipt-treaty question with a conformance list instead of a yes.
 * Their list wanted issuer key, buyer id, action type, amount, asset,
 * network, timestamp, artifact hash and a status path. This store had
 * four of nine, and the missing ones were the money: `tip_usdc`
 * recorded only the amount ABOVE the minimum, so a certificate proved
 * we issued it, for that item, on that date, and was silent on what
 * changed hands.
 *
 * Second time in a week an outsider found something the whole test
 * suite could not, and both times it cost nothing but the reading.
 */
describe("the receipt says what was paid", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("binds the amount, asset, network, payer and chain transaction", async () => {
    const cert: Certificate = {
      cert_id: "cert_test",
      item: "hello",
      patron_number: 1,
      date: "2026-07-31T00:00:00.000Z",
      paid_usdc: 0.5,
      asset: "USDC",
      network: BASE_NETWORK,
      payer: "0xabc",
      settlement_tx: "0xdef",
    };
    // INSIDE the canonical form. An amount displayed but unsigned is
    // an amount anybody who can edit the record can change without
    // breaking the signature — the exact defect found on `attests`,
    // and worse here, because this one is the money.
    const signed = canonicalizeCertificate(cert);
    for (const field of [
      '"paid_usdc":0.5',
      '"asset":"USDC"',
      `"network":"${BASE_NETWORK}"`,
      '"payer":"0xabc"',
      '"settlement_tx":"0xdef"',
    ]) {
      expect(signed, `${field} is not covered by the signature`).toContain(
        field,
      );
    }
  });

  it("names the money as uncovered on a certificate too old to carry it", () => {
    // Certificates issued before 2026-07-31 were signed over a field
    // set without any of this. If one somehow served an amount, verify
    // has to say the signature does not cover it rather than report a
    // clean valid.
    const legacy: Certificate = {
      cert_id: "cert_old",
      item: "hello",
      patron_number: 1,
      date: "2026-07-25T00:00:00.000Z",
      paid_usdc: 0.5,
      payer: "0xabc",
    };
    const uncovered = fieldsOutsideLegacySignature(legacy);
    expect(uncovered).toContain("paid_usdc");
    expect(uncovered).toContain("payer");
  });

  it("reaches a real purchase, not just the canonical form", async () => {
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const accepted = decodePaymentRequired(challenge).accepts[0];
    if (!accepted) {
      throw new Error("no payment tier offered");
    }
    const response = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      certificate?: Certificate;
    };
    const cert = body.certificate;
    expect(cert?.paid_usdc, "a settled purchase minted a receipt with no amount").toBeGreaterThan(0);
    expect(cert?.asset).toBe("USDC");
    expect(cert?.network).toBe(BASE_NETWORK);
    // The two fields that make an outside operator's own final receipt
    // and ours the same fact checked twice, rather than two claims.
    expect(cert?.payer).toBe(TEST_PAYER);
    expect(cert?.settlement_tx).toBe(TEST_TRANSACTION);
  });

  it("leaves the money off an artifact where no money moved", () => {
    // A zero would claim nothing was paid; an absence claims this was
    // never a purchase. The free shelf is the second one, and stating
    // it as a zero would be the same species of wrong as a rate
    // rounding to zero beside a settled sale.
    const free: Certificate = {
      cert_id: "cert_free",
      item: "hello",
      patron_number: 2,
      date: "2026-07-31T00:00:00.000Z",
    };
    const signed = canonicalizeCertificate(free);
    expect(signed).not.toContain("paid_usdc");
    expect(signed).not.toContain('"asset"');
  });
});
