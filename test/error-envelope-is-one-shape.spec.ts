import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * ONE ERROR SHAPE, EVERY REFUSAL (2026-09-21).
 *
 * An agent review asked for "one consistent error shape everywhere
 * (code, message, recovery links) so agents can handle failures
 * programmatically instead of parsing four formats."
 *
 * WHAT WAS ACTUALLY WRONG, which is narrower than the review thought
 * and worse where it was true. The review's example surfaces —
 * /catalog, /returns, /shipping — already shared one envelope to the
 * byte; they looked like three formats because two were read pretty
 * printed and one raw, which is a client's whitespace and not ours.
 * /contact and /terms are not errors at all: they are 301s onto /what
 * and /rights, real pages under guessable names, and an alias that
 * resolves is the opposite of a failure to handle.
 *
 * The real gap was inside the shared envelope. The item refusals
 * carried `code`, `charged` and `retry_same_request` — the three
 * fields a caller actually branches on — and the two envelopes every
 * wrong guess in the store lands on, the 404 and the 405, carried
 * none of them. The most-hit refusals were the least machine-readable
 * ones, and an agent that guessed a URL had to read English to learn
 * whether it had been charged.
 *
 * So this file asserts the floor rather than a single literal schema:
 * every refusal names a code from the store's own vocabulary, says
 * whether money moved, says whether the request is worth repeating,
 * and offers a free way back. Surfaces stay free to add fields that
 * only they can mean — `allow` on a 405, `where_to_look_next` on a
 * 404 — because a shared floor is what a client can rely on, and a
 * frozen shape is what stops a surface from being useful.
 */

type Envelope = Record<string, unknown>;

async function refusal(path: string, init?: RequestInit): Promise<{ status: number; body: Envelope }> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    ...init,
  });
  expect(response.headers.get("Content-Type"), path).toContain("application/json");
  return { status: response.status, body: (await response.json()) as Envelope };
}

/** Every shape of "no" a guessing caller can provoke without paying. */
const REFUSALS: Array<[string, string, RequestInit | undefined]> = [
  ["an aisle that never existed", "/catalog", undefined],
  ["a plausible ecommerce path", "/returns", undefined],
  ["another one", "/shipping", undefined],
  ["a nonsense path", "/no-such-aisle-at-all", undefined],
  ["an item id nobody sells", "/menu/nonesuch", undefined],
  ["a real door, wrong method", "/api/bell", { method: "GET" }],
];

describe("every refusal answers in one shape", () => {
  for (const [label, path, init] of REFUSALS) {
    it(`names a code and says whether money moved: ${label}`, async () => {
      const { status, body } = await refusal(path, init);
      expect(status, path).toBeGreaterThanOrEqual(400);

      // A sentence a person can read.
      expect(typeof body["error"], `${path} has no error message`).toBe("string");
      expect((body["error"] as string).length, path).toBeGreaterThan(0);

      // A token a program can switch on.
      expect(typeof body["code"], `${path} has no code to branch on`).toBe("string");
      expect(body["code"], path).toMatch(/^[a-z][a-z0-9_]*$/);

      // The one fact a buyer must never have to infer.
      expect(body["charged"], `${path} does not say whether money moved`).toBe(false);

      // Whether to try again at all.
      expect(
        body["retry_same_request"],
        `${path} does not say whether the request is worth repeating`,
      ).toBe(false);
    });

    it(`offers a free way back: ${label}`, async () => {
      const { body } = await refusal(path, init);
      /*
       * Recovery is a link the caller can follow for nothing. Either a
       * next_step read or, on the 404, the whole door set — but never
       * a dead end and never a paid one.
       */
      const next = body["next_step"] as { url?: string; payment_required?: boolean } | undefined;
      const where = body["where_to_look_next"] as Array<{ url: string }> | undefined;
      const menu = body["menu_url"];

      expect(
        Boolean(next?.url) || (where?.length ?? 0) > 0 || typeof menu === "string",
        `${path} refuses without offering anywhere to go`,
      ).toBe(true);

      if (next) {
        expect(next.payment_required, `${path} points recovery at a paid door`).toBe(false);
      }
    });
  }

  it("keeps the example surfaces the review named on one envelope", async () => {
    /*
     * The review read these three as three formats. They are one, and
     * this is the assertion that keeps them one — byte-for-byte on the
     * keys, whatever a client's pretty-printer does on the way in.
     */
    const [catalog, returns, shipping] = await Promise.all(
      ["/catalog", "/returns", "/shipping"].map((path) => refusal(path)),
    );
    expect(catalog.status).toBe(404);
    expect(Object.keys(catalog.body).sort()).toEqual(Object.keys(returns.body).sort());
    expect(Object.keys(catalog.body).sort()).toEqual(Object.keys(shipping.body).sort());
  });

  it("resolves the aliases the review read as inconsistent errors", async () => {
    /*
     * /contact and /terms are not failures to standardize. They are
     * names a caller reasonably guesses, pointed at the pages that
     * answer them. Pinned so nobody "standardizes" a working alias
     * into a 404 on the strength of that review line.
     */
    for (const [alias, target] of [
      ["/contact", "/what"],
      ["/terms", "/rights"],
    ]) {
      const response = await SELF.fetch(`${BASE}${alias}`, {
        headers: { Accept: "application/json" },
        redirect: "manual",
      });
      expect(response.status, alias).toBe(301);
      // Relative in the test worker, absolute from the edge; the
      // destination is the assertion, not the spelling.
      expect(response.headers.get("Location"), alias).toMatch(
        new RegExp(`^(${BASE})?${target}$`),
      );
    }
  });

  it("names the code in the markdown dialect too", async () => {
    const response = await SELF.fetch(`${BASE}/no-such-aisle-at-all`, {
      headers: { Accept: "text/markdown" },
    });
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("code: not_found");
    expect(body).toContain("nothing was charged");
  });
});
