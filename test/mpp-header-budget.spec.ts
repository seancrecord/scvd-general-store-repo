import { beforeAll, expect, it, vi } from "vitest";
import { Challenge } from "mppx";
import { installBuyerHarness, request, testEnv } from "./helpers/buyer-harness";
import { checkoutNetworks } from "@/lib/payment-networks";
import { PWID_TIER_MULTIPLIERS } from "@/lib/payments";

// A separate isolate: the payment stack snapshots enabled rails on its first quote.
testEnv.ARBITRUM_PAY_TO = testEnv.PAY_TO_ADDRESS;
testEnv.WORLD_PAY_TO = testEnv.PAY_TO_ADDRESS;
installBuyerHarness();
beforeAll(() => {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const response = await inner(input, init);
    if (!url.endsWith("/x402/supported")) return response;
    const supported = await response.json<{ kinds: { network: string; x402Version: number; scheme: string }[] }>();
    for (const { network } of checkoutNetworks(testEnv)) {
      if (!supported.kinds.some(kind => kind.network === network)) supported.kinds.push({ network, x402Version: 2, scheme: "exact" });
    }
    return Response.json(supported);
  });
});

it("fits every configured checkout rail and native tier below the stock Node header limit", async () => {
  testEnv.MPP_CHECKOUT_ENABLED = "true";
  testEnv.MPP_CHALLENGE_KEY = "fixture-native-checkout-hmac-key";
  const response = await request("/api/buy/graffiti_on_a_train?tag=fixture");
  expect(response.status).toBe(402);
  const paymentRequired = JSON.parse(atob(response.headers.get("PAYMENT-REQUIRED")!)) as { accepts: unknown[] };
  expect(paymentRequired.accepts).toHaveLength(checkoutNetworks(testEnv).length * PWID_TIER_MULTIPLIERS.length);
  expect(Challenge.fromResponseList(response)).toHaveLength(PWID_TIER_MULTIPLIERS.length);
  let bytes = `HTTP/1.1 ${response.status} ${response.statusText}\r\n`.length + 2;
  response.headers.forEach((value, name) => { bytes += `${name}: ${value}\r\n`.length; });
  // Existing safety margin below Node's 16,384-byte limit; do not move the limit to fit the SDK.
  expect(bytes).toBeLessThan(15_360);
});
