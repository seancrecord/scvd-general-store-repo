import { describe, expect, it } from "vitest";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm";
import {
  SIMULATED_CAP_LABEL,
  simulatePayment,
  type ClientProfile,
  type ReadAccept,
} from "@/lib/client-simulator";

/**
 * THE DIFFERENTIAL SPEC — the simulator checked against the thing it
 * simulates.
 *
 * WHY THIS SHAPE AND NOT ASSERTIONS. Every other way of testing this
 * module is a way of writing our own beliefs down twice. Assert that
 * a $300 door "would throw" and the test passes whenever the
 * simulator agrees with the test author, which is not the same as
 * agreeing with `@x402/core`. That is exactly how the spend-cap spec
 * false-passed on 2026-08-28: seven green assertions, every one of
 * them comparing our published copy against our own constant.
 *
 * So this suite CONSTRUCTS A REAL `x402Client`, registers the real
 * `ExactEvmScheme`, calls the real `selectPaymentRequirements`, and
 * asserts our replay reached the same ending — the same accept, or
 * the same refusal. It cannot pass vacuously: if the library changes
 * its filter order, its inclusivity, or its default ceiling, the
 * library moves and the simulator does not, and these go red.
 *
 * The library throws where it refuses, so "refused" is observed as a
 * thrown error rather than a sentinel we invented, and the boundary
 * cases below are the ones where a hand-written expectation would
 * most plausibly have been wrong:
 *
 *   - EXACTLY the ceiling. `<=`, so it pays. A simulator written
 *     from the prose ("above the cap") gets this backwards.
 *   - ONE ATOMIC UNIT over. Refused. The pair proves the comparison
 *     is on atomic units, not a rounded dollar figure.
 *   - MIXED, over first. Base is over, Polygon is under, and the
 *     client silently signs POLYGON — index 1, not index 0 and not a
 *     refusal. This is the case that makes the whole tool worth
 *     shipping: the door looks fine, the buyer pays, and the rail
 *     they land on is not the one the door listed first.
 */

/** Base and Polygon USDC, from @x402/evm's own DEFAULT_ASSETS table. */
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const PAY_TO = "0x0000000000000000000000000000000000000042";

function accept(
  network: string,
  asset: string,
  amount: string,
  extra?: Record<string, unknown>,
): ReadAccept {
  return {
    scheme: "exact",
    network,
    asset,
    amount,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    ...(extra ? { extra } : {}),
  };
}

/**
 * THE CASTS ARE THE POINT, so they are named rather than hidden.
 * `selectPaymentRequirements` is typed private and `register` wants a
 * fully-typed SchemeNetworkClient. Reaching past both is deliberate:
 * the value of this suite is that it exercises the REAL selection
 * path rather than a public wrapper we could accidentally satisfy
 * with a stub. A test that only touched the public surface would be
 * testing the surface, which is not where the buyer's money is lost.
 *
 * The cost is that a library refactor of a private member breaks this
 * file — which is the correct failure. The simulator's whole claim is
 * that it replays that member; a rename means the claim needs
 * re-checking, and a spec that kept passing through it would be a
 * guard that cannot fail (rule 46).
 */
type ReachIntoClient = {
  register: (network: string, client: unknown) => unknown;
  setSpendControls: (value: unknown) => void;
  selectPaymentRequirements: (
    version: number,
    accepts: readonly ReadAccept[],
  ) => ReadAccept;
};

/**
 * A stock client, built the way an unconfigured buyer's is: the real
 * scheme on both EVM rails and NOTHING else set. `spendControls` is
 * left alone deliberately — the finding is that `{}` means "on with
 * the default", not "off".
 */
function stockClient(spendControls?: unknown): ReachIntoClient {
  /*
   * BOTH CONSTRUCTORS ARE CALLED WITH NOTHING, ON PURPOSE, and both
   * published types ask for an argument this path never touches:
   * `ExactEvmScheme` wants a signer (used only when a payment is
   * actually built — no signature happens here), and `x402Client`
   * wants a selector (omitting it is what installs the accepts[0]
   * default, which IS the behaviour under test — passing one would
   * be supplying the answer). Casting is how a test says "this
   * argument does not participate", and if either ever starts
   * participating, this file throws at construction rather than
   * quietly measuring something else.
   */
  const scheme = new (ExactEvmScheme as unknown as new () => {
    client?: unknown;
  })();
  const client = new (x402Client as unknown as new () => ReachIntoClient)();
  for (const network of ["eip155:8453", "eip155:137"]) {
    client.register(network, (scheme as { client?: unknown }).client ?? scheme);
  }
  if (spendControls !== undefined) {
    client.setSpendControls(spendControls);
  }
  return client;
}

