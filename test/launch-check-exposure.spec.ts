import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  MAX_AUTHORIZATION_SECONDS,
  fieldSignerFromKey,
  performLaunchCheck,
} from "@/services/launch-check";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const TARGET = "https://seller.example/paid";
const SELLER_PAY_TO = "0x1111111111111111111111111111111111111111";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const clearScreen = async () => ({ listed: false as const, source: "test screen" });

/**
 * ROADMAP 0.6 / LEDGER I2 — LIVE MONEY EXPOSURE ON THE PAID WALK.
 *
 * Everything else in this phase is a false sentence. This one is the
 * field wallet.
 *
 * The authorization this store signs sets
 * `validBefore = now + the SELLER'S maxTimeoutSeconds`, uncapped. The
 * seller writes that number. A door asking for 10 years got a signed,
 * submittable EIP-3009 authorization against our wallet good for ten
 * years — and the store then walked away, because from our side the
 * check was over.
 *
 * WORSE, WE SIGNED A CLAIM ABOUT IT. On `payment_refused` and on a
 * late `unreachable`, the report signs `paid_usd: 0` immediately,
 * while that authorization is still live and submittable. A signed
 * money claim that can become false minutes later is the one thing an
 * evidence store cannot ship. The unreachable branch's own prose —
 * "no funds can have moved after the window" — was true only by the
 * accident that the window was usually short.
 *
 * The clamp is the fix. `authorization_outstanding_until` in the
 * signed bytes is the honesty: while the window is open we say so,
 * rather than asserting a zero we cannot yet know.
 */
function hostileSeller(opts: { maxTimeoutSeconds: number; refuse?: boolean }) {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payment = new Headers(init?.headers).get("PAYMENT-SIGNATURE");
    const challenge = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "5000",
          asset: USDC_BASE,
          payTo: SELLER_PAY_TO,
          maxTimeoutSeconds: opts.maxTimeoutSeconds,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    };
    if (!payment) {
      return new Response("{}", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
      });
    }
    // Presented, and refused — the branch that signs paid_usd: 0 while
    // the authorization it just handed over is still submittable.
    return new Response(JSON.stringify({ error: "no" }), { status: 402 });
  }) as unknown as typeof fetch;
}

describe("the authorization window is ours to bound, not the seller's", () => {
  it("clamps a hostile maxTimeoutSeconds to the house ceiling", async () => {
    const TEN_YEARS = 315_360_000;
    const before = Math.floor(Date.now() / 1000);
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: hostileSeller({ maxTimeoutSeconds: TEN_YEARS }),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });

    const outstanding = check.authorization_outstanding_until;
    expect(outstanding).not.toBeNull();
    // The seller asked for a decade. It gets the house ceiling.
    expect(outstanding! - before).toBeLessThanOrEqual(
      MAX_AUTHORIZATION_SECONDS + 5,
    );
    expect(outstanding! - before).toBeGreaterThan(0);
  });

  it("never signs paid_usd: 0 without saying the authorization is still open", async () => {
    /*
     * The layer-6 failure. A refused presentation means no goods
     * arrived — it does NOT mean no money can move, because the
     * signed authorization is out there until validBefore. Reporting
     * a bare zero is a claim we cannot support until the window shuts.
     */
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: hostileSeller({ maxTimeoutSeconds: 600, refuse: true }),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });

    expect(check.paid_usd).toBe(0);
    // ...and the zero travels with its own expiry, inside the signed bytes.
    expect(check.authorization_outstanding_until).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
    expect(check.signature_covers).toContain("authorization_outstanding_until");
  });

  it("reports no outstanding window when nothing was ever presented", async () => {
    // A door that never got an authorization cannot have one open.
    const noDoor = (async () =>
      new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: noDoor,
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.authorization_outstanding_until).toBeNull();
  });
});


/**
 * LEDGER I3 — WHAT THE PAID KNOCK REFUSES TO DO.
 *
 * All three knocks used bare fetch: redirects followed, no timeout,
 * no size cap. The redirect is the sharp one, because
 * `redirect: "follow"` carries the PAYMENT-SIGNATURE header wherever
 * the seller points. A door could bounce this store's signed
 * authorization to a host it does not control and we never agreed to
 * pay — and the walk would have gone along with it, silently.
 */
function redirectingSeller(location: string) {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payment = new Headers(init?.headers).get("PAYMENT-SIGNATURE");
    if (!payment) {
      return new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:8453",
                  amount: "5000",
                  asset: USDC_BASE,
                  payTo: SELLER_PAY_TO,
                  maxTimeoutSeconds: 300,
                  extra: { name: "USD Coin", version: "2" },
                },
              ],
            }),
          ),
        },
      });
    }
    // Money in hand, and the door points somewhere else.
    return new Response(null, { status: 302, headers: { location } });
  }) as unknown as typeof fetch;
}

describe("a redirect on the paid knock is a finding, not a detour", () => {
  it("refuses to carry the payment header to wherever the seller points", async () => {
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: redirectingSeller("https://somebody-else.example/collect"),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });

    expect(check.verdict).toBe("payment_refused");
    const settle = check.stages.find((stage) => stage.stage === "settle")!;
    expect(settle.ok).toBe(false);
    // The finding names where it was pointed, so an operator reading
    // this can see what their own door did.
    expect(settle.detail).toContain("somebody-else.example");
    expect(settle.detail).toContain("does not follow");
    // Nothing was paid, and the window still travels with the zero.
    expect(check.paid_usd).toBe(0);
    expect(check.authorization_outstanding_until).toBeGreaterThan(0);
  });
});
