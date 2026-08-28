import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRoutesConfig } from "@/lib/payments";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * A REAL BROWSER'S HEADERS, and both halves matter.
 *
 * `@x402/core`'s `isWebBrowser` requires `Accept: text/html` AND a
 * User-Agent containing "Mozilla" — both, not either. The first probe
 * of this defect sent the Accept header alone, got JSON back from
 * every route including the ones that DO set a page, and briefly
 * looked like the opposite finding: that our own paywall page never
 * rendered anywhere. It renders. The buy doors were always fine.
 *
 * That near-miss is why this constant lives here with its reason
 * attached: a test that gets these headers wrong reports "no route
 * serves a human page" and passes forever after the bug is fixed.
 */
const BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/** The line from the library's fallback that gives it away. */
const LIBRARY_TELL = "@x402/paywall";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE STANDING GUARD (#91, 2026-08-28).
 *
 * `customPaywallHtml` was set on the buy routes and nowhere else, so
 * the penny pages and the commission rungs fell through to
 * `@x402/core`'s `FALLBACK_PAYWALL_HTML` — a page titled "Payment
 * Required" that names neither the store nor the price nor the goods,
 * and instructs the READER to "install @x402/paywall", which is
 * advice for the operator rendered to the visitor.
 *
 * It went a month unseen because the route table was assembled inside
 * getPaymentStack, where only a running Worker could look at it.
 * There was no seam at which to ask "do all of them have one?", so
 * nobody asked. `buildRoutesConfig` is that seam, and this is the
 * question.
 */
describe("no paid door serves a stranger's page", () => {
  it("gives every route the store builds a human page of its own", () => {
    const routes = buildRoutesConfig(testEnv);
    const patterns = Object.keys(routes);
    // A guard over an empty table is a guard that cannot fail.
    expect(patterns.length).toBeGreaterThan(20);
    const naked = patterns.filter((pattern) => {
      const config = (routes as Record<string, { customPaywallHtml?: string }>)[
        pattern
      ];
      return typeof config?.customPaywallHtml !== "string";
    });
    expect(
      naked,
      "these paid routes have no customPaywallHtml, so a human with a browser gets @x402/core's fallback page — the one that tells them to install a package we do not run",
    ).toEqual([]);
  });

  it("never lets the library's fallback wording into a page we wrote", () => {
    const routes = buildRoutesConfig(testEnv);
    for (const [pattern, config] of Object.entries(
      routes as Record<string, { customPaywallHtml?: string }>,
    )) {
      const html = config.customPaywallHtml ?? "";
      expect(html, `${pattern} carries the library's tell`).not.toContain(
        LIBRARY_TELL,
      );
      // Ours name the store and offer a way back to something free.
      expect(html, `${pattern} does not link back to the store`).toContain(
        testEnv.STORE_BASE_URL,
      );
      expect(html, `${pattern} has no title`).toMatch(/<title>[^<]+<\/title>/);
    }
  });

  /**
   * THE THREE PAGES SAY DIFFERENT THINGS, and that is the point of not
   * sharing one body. A shelf item genuinely is for agents. An almanac
   * page is something a person can read for a penny, and telling that
   * person to go away would be both rude and false — a stranger buying
   * one is the only sale of its kind this store has made. A commission
   * rung is not a door to wander into at all: it refuses without a
   * live quote, so an invitation to pay it would be an invitation to
   * lose money.
   */
  it("addresses the reader each door actually gets", () => {
    const routes = buildRoutesConfig(testEnv) as Record<
      string,
      { customPaywallHtml?: string }
    >;
    const buy = routes["GET /api/buy/hello"]?.customPaywallHtml ?? "";
    expect(buy).toContain("That shelf is for agents, friend.");

    const almanac = routes["GET /almanac/:slug"]?.customPaywallHtml ?? "";
    expect(almanac).toContain("That'll be a penny, friend.");
    // It points a person at the free reading rather than at the exit.
    expect(almanac).toContain("/almanac");

    const rung = routes["GET /api/commission/pay/50"]?.customPaywallHtml ?? "";
    expect(rung).toContain("$50");
    // The honest warning: paying this without a quote buys a refusal.
    expect(rung).toContain("refusal");
  });

  /**
   * EVERY LINK ON THESE PAGES IS WALKED, because the first draft of
   * the commission page pointed at `/commission` — a page that does
   * not exist and never has. It read plausibly, it typechecked, and
   * it would have shipped a 404 as the store's advice to somebody who
   * had just been told not to spend money. Rule 55 exists for exactly
   * that, and the check is cheap: follow every href we wrote.
   *
   * Only same-origin links are walked. Nothing here should point off
   * the store anyway, and a test that reaches the open internet is a
   * test that fails for reasons that are nobody's fault.
   */
  it("walks every link these pages promise", async () => {
    const routes = buildRoutesConfig(testEnv) as Record<
      string,
      { customPaywallHtml?: string }
    >;
    const targets = new Set<string>();
    for (const config of Object.values(routes)) {
      for (const match of (config.customPaywallHtml ?? "").matchAll(
        /href="([^"]+)"/g,
      )) {
        const href = match[1]!;
        if (href.startsWith(testEnv.STORE_BASE_URL)) {
          targets.add(href);
        }
      }
    }
    expect(targets.size).toBeGreaterThan(2);
    const dead: string[] = [];
    for (const href of targets) {
      const response = await SELF.fetch(href);
      if (response.status >= 400) {
        dead.push(`${href} -> ${response.status}`);
      }
    }
    expect(
      dead,
      "a paywall page links somewhere that does not answer — the reader is being turned away and then sent nowhere",
    ).toEqual([]);
  });

  /**
   * THE BUY DOOR'S BYTES ARE UNCHANGED. Factoring the chrome out of
   * three copies is exactly the kind of edit that quietly reflows
   * published copy, and this door's words shipped and have been read.
   */
  it("keeps the buy door's published wording byte for byte", () => {
    const routes = buildRoutesConfig(testEnv) as Record<
      string,
      { customPaywallHtml?: string }
    >;
    expect(routes["GET /api/buy/hello"]?.customPaywallHtml).toBe(
      `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>That shelf is for agents</title></head>
<body style="font-family: Georgia, serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem;">
<h1>That shelf is for agents, friend.</h1>
<p>&ldquo;A Signed Hello&rdquo; is bought over the x402 protocol &mdash; your agent
will know what to do with the 402 this page came with.</p>
<p>You're welcome to browse the <a href="${testEnv.STORE_BASE_URL}/">front of the store</a>
like a regular person. The guestbook's free.</p>
</body></html>`,
    );
  });
});

