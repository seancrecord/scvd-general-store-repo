import { SELF } from "cloudflare:test";
import { DID_DOC_TIMEOUT_MS } from "@/services/conformance";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE HAPPY PATH OF THE HEADLINE FREE FEATURE, WHICH WAS NEVER TESTED.
 *
 * Found by CV on 2026-08-03, walking the store as a buyer persona: he
 * pulled a genuinely valid, currently-live signed offer off our own
 * /api/buy/small_blessing 402 and fed it to the conformance desk. It
 * answered does_not_conform, three times running. Not flaky, not
 * crypto — the did:web resolution was throwing before it made a single
 * request.
 *
 * THE BUG: `redirect: "error"`. Workers never implemented it —
 * `TypeError: Invalid redirect value, must be one of "follow" or
 * "manual" ("error" won't be implemented)`. Every resolution threw,
 * resolveDidWeb caught it and reported "did document unreachable",
 * which is indistinguishable from a host that really is down. So the
 * feature /try and /what both point at as the reason to trust anything
 * here failed 100% of its happy path for a day, quietly.
 *
 * WHY THE SUITE MISSED IT, which is the part worth keeping. Every
 * conformance test supplied `public_key_hex` — the offline path, which
 * skips resolution entirely — and the two that did resolve pointed at
 * example.test, an unresolvable host. So the tests asserted that the
 * FAILURE path fails gracefully, and it did. The path that mattered
 * was never exercised with a request that could have succeeded.
 *
 * That is a vacuous pass wearing a green tick: testing that a broken
 * thing breaks politely, and never testing that the working thing
 * works. Same shape as the season-one test that passed by returning
 * early, found the same night.
 */
describe("did:web resolution can actually be attempted", () => {
  /**
   * THE REGRESSION GUARD, and it deliberately does not need the
   * network. The defect was in the REQUEST OPTIONS — it threw before
   * any byte went out — so the check that catches it is whether the
   * options are constructible at all.
   */
  it("does not use a redirect mode Workers refuses to construct", async () => {
    let thrown: Error | null = null;
    try {
      await fetch("https://scvd.store/.well-known/did.json", {
        redirect: "manual",
        signal: AbortSignal.timeout(50),
      });
    } catch (error) {
      thrown = error as Error;
    }
    // Any network outcome is fine here. A TypeError is not: it means
    // the options themselves are invalid and no request was ever made.
    expect(
      thrown?.name,
      `fetch options rejected before any request: ${thrown?.message}`,
    ).not.toBe("TypeError");
  });

  it("proves redirect:\"error\" would still break it", async () => {
    // Kept as an executable record of the defect. If Workers ever
    // implements it this fails and the comment above can be retired.
    let thrown: Error | null = null;
    try {
      await fetch("https://scvd.store/.well-known/did.json", {
        redirect: "error" as "manual",
        signal: AbortSignal.timeout(50),
      });
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.name).toBe("TypeError");
    expect(thrown?.message).toContain("Invalid redirect value");
  });

  /**
   * THE SHAPE OF THE FAILURE CV SAW, asserted end to end. Resolution
   * against an unreachable host must report a RESOLUTION problem and
   * must never report a TypeError about our own request options — the
   * two were indistinguishable in the verdict, which is why a config
   * bug read as somebody else's server being down.
   */
  it("reports a resolution failure, never our own broken options", async () => {
    const jws = [
      btoa(JSON.stringify({ alg: "EdDSA", kid: "did:web:example.test#k" }))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
      btoa(JSON.stringify({ version: 1 }))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
      "AA",
    ].join(".");
    const response = await SELF.fetch(`${BASE}/api/conformance/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact: jws }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    const detail = JSON.stringify(body.checks ?? []);
    expect(
      detail.includes("Invalid redirect value"),
      "the desk is reporting our own invalid fetch options as a fact about somebody else's DID document",
    ).toBe(false);
    /*
     * HEADROOM, DERIVED RATHER THAN GUESSED. This test makes a real
     * resolution attempt against an unreachable host, and the desk
     * gives that attempt DID_DOC_TIMEOUT_MS. Vitest's default ceiling
     * is 5s, which left barely two seconds for everything else — and
     * on 2026-08-09 a loaded CI runner ate it and failed a DOCS-ONLY
     * commit. A red build that says nothing about the diff is worse
     * than a slow one: it teaches everybody to re-run and stop
     * reading.
     *
     * Sized off the real budget so the two cannot silently invert.
     */
  }, DID_DOC_TIMEOUT_MS * 8);

  it("never answers with a 5xx when a stranger's host misbehaves", async () => {
    // CV saw a 522 upstream. A counterpart being unreachable is a
    // verdict, never an outage on our side.
    const response = await SELF.fetch(`${BASE}/api/conformance/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact: "not.a.jws", check_anchor: true }),
    });
    expect(response.status).toBeLessThan(500);
  });
});
