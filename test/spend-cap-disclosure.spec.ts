import { DEFAULT_MAX_AMOUNT_PER_PAYMENT } from "@x402/core/client";
import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  CLIENT_CAP_LABEL,
  CLIENT_CAP_READABLE,
  CLIENT_CAP_USD,
  readAgainstCap,
} from "@/lib/client-spend-cap";
import { priceTiersUsdc } from "@/lib/payments";
import { agentsMd } from "@/routes/agents-md";
import { runChecks } from "@/services/preflight";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * THE REFUSAL THAT HAPPENS ON THE BUYER'S MACHINE (task #52, part 1
 * of the keeper's four-part ruling of 2026-08-25).
 *
 * The stock x402 client applies a per-payment ceiling —
 * DEFAULT_MAX_AMOUNT_PER_PAYMENT, "$1" in @x402/core 2.23.0 — inside
 * selectPaymentRequirements, BEFORE it picks an accept. Over the
 * ceiling it throws without signing. Thirteen of twenty-four priced
 * doors here are above it.
 *
 * WHAT MAKES THAT WORTH A SPEC is that neither side can see it. The
 * buyer's client throws locally; we record a challenge and then
 * nothing. On our books it is shaped exactly like someone reading a
 * price and wandering off, so the store cannot tell a safety control
 * from apathy — and every conclusion drawn from "challenges without
 * settles" inherits that confusion.
 *
 * The keeper's ruling rejects routing around the cap: it is the
 * buyer's operator's control, and a store selling evidence and trust
 * does not ship a library to defeat one. What is left is disclosure,
 * so this pins the disclosure: at the door, in the manual, and priced
 * from the SDK's own constant rather than from anything we typed.
 */

function overCapItems() {
  return MENU_ITEMS.filter((item) => {
    const reading = readAgainstCap(priceTiersUsdc(item));
    return reading?.blocked === true;
  });
}

describe("the cap the store publishes is the cap the client applies", () => {
  it("reads the ceiling from the client package rather than a number of ours", () => {
    /*
     * THE ASSERTION THIS FILE WAS MISSING, and it took a mutation to
     * find. Every test below compares a published sentence against
     * CLIENT_CAP_LABEL — so replacing the import with a typed "$5"
     * left all of them green. They proved the surfaces AGREE WITH
     * EACH OTHER, which is worth nothing if what they agree on is a
     * number we made up. The claim is that our copy tracks the
     * CLIENT's constant, so the constant is what it has to be checked
     * against, exactly once, here.
     */
    expect(
      CLIENT_CAP_LABEL,
      "the published ceiling is no longer the one the client package exports — every surface now agrees on a figure of our own invention",
    ).toBe(String(DEFAULT_MAX_AMOUNT_PER_PAYMENT));
    expect(
      CLIENT_CAP_READABLE,
      "the installed client's cap is no longer legible as an amount — say nothing rather than a wrong number",
    ).toBe(true);
    expect(CLIENT_CAP_USD).toBeGreaterThan(0);
  });

  it("finds the doors a stock client cannot buy at all", () => {
    const blocked = overCapItems();
    expect(
      blocked.length,
      "no door reads as over the cap — either the shelf changed or the reading broke",
    ).toBeGreaterThan(0);
    for (const item of blocked) {
      expect(Math.min(...priceTiersUsdc(item))).toBeGreaterThan(CLIENT_CAP_USD);
    }
  });
});

describe("a door that a stock client will refuse says so in its own 402", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("puts the notice, the figure and the two settings in the 402 body", async () => {
    const item = overCapItems()[0];
    expect(item, "no over-cap item to probe").toBeDefined();
    if (!item) return;
    const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
    expect(response.status).toBe(402);
    const body = (await response.json()) as Record<string, unknown>;
    const notice = String(body["client_spend_cap"] ?? "");
    expect(
      notice,
      "the door a stock client throws on says nothing about it — the buyer spends a round trip to learn what we already knew",
    ).not.toBe("");
    expect(notice).toContain(CLIENT_CAP_LABEL);
    expect(
      notice,
      "the notice names no way out — a warning without a setting is just an apology",
    ).toContain("maxAmountPerPayment");
    expect(notice).toContain("spendControls");
    expect(
      notice,
      "the cheapest accept is what the buyer must clear; the notice has to name it",
    ).toContain(String(Math.min(...priceTiersUsdc(item))));
  }, 20_000);

  it("stays quiet at a door the cap does not touch", async () => {
    const cheap = MENU_ITEMS.find((item) => {
      const reading = readAgainstCap(priceTiersUsdc(item));
      return reading !== null && !reading.blocked && !reading.tipCapped;
    });
    expect(cheap, "no wholly-under-cap item on the shelf").toBeDefined();
    if (!cheap) return;
    const response = await SELF.fetch(`${BASE}/api/buy/${cheap.id}`);
    expect(
      response.status,
      "the control door did not even answer 402 — an absence read off an error page proves nothing (rule 46)",
    ).toBe(402);
    const body = (await response.json()) as Record<string, unknown>;
    expect(
      body["client_spend_cap"],
      "a door the ceiling cannot block carries the warning anyway — a notice on everything is a notice on nothing",
    ).toBeUndefined();
  }, 20_000);
});

describe("the manual an agent reads before buying says it too", () => {
  it("names the ceiling in the purchasing flow, where the claim it qualifies lives", () => {
    const manual = agentsMd(BASE);
    expect(
      manual,
      "agents.md tells an agent that a stock client handles steps 2-3 and never mentions the ceiling that stops it",
    ).toContain(CLIENT_CAP_LABEL);
    expect(manual).toContain("maxAmountPerPayment");
  });

  it("counts the affected doors from the shelf instead of typing the number", () => {
    // Whitespace-normalized: the claim under test is that the count is
    // DERIVED and published, not that prose wraps at a given column.
    const manual = agentsMd(BASE).replace(/\s+/g, " ");
    const blocked = overCapItems().length;
    const priced = MENU_ITEMS.filter((item) => item.price_usdc > 0).length;
    expect(
      manual.includes(`${blocked} of this store's ${priced} priced doors`),
      `agents.md does not carry the derived count (${blocked} of ${priced}) — a typed count goes stale the next time a price moves`,
    ).toBe(true);
  });
});


describe("what we tell operators and what we tell buyers is one figure", () => {
  /*
   * THE DEFECT THIS BATTERY EXISTS TO FIND, COMMITTED BY THE BATTERY.
   *
   * `above-default-client-cap` tells another operator their door is
   * over the ceiling; the 402 disclosure tells our own buyers the
   * same thing about ours. Before #52 those were two parsers of one
   * constant sitting in two files. Quoting $1 to an operator and $5
   * to a buyer would be exactly the kind of two-instruments-one-fact
   * disagreement this store publishes a vocabulary to prevent.
   *
   * They now share `readAgainstCap`, so this asserts what that buys:
   * one figure, both audiences.
   */
  it("quotes the same ceiling in the operator advisory and the buyer notice", () => {
    const dearDoor = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "25000000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1111111111111111111111111111111111111111",
        },
      ],
    };
    const response = new Response("{}", {
      status: 402,
      headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(dearDoor)) },
    });
    const checks = runChecks(response, false);
    const advisory = JSON.stringify(checks);
    expect(
      advisory,
      "the operator advisory stopped naming the ceiling it is about",
    ).toContain(CLIENT_CAP_LABEL);
  });
});
