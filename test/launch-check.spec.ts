import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  FIELD_SPEND_CAP_USD,
  LAUNCH_CHECK_UA,
  SANCTIONS_ORACLE_BASE,
  chainalysisScreen,
  fieldSignerFromKey,
  oracleScreen,
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
    /**
     * THE DEFECT, MODELLED. A conformant seller refuses a payment it
     * has already settled; the default below does. Three of thirty-one
     * doors an independent tester walked on 2026-08-23 did not, and
     * served their goods twice for one settlement. Set this to make
     * the fake seller one of those three.
     */
    acceptsReplay?: boolean;
    /**
     * A HOSTILE WINDOW. The spec lets a seller name
     * maxTimeoutSeconds and this store took it at face value, so a
     * door could mint an authorization against the field wallet good
     * for years. Set this to be that door.
     */
    maxTimeoutSeconds?: number;
    /** Bytes of filler on the paid response, to model an unbounded read. */
    padBytes?: number;
    /** Answer the paid knock with a redirect instead of goods. */
    redirectTo?: string;
  } = {},
): typeof fetch {
  /** Payments this seller has already settled once. */
  const spent = new Set<string>();
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
          maxTimeoutSeconds: opts.maxTimeoutSeconds ?? 300,
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
    if (spent.has(payment) && !opts.acceptsReplay) {
      // The correct answer: this authorization is spent.
      return new Response(JSON.stringify({ error: "payment already used" }), {
        status: 402,
      });
    }
    spent.add(payment);
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
    // The calling card is out on EVERY knock — the walkabout's law.
    // Three now: the unpaid approach, the payment, and the replay.
    expect(log.requests).toHaveLength(3);
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
      // 2.4: offer issuance is recorded between reading the terms and
      // screening the payee — a door with signed offers and one
      // without are different facts, and both are now written down.
      "offers",
      "screen",
      "payment",
      "settle",
      "delivery",
      "replay",
      /*
       * 3.2: what the seller said about money gets its own stage. No
       * reader stands at this spec's seam, so the stage records the
       * hash as claimed — the label is the point; the read is the
       * paid seam's job (see money-path-symmetry.spec.ts).
       */
      "tx-verify",
    ]);
    const delivery = check.stages.find((stage) => stage.stage === "delivery")!;
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

  /**
   * THE ONE CHECK THAT FINDS ANYTHING.
   *
   * An independent tester (Cairn, cairnwake.com) walked 37 x402 doors
   * between 2026-08-12 and 2026-08-23 and published every result. Its
   * eleven hostile-payload checks — garbage, unsigned, wrong scheme,
   * wrong network, wrong asset, self-destination, wrong amount, extra
   * instruction, fee-payer-as-source, high priority fee — passed 37 of
   * 37. Not one endpoint anywhere accepted a malformed payment.
   *
   * Every defect it found was in two places: the settlement, and the
   * REPLAY. Three of thirty-one doors served their goods a second time
   * for a payment that had already settled once.
   *
   * That is why this store did not build the negative battery it had
   * evidence nobody fails, and built this instead.
   *
   * CORRECTION APPENDED 2026-08-24, ORIGINAL LEFT STANDING. The tester
   * wrote back that "37/37" is now stale: one hostile-input failure has
   * since appeared in 88 endpoints — palmyr.ai settled a wrong-scheme
   * envelope, https://cairnwake.com/r/1ccbdc9f.html. Ten of the eleven
   * checks remain at zero. The decision this test guards is unchanged,
   * and it is recorded here rather than edited above so a reader can
   * see both what we believed and when it moved.
   */
  it("presents the settled payment a second time and records the answer", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("settled");
    // A conformant door refused it, so the field is FALSE, not null.
    expect(check.replay_served).toBe(false);
    const replay = check.stages.find((stage) => stage.stage === "replay")!;
    expect(replay.ok).toBe(true);
    expect(replay.detail).toContain("refused, correctly");
    // BYTE-IDENTICAL is the whole test: a fresh authorization would
    // prove nothing, because a second nonce is a second payment.
    expect(log.requests[2]?.payment).toBe(log.requests[1]?.payment);
  });

  it("names the defect when a door serves the same payment twice", async () => {
    const log: SellerLog = { requests: [] };
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller(log, { acceptsReplay: true }),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("settled");
    expect(check.replay_served).toBe(true);
    const replay = check.stages.find((stage) => stage.stage === "replay")!;
    expect(replay.ok).toBe(false);
    expect(replay.detail).toContain("SERVED AGAIN");
    /*
     * AND WE ARE NOT BILLED TWICE. The authorization's nonce is spent
     * on first settlement, so no second transfer can reach the seller
     * — which is exactly what makes this defect expensive for THEM and
     * free for us. If paid_usd ever doubles here, the check has become
     * a way to spend the keeper's money finding bugs.
     */
    expect(check.paid_usd).toBe(0.005);
    expect(check.paid_usd).toBeLessThanOrEqual(FIELD_SPEND_CAP_USD);
  });

  it("claims nothing about a door it never paid", async () => {
    // Nothing settled, so there was nothing to replay. NULL, not false
    // — scoring a door we never tested is the lie this field prevents.
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: fakeSeller({ requests: [] }, { refuse: true }),
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("payment_refused");
    expect(check.replay_served).toBeNull();
    expect(check.stages.some((stage) => stage.stage === "replay")).toBe(false);
  });

  it("counts a replay that never answered as unknown, not as a pass", async () => {
    /*
     * A door that dies on the replay has not refused it. Recording
     * that as a pass would credit an endpoint for behaviour nobody
     * observed — the same dishonesty the census avoids by counting its
     * own missed rounds against itself.
     */
    const log: SellerLog = { requests: [] };
    const seller = fakeSeller(log);
    let knocks = 0;
    const diesOnReplay = (async (input: RequestInfo | URL, init?: RequestInit) => {
      knocks += 1;
      if (knocks === 3) throw new Error("Network connection lost.");
      return seller(input, init);
    }) as typeof fetch;
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: diesOnReplay,
      signer: await fieldSignerFromKey(TEST_FIELD_KEY),
      screen: clearScreen,
    });
    expect(check.verdict).toBe("settled");
    expect(check.replay_served).toBeNull();
    const replay = check.stages.find((stage) => stage.stage === "replay")!;
    expect(replay.ok).toBe(false);
    expect(replay.detail).toContain("could not complete");
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

