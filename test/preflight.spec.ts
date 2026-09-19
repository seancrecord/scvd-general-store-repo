import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ADVISORY_NAMES, PRE_HANDLER_PAYMENT_FLOWS, SPEC_SCHEMES, runChecks } from "@/services/preflight";
import { RECEIVABLE_CHECK, checkRailReceivable, solanaPayTos } from "@/services/rail-receivable";
import { solanaPayTo } from "@/lib/payment-networks";
import { MENU_ITEMS } from "@/store";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE FREE ENDPOINT PREFLIGHT — and the test that matters most is the
 * dogfood one: the store's OWN 402 passes the store's own preflight
 * checks. The production route refuses to probe our own hostname
 * (Workers cannot self-fetch — the 522 lesson), so THIS test is the
 * standing proof behind the refusal message's claim that "our own
 * 402s pass these exact checks in CI on every build." If that claim
 * ever stops being true, this is where it fails.
 */

const BASE = "https://scvd.store";

describe("the store passes its own preflight", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("our live 402 clears every structural check", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    expect(challenge.status).toBe(402);
    const { checks } = runChecks(challenge, false);
    for (const check of checks) {
      expect(check.ok, `${check.name}: ${check.detail}`).toBe(true);
    }
    // The checks that must have RUN, not just passed vacuously.
    const names = checks.map((check) => check.name);
    expect(names).toContain("status-402");
    expect(names).toContain("payment-required-header");
    expect(names).toContain("x402-version");
    expect(names).toContain("accepts");
    expect(names).toContain("signed-offers");
  });

  it("and earns no testnet or units advisory doing it", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    const { advisories } = runChecks(challenge, false);
    const flagged = advisories.map((advisory) => advisory.name);
    expect(flagged).not.toContain("testnet-network");
    expect(flagged).not.toContain("amount-not-atomic");
  });

  /**
   * THE v2 HALF OF THE CLAIM (2026-09-19; instrument audit row 24).
   * The refusal above is served to v2 callers too, and v2 folds the
   * L3b consistency trio and the Solana rail read into its verdict —
   * neither was ever proven on our own door, because the block above
   * destructured `{checks}` and stopped. This reads the whole return
   * the way the served route does (body and probed URL supplied, so
   * the body-placement and resource-host reads run rather than skip),
   * and holds every L3b check to a pass on every shelf door.
   */
  it("our live 402 clears the L3b consistency trio and the depth reads on every door", async () => {
    let quoted = 0;
    for (const item of MENU_ITEMS) {
      const url = `${BASE}/api/buy/${item.id}`;
      const challenge = await SELF.fetch(url);
      // A human-labour door is shuttered until the keeper is seen; that is
      // a 503 with no terms, not a door this battery can read. Anything
      // else that is not a quote is a door answering wrong.
      if (challenge.status === 503) continue;
      expect(challenge.status, item.id).toBe(402);
      quoted += 1;
      const ran = runChecks(challenge, false, await challenge.text(), url);
      expect(ran.method_unresolved, item.id).toBeUndefined();
      expect(ran.accepts?.length ?? 0, `${item.id}: accepts parsed`).toBeGreaterThan(0);
      for (const check of [...ran.checks, ...(ran.l3b ?? [])]) {
        expect(check.ok, `${item.id} ${check.name}: ${check.detail}`).toBe(true);
      }
      const l3b = (ran.l3b ?? []).map((check) => check.name);
      for (const name of ["payto-payable", "amount-atomic", "network-mainnet", "transfer-method-signable"]) {
        expect(l3b, `${item.id}: ${name} ran`).toContain(name);
      }
      // The depth reads that only run with the body and the knocked URL
      // in hand. resource-host-mismatch is an advisory that fires only on
      // a mismatch, so its silence is proven from the input rather than
      // assumed: the resource the challenge names is on the knocked host.
      const names = ran.checks.map((check) => check.name);
      expect(names, item.id).toContain("signed-offers");
      const terms = JSON.parse(atob(challenge.headers.get("PAYMENT-REQUIRED") ?? "")) as { resource?: { url?: string } | string };
      const resource = typeof terms.resource === "string" ? terms.resource : terms.resource?.url;
      expect(resource && new URL(resource).host, `${item.id}: resource host`).toBe(new URL(url).host);
      expect(ran.advisories.map((advisory) => advisory.name), item.id).not.toContain("resource-host-mismatch");
    }
    // Most of the shelf quotes unshuttered; a walk that read almost nothing proves nothing.
    expect(quoted).toBeGreaterThan(MENU_ITEMS.length / 2);
  });

  /**
   * THE RAIL READ NEEDS A LEDGER, so CI cannot prove the live fact and
   * does not pretend to (rail-receivable.ts says why it lives outside
   * runChecks). What CI can prove is the instrument: our own accepts
   * carry the Solana payTo the configuration names, so the read
   * applies to our door rather than silently not applying; and given
   * a ledger it says receivable for an owner with a USDC account and
   * not receivable for one without — the check fires both ways on our
   * bytes, and a pass is never the answer to a read that could not run.
   */
  it("the Solana rail read applies to our own accepts and decides both ways on them", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
    const { accepts } = runChecks(challenge, false);
    const configured = solanaPayTo(env as unknown as Env);
    expect(configured, "the test environment offers a Solana rail").toBeTruthy();
    expect(solanaPayTos(accepts ?? [])).toEqual([configured]);
    const ledger = (accounts: string[]) => vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as { method?: string };
      const value = body.method === "getTokenAccountsByOwner" ? accounts.map((pubkey) => ({ pubkey })) : null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: value === null ? null : { value } }));
    }));
    try {
      ledger(["AtaOfOurReceiver1111111111111111111111111111"]);
      const held = await checkRailReceivable(env as unknown as Env, accepts ?? []);
      expect(held.check?.name).toBe(RECEIVABLE_CHECK);
      expect(held.check?.ok).toBe(true);
      ledger([]);
      const empty = await checkRailReceivable(env as unknown as Env, accepts ?? []);
      expect(empty.check?.name).toBe(RECEIVABLE_CHECK);
      expect(empty.check?.ok).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the checks catch the mapped failure moments", () => {
  function challenge402(
    challenge: Record<string, unknown>,
    headers: Record<string, string> = {},
  ): Response {
    return new Response("{}", {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)),
        ...headers,
      },
    });
  }

  const GOOD_ACCEPT = {
    scheme: "exact",
    network: "eip155:8453",
    amount: "5000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x1111111111111111111111111111111111111111",
  };

  /*
   * The body-placement regression is held by test/offer-placement.spec.ts
   * against a real fixture door (test/fixtures/doors/body-offers.json),
   * which exercises the whole probe path rather than runChecks alone.
   * A duplicate lived here briefly on 2026-08-27 and was dropped for it.
   */

  it("a 200 is called what it is: listed but functionally absent", () => {
    const { checks } = runChecks(new Response("ok", { status: 200 }), false);
    const status = checks.find((check) => check.name === "status-402");
    expect(status?.ok).toBe(false);
    expect(status?.detail).toContain("listed but functionally absent");
  });

  it("a redirect is refused, because payment clients refuse it too", () => {
    const { checks } = runChecks(
      new Response(null, { status: 301, headers: { Location: "https://elsewhere.test" } }),
      false,
    );
    expect(checks[0]?.ok).toBe(false);
    expect(checks[0]?.detail).toContain("redirect");
  });

  it("a 402 with no PAYMENT-REQUIRED header fails with the v2 explanation", () => {
    const { checks } = runChecks(new Response("{}", { status: 402 }), false);
    const header = checks.find((check) => check.name === "payment-required-header");
    expect(header?.ok).toBe(false);
    expect(header?.detail).toContain("header");
  });

  it("testnet accepts earn the FAQ's stuck-point advisory without failing the shape", () => {
    const { checks, advisories } = runChecks(
      challenge402({
        x402Version: 2,
        accepts: [{ ...GOOD_ACCEPT, network: "eip155:84532" }],
      }),
      false,
    );
    expect(checks.every((check) => check.ok)).toBe(true);
    const testnet = advisories.find((advisory) => advisory.name === "testnet-network");
    expect(testnet?.detail).toContain("Base Sepolia");
    expect(testnet?.detail).toContain("eip155:8453");
  });

  it("a dollar-typed amount is flagged as the million-fold mistake", () => {
    const { advisories } = runChecks(
      challenge402({
        x402Version: 2,
        accepts: [{ ...GOOD_ACCEPT, amount: "0.005" }],
      }),
      false,
    );
    const units = advisories.find((advisory) => advisory.name === "amount-not-atomic");
    expect(units?.detail).toContain("ATOMIC");
  });

  it("accepts holes are named field by field", () => {
    const { checks } = runChecks(
      challenge402({
        x402Version: 2,
        accepts: [{ scheme: "exact", network: "eip155:8453" }],
      }),
      false,
    );
    const accepts = checks.find((check) => check.name === "accepts");
    expect(accepts?.ok).toBe(false);
    expect(accepts?.detail).toContain("accepts[0].amount");
    expect(accepts?.detail).toContain("accepts[0].payTo");
  });
});

