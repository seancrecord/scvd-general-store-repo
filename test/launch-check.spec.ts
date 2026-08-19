import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  FIELD_SPEND_CAP_USD,
  LAUNCH_CHECK_UA,
  fieldSignerFromKey,
  performLaunchCheck,
} from "@/services/launch-check";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const SHOP = "https://shop.example";
const TARGET = `${SHOP}/api/buy/thing`;

/** A throwaway, publicly-known dev key (hardhat account #1). It has
 * never held funds and never will; what it proves is that the REAL
 * viem signing path runs in workerd, not a stand-in. */
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SELLER_PAY_TO = "0x1111111111111111111111111111111111111111";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SELLER_TX =
  "0x" + "ab".repeat(32);

beforeAll(() => {
  installFacilitatorMock();
});

afterEach(() => {
  // The door-closed test depends on these being ABSENT; leave the env
  // the way every other suite expects to find it.
  delete (testEnv as unknown as Record<string, unknown>).FIELD_WALLET_KEY;
  delete (testEnv as unknown as Record<string, unknown>).SANCTIONS_API_KEY;
});

interface SellerLog {
  requests: Array<{ ua: string | null; payment: string | null }>;
}

/**
 * A fake seller with a real 402 door: unpaid knock gets the challenge,
 * paid knock gets its payment payload CHECKED — shape, recipient,
 * signature format — before the 200, because the property under test
 * is that we present what a conformant seller can accept.
 */
function fakeSeller(
  log: SellerLog,
  opts: {
    amount?: string;
    refuse?: boolean;
    challengeIn?: "header" | "body";
  } = {},
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const payment = headers.get("PAYMENT-SIGNATURE");
    log.requests.push({ ua: headers.get("User-Agent"), payment });
    const challenge = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: opts.amount ?? "5000",
          asset: USDC_BASE,
          payTo: SELLER_PAY_TO,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        },
      ],
    };
    if (!payment) {
      return new Response(
        opts.challengeIn === "body" ? JSON.stringify(challenge) : "{}",
        {
          status: 402,
          headers:
            opts.challengeIn === "body"
              ? { "content-type": "application/json" }
              : { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
        },
      );
    }
    const payload = JSON.parse(atob(payment)) as {
      x402Version: number;
      payload: { signature: string; authorization: Record<string, string> };
    };
    if (
      payload.x402Version !== 2 ||
      !/^0x[0-9a-f]{130}$/i.test(payload.payload.signature) ||
      payload.payload.authorization.to !== SELLER_PAY_TO ||
      payload.payload.authorization.value !== (opts.amount ?? "5000")
    ) {
      return new Response(JSON.stringify({ error: "bad payload" }), {
        status: 400,
      });
    }
    if (opts.refuse) {
      return new Response(JSON.stringify({ error: "declined" }), {
        status: 400,
      });
    }
    return new Response(JSON.stringify({ goods: "the thing" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "PAYMENT-RESPONSE": btoa(JSON.stringify({ transaction: SELLER_TX })),
      },
    });
  }) as typeof fetch;
}

const clearScreen = async () => ({ listed: false as const, source: "test screen" });

describe("the walk engine, stage by stage", () => {
  it("settles: real viem signature presented, receipt read, delivery recorded", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("settled");
    expect(check.paid_usd).toBe(0.005);
    expect(check.tx_hash).toBe(SELLER_TX);
    expect(check.pay_to).toBe(SELLER_PAY_TO);
    // The calling card was out on BOTH knocks — the walkabout's law.
    expect(log.requests).toHaveLength(2);
    for (const request of log.requests) {
      expect(request.ua).toBe(LAUNCH_CHECK_UA);
    }
    // The seller verified the payload before answering 200, so this
    // signature is one a conformant seller accepts — the live path.
    expect(log.requests[1]?.payment).toBeTruthy();
    const stageNames = check.stages.map((stage) => stage.stage);
    expect(stageNames).toEqual([
      "approach",
      "challenge",
      "terms",
      "screen",
      "payment",
      "settle",
      "delivery",
    ]);
    const delivery = check.stages.at(-1)!;
    expect(delivery.ok).toBe(true);
    expect(delivery.detail).toContain("sha256");
    expect(check.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(check.field_wallet).toBeTruthy();
  });

  it("reads a body-only challenge and names the header's absence as a finding", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log, { challengeIn: "body" }),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("settled");
    const challengeStage = check.stages.find((s) => s.stage === "challenge")!;
    expect(challengeStage.detail).toContain("header absent");
  });

  it("records a refusal as the seller's answer, money never counted", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log, { refuse: true }),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("payment_refused");
    expect(check.paid_usd).toBe(0);
    expect(check.stages.at(-1)?.detail).toContain("HTTP 400");
  });

  it("an open door gets a note, not a harvest", async () => {
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: (async () =>
        new Response("free goods", { status: 200 })) as typeof fetch,
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("no_payment_gate");
    expect(check.stages.at(-1)?.detail).toContain("a note, not a harvest");
  });

  it("a 402 nobody can sign is its own verdict", async () => {
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: (async () =>
        new Response("payment required", { status: 402 })) as typeof fetch,
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("malformed_challenge");
  });

  it("over the cap: unpaid by OUR rule, and the till is never knocked twice", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      // $1.00 — twenty times the cap.
      fetch: fakeSeller(log, { amount: "1000000" }),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("unpaid_by_rule");
    expect(check.paid_usd).toBe(0);
    expect(log.requests).toHaveLength(1);
    const rules = check.stages.find((s) => s.stage === "rules")!;
    expect(rules.detail).toContain(String(FIELD_SPEND_CAP_USD.toFixed(2)));
    expect(rules.detail).toContain("this store's rules");
  });

  it("a listed payTo is skipped with the skip recorded — rule 3", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: async () => ({ listed: true, source: "test screen" }),
    });
    expect(check.verdict).toBe("unpaid_by_rule");
    expect(log.requests).toHaveLength(1);
    expect(check.stages.find((s) => s.stage === "screen")?.detail).toContain(
      "withheld",
    );
  });

  it("a screen that does not answer fails CLOSED, never open", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: async () => ({ listed: null, source: "test screen (down)" }),
    });
    expect(check.verdict).toBe("unpaid_by_rule");
    expect(log.requests).toHaveLength(1);
    expect(check.stages.find((s) => s.stage === "screen")?.detail).toContain(
      "fails closed",
    );
  });

  it("with no wallet and no screen provisioned, the record still tells the truth", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log),
    });
    expect(check.verdict).toBe("unpaid_by_rule");
    expect(check.paid_usd).toBe(0);
    expect(check.field_wallet).toBeNull();
  });
});

