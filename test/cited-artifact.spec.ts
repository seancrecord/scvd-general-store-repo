import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { pendingPaymentStub } from "./helpers/payment";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { CITED_ARTIFACT_MAX_LENGTH, CITED_ARTIFACT_PATTERN, buyInputSchema } from "@/lib/bazaar-discovery";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";
const testEnv = env as never as import("@/types").Env;

/**
 * THE CITED ARTIFACT (2026-10-01): a buyer may name, on any purchase,
 * one artifact that lives outside this store — the approval or intent
 * receipt its own runtime signed — as `<format>:<reference>`. It rides
 * the certificate SIGNED under the same law as purpose, is shape-checked
 * before money moves, and is never fetched, verified or resolved here.
 * These pin the link, the refusal, the escape on the human page, and —
 * per the cross_ref lesson — that a citation stapled onto a signed
 * certificate breaks the signature instead of downgrading to legacy.
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

const CITED = "dsse:art_e415901189dc1613";

async function buy(citedArtifact?: string) {
  const { fulfillPurchase } = await import("@/services/fulfillment");
  const payment = pendingPaymentStub({ paidUsdc: 0.5 }) as unknown as Parameters<
    typeof fulfillPurchase
  >[2];
  return fulfillPurchase(testEnv, ITEM, payment, citedArtifact ? { citedArtifact } : {});
}

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

describe("the cited artifact rides the certificate, signed", () => {
  it("records the line verbatim inside the signature, on any item", async () => {
    const { canonicalizeCertificate } = await import("@/lib/signing");
    const response = await buy(CITED);
    const cert = response["certificate"] as import("@/types").Certificate;
    expect(cert.cited_artifact).toBe(CITED);
    expect(canonicalizeCertificate(cert)).toContain(`"cited_artifact":"${CITED}"`);
    expect(response["signed_payload"]).toContain(`"cited_artifact":"${CITED}"`);
  });

  it("omits the key entirely when nothing was cited", async () => {
    const { canonicalizeCertificate } = await import("@/lib/signing");
    const response = await buy();
    const cert = response["certificate"] as import("@/types").Certificate;
    expect(cert.cited_artifact).toBeUndefined();
    expect(canonicalizeCertificate(cert)).not.toContain('"cited_artifact"');
  });

  it("breaks the signature when a citation is stapled on afterward — both forms, never a clean legacy", async () => {
    const { certificateSignatureForm } = await import("@/lib/signing");
    const response = await buy();
    const cert = response["certificate"] as import("@/types").Certificate;
    const tampered = { ...cert, cited_artifact: "dsse:art_the_keeper_approved_this" };
    const form = await certificateSignatureForm(
      tampered,
      response["signature"] as string,
      response["public_key"] as string,
    );
    expect(form).toBe("invalid");
  });

  it("is carried by the replay kit beside purpose and mandate_id", async () => {
    const response = await buy(CITED);
    const cert = response["certificate"] as import("@/types").Certificate;
    const kit = (await (
      await SELF.fetch(`${BASE}/api/replay/${cert.cert_id}`, { headers: { Accept: "application/json" } })
    ).json()) as { call: { cited_artifact?: string } };
    expect(kit.call.cited_artifact).toBe(CITED);
  });
});

describe("the buy door checks the shape before money moves, and nothing else", () => {
  it("is declared on every item's input schema with the one pattern the door enforces", () => {
    for (const item of MENU_ITEMS) {
      const property = (buyInputSchema(item).properties as Record<string, { maxLength?: number; pattern?: string }>)["cited_artifact"];
      expect(property, `${item.id} does not declare cited_artifact`).toBeTruthy();
      expect(property!.maxLength).toBe(CITED_ARTIFACT_MAX_LENGTH);
      expect(property!.pattern).toBe(CITED_ARTIFACT_PATTERN.source);
    }
  });

  it("is left off the compact item contract like the disclosure block, and stays on the full schema", async () => {
    // The compact view lives under a byte guard the one inlined copy
    // tripped on the largest item; a reader of that view learns the
    // field at the quote, the shelf and the contract, where it is filled.
    const compact = (await (await SELF.fetch(`${BASE}/menu/hello?view=compact`)).json()) as {
      input_schema: { properties: Record<string, unknown> };
    };
    expect(compact.input_schema.properties["cited_artifact"]).toBeUndefined();
    expect(compact.input_schema.properties["purpose"]).toBeTruthy();
    expect(buyInputSchema(MENU_ITEMS.find((item) => item.id === "hello")!).properties["cited_artifact"]).toBeTruthy();
  });

  it("refuses a malformed citation with 400 and names the field, before any 402 is issued", async () => {
    for (const bad of ["no-colon", "has space:art_1", ":art_1", "DSSE:art_1", "dsse:", "dsse:art 1", "dsse:art\u0000", "x".repeat(CITED_ARTIFACT_MAX_LENGTH + 1)]) {
      const response = await SELF.fetch(
        `${BASE}/api/buy/hello?cited_artifact=${encodeURIComponent(bad)}`,
        { headers: { Accept: "application/json" } },
      );
      expect(response.status, bad).toBe(400);
      const body = (await response.json()) as { code: string; input_field: string; charged: boolean };
      expect(body.code).toBe("bad_request");
      expect(body.input_field).toBe("cited_artifact");
      expect(body.charged).toBe(false);
    }
  });

  it("quotes a well-formed citation without fetching, resolving or judging it", async () => {
    for (const good of [CITED, "jws:sha256:3ab4b78a04308", "in-toto.v1:art_1", `dsse:${"a".repeat(128)}`]) {
      const response = await SELF.fetch(
        `${BASE}/api/buy/hello?cited_artifact=${encodeURIComponent(good)}`,
        { headers: { Accept: "application/json" } },
      );
      expect(response.status, good).toBe(402);
    }
  });
});

describe("the receipt page", () => {
  it("prints the citation escaped, with the store's limit beside it", async () => {
    const hostile = "dsse:<script>alert(1)</script>";
    expect(CITED_ARTIFACT_PATTERN.test(hostile)).toBe(true); // printable ASCII passes the door; escaping is the defence.
    const response = await buy(hostile);
    const page = await (
      await SELF.fetch(response["verify_url"] as string, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("Cited artifact from your agent");
    expect(page).toContain("dsse:&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page).not.toContain("<script>alert(1)");
    expect(page).toContain("never fetched or verified it");
  });

  it("tells the human, in receipt_for_your_human, whose job checking it is", async () => {
    const response = await buy(CITED);
    const forHuman = response["receipt_for_your_human"] as { body: string };
    expect(forHuman.body).toContain(CITED);
    expect(forHuman.body).toContain("your runtime's verifier's job");
  });
});