describe("the route holds its boundaries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function post(url: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await SELF.fetch(`${BASE}/api/preflight/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it("refuses our own hostname with the reason and the CI-backed claim", async () => {
    const { status, body } = await post(`${BASE}/api/buy/hello`);
    expect(status).toBe(400);
    expect(String(body["error"])).toContain("cannot fetch");
    expect(String(body["error"])).toContain("CI");
  });

  it("refuses http, custom ports, and garbage", async () => {
    for (const bad of ["http://shop.example/x", "https://shop.example:8443/x", "not a url"]) {
      const { status } = await post(bad);
      expect(status, bad).toBe(400);
    }
  });

  it("probes exactly once, reports ready, and the breadcrumb rides along", async () => {
    let probes = 0;
    vi.stubGlobal("fetch", async () => {
      probes += 1;
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
                  amount: "10000",
                  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  payTo: "0x1111111111111111111111111111111111111111",
                },
              ],
            }),
          ),
        },
      });
    });
    const { status, body } = await post("https://other-shop.example/api/buy/thing");
    expect(status).toBe(200);
    expect(body["verdict"]).toBe("ready");
    expect(probes, "the single-probe promise is load-bearing").toBe(1);
    // The response travels — pasted into issues and CI logs — so it
    // explains itself wherever it lands, same as every artifact.
    const identity = body["store_identity"] as Record<string, unknown>;
    expect(identity["name"]).toBeTruthy();
    expect(body["our_conflict_of_interest"]).toBeTruthy();
    // "ready" must never read as an uptime claim; the note disclaims it.
    expect(String(body["single_probe_note"])).toContain("never whether it is reliable");
  });

  it("an unreachable host is a verdict about the path, not their code", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("connection refused");
    });
    const { status, body } = await post("https://gone.example/api/buy/x");
    expect(status).toBe(200);
    expect(body["verdict"]).toBe("unreachable");
    const checks = body["checks"] as { detail: string }[];
    expect(checks[0]?.detail).toContain("does not prove the endpoint is down");
  });

  it("the GET doc carries the literal failure strings a stuck developer searches", async () => {
    const doc = await (await SELF.fetch(`${BASE}/api/preflight/v1`)).text();
    expect(doc).toContain("eip155:84532");
    expect(doc).toContain("listed but functionally absent");
    expect(doc).toContain("invalid_exact_evm_payload_signature");
    expect(doc).toContain("PAYMENT-SIGNATURE");
  });
});