/**
 * THE END-TO-END HALF, because the table being right is not the same
 * as the bytes reaching a browser. This is the shape of the original
 * observation, kept as the regression: walk in with a browser's
 * headers and read what comes back.
 */
describe("what a person actually gets served", () => {
  it("hands a browser our page at a buy door", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: BROWSER,
    });
    expect(response.status).toBe(402);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("That shelf is for agents, friend.");
    expect(html).not.toContain(LIBRARY_TELL);
  });

  /**
   * THE PAGE THE DEFECT WAS ACTUALLY ON. The almanac is the only shelf
   * a stranger has ever bought from — the note above
   * pennyPageRouteConfig records that first sale — so this is the door
   * where a stranger's "install @x402/paywall" was doing the most
   * damage, and the one whose regression matters most.
   */
  it("hands a browser our page at a penny page, not the library's", async () => {
    const response = await SELF.fetch(
      `${BASE}/almanac/notes-from-a-tuesday-in-oak-city`,
      { headers: BROWSER },
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).not.toContain(LIBRARY_TELL);
    expect(html).not.toContain("<title>Payment Required</title>");
    expect(html).toContain("That'll be a penny, friend.");
  });

  /**
   * An agent's 402 is untouched by any of this: the paywall branch
   * needs a browser's two headers, and everything else still gets the
   * JSON body and the PAYMENT-REQUIRED header it always got. Worth
   * asserting, because a paywall change that quietly reshaped the
   * machine-readable challenge would break every buyer to fix a page
   * almost nobody sees.
   */
  it("leaves the machine-readable challenge alone", async () => {
    const response = await SELF.fetch(
      `${BASE}/almanac/notes-from-a-tuesday-in-oak-city`,
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("content-type")).toContain("application/json");
    const header = [...response.headers.keys()].find(
      (name) => name.toLowerCase() === "payment-required",
    );
    expect(header).toBeTruthy();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["price_usdc"]).toBe(0.01);
  });
});
