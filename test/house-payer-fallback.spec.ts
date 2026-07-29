import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
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
 * THE HOUSE FLAG SURVIVES A FACILITATOR THAT FORGETS THE PAYER.
 *
 * CV's first settled purchase, 2026-07-29, raised the right question:
 * did it book as house? The flag is decided by wallet address, so a
 * settle response with no `payer` field books ORGANIC — and an organic
 * settle is the single number this build is waiting on. A house wallet
 * quietly promoted to the store's first outside sale is false in the
 * exact direction rule 13 exists to prevent, and it would fill the
 * First Dollar frame permanently on the way past.
 *
 * The store has already recorded settles with no payer (the `nopayer`
 * counter exists because of them), so this is not hypothetical.
 */
describe("who paid, when the facilitator doesn't say", () => {
  async function buyAs(from: string): Promise<Response> {
    const first = await SELF.fetch("https://scvd.store/api/buy/hello");
    const accepted = decodePaymentRequired(first).accepts[0];
    const header = buildPaymentSignature(
      accepted as NonNullable<typeof accepted>,
    );
    // Rewrite the authorization's `from` to the wallet under test.
    const payload = JSON.parse(atob(header)) as {
      payload: { authorization: { from: string } };
    };
    payload.payload.authorization.from = from;
    return SELF.fetch("https://scvd.store/api/buy/hello", {
      headers: { "PAYMENT-SIGNATURE": btoa(JSON.stringify(payload)) },
    });
  }

  it("reads the payer off the signed authorization and keeps CV out of the organic column", async () => {
    // The facilitator returns no payer at all.
    facilitator.settleOmitsPayer = true;

    const before = await testEnv.COUNTERS.get(KV_KEYS.firstDollar);
    const response = await buyAs(CV_WALLET);
    expect(response.status).toBe(200);

    // The First Dollar frame fills once, with the first ORGANIC settle,
    // forever. A house wallet must never be the thing that fills it.
    const after = await testEnv.COUNTERS.get(KV_KEYS.firstDollar);
    expect(after, "a house wallet filled the First Dollar frame").toBe(before);
    facilitator.settleOmitsPayer = false;
  });

  it("still books a stranger's wallet as organic, which is the point of the column", async () => {
    facilitator.settleOmitsPayer = true;
    const response = await buyAs("0x0000000000000000000000000000000000000009");
    expect(response.status).toBe(200);
    // Something filled the frame; a stranger is exactly what should.
    expect(await testEnv.COUNTERS.get(KV_KEYS.firstDollar)).toBeTruthy();
    facilitator.settleOmitsPayer = false;
  });
});
