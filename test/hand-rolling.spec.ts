import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { HAND_ROLLING } from "@/store/hand-rolling";
import {
  type FacilitatorMockState,
  installFacilitatorMock,
} from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

let facilitator: FacilitatorMockState;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

/**
 * THE DOMAIN TRAP.
 *
 * On 2026-07-28 the only outside client ever to present a payment
 * signature here presented three, all on the half-cent practice item,
 * and every one failed at VERIFY. The likeliest cause is the one that
 * catches nearly every hand-rolled x402 client on Base: the EIP-712
 * domain name is "USD Coin" on mainnet and "USDC" on Sepolia. Build
 * against the testnet, point at mainnet, and every signature you make
 * is invalid everywhere, silently.
 *
 * It cannot be accepted by us or anyone — the verifyingContract is the
 * USDC contract, which checks its own immutable DOMAIN_SEPARATOR, so a
 * wrong-domain authorization reverts on chain. Saying so IS the fix,
 * which makes this prose load-bearing and therefore testable.
 */
describe("the hand-rolling notes", () => {
  it("publishes the mainnet domain the store actually advertises", async () => {
    // The strongest assertion available: the values we print must equal
    // the values riding in the live challenge. If a network ever moves,
    // the prose cannot drift away from the wire without this failing.
    const response = await SELF.fetch(
      "https://scvd.store/api/buy/small_blessing",
    );
    expect(response.status).toBe(402);
    const challenge = decodePaymentRequired(response);
    const accepted = challenge.accepts[0];
    expect(accepted).toBeTruthy();
    const extra = (accepted?.extra ?? {}) as Record<string, unknown>;

    expect(extra.name).toBe(HAND_ROLLING.eip712.name);
    expect(extra.version).toBe(HAND_ROLLING.eip712.version);
    expect(accepted?.network).toBe(HAND_ROLLING.eip712.chain);
    expect(accepted?.asset?.toLowerCase()).toBe(
      HAND_ROLLING.eip712.verifying_contract.toLowerCase(),
    );
  });

  it("names both domains, because the trap is the difference between them", () => {
    expect(HAND_ROLLING.domain_warning).toContain('"USD Coin"');
    expect(HAND_ROLLING.domain_warning).toContain('"USDC"');
    // And says why nobody can just accept the wrong one.
    expect(HAND_ROLLING.domain_warning).toContain("reverts on chain");
  });

  it("hangs the notes on /try, for both readers", async () => {
    const html = await SELF.fetch("https://scvd.store/try", {
      headers: { Accept: "text/html" },
    });
    const page = await html.text();
    expect(page).toContain("USD Coin");
    expect(page).toContain("hand-rolling the client");
    // The anchor the 402 points at has to exist, or the pointer lies.
    expect(page).toContain('id="hand-rolling"');

    const json = await SELF.fetch("https://scvd.store/try");
    const body = (await json.json()) as Record<string, unknown>;
    const notes = body.hand_rolling as typeof HAND_ROLLING;
    expect(notes.eip712.name).toBe("USD Coin");
    expect(notes.eip712.chain_id).toBe(8453);
  });

  it("points at the notes from an ordinary 402 without carrying them", async () => {
    // Every 402 is a client-builder's most likely first contact, but
    // the common path stays light: a URL, not an essay.
    const response = await SELF.fetch("https://scvd.store/api/buy/hello");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.hand_rolling_url).toBe("https://scvd.store/try#hand-rolling");
    expect(body.hand_rolling).toBeUndefined();
  });

  it("carries the whole block when a signature is actually declined", async () => {
    // The one moment it earns its weight: somebody signed, it didn't
    // clear, and they are looking at our response for a reason why.
    facilitator.verifyShouldFail = true;
    try {
      const first = await SELF.fetch("https://scvd.store/api/buy/hello");
      const accepted = decodePaymentRequired(first).accepts[0];
      expect(accepted).toBeTruthy();
      const declined = await SELF.fetch("https://scvd.store/api/buy/hello", {
        headers: {
          "PAYMENT-SIGNATURE": buildPaymentSignature(
            accepted as NonNullable<typeof accepted>,
          ),
        },
      });
      expect(declined.status).toBe(402);
      const body = (await declined.json()) as Record<string, unknown>;
      expect(body.payment_declined).toBeTruthy();
      const notes = body.hand_rolling as typeof HAND_ROLLING | undefined;
      expect(notes?.eip712.name).toBe("USD Coin");
      expect(notes?.domain_warning).toContain("SEPOLIA");
    } finally {
      facilitator.verifyShouldFail = false;
    }
  });

  it("states the limit it cannot pass: we can't see why YOUR signature failed", () => {
    // Rule: say what a thing is NOT. Verification happens at the
    // facilitator and on chain; a failed verify tells us only that.
    expect(HAND_ROLLING.honest_limit).toContain("cannot tell you");
  });
});