/** What the real library did: the index it chose, or the refusal. */
function realEnding(
  accepts: readonly ReadAccept[],
  spendControls?: unknown,
): { outcome: "would_sign"; index: number } | { outcome: "would_throw" } {
  try {
    const picked = stockClient(spendControls).selectPaymentRequirements(
      2,
      accepts,
    );
    return { outcome: "would_sign", index: accepts.indexOf(picked) };
  } catch {
    return { outcome: "would_throw" };
  }
}

interface Case {
  name: string;
  accepts: ReadAccept[];
  /** What the real client is configured with. */
  spendControls?: unknown;
  /** The same configuration, in the shape a buyer sends us. */
  profile?: ClientProfile;
}

const CASES: Case[] = [
  {
    name: "every tier above the ceiling — the collab at $300 on two rails",
    accepts: [
      accept("eip155:8453", USDC_BASE, "300000000"),
      accept("eip155:137", USDC_POLYGON, "300000000"),
    ],
  },
  {
    name: "under the ceiling on two rails — $0.99",
    accepts: [
      accept("eip155:8453", USDC_BASE, "990000"),
      accept("eip155:137", USDC_POLYGON, "990000"),
    ],
  },
  {
    name: "exactly the ceiling — the comparison is inclusive",
    accepts: [accept("eip155:8453", USDC_BASE, "1000000")],
  },
  {
    name: "one atomic unit over the ceiling",
    accepts: [accept("eip155:8453", USDC_BASE, "1000001")],
  },
  {
    name: "mixed — Base over, Polygon under, and the client takes Polygon",
    accepts: [
      accept("eip155:8453", USDC_BASE, "5000000"),
      accept("eip155:137", USDC_POLYGON, "500000"),
    ],
  },
  {
    name: "a token neither scheme lists as a default asset",
    accepts: [
      accept("eip155:8453", "0xdead000000000000000000000000000000000000", "1"),
    ],
  },
  {
    name: "spendControls: false — the one escape",
    accepts: [accept("eip155:8453", USDC_BASE, "300000000")],
    spendControls: false,
    profile: { spend_controls_disabled: true },
  },
  {
    name: "the buyer raised maxAmountPerPayment",
    accepts: [accept("eip155:8453", USDC_BASE, "300000000")],
    spendControls: { maxAmountPerPayment: "$500" },
    profile: { max_amount_per_payment_usd: 500 },
  },
  /*
   * THE PAYMENT-FLOW CASES, ADDED BECAUSE MUTATION FOUND THEM MISSING.
   * Deleting the prefer-authorization stage from the simulator left
   * all thirteen tests green — the stage was modelled correctly and
   * guarded by nothing, which is a guard that cannot fail (rule 46).
   * These five were then read off the real client rather than
   * reasoned about, and they are its actual behaviour: a mixed set
   * drops upfront and escrow WHOLE, an all-upfront set keeps them
   * because no authorization accept survives to displace them, and a
   * missing flow counts as authorization.
   */
  {
    name: "upfront listed first is dropped for the authorization behind it",
    accepts: [
      accept("eip155:8453", USDC_BASE, "990000", { paymentFlow: "upfront" }),
      accept("eip155:137", USDC_POLYGON, "990000", {
        paymentFlow: "authorization",
      }),
    ],
  },
  {
    name: "escrow first, undeclared second — undeclared counts as authorization",
    accepts: [
      accept("eip155:8453", USDC_BASE, "990000", { paymentFlow: "escrow" }),
      accept("eip155:137", USDC_POLYGON, "990000"),
    ],
  },
  {
    name: "upfront alone survives, because nothing displaces it",
    accepts: [
      accept("eip155:8453", USDC_BASE, "990000", { paymentFlow: "upfront" }),
    ],
  },
];

