import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import tillSource from "../till/till.js";
import { renderSimplePage } from "@/pages/simple-page";
import { tillShelfHtml } from "@/lib/till-shelf";
import { MENU_ITEMS } from "@/store";
import { HOUSE_RULE } from "@/store/wallet-safety";

const BASE = "https://scvd.store";

/**
 * THE TILL, FROM THE SERVER'S SIDE.
 *
 * till/till.test.mjs runs the client itself under Node, where it can
 * be imported and executed against fabricated wallets — the Worker
 * pool forbids dynamic code evaluation, so a spec here could only ever
 * check that bytes went out, and bytes going out is not a payment
 * path. This file checks the half that IS the server's:
 *
 *   - the script is served, as itself, from this origin;
 *   - the pages that sell something carry the inert island it reads;
 *   - and — the constraint the whole design turns on — a reader with
 *     scripting off sees a document identical to the one they saw
 *     before any of this existed.
 *
 * That last one is not a manner of speaking. The slot in
 * renderSimplePage is asserted byte-for-byte below: the same page,
 * rendered with and without a till, differs by exactly the appended
 * block and in no other position.
 */

/**
 * The two tags the server adds, together, as a unit. Neither renders:
 * a browser displays no `application/json` script and executes none of
 * it either, and a `<script src>` shows nothing by definition.
 */
const INERT_BLOCK =
  /\n {2}<script type="application\/json" id="scvd-till-shelf">[\s\S]*?<\/script>\n<script type="module" src="\/till\.js"><\/script>/;

/**
 * The till with its documentation removed.
 *
 * The bans below are on what the file DOES, not on what it discusses,
 * and this file discusses every one of them by name — the header
 * comment lists `localStorage` and friends precisely to say it never
 * touches them. A guard that could not tell a promise from a call
 * would fail on the promise, so comments come off first.
 */
const TILL_CODE = tillSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * Every <script> tag in a document, with its attributes.
 *
 * CASE-INSENSITIVE, and that is the whole point rather than a detail.
 * This is the filter behind "no executable script reaches these pages
 * except the till" — and a filter that matches `<script>` but not
 * `<SCRIPT>` passes a page carrying the thing it was written to catch.
 * HTML tag names are case-insensitive; a guard that is not has a hole
 * exactly the size of a capital letter. CodeQL flagged it the day this
 * shipped.
 */
function scriptTags(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
}

async function page(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: "text/html" },
  });
  expect(response.status, path).toBe(200);
  return response.text();
}