describe("the keyless sanctions screen — the on-chain oracle", () => {
  function rpcAnswer(result: string, status = 200): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      // The call must be the real oracle read: eth_call, the Base
      // deployment address, the derived selector, the padded address.
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: [{ to: string; data: string }, string];
      };
      expect(body.method).toBe("eth_call");
      expect(body.params[0].to).toBe(SANCTIONS_ORACLE_BASE);
      expect(body.params[0].data.startsWith("0xdf592f7d")).toBe(true);
      expect(body.params[0].data).toContain(SELLER_PAY_TO.slice(2));
      return new Response(JSON.stringify({ result }), { status });
    }) as typeof fetch;
  }

  it("a clear address screens false, a listed one true", async () => {
    const clear = await oracleScreen("https://rpc.test", rpcAnswer(`0x${"0".repeat(64)}`))(SELLER_PAY_TO);
    expect(clear.listed).toBe(false);
    const listed = await oracleScreen("https://rpc.test", rpcAnswer(`0x${"0".repeat(63)}1`))(SELLER_PAY_TO);
    expect(listed.listed).toBe(true);
    expect(listed.source).toContain("oracle");
  });

  it("anything unexpected is null — which upstream withholds payment", async () => {
    const error = await oracleScreen("https://rpc.test", rpcAnswer("", 429))(SELLER_PAY_TO);
    expect(error.listed).toBeNull();
    const garbage = await oracleScreen("https://rpc.test", rpcAnswer("0xdeadbeef"))(SELLER_PAY_TO);
    expect(garbage.listed).toBeNull();
    const down = await oracleScreen("https://rpc.test", (async () => {
      throw new Error("rpc down");
    }) as typeof fetch)(SELLER_PAY_TO);
    expect(down.listed).toBeNull();
  });

  it("a non-EVM address shape is unscreenable, said without a network call", async () => {
    const never = (async () => {
      throw new Error("must not be called");
    }) as typeof fetch;
    const verdict = await oracleScreen("https://rpc.test", never)("DGxcPr-not-an-evm-address");
    expect(verdict.listed).toBeNull();
    expect(verdict.source).toContain("unscreenable");
  });

  it("the API key, when present, still works as an override", async () => {
    const screen = chainalysisScreen("test-key", (async () =>
      new Response(JSON.stringify({ identifications: [] }), {
        status: 200,
      })) as typeof fetch);
    expect((await screen(SELLER_PAY_TO)).listed).toBe(false);
    const flagged = chainalysisScreen("test-key", (async () =>
      new Response(JSON.stringify({ identifications: [{ category: "sanctions" }] }), {
        status: 200,
      })) as typeof fetch);
    expect((await flagged(SELLER_PAY_TO)).listed).toBe(true);
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

  it("refuses to sell while the field wallet is unprovisioned — closed, said plainly", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/launch_check?url=${encodeURIComponent(TARGET)}`,
      { headers: buying },
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("field wallet");
    expect(body.error).toContain("/api/preflight/v1");
  });

  it("needs NO screening secret: the wallet alone opens the door", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
    // No SANCTIONS_API_KEY — the keyless oracle is the default, so
    // the request must get PAST the 503 and reach the payment gate.
    const response = await SELF.fetch(
      `${BASE}/api/buy/launch_check?url=${encodeURIComponent(TARGET)}`,
      { headers: buying },
    );
    expect(response.status).not.toBe(503);
  });

  it("refuses a missing url before money, naming the free door", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
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

  it("delivers the walk end to end on the keyless default: settled, evidence bound, served forever", async () => {
    testEnv.FIELD_WALLET_KEY = TEST_FIELD_KEY;
    // Deliberately NO SANCTIONS_API_KEY: this walk screens through the
    // on-chain oracle, which is what production does out of the box.
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
        if (String(init?.body ?? "").includes("0xdf592f7d")) {
          // The oracle read, answering "not sanctioned", byte for byte.
          return new Response(
            JSON.stringify({ result: `0x${"0".repeat(64)}` }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
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

/**
 * THE BUYER HAS TO BE TOLD, not just recorded to. A finding that
 * costs an operator money and rides only in a stage array is a
 * finding most operators will never read.
 */
describe("the replay finding reaches the person who paid for it", () => {
  it("leads the note with the giveaway when a door served twice", async () => {
    const { launchCheckNote } = await import("@/store/copy/deliverables");
    const note = launchCheckNote("settled", true);
    expect(note).toContain("took it again");
    expect(note).toContain("for free");
    // And it explains WHY no second payment arrived, so the operator
    // does not go looking for money that cannot exist.
    expect(note.toLowerCase()).toContain("single-use");
  });

  it("keeps the ordinary settled note when the door refused the replay", async () => {
    const { launchCheckNote } = await import("@/store/copy/deliverables");
    const note = launchCheckNote("settled", false);
    expect(note).not.toContain("took it again");
    expect(note).toContain("paying stranger");
  });

  it("says nothing about replay on a walk that never paid", async () => {
    const { launchCheckNote } = await import("@/store/copy/deliverables");
    const note = launchCheckNote("payment_refused", null);
    expect(note).not.toContain("took it again");
    expect(note).toContain("refused it");
  });
});
