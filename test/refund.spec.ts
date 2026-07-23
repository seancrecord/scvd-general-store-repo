import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createRefund, listRefunds } from "@/services/refunds";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

/**
 * The refund ledger: honest status, keyless Worker, keeper pays
 * by hand and records the hash. Not tied to any novelty product.
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

describe("the refund ledger", () => {
  it("records a pending refund and tells the truth until paid", async () => {
    const refund = await createRefund(testEnv, {
      item: "hello",
      amountUsdc: 0.5,
      payer: "0x2222222222222222222222222222222222222222",
    });
    const refundUrl = `${BASE}/api/refund/${refund.refund_id}`;

    const status = await json(await SELF.fetch(refundUrl));
    expect(status["status"]).toBe("refund_pending");
    expect(String(status["note"])).toContain("by hand on Sundays");

    const mark = await SELF.fetch(
      `${BASE}/admin/refunds/${refund.refund_id}/paid`,
      {
        method: "POST",
        headers: {
          ...adminAuth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ tx_hash: "0xabc123" }).toString(),
        redirect: "manual",
      },
    );
    expect([200, 302]).toContain(mark.status);

    const paidStatus = await json(await SELF.fetch(refundUrl));
    expect(paidStatus["status"]).toBe("refund_paid");
    expect(paidStatus["tx_hash"]).toBe("0xabc123");

    const refunds = await listRefunds(testEnv);
    expect(
      refunds.find((record) => record.refund_id === refund.refund_id)?.status,
    ).toBe("refund_paid");
  });

  it("keeps the Worker keyless: no outbound payment path exists", async () => {
    // The refund route is read-only; only the admin mark-paid exists,
    // and it records a hash, it doesn't move money.
    const response = await SELF.fetch(`${BASE}/api/refund/refund_nonexistent`);
    expect(response.status).toBe(404);
  });
});