/** A 402 whose single accepts entry declares (or omits) a payment flow. */
function flowChallenge(paymentFlow: string | null): Response {
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
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0x1111111111111111111111111111111111111111",
              ...(paymentFlow === null ? {} : { extra: { paymentFlow } }),
            },
          ],
        }),
      ),
    },
  });
}

describe("scheme drift is named before anyone pays into it", () => {
  it("a proprietary scheme earns the advisory without failing the shape", () => {
    const { checks, advisories } = runChecks(
      new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "gokite-aa",
                  network: "eip155:8453",
                  amount: "5000",
                  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  payTo: "0x1111111111111111111111111111111111111111",
                },
              ],
            }),
          ),
        },
      }),
      false,
    );
    // Structurally fine — their own clients may be happy.
    expect(checks.every((check) => check.ok)).toBe(true);
    // But a generic caller is told before paying, not after.
    const drift = advisories.find((a) => a.name === "nonstandard-scheme");
    expect(drift?.detail).toContain('"gokite-aa"');
    // The accusation now has to name the list it is measured against,
    // so a reader can check the claim instead of taking our word.
    expect(drift?.detail).toContain("exact, upto, auth-capture, batch-settlement");
    expect(advisories.map((a) => a.name)).not.toContain("spec-scheme-not-exact");
  });

  /*
   * THE DRIFT WAS OURS, 2026-09-14. Until today every one of these
   * three earned `nonstandard-scheme` and a sentence calling the door
   * a silent dead end outside its vendor's stack. They are the
   * specification. Each case below fails against the battery as it
   * stood this morning, which is the point of pinning them.
   */
  it.each(["upto", "auth-capture", "batch-settlement"])(
    "%s is the specification, not vendor drift, and is never accused of being one",
    (scheme) => {
      const { checks, advisories } = runChecks(
        new Response("{}", {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": btoa(
              JSON.stringify({
                x402Version: 2,
                accepts: [
                  {
                    scheme,
                    network: "eip155:8453",
                    amount: "5000",
                    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                    payTo: "0x1111111111111111111111111111111111111111",
                  },
                ],
              }),
            ),
          },
        }),
        false,
      );
      expect(checks.every((check) => check.ok)).toBe(true);
      expect(advisories.map((a) => a.name)).not.toContain("nonstandard-scheme");

      // What WAS true in the old advisory survives, without the charge:
      // an exact-only client still cannot pay here.
      const noted = advisories.find((a) => a.name === "spec-scheme-not-exact");
      expect(noted?.detail).toContain(`"${scheme}"`);
      expect(noted?.detail).toContain("not a defect and not drift");
      expect(noted?.detail).toContain('built only for "exact"');
    },
  );

  /*
   * THE ANSWER TO WHAT THE SCHEME FIX RAISED. `ready` means the same
   * thing on every family — the verdict-moving checks read the
   * scheme-independent envelope §4 requires of all of them. What
   * differs is what `ready` does not cover, and §6.1's flow is the
   * piece a buyer most needs before spending.
   */
  it.each([...PRE_HANDLER_PAYMENT_FLOWS])(
    "a %s flow is named, because it spends the buyer before anything is delivered",
    (paymentFlow) => {
      const { checks, advisories } = runChecks(flowChallenge(paymentFlow), false);
      expect(checks.every((check) => check.ok)).toBe(true);
      const warned = advisories.find((a) => a.name === "settles-before-delivery");
      expect(warned?.detail).toContain(`"${paymentFlow}"`);
      expect(warned?.detail).toContain("charged with nothing delivered");
      expect(warned?.detail).toContain("defines no refund");
    },
  );

  it.each(["authorization", null])(
    "flow %s draws nothing — absence means the mechanism default, which we do not resolve",
    (paymentFlow) => {
      const { advisories } = runChecks(flowChallenge(paymentFlow), false);
      expect(advisories.map((a) => a.name)).not.toContain("settles-before-delivery");
    },
  );

  it("the battery and this store's own buying client read the flow through one law", async () => {
    // One law with two spellings is how instruments drift apart; the
    // client dropped upfront entries long before the battery said so.
    const { readPaymentFlow, settlesBeforeHandler } = await import("@/lib/value-checks");
    expect(readPaymentFlow({ paymentFlow: "upfront" })).toBe("upfront");
    expect(readPaymentFlow({})).toBeNull();
    expect(readPaymentFlow(null)).toBeNull();
    expect(readPaymentFlow({ paymentFlow: "" })).toBeNull();
    expect(settlesBeforeHandler("authorization")).toBe(false);
    expect(settlesBeforeHandler(null)).toBe(false);
    expect(PRE_HANDLER_PAYMENT_FLOWS).toEqual(["upfront", "escrow"]);
  });

  it("the published scheme list is the one the battery actually applies", () => {
    // A list that drifts from the code is the same failure one level up.
    expect([...SPEC_SCHEMES].sort()).toEqual(
      ["auth-capture", "batch-settlement", "exact", "upto"],
    );
    expect(ADVISORY_NAMES).toContain("spec-scheme-not-exact");
  });

  it("our own 402 earns no scheme advisory, which is the claim that matters", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    const { advisories } = runChecks(challenge, false);
    expect(advisories.map((a) => a.name)).not.toContain("nonstandard-scheme");
  });
});

describe("the global budget backstops the per-isolate one (CV's finding)", () => {
  it("a spent global bucket 429s even when this isolate's bucket is fresh", async () => {
    // CV fired 40 concurrent probes and got zero 429s: Cloudflare
    // spread them across isolates and every isolate held a fresh
    // bucket. The KV bucket is the answer; this test spends it
    // directly and expects the refusal regardless of isolate state.
    const { env } = await import("cloudflare:test");
    const minute = new Date().toISOString().slice(0, 16);
    await (env as { COUNTERS: KVNamespace }).COUNTERS.put(
      `preflight_budget:${minute}`,
      "60",
      { expirationTtl: 120 },
    );
    const response = await SELF.fetch(`${BASE}/api/preflight/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://someone-else.example/api/buy/x" }),
    });
    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("cost bound on our side");
    await (env as { COUNTERS: KVNamespace }).COUNTERS.delete(
      `preflight_budget:${minute}`,
    );
  });

  it("the GET doc discloses both ceilings and why the cap exists", async () => {
    const doc = await (await SELF.fetch(`${BASE}/api/preflight/v1`)).text();
    expect(doc).toContain("60 probes/minute");
    expect(doc).toContain("checker rather than a relay");
  });
});
