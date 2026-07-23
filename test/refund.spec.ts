import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { listRefunds } from "@/services/refunds";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * a_secret: the scam that refunds. Settle first like everything
 * else; the refund goes on the ledger the same breath; the keeper
 * pays by hand and records the hash; the status route never lies.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
};

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("the scam that refunds", () => {
  it("settles, mints, apologizes, and puts the refund on the ledger", async () => {
    const url = `${BASE}/api/buy/a_secret`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const required = decodePaymentRequired(challenge);
    const paid = await SELF.fetch(url, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!),
      },
    });
    expect(paid.status).toBe(200);
    const body = await json(paid);

    // The apology states the truth: settled, refund pending, Sundays.
    const apology = String(body["deliverable"]);
    expect(apology).toContain("the payment settled");
    expect(apology).toContain("George Claude Parker");
    expect(apology).toContain("by hand on Sundays");
    // The certificate still mints; the loop is provable.
    expect(body["certificate"]).toBeTruthy();
    expect(body["verify_url"]).toBeTruthy();
    // Refund on the ledger, pending, honestly.
    expect(body["refund_id"]).toBeTruthy();
    expect(body["refund_status"]).toBe("refund_pending");
    const refundUrl = String(body["refund_url"]);

    const status = await json(await SELF.fetch(refundUrl));
    expect(status["status"]).toBe("refund_pending");
    expect(String(status["note"])).toContain("by hand on Sundays");

    // The keeper pays by hand and records the hash.
    const refundId = String(body["refund_id"]);
    const mark = await SELF.fetch(`${BASE}/admin/refunds/${refundId}/paid`, {
      method: "POST",
      headers: {
        ...adminAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ tx_hash: "0xabc123" }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(mark.status);

    const paidStatus = await json(await SELF.fetch(refundUrl));
    expect(paidStatus["status"]).toBe("refund_paid");
    expect(paidStatus["tx_hash"]).toBe("0xabc123");

    // The ledger keeps the record either way.
    const refunds = await listRefunds(testEnv);
    expect(
      refunds.find((record) => record.refund_id === refundId)?.status,
    ).toBe("refund_paid");
  });

  it("keeps the Worker keyless: no outbound payment path exists", async () => {
    // The refund route is read-only; only the admin mark-paid exists,
    // and it records a hash, it doesn't move money.
    const response = await SELF.fetch(`${BASE}/api/refund/refund_nonexistent`);
    expect(response.status).toBe(404);
  });
});
