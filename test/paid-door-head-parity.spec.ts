import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import { buildRoutesConfig } from "@/lib/payments";
import { acceptedNetworks } from "@/lib/payment-networks";
import { ALMANAC_ENTRIES } from "@/store/almanac";
import { installFacilitatorMock, type FacilitatorMockState } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import { productionShape } from "./helpers/production-shape";
import type { Env } from "@/types";

const BASE = "https://scvd.store";

/**
 * HEAD IS GET WITHOUT THE BODY, AND OUR PAID DOORS FORGOT THE FIRST
 * HALF (2026-09-20).
 *
 * RFC 9110 §9.3.2: "The server SHOULD send the same header fields in
 * response to a HEAD request as it would have sent if the request
 * method had been GET." Ours did not. Every route config this store
 * hands the x402 stack is keyed `GET /path` (lib/payments.ts), so
 * `requiresPayment` said no to a HEAD, the gate waved it through to a
 * handler that found no authorization and answered its belt-and-braces
 * 402 — a 402 with NO PAYMENT-REQUIRED header, no WWW-Authenticate,
 * and therefore no price. The same GET-only test sat in front of the
 * native lane (lib/mpp-checkout-capability.ts), so the MPP challenge
 * went missing too.
 *
 * WHY IT MATTERS BEYOND THE RFC. A directory probes a door twice —
 * once with GET, once with HEAD — and reads whichever record it kept.
 * A reader that kept the HEAD saw a 402 that quoted nothing, which is
 * indistinguishable from a door that cannot be paid. We published the
 * price on one knock and withheld it on the other, and nothing in this
 * suite could tell, because every spec here knocks the way a buyer
 * does.
 *
 * WHAT THIS GUARD IS. The denominator is buildRoutesConfig itself —
 * the same table the gate matches against — so a paid door added
 * tomorrow is probed tomorrow. A pattern route whose parameter has no
 * sample below makes this spec FAIL rather than skip: a door the guard
 * cannot knock on is a door the guard must not claim to have checked
 * (AT_SCALE.md rule 1, rule 5).
 */

/** Concrete values for the four pattern routes, so a pattern is a real knock. */
const PATTERN_SAMPLES: Record<string, string> = {
  slug: ALMANAC_ENTRIES[0]!.slug,
  issue: "1",
  week: "1",
  sign: "aries",
};

function probePaths(shaped: Env): string[] {
  const paths = new Set<string>();
  for (const key of Object.keys(buildRoutesConfig(shaped))) {
    const [verb, pattern] = key.split(" ", 2);
    expect(verb, `${key}: every paid route is keyed by one verb`).toBe("GET");
    paths.add(
      pattern!.replace(/:([a-z_]+)/gi, (_match, name: string) => {
        const sample = PATTERN_SAMPLES[name];
        // Refuse rather than guess: an unknown parameter means this
        // guard does not know how to knock on that door.
        expect(sample, `no sample value for :${name} in ${pattern}`).toBeTruthy();
        return sample ?? `:${name}`;
      }),
    );
  }
  return [...paths].sort();
}

/**
 * The production shape quotes five rails; the facilitator mock lists
 * two, and the payment stack throws rather than quote a rail its
 * facilitator never claimed. The kinds are DERIVED from the same
 * checkout table the challenge is built from, so a sixth rail needs no
 * edit here — the pattern is test/five-network-header-budget.spec.ts,
 * which spells the three extra networks by hand.
 */
function supportEveryConfiguredRail(shaped: Env): void {
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/x402/supported")) return response;
    const body = await response.json() as { kinds: { x402Version: number; scheme: string; network: string }[] };
    for (const network of acceptedNetworks(shaped)) {
      if (!body.kinds.some((kind) => kind.network === network)) {
        body.kinds.push({ x402Version: 2, scheme: "exact", network });
      }
    }
    return Response.json(body);
  });
}

