import { SELF, env } from "cloudflare:test";
import { pendingProofBytes } from "./helpers/ots";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  createPatronAnchor,
  getPatronAnchor,
  sweepPatronAnchors,
} from "@/services/patron-anchors";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

const DIGEST = "ab".repeat(32);

/** Calendars that answer locally: no network, no flake. */
const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () =>
    new Response(pendingProofBytes())) as unknown as typeof fetch,
};
const deadCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => {
    throw new Error("calendar unreachable");
  }) as unknown as typeof fetch,
};

/**
 * THE BITCOIN ANCHOR — marketplace item two: the store's own anchoring
 * machinery, sold as the bounded observation it is. What is testable:
 * free refusals before money, the certificate binding the digest, the
 * proof surviving a calendar outage, and the sweep finishing delivery
 * without ever becoming monitoring.
 */
describe("a bitcoin anchor", () => {
  it("sits on the cheap door with digest as its one required input", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "bitcoin_anchor");
    expect(item?.price_usdc).toBe(1);
    expect(item?.fulfillment).toBe("instant");
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("digest");
    expect(schema.required).not.toContain("label");
  });

  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses a missing digest before any money is asked for", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/bitcoin_anchor`, {
      headers: buying,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    // The refusal states the design line: we never see the bytes.
    expect(body.error).toContain("never see your bytes");
  });

  it("refuses a malformed digest plainly", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/bitcoin_anchor?digest=0x${DIGEST}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("no 0x prefix");
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/bitcoin_anchor`);
    expect(response.status).toBe(402);
  });

  it("delivers a certificate binding the digest and a living proof URL, paid", async () => {
    const challenge = await SELF.fetch(
      `${BASE}/api/buy/bitcoin_anchor?digest=${DIGEST}&label=key-log-v3`,
    );
    expect(challenge.status).toBe(402);
    const headerName = [...challenge.headers.keys()].find(
      (name) => name.toLowerCase() === "payment-required",
    )!;
    const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
      accepts: Array<Record<string, unknown>>;
    };
    const paid = await SELF.fetch(
      `${BASE}/api/buy/bitcoin_anchor?digest=${DIGEST}&label=key-log-v3`,
      {
        headers: {
          "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never),
        },
      },
    );
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    expect(body.digest).toBe(DIGEST);
    expect(body.anchor_id).toMatch(/^banchor_/);
    expect(body.proof_url).toBe(`/api/bitcoin-anchor/${body.anchor_id}`);

    // The certificate's attests field IS the buyer's digest: the
    // store's dated word, on the endpoint that already existed.
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)
    ).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);
    expect(verify.certificate.attests).toBe(DIGEST);

    // The proof URL serves the record with its label honestly framed.
    const proof = (await (
      await SELF.fetch(`${BASE}${body.proof_url}`)
    ).json()) as Record<string, any>;
    expect(proof.digest).toBe(DIGEST);
    expect(proof.label).toBe("key-log-v3");
    expect(proof.label_note).toContain("never instructions");
    expect(proof.how_to_verify.join(" ")).toContain("ots verify");
  });
});

describe("the anchor's delivery survives the calendars", () => {
  it("keeps the record when every calendar is down, then the sweep finishes the job", async () => {
    const record = await createPatronAnchor(
      testEnv,
      { digest: DIGEST, certId: "cert_test" },
      deadCalendar,
    );
    expect(record.ots.status).toBe("failed");
    // The purchase is complete: record stored, digest bound, state named.
    const stored = await getPatronAnchor(testEnv, record.anchor_id);
    expect(stored?.ots.status).toBe("failed");

    // Next hour: the calendars are back, the sweep resubmits.
    const sweep = await sweepPatronAnchors(testEnv, okCalendar);
    expect(sweep.resubmitted).toBeGreaterThanOrEqual(1);
    const after = await getPatronAnchor(testEnv, record.anchor_id);
    expect(after?.ots.status).toBe("pending");
  });

  it("upgrades a pending proof when the calendar confirms, and stops", async () => {
    const record = await createPatronAnchor(
      testEnv,
      { digest: "cd".repeat(32), certId: "cert_test2" },
      okCalendar,
    );
    expect(record.ots.status).toBe("pending");
    const sweep = await sweepPatronAnchors(testEnv, okCalendar);
    expect(sweep.upgraded).toBeGreaterThanOrEqual(1);
    const after = await getPatronAnchor(testEnv, record.anchor_id);
    expect(after?.ots.status).toBe("complete");
    expect(after?.ots.proof_base64).toBeTruthy();

    // Terminal means terminal: a second sweep touches nothing — the
    // line that keeps this delivery, never monitoring.
    const again = await sweepPatronAnchors(testEnv, okCalendar);
    expect(again.upgraded).toBe(0);
    expect(again.resubmitted).toBe(0);
  });
});
