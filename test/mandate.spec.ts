import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { certificateSignatureForm } from "@/lib/signing";
import type { Certificate, Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

async function buy(
  path: string,
): Promise<Record<string, any>> {
  const challenge = await SELF.fetch(`${BASE}${path}`);
  expect(challenge.status).toBe(402);
  const headerName = [...challenge.headers.keys()].find(
    (name) => name.toLowerCase() === "payment-required",
  )!;
  const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
    accepts: Array<Record<string, unknown>>;
  };
  const paid = await SELF.fetch(`${BASE}${path}`, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never),
    },
  });
  expect(paid.status).toBe(200);
  return (await paid.json()) as Record<string, any>;
}

describe("the mandate — recorded before the acting", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("sits on the shelf: mandate text required, the register stated", async () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "the_mandate");
    expect(item?.fulfillment).toBe("instant");
    expect(item?.description).toContain("proves the claim was MADE");
    expect(JSON.stringify(item?.constraints)).toContain(
      "chain-of-custody, not truth-of-intent",
    );
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("mandate");
  });

  it("refuses empty text, bad roles, bad caps and bad expiries before money", async () => {
    const empty = await SELF.fetch(`${BASE}/api/buy/the_mandate`, {
      headers: buying,
    });
    expect(empty.status).toBe(400);
    const role = await SELF.fetch(
      `${BASE}/api/buy/the_mandate?mandate=do+things&submitted_as=overlord`,
      { headers: buying },
    );
    expect(role.status).toBe(400);
    const cap = await SELF.fetch(
      `${BASE}/api/buy/the_mandate?mandate=do+things&declared_cap_usdc=-5`,
      { headers: buying },
    );
    expect(cap.status).toBe(400);
    const expiry = await SELF.fetch(
      `${BASE}/api/buy/the_mandate?mandate=do+things&expires_at=someday`,
      { headers: buying },
    );
    expect(expiry.status).toBe(400);
  });

  it("records, signs, binds and serves the mandate — with its limits on it", async () => {
    const body = await buy(
      `/api/buy/the_mandate?mandate=${encodeURIComponent(
        "Buy verification artifacts as needed, max $5 per item.",
      )}&submitted_as=agent&declared_cap_usdc=10&expires_at=2027-01-01T00:00:00Z`,
    );
    expect(body.mandate_id).toMatch(/^m_/);
    expect(body.mandate.mandate_text).toBe(
      "Buy verification artifacts as needed, max $5 per item.",
    );
    expect(body.mandate.submitted_as).toBe("agent");
    expect(body.mandate.declared_cap_usdc).toBe(10);
    expect(body.mandate.signature).toMatch(/^[0-9a-f]{128}$/);
    // The register travels on the artifact itself.
    expect(body.mandate.scope).toContain("Chain-of-custody, not truth-of-intent");
    expect(body.mandate.scope).toContain("enforces nothing");

    // The certificate's attests field IS the record's evidence hash.
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)
    ).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);
    expect(verify.certificate.attests).toBe(body.mandate.evidence_hash);

    // Served free forever, honest limits printed on the envelope too.
    const served = (await (
      await SELF.fetch(`${BASE}${body.mandate_url}`)
    ).json()) as Record<string, any>;
    expect(served.mandate.evidence_hash).toBe(body.mandate.evidence_hash);
    expect(served.what_this_is).toContain("not truth-of-intent");
  });

  it("a later purchase citing the mandate carries it SIGNED on the certificate", async () => {
    const minted = await buy(
      `/api/buy/the_mandate?mandate=${encodeURIComponent("Say hello for me.")}`,
    );
    const mandateId = minted.mandate_id as string;

    const hello = await buy(
      `/api/buy/hello?mandate_id=${mandateId}&purpose=${encodeURIComponent("house test of the mandate link")}`,
    );
    const cert = hello.certificate as Certificate;
    expect(cert.mandate_id).toBe(mandateId);

    // Signed, not decorative: verify passes as-is…
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`)
    ).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);

    // …and stapling a different mandate onto the cert breaks the
    // signature in BOTH forms — the cross_ref lesson, applied.
    const tampered = { ...cert, mandate_id: "m_forgedforged" };
    expect(
      await certificateSignatureForm(
        tampered as Certificate,
        hello.signature as string,
        hello.public_key as string,
      ),
    ).toBe("invalid");

    // The human-shaped surfaces carry the link too.
    expect(String(hello.receipt_for_your_human.body)).toContain(
      `/api/mandate/${mandateId}`,
    );
    const page = await (
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("Acting under recorded mandate");
    expect(page).toContain(mandateId);
  });

  it("refuses a citation it cannot resolve, before money", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/hello?mandate_id=m_neverminted`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("cannot ride a certificate");
    expect(body.error).toContain("/api/buy/the_mandate");
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/the_mandate`);
    expect(response.status).toBe(402);
  });
});
