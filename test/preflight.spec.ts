import { SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runChecks } from "@/services/preflight";
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
