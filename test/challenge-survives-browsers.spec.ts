import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRoutesConfig } from "@/lib/payments";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE CHALLENGE OUTLIVES THE FRIENDLY PAGE (2026-09-21).
 *
 * An agent review raised this at the door: "in a browser,
 * GET /api/buy/{item} auto-redirects to a friendly HTML page and the
 * 402 quote is invisible — confirm that a client whose HTTP stack
 * chases redirects still receives the raw 402 with the
 * PAYMENT-REQUIRED challenge."
 *
 * It does, and the reason is stronger than the question assumed:
 * there is no redirect anywhere on a paid door. The friendly page is
 * the BODY of the 402 itself, served with the status, the
 * PAYMENT-REQUIRED header and the WWW-Authenticate challenge fully
 * intact. A client that follows redirects has nothing to follow, so
 * it cannot be carried away from the quote — and a client that reads
 * headers gets the terms whatever its Accept says.
 *
 * WHAT THIS FILE ACTUALLY PINS, and why it is not "every door says
 * 402". Which transports a door offers is configuration (MPP is
 * env-gated), and a human-labour door behind a closed shutter refuses
 * rather than quoting a price the keeper cannot honour — so a bare
 * status assertion would encode this environment's config as though
 * it were the contract.
 *
 * The contract is PARITY: looking like a browser must never cost a
 * caller anything. Whatever a door tells a JSON client, it tells a
 * browser and a generic fetch stack — same status, same challenge,
 * same transports — and it never answers any of them with a redirect.
 * That is the property the review was really asking after, it holds
 * in every configuration, and it is exactly what a later "be nicer to
 * humans" change would break by serving that page as a 200 or as a
 * 302 to /try.
 *
 * Every request below uses redirect: "follow" — the default for fetch
 * and for most generic client stacks, and the exact shape the review
 * was worried about.
 */

/** Both halves, per the note in human-paywall.spec.ts. */
const BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/** A generic fetch stack: no Accept preference, no browser tell. */
const PLAIN = { Accept: "*/*" };

/** What an agent library asks for, and the baseline the others must match. */
const JSON_CLIENT = { Accept: "application/json" };

beforeAll(() => {
  installFacilitatorMock();
});

function decodeChallenge(header: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(header), (character) => character.charCodeAt(0)),
    ),
  ) as Record<string, unknown>;
}

/** The auth scheme a door names, without its per-request nonce. */
function scheme(response: Response): string | null {
  const header = response.headers.get("WWW-Authenticate");
  return header ? (header.split(/[\s,]/)[0] ?? null) : null;
}

function get(path: string, headers: Record<string, string>): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, { headers, redirect: "follow" });
}

/**
 * One door of each shape the store sells: a plain shelf item, an item
 * that REQUIRES a query parameter (the branch that refuses before the
 * gate), a term item, a pay-what-it-deserves item, a penny page and a
 * commission rung. The last two are the ones that fell through to a
 * stranger's page once before.
 */
const DOORS = [
  "/api/buy/hello",
  "/api/buy/spot_check",
  "/api/buy/conformance_watch",
  "/api/buy/luckies",
  "/almanac/notes-from-a-tuesday-in-oak-city",
  "/api/commission/pay/25",
];

describe("the 402 challenge survives a redirect-following client", () => {
  it("never answers a paid door with a redirect, whoever is asking", async () => {
    for (const door of DOORS) {
      for (const [label, headers] of [
        ["a browser", BROWSER],
        ["a generic fetch stack", PLAIN],
        ["a JSON client", JSON_CLIENT],
      ] as const) {
        const response = await get(door, headers);
        expect(response.redirected, `${door} (${label}) was redirected`).toBe(false);
        expect(
          response.status >= 300 && response.status < 400,
          `${door} (${label}) answered ${response.status}, a redirect`,
        ).toBe(false);
        expect(response.headers.get("Location"), `${door} (${label})`).toBeNull();
      }
    }
  });

  it("tells a browser exactly what it tells a JSON client", async () => {
    /*
     * The parity assertion. A door may quote (402) or refuse (a closed
     * shutter on human labour) — but it must give the same answer, on
     * the same transports, to all three. If content negotiation ever
     * starts deciding whether terms are offered at all, this fails.
     */
    for (const door of DOORS) {
      const baseline = await get(door, JSON_CLIENT);
      for (const [label, headers] of [
        ["a browser", BROWSER],
        ["a generic fetch stack", PLAIN],
      ] as const) {
        const response = await get(door, headers);
        expect(response.status, `${door}: ${label} got a different status`).toBe(
          baseline.status,
        );
        expect(
          response.headers.get("PAYMENT-REQUIRED") === null,
          `${door}: ${label} did not get the same x402 challenge`,
        ).toBe(baseline.headers.get("PAYMENT-REQUIRED") === null);
        expect(scheme(response), `${door}: ${label} was offered a different transport`).toBe(
          scheme(baseline),
        );
      }
    }
  });

  it("gives a complete quote whenever it quotes at all", async () => {
    for (const door of DOORS) {
      for (const headers of [BROWSER, PLAIN, JSON_CLIENT]) {
        const response = await get(door, headers);
        const challenge = response.headers.get("PAYMENT-REQUIRED");
        // A door that refused (closed shutter) quotes nothing, and
        // that is the honest answer — but a door that DID quote must
        // have quoted completely.
        if (response.status !== 402 || !challenge) continue;

        const quote = decodeChallenge(challenge);
        expect(quote["x402Version"], door).toBe(2);
        const accepts = quote["accepts"] as Array<Record<string, unknown>>;
        expect(Array.isArray(accepts), door).toBe(true);
        expect(accepts.length, `${door} offered no network`).toBeGreaterThan(0);
        for (const accept of accepts) {
          expect(accept["network"], door).toBeTruthy();
          expect(accept["amount"], door).toBeTruthy();
          expect(accept["payTo"], door).toBeTruthy();
        }
      }
    }
  });

  it("serves the human a page without taking the machine's terms away", async () => {
    /*
     * The friendly page and the challenge on ONE response. This is
     * the invariant the review doubted, stated directly: a browser
     * gets prose, and the same bytes carry the quote.
     */
    const response = await get("/api/buy/hello", BROWSER);
    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain("x402");
    expect(response.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
  });

  it("holds for every shelf door the store builds, not only the sample", async () => {
    /*
     * The sample above is readable; this is complete. buildRoutesConfig
     * is the same seam the human-paywall guard uses, so a door added
     * next month is covered here the day it is added.
     */
    const patterns = Object.keys(buildRoutesConfig(testEnv))
      .filter((pattern) => pattern.startsWith("GET /api/buy/"))
      .map((pattern) => pattern.slice("GET ".length));
    expect(patterns.length).toBeGreaterThan(30);

    for (const path of patterns) {
      const browser = await get(path, BROWSER);
      const machine = await get(path, JSON_CLIENT);
      expect(browser.redirected, path).toBe(false);
      expect(browser.status, `${path}: browser and machine disagree`).toBe(machine.status);
      expect(
        browser.headers.get("PAYMENT-REQUIRED") === null,
        `${path}: the browser lost the challenge`,
      ).toBe(machine.headers.get("PAYMENT-REQUIRED") === null);
    }
  });
});
