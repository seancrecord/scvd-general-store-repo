import { SELF, env } from "cloudflare:test";
import type { Env } from "@/types";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

/**
 * WHAT EACH PUBLISHED VERDICT CANNOT SEE.
 *
 * Swept 2026-08-02 after three instruments turned out to have unstated
 * blind spots inside one day, every one found by accident:
 * reconcileSettles reported clean through undelivered sales, the
 * delivery audit could not see its own writes failing, and the skill
 * freshness suite passes while the bundle silently lacks new
 * capabilities.
 *
 * The pattern is not that the checks were wrong. Each was correct
 * about the thing it measured. The failure is that a correct answer
 * to a narrow question READS as an answer to the broad one, and a
 * reader has no way to tell which they were handed.
 *
 * So: every surface that publishes a verdict states what it cannot
 * see, and these tests hold that in place. A limit that can be
 * dropped in a refactor is a limit that will be.
 */

beforeAll(() => {
  installFacilitatorMock();
});

describe("the track record names its own blind spot", () => {
  it("says the log is built from our own writes and cannot see what was never written", async () => {
    /**
     * The worst possible place for an unstated blind spot: a page
     * whose entire job is evidencing conduct. Computed from ORDERS,
     * so a settlement that never created one does not appear as a
     * failure — it does not appear at all, and the log reads clean
     * while a buyer got nothing.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/fulfillment-log`)
    ).json()) as Record<string, unknown>;
    const limit = String(body["what_this_log_cannot_see"]);
    expect(limit).toContain("would not show up at all");
    // And it names the instruments that DO cover it, so a reader can
    // go ask about those rather than discovering the gap themselves.
    expect(limit).toContain("delivery audit");
    expect(limit.toLowerCase()).toContain("base");
    expect(limit).toContain("/corrections");
  });
});

describe("the funnel does not assert what it cannot check", () => {
  it("stops claiming every counted settlement minted an artifact", async () => {
    /**
     * The counter is bumped in recordSettlement, which runs BEFORE
     * the handler that mints. So a sale that settled and then failed
     * to deliver IS counted here and has nothing behind it — the flat
     * claim was falsifiable and unverified, which is the shape this
     * store exists to avoid.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/pulse.json`)
    ).json()) as Record<string, unknown>;
    const text = JSON.stringify(body);
    expect(text).not.toContain("Every settlement counted here minted");
    expect(text).toContain("EXPECTED to have minted");
    // A claim with an instrument behind it, not an assurance.
    expect(text).toContain("delivery audit");
  });

  it("says the same thing on the page a human reads", async () => {
    // The HTML carried its own copy of the claim; a limit stated in
    // JSON and dropped in prose is a limit stated to nobody.
    // /pulse content-negotiates; without this header it serves JSON,
    // so the first cut of this test was checking the wrong document.
    const html = await (
      await SELF.fetch(`${BASE}/pulse`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).not.toContain("Every settlement counted here minted a signed artifact —");
    expect(html).toContain("checked rather than asserted");
  });
});

describe("surfaces that already knew their limits keep them", () => {
  it("the anchor log still leads with WHEN not WHO", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/anchor-log.json`)
    ).json()) as Record<string, unknown>;
    expect(String(body["what_it_does_not_prove"])).toContain("WHO SHOULD HAVE");
  });

  it("the claims door still names what it cannot verify, on both rails", async () => {
    const res = await SELF.fetch(`${BASE}/api/claims`);
    const body = (await res.json()) as Record<string, unknown>;
    // Was "EOA signatures only" while the door was EVM-only; the
    // limit survived the second rail with both halves named.
    expect(String(body["limits"])).toContain("EIP-1271");
    expect(String(body["limits"])).toContain("PDA");
  });

  it("trust.json still carries its limit", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as Record<string, unknown>;
    expect(String(body["limit"]).toLowerCase()).toContain("weakest");
  });
});

/**
 * THE FOURTH ONE, FOUND 2026-08-02 IN A STRATEGY CONVERSATION RATHER
 * THAN IN A SWEEP — which is the argument for the sweep.
 *
 * A reading of the office's Sources table concluded that no traffic
 * has ever arrived from a directory listing. The table said so. The
 * table cannot know it, and the two instruments on that page are blind
 * for OPPOSITE reasons:
 *
 *   - The channel column infers `bazaar` from a referrer header.
 *     Machine clients overwhelmingly send none, so a directory-referred
 *     agent lands in `direct`, indistinguishable from a bookmark. A
 *     zero there is zero ATTRIBUTABLE arrivals.
 *   - The venue line takes `?src=` markers, which need no referrer and
 *     work fine on a bare client — but it only counts markers we
 *     minted, and the only two in the codebase are `try` and `skill`.
 *     No directory listing carries one. An empty venue line means we
 *     never handed out the paper.
 *
 * Neither is evidence about directory traffic. A number nobody can
 * falsify, read as a finding, is how a store decides to stop doing
 * something that was working — so the page says this itself now,
 * beside the numbers, where the reading happens.
 */
describe("the office says why its channel numbers cannot settle the question", () => {
  const adminAuth = {
    Authorization: `Basic ${btoa(`keeper:${(env as unknown as Env).ADMIN_PASSWORD}`)}`,
  };

  it("names the referrer gap under the channel table", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    // The template wraps, so a phrase that spans a line break is not a
    // literal substring of the response. Collapse whitespace and match
    // the sentence rather than pinning the copy's line endings.
    const flat = html.replace(/\s+/g, " ");
    expect(flat).toContain("zero ATTRIBUTABLE arrivals");
    expect(flat).toContain("indistinguishable from a bookmark");
  });

  it("names the unminted-marker gap beside the venue line", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    const flat = html.replace(/\s+/g, " ");
    expect(flat).toContain("the paper was never handed out");
  });

  /**
   * THE HAND-TYPED VERSION OF THIS TEST LASTED ABOUT AN HOUR.
   *
   * It pinned the caveat's claim that the only markers were `try` and
   * `skill` — which was already false when it was written: the marker
   * that actually ships in the ClawHub bundle is `clawhub-skill`, and
   * a fourth (`workcheck-persona-test`) had fired in the live books
   * without existing anywhere in this codebase at all.
   *
   * Both facts came from CV reading the counters, not from the test.
   * That is rule 1 collecting on a debt inside the same afternoon: a
   * hand-typed list is wrong the moment somebody looks. The register
   * in src/store/venues.ts is the source now, the page counts it, and
   * test/venue-register.spec.ts holds the two together — so this file
   * asserts only the shape of the caveat, not its contents.
   */
  it("says the old rows keep their own names, so history is not silently rewritten", async () => {
    // Bucketing applies to NEW writes only; keys written before the
    // register are read as written. A reader who remembers seeing a
    // marker that is no longer registrable needs to know it is still
    // its own row rather than folded away.
    const html = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    const flat = html.replace(/\s+/g, " ");
    expect(flat).toContain("Rows predating the register keep their own names");
    expect(flat).toContain("Only new writes are bucketed");
  });
});

/**
 * ROUND TWO OF THE SWEEP, 2026-08-02. Same question asked of the
 * surfaces the first pass did not reach: what would this page look
 * like if the thing it measures failed silently?
 *
 * Two answers came back wrong, and one of them was a sentence written
 * earlier the same day on /try — which is the argument for asking the
 * question on a schedule rather than when something feels off.
 */
describe("round two: the record and the books state their limits", () => {
  it("/corrections says the list is written by hand", async () => {
    // Nothing writes to CORRECTIONS. It is a static array in
    // src/store/corrections.ts; the delivery audit and the chain walk
    // raise ALERTS and stop there, by design (rule 30). A reader had
    // no way to tell a quiet week from an unwritten one.
    const body = (await (
      await SELF.fetch(`${BASE}/corrections`)
    ).json()) as Record<string, unknown>;
    const caveat = String(body["what_this_record_cannot_show_you"]);
    expect(caveat).toContain("written by hand");
    expect(caveat).toContain("raises an ALERT to a person");
    expect(
      caveat,
      "the caveat has to name the ambiguity, not just the mechanism",
    ).toContain("nobody wrote anything down");
  });

  it("/stats says its numbers are our books rather than the chain", async () => {
    // "Computed live, no hand edits" was standing in for independence
    // it does not provide: a settle that never bumped a counter is an
    // ABSENCE here, not a discrepancy, so the page reads clean.
    const body = (await (await SELF.fetch(`${BASE}/stats`)).json()) as Record<
      string,
      unknown
    >;
    const what = String(body["what_these_numbers_are"]);
    expect(what).toContain("OUR BOOKS, NOT THE CHAIN");
    expect(what).toContain("would not appear at all");
    expect(
      String(body["how_to_check_it_without_us"]),
      "naming the limit without handing over the means to check it is half an answer",
    ).toContain("Base is readable by anyone");
  });

  it("/stats still publishes the numbers it is caveating", async () => {
    // A caveat that arrived by deleting the figure would be the wrong
    // fix. The books stay; the frame goes around them.
    const body = (await (await SELF.fetch(`${BASE}/stats`)).json()) as Record<
      string,
      unknown
    >;
    expect(body["track_record"]).toBeTruthy();
    expect(body["house_flag_policy"]).toBeTruthy();
  });
});