describe("the launch check door", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("sits on the shelf: url required, no badge, the cap and the walkabout stated", async () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "launch_check");
    expect(item?.fulfillment).toBe("instant");
    expect(item?.description).toContain("Not a badge");
    expect(JSON.stringify(item?.constraints)).toContain("$0.05");
    expect(JSON.stringify(item?.constraints)).toContain("fails closed");
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("url");
  });

  it("refuses to sell while the field wallet or screen is unprovisioned — closed, said plainly", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/launch_check?url=${encodeURIComponent(TARGET)}`,
      { headers: buying },
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("fail");
    expect(body.error).toContain("/api/preflight/v1");
  });

  it("refuses a missing url before money, naming the free door", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
    testEnv.SANCTIONS_API_KEY = "test-screen-key";
    const response = await SELF.fetch(`${BASE}/api/buy/launch_check`, {
      headers: buying,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      "/api/preflight/v1",
    );
  });

  it("refuses to walk its own till, with the reason", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
    testEnv.SANCTIONS_API_KEY = "test-screen-key";
    const response = await SELF.fetch(
      `${BASE}/api/buy/launch_check?url=${encodeURIComponent(`${BASE}/api/buy/hello`)}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      "vouching for itself",
    );
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/launch_check`);
    expect(response.status).toBe(402);
  });

  it("delivers the walk end to end: settled, evidence bound, served forever", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
    testEnv.SANCTIONS_API_KEY = "test-screen-key";
    const log: SellerLog = { requests: [] };
    const seller = fakeSeller(log);
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.startsWith(SHOP)) return seller(input as never, init as never);
        if (url.startsWith("https://public.chainalysis.com/")) {
          return new Response(JSON.stringify({ identifications: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return inner(input as never, init as never);
      }) as typeof fetch,
    );
    try {
      const target = encodeURIComponent(TARGET);
      const challenge = await SELF.fetch(
        `${BASE}/api/buy/launch_check?url=${target}`,
      );
      expect(challenge.status).toBe(402);
      const headerName = [...challenge.headers.keys()].find(
        (name) => name.toLowerCase() === "payment-required",
      )!;
      const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
        accepts: Array<Record<string, unknown>>;
      };
      const paid = await SELF.fetch(
        `${BASE}/api/buy/launch_check?url=${target}`,
        {
          headers: {
            "PAYMENT-SIGNATURE": buildPaymentSignature(
              required.accepts[0] as never,
            ),
          },
        },
      );
      expect(paid.status).toBe(200);
      const body = (await paid.json()) as Record<string, any>;
      expect(body.verdict).toBe("settled");
      expect(body.check_id).toMatch(/^lcheck_/);
      expect(body.paid_usd).toBe(0.005);
      expect(body.tx_hash).toBe(SELLER_TX);
      expect(body.check_url).toBe(`/api/launch-check/${body.check_id}`);
      expect(body.check.ua_sent).toBe(LAUNCH_CHECK_UA);

      // The certificate's attests field IS the record's evidence hash.
      const verify = (await (
        await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)
      ).json()) as Record<string, any>;
      expect(verify.valid).toBe(true);
      expect(verify.certificate.attests).toBe(body.check.evidence_hash);

      // The check URL serves the record with its honest boundaries.
      const record = (await (
        await SELF.fetch(`${BASE}${body.check_url}`)
      ).json()) as Record<string, any>;
      expect(record.check.evidence_hash).toBe(body.check.evidence_hash);
      expect(record.what_this_is).toContain("never a badge");
      expect(JSON.stringify(record.how_to_verify)).toContain(
        "house-ledger.json",
      );
    } finally {
      vi.unstubAllGlobals();
      installFacilitatorMock();
    }
  });
});