describe("a paid door answers HEAD with the headers it answers GET with", () => {
  let facilitator: FacilitatorMockState;
  beforeEach(() => {
    facilitator = installFacilitatorMock();
    supportEveryConfiguredRail(productionShape(env as unknown as Env));
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("sends the same headers and the same status down both knocks", async () => {
    const shaped = productionShape(env as unknown as Env);
    const paths = probePaths(shaped);
    expect(paths.length).toBeGreaterThan(0);

    const mismatches: string[] = [];
    let quoted = 0;
    for (const path of paths) {
      const get = await app.request(`${BASE}${path}`, {}, shaped);
      const head = await app.request(`${BASE}${path}`, { method: "HEAD" }, shaped);
      if (get.status === 402) quoted += 1;
      if (get.status !== head.status) {
        mismatches.push(`${path}: GET ${get.status}, HEAD ${head.status}`);
        continue;
      }
      const names = (res: Response): string =>
        [...res.headers.keys()].map((name) => name.toLowerCase()).sort().join(",");
      const missing = [...get.headers.keys()]
        .map((name) => name.toLowerCase())
        .filter((name) => !head.headers.has(name))
        .sort();
      if (names(get) !== names(head)) {
        mismatches.push(`${path}: HEAD is missing ${missing.join(", ") || "nothing"} (GET ${names(get)} / HEAD ${names(head)})`);
      }
    }
    expect(mismatches.join("\n")).toBe("");
    // A guard that went green because every door 404'd would be no guard.
    expect(quoted, "no probed door answered 402; the parity above proved nothing").toBeGreaterThan(0);
  });
});

/**
 * THE OTHER HALF, AND THE ONLY ONE THAT MOVES MONEY. Hono answers a
 * HEAD by dispatching the GET and throwing the body away
 * (`new Response(null, await dispatch(..., "GET"))`), so a gate that
 * settled a HEAD would charge a buyer and hand the goods to the
 * runtime's bin. HEAD quotes; it never charges. This is asserted
 * against a payment PROVEN to work — the same header settles on a GET
 * in the second expectation — because "nothing settled" from a payment
 * that could never settle is not evidence of anything (AT_SCALE.md
 * rule 5).
 */
describe("a HEAD is answered, never charged", () => {
  let facilitator: FacilitatorMockState;
  beforeEach(() => {
    facilitator = installFacilitatorMock();
  });

  it("quotes a signed payment presented on a HEAD instead of settling it", async () => {
    const shaped = productionShape(env as unknown as Env);
    const door = `${BASE}/api/buy/hello`;
    const quote = await app.request(door, {}, shaped);
    expect(quote.status).toBe(402);
    const signature = buildPaymentSignature(decodePaymentRequired(quote).accepts[0]!);

    const head = await app.request(door, { method: "HEAD", headers: { "PAYMENT-SIGNATURE": signature } }, shaped);
    expect(head.status).toBe(402);
    expect(head.headers.has("PAYMENT-REQUIRED"), "the HEAD is quoted, not merely refused").toBe(true);
    expect(facilitator.verifyCalls, "a HEAD reached the facilitator").toBe(0);
    expect(facilitator.settleCalls, "a HEAD moved money").toBe(0);

    // The same header down the paying method: the payment was real.
    const paid = await app.request(door, { headers: { "PAYMENT-SIGNATURE": signature } }, shaped);
    expect(paid.status).toBe(200);
    expect(facilitator.settleCalls).toBe(1);
  });

  it("quotes a native credential presented on a HEAD instead of running checkout", async () => {
    const shaped = productionShape(env as unknown as Env);
    const head = await app.request(
      `${BASE}/api/buy/hello`,
      { method: "HEAD", headers: { Authorization: "Payment credential=\"not-a-real-one\"" } },
      shaped,
    );
    // The native lane refuses a bad credential with its own problem
    // document; a quote means it never read this one.
    expect(head.status).toBe(402);
    expect(head.headers.has("WWW-Authenticate")).toBe(true);
    expect(facilitator.settleCalls).toBe(0);
  });
});