describe("the payment dry run agrees with the client it replays", () => {
  for (const item of CASES) {
    it(`reaches the same ending: ${item.name}`, () => {
      const real = realEnding(item.accepts, item.spendControls);
      const mine = simulatePayment(item.accepts, item.profile ?? {});
      expect(mine.outcome).toBe(real.outcome);
      if (real.outcome === "would_sign") {
        // Not merely "it signs" — the SAME accept. A simulator that
        // agreed on the verdict and disagreed on the rail would send
        // a buyer to the wrong chain with our name on the advice.
        expect(mine.chosen?.index).toBe(real.index);
      }
    });
  }

  /**
   * The mixed case again, stated as its own claim rather than left
   * inside the loop, because it is the sentence the product exists
   * to be able to say: the door listed Base first, the buyer never
   * chose Polygon, and Polygon is where the money goes.
   */
  it("names the rail a capped buyer actually lands on, which is not the first one", () => {
    const reading = simulatePayment([
      accept("eip155:8453", USDC_BASE, "5000000"),
      accept("eip155:137", USDC_POLYGON, "500000"),
    ]);
    expect(reading.outcome).toBe("would_sign");
    expect(reading.chosen?.network).toBe("eip155:137");
    expect(reading.chosen?.amount_usd).toBe(0.5);
    const dropped = reading.dropped.find((entry) => entry.index === 0);
    expect(dropped?.stage).toBe("amount-cap");
  });

  /**
   * Rule 52 on the module itself: the ceiling it reports is the one
   * the package exports, never a number we typed. Hardcoding "$1"
   * here would reproduce the exact defect that made the spend-cap
   * spec pass while testing nothing.
   */
  it("reports the ceiling the client package itself exports", async () => {
    const { DEFAULT_MAX_AMOUNT_PER_PAYMENT } = await import("@x402/core/client");
    expect(SIMULATED_CAP_LABEL).toBe(String(DEFAULT_MAX_AMOUNT_PER_PAYMENT));
    const blocked = simulatePayment([
      accept("eip155:8453", USDC_BASE, "300000000"),
    ]);
    expect(blocked.cap_applied).toContain(
      String(DEFAULT_MAX_AMOUNT_PER_PAYMENT).replace("$", ""),
    );
  });

  /**
   * A door with nothing to walk is the preflight's question, not
   * this one's. Answering it here would put two instruments in
   * public disagreement about the same door.
   */
  it("declines to simulate a challenge that yielded no accepts", () => {
    const reading = simulatePayment([]);
    expect(reading.outcome).toBe("cannot_simulate");
    expect(reading.chosen).toBeNull();
  });

  /**
   * The caveats ship with the answer, always — including the one
   * that only applies when the buyer told us nothing about their
   * client, which is the reading most likely to be over-trusted.
   */
  it("publishes what it cannot see, and says so louder with no profile", () => {
    const bare = simulatePayment([accept("eip155:8453", USDC_BASE, "990000")]);
    expect(
      bare.what_this_cannot_see.some((line) => line.includes("configured NOTHING")),
    ).toBe(true);
    const told = simulatePayment([accept("eip155:8453", USDC_BASE, "990000")], {
      max_amount_per_payment_usd: 5,
    });
    expect(
      told.what_this_cannot_see.some((line) => line.includes("configured NOTHING")),
    ).toBe(false);
    // The version caveat is unconditional: it is true of every reading.
    for (const reading of [bare, told]) {
      expect(
        reading.what_this_cannot_see.some((line) =>
          line.includes("different version"),
        ),
      ).toBe(true);
    }
  });

  /**
   * The three-rail hazard, which is the published claim
   * STOCK_CLIENT_RAIL_NOTE makes in prose. If the note and this
   * reading ever disagree the store is telling two stories about the
   * same library.
   */
  it("warns that the unchosen rails are never attempted", () => {
    const reading = simulatePayment([
      accept("eip155:8453", USDC_BASE, "990000"),
      accept("eip155:137", USDC_POLYGON, "990000"),
    ]);
    const hazard = reading.hazards.find(
      (entry) => entry.name === "no-rail-fallback",
    );
    expect(hazard?.detail).toContain("no loop over the remaining accepts");
    expect(
      reading.dropped.some((entry) => entry.stage === "not-selected"),
    ).toBe(true);
  });
});