describe("the browser till is served as itself", () => {
  it("serves /till.js byte-for-byte from the repository", async () => {
    const response = await SELF.fetch(`${BASE}/till.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/javascript",
    );
    // No sniffing: a script whose type a browser guessed is a script
    // somebody else chose the meaning of.
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

    /*
     * IDENTICAL TO THE SOURCE, and this is the assertion that makes
     * "unminified, auditable, what you read is what you run" a fact
     * rather than an intention. There is no build step between the
     * file in this repository and the bytes a buyer's wallet is asked
     * to trust, and this fails the day one appears.
     */
    expect(await response.text()).toBe(tillSource);
  });

  it("never asks for key material, and never keeps anything", () => {
    /*
     * THE HOUSE PROMISE, AS A TEST RATHER THAN A PARAGRAPH. The store
     * says it never asks anyone to run code, install anything, or hand
     * over credentials or key material. A wallet SIGNATURE is not
     * that — the wallet signs and the key never leaves it — and the
     * distinction is only worth anything if the code is held to it.
     *
     * `eth_signTypedData_v4` is the one signing method used, and it is
     * matched with a word boundary so bare `eth_sign` (which signs
     * arbitrary opaque bytes, the method every drainer wants) stays
     * banned by this same line.
     */
    const forbidden: Array<[RegExp, string]> = [
      [/\beth_sign\b/, "bare eth_sign signs opaque bytes and must never appear"],
      [/personal_sign/, "personal_sign is not how EIP-3009 is authorized"],
      [/eth_sendTransaction/, "this till moves no funds itself"],
      [/privateKey|private_key|mnemonic|seed ?phrase/i, "key material"],
      [/localStorage|sessionStorage|indexedDB|document\.cookie/, "browser storage"],
      [/\beval\b|new Function/, "dynamic code evaluation"],
    ];
    for (const [pattern, why] of forbidden) {
      expect(TILL_CODE, why).not.toMatch(pattern);
    }
    // The one signing method it does use, present and named.
    expect(TILL_CODE).toContain("eth_signTypedData_v4");
    /*
     * And the prose keeps saying so. The comments are the audit trail
     * a buyer reads before trusting a signature request, so the file
     * losing its own explanation is a regression too.
     */
    expect(tillSource).toContain("the key never leaves it");
  });

  it("talks to this origin and nowhere else", () => {
    /*
     * Every URL the till fetches comes out of the page it is on, and
     * every one of them is a path. An absolute http(s) URL in this
     * file would mean the till could be pointed somewhere else — at an
     * RPC provider, an analytics host, anywhere — so the check is that
     * none exists outside of prose.
     */
    expect(TILL_CODE).not.toMatch(/https?:\/\//);
  });
});

describe("nothing renders that did not render before", () => {
  it("adds the till through a slot that cannot emit visible markup", () => {
    /*
     * THE INVARIANT, PROVED AT THE MECHANISM RATHER THAN SAMPLED AT
     * THE PAGES. Same options, same body, one with a till and one
     * without: the documents differ by exactly the appended block and
     * at no other position. A future caller cannot slip a paragraph,
     * a button or a wrapper through this slot without failing here.
     */
    const options = {
      title: "A Room",
      description: "A room in the store, for the purposes of this test.",
      path: "/try",
      bodyHtml: "<section><p>Instructions that work without scripting.</p></section>",
    };
    const inert = tillShelfHtml([MENU_ITEMS[0]!], {
      heading: "Buy it here",
      standfirst: "One signature.",
      verifyHint: `${BASE}/api/verify/{cert_id}`,
    });

    const without = renderSimplePage(options);
    const with_ = renderSimplePage({ ...options, inertHtml: inert });

    expect(with_).not.toBe(without);
    expect(with_.replace(`\n  ${inert}`, "")).toBe(without);
  });

  it("leaves /try and an item page executable-script-free apart from the till", async () => {
    for (const path of ["/try", "/menu/hello"]) {
      const html = await page(path);

      const matches = html.match(new RegExp(INERT_BLOCK.source, "g")) ?? [];
      expect(matches.length, `${path} inert blocks`).toBe(1);

      const stripped = html.replace(INERT_BLOCK, "");
      /*
       * With the till's two tags removed, every remaining <script> on
       * the page must be a data island — the JSON-LD these rooms have
       * carried since long before the till. If a second executable
       * script ever appears on a store page, this is where it stops.
       */
      for (const tag of scriptTags(stripped)) {
        // Lower-cased for the same reason the matcher is: a tag this
        // guard cannot read is a tag it cannot refuse.
        expect(tag.toLowerCase(), `${path}: ${tag}`).toContain(
          'type="application/ld+json"',
        );
      }
      expect(stripped, path).not.toContain("till.js");
    }
  });

  it("keeps the till's own markup out of the served document entirely", async () => {
    /*
     * The button, the status line, the inputs and the styles are all
     * built at runtime. None of them is in the HTML, so a reader with
     * scripting off has nothing to look at that does not work — which
     * is the difference between progressive enhancement and a page
     * with a dead button on it.
     */
    const html = (await page("/try")).replace(INERT_BLOCK, "");
    for (const fragment of ["<button", 'class="till', "<input", "Pay $"]) {
      expect(html, fragment).not.toContain(fragment);
    }
  });

  it("keeps /try's server-rendered instructions intact", async () => {
    // The page still teaches a client-builder the whole flow without
    // any of this: the till is an addition, never a replacement.
    const html = await page("/try");
    expect(html).toContain("PAYMENT-REQUIRED");
    expect(html).toContain("PAYMENT-SIGNATURE");
    expect(html).toContain("USD Coin");
    expect(html).toContain("/api/buy/");
  });
});

describe("the shelf island says what the menu says", () => {
  function shelfOf(html: string): {
    heading: string;
    house_rule: string;
    items: Array<{
      id: string;
      name: string;
      price_usdc: number;
      buy_path: string;
      requires: Array<{ name: string }>;
    }>;
  } {
    const match =
      /<script type="application\/json" id="scvd-till-shelf">([\s\S]*?)<\/script>/.exec(
        html,
      );
    expect(match, "no shelf island").toBeTruthy();
    return JSON.parse(match![1]!) as never;
  }

  it("prices every offered item from the live menu, never a copy", async () => {
    const shelf = shelfOf(await page("/try"));
    expect(shelf.items.length).toBeGreaterThan(0);
    for (const row of shelf.items) {
      const item = MENU_ITEMS.find((entry) => entry.id === row.id);
      expect(item, row.id).toBeTruthy();
      expect(row.price_usdc, row.id).toBe(item!.price_usdc);
      expect(row.name, row.id).toBe(item!.name);
      expect(row.buy_path, row.id).toBe(`/api/buy/${item!.id}`);
    }
  });

  it("carries the anti-impersonation promise to the till itself", async () => {
    /*
     * A signature request is the most impersonated interaction in this
     * industry. The moment a wallet dialog is about to open is exactly
     * when the reader should be told what this store does and does not
     * ask for — sourced from the same constant every other trust
     * surface prints, so it cannot soften into a friendlier version.
     */
    expect(shelfOf(await page("/try")).house_rule).toBe(HOUSE_RULE);
    expect(shelfOf(await page("/menu/hello")).house_rule).toBe(HOUSE_RULE);
  });

  it("names an item's required inputs so the till can ask for them", async () => {
    const shelf = shelfOf(await page("/menu/settlement_attestation"));
    const row = shelf.items[0]!;
    expect(row.id).toBe("settlement_attestation");
    expect(row.requires.map((field) => field.name)).toContain("tx_hash");
  });

  it("gives an item page exactly its own item and no other", async () => {
    const shelf = shelfOf(await page("/menu/hello"));
    expect(shelf.items.map((row) => row.id)).toEqual(["hello"]);
  });
});

describe("the item page answers a person without changing its answer to an agent", () => {
  it("serves the paper page only when the caller asked for HTML", async () => {
    const html = await page("/menu/hello");
    expect(html).toContain("<!DOCTYPE html>");
    const item = MENU_ITEMS.find((entry) => entry.id === "hello")!;
    expect(html).toContain(item.name);
    expect(html).toContain(String(item.price_usdc));
  });

  it("still answers JSON to a bare fetch, byte-shape unchanged", async () => {
    const response = await SELF.fetch(`${BASE}/menu/hello`);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["id"]).toBe("hello");
    expect(body["buy_url"]).toBe(`${BASE}/api/buy/hello`);
    expect(body["spec"]).toBeTruthy();
  });

  it("still answers markdown when markdown is what was asked for", async () => {
    const response = await SELF.fetch(`${BASE}/menu/hello`, {
      headers: { Accept: "text/markdown" },
    });
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(await response.text()).toContain("# ");
  });

  it("keeps the canonical link on every dialect of the page", async () => {
    for (const accept of ["text/html", "application/json", "text/markdown"]) {
      const response = await SELF.fetch(`${BASE}/menu/hello`, {
        headers: { Accept: accept },
      });
      const link = response.headers.get("Link") ?? "";
      expect(link, accept).toContain(`${BASE}/menu/hello`);
      expect(link, accept).toContain('rel="canonical"');
    }
  });

  it("still tombstones a retired item rather than papering one", async () => {
    const response = await SELF.fetch(`${BASE}/menu/definitely_not_an_item`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(404);
  });
});
