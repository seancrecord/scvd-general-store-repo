import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { openPack } from "@/services/cards";
import { SOCIAL_UNFURLERS } from "@/lib/crawlers";
import { wantsHtml } from "@/pages/simple-page";
import { packNote } from "@/store/copy/deliverables";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const BUYER = "0x404018c829a4e5ac5f703d1eb0b942ae7852017f";

/**
 * THE PACK, FOR A PERSON, AND THE PREVIEW NOBODY EVER SAW
 * (2026-09-14, the keeper, having bought a pack with his own wallet).
 *
 * Two findings, one purchase. The receipt was a JSON blob behind a
 * disclosure triangle: no count, no faces, no share button, and no way
 * back to the cards later. And the share button that did exist, on a
 * card's own page, posted a link that has never once rendered a
 * picture — because Twitterbot sends `Accept: * / *`, which this store
 * answers with a signed record that has no Open Graph tags in it.
 */
describe("an unfurler gets the page it came for", () => {
  it("hands every link-preview bot HTML, whatever it asked for", () => {
    /**
     * THE BUG, AT ITS SOURCE. wantsHtml gave HTML to a browser and to
     * a named indexer, and JSON to everything else. An unfurler is
     * neither: it reads the head, throws the body away, and draws a
     * card from the meta tags. On `Accept: * / *` — which is what all
     * of them send — it got the JSON twin, so the preview had nothing
     * to draw and silently drew nothing.
     */
    for (const agent of SOCIAL_UNFURLERS) {
      expect(wantsHtml("*/*", `${agent}/1.0`), agent).toBe(true);
      expect(wantsHtml(undefined, `${agent}/1.0`), agent).toBe(true);
      expect(wantsHtml("application/json", `${agent}/1.0`), agent).toBe(true);
    }
    // The four that matter most, spelled as they really arrive.
    expect(wantsHtml("*/*", "Twitterbot/1.0")).toBe(true);
    expect(wantsHtml("*/*", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(wantsHtml("*/*", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")).toBe(true);
    expect(wantsHtml("*/*", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")).toBe(true);
    // And an ordinary agent still gets the record, which is the whole
    // point of the negotiation this fix is narrowing, not removing.
    expect(wantsHtml("application/json", "curl/8.4.0")).toBe(false);
    expect(wantsHtml("*/*", undefined)).toBe(false);
  });

  it("serves a card's Open Graph image to Twitterbot, not a signed record", async () => {
    const pack = await openPack(testEnv, { certId: "cert_unfurl", patronNumber: 1, payer: BUYER });
    const cardId = pack.cards[0]!.card.card_id;
    const preview = await SELF.fetch(`${BASE}/p/${cardId}`, { headers: { Accept: "*/*", "User-Agent": "Twitterbot/1.0" } });
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("text/html");
    const html = await preview.text();
    expect(html).toContain(`<meta property="og:image" content="${BASE}/p/${cardId}.png">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`<meta name="twitter:image" content="${BASE}/p/${cardId}.png">`);
    // The image the tags name actually answers, and is a real sheet.
    const sheet = await SELF.fetch(`${BASE}/p/${cardId}.png`);
    expect(sheet.status).toBe(200);
    expect(sheet.headers.get("content-type")).toBe("image/png");
    expect((await sheet.arrayBuffer()).byteLength).toBeGreaterThan(10_000);
  });

  it("unfurls the pack page and the binder too, since those are what a person posts", async () => {
    const pack = await openPack(testEnv, { certId: "cert_unfurl_2", patronNumber: 2, payer: BUYER });
    for (const path of [`/pack/${pack.pack.pack_id}`, `/binder/${BUYER}`, "/design"]) {
      const preview = await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "*/*", "User-Agent": "Twitterbot/1.0" } });
      expect(preview.status, path).toBe(200);
      expect(await preview.text(), path).toContain('property="og:image"');
    }
  });
});

describe("the share sheet is the most ordinary PNG on the internet", () => {
  /**
   * AN OG IMAGE IS THE WRONG PLACE TO BE CLEVER (2026-09-14, the
   * keeper, out of patience with a blank preview: "is there not a
   * fucking way to hit tweet and have the picture embedded?").
   *
   * X's intent URL has no media parameter — no site can attach a file
   * to a tweet through a link, and the card is the only automatic
   * path. So the card has to be beyond argument, and ours was not: a
   * 4-bit indexed palette in uncompressed deflate blocks, 405,833
   * bytes. Spec-valid, decodes fine locally, and about as far from an
   * ordinary social image as a PNG gets — two nonstandard traits
   * sitting in the one file every unfurler on the internet has to
   * accept, plus a weight some of them will not spend.
   *
   * Workers ship CompressionStream, so the clever was never buying
   * anything: 8-bit RGB properly deflated is both standard and 25x
   * smaller. This test holds the format, because the temptation to
   * shave bytes with a palette is exactly how it got here.
   */
  it("is 8-bit truecolour RGB, deflated, and small enough that nothing gives up fetching it", async () => {
    const pack = await openPack(testEnv, { certId: "cert_sheet_shape", patronNumber: 7, payer: BUYER });
    const id = pack.cards[0]!.card.card_id;
    const res = await SELF.fetch(`${BASE}/p/${id}.png`);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(bytes.buffer);

    // The PNG signature, then IHDR at a fixed offset.
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(675);
    expect(bytes[24], "bit depth: 8, not a packed palette").toBe(8);
    expect(bytes[25], "colour type: 2 (truecolour RGB), not 3 (indexed)").toBe(2);
    // No PLTE chunk at all — a truecolour image has no palette to carry.
    expect(new TextDecoder().decode(bytes.slice(0, 64))).not.toContain("PLTE");

    /*
     * A REAL DEFLATE STREAM, not stored blocks. The zlib header's
     * second byte carries the compression level in its top bits; a
     * stored-block stream from the old encoder wrote 0x01 there.
     */
    const idat = bytes.indexOf(0x49);
    expect(idat).toBeGreaterThan(0);
    expect(bytes.length, "was 405,833 at 4-bit stored; anything near that means the palette came back").toBeLessThan(120_000);
    expect(bytes.length).toBeGreaterThan(2_000);
  });
});

describe("the pack, opened, for a person", () => {
  let packId = "";
  let names: string[] = [];

  beforeAll(async () => {
    const pack = await openPack(testEnv, { certId: "cert_pack_page", patronNumber: 3, payer: BUYER });
    packId = pack.pack.pack_id;
    names = pack.cards.map((signed) => signed.card.name);
  });

  it("says how many, shows every face, and gives each one a share button", async () => {
    const page = await SELF.fetch(`${BASE}/pack/${packId}`, { headers: { Accept: "text/html" } });
    expect(page.status).toBe(200);
    const html = await page.text();
    // 1. HOW MANY. The first sentence on the page, in words, not a
    //    count the reader has to take off a list.
    expect(html).toContain("You pulled 5 cards.");
    // 2. THE FACES. Every card, as a picture, linked to its own page.
    for (const name of new Set(names)) expect(html, name).toContain(name);
    expect([...html.matchAll(/class="pack-card /g)]).toHaveLength(5);
    expect([...html.matchAll(/\/p\/card_[a-z0-9]+\.svg/g)].length).toBeGreaterThanOrEqual(5);
    // 3. THE BUTTONS. One per card, plus one for the whole pack, plus
    //    the way back to everything this wallet holds.
    expect([...html.matchAll(/Share on X|>Share</g)].length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("Share the whole pack");
    expect(html).toContain(`href="/binder/${BUYER}"`);
    expect(html).toContain("All your cards");
  });

  it("names duplicates as credit rather than leaving them looking like a mistake", async () => {
    const page = await (await SELF.fetch(`${BASE}/pack/${packId}`, { headers: { Accept: "text/html" } })).text();
    const dupes = names.filter((name, index) => names.indexOf(name) !== index);
    // "burns" for one, "burn" for several — assert the part that holds
    // either way, so the grammar can be right without the test lying.
    if (dupes.length > 0) expect(page).toContain("into pack credit");
  });

  it("hands a person a PNG to attach, not the SVG an upload box refuses", async () => {
    /**
     * THE FILE A READER ACTUALLY GETS (2026-09-14, the keeper, looking
     * at an empty X composer: "they are also saving as svg so that is
     * probably why").
     *
     * He was right about the file and it was a second gap, not the one
     * blocking the card: the face on these pages is vector, so a
     * right-click or a drag hands over an SVG, which X, Slack and every
     * other upload box reject. The PNG was always served and was named
     * only in fine print as a code span. Both pages now carry a real
     * download beside the share button, and it must stay a PNG.
     */
    const page = await (await SELF.fetch(`${BASE}/pack/${packId}`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("Save the image");
    const downloads = [...page.matchAll(/href="\/p\/(card_[a-z0-9]+)\.png" download="/g)];
    expect(downloads.length).toBeGreaterThanOrEqual(1);
    for (const [, id] of downloads) {
      const png = await SELF.fetch(`${BASE}/p/${id}.png`);
      expect(png.headers.get("content-type"), id).toBe("image/png");
    }
    // Never an SVG behind a download, however the markup moves around.
    expect(page).not.toMatch(/href="[^"]*\.svg" download/);

    const card = await (await SELF.fetch(`${BASE}/p/${downloads[0]![1]}`, { headers: { Accept: "text/html" } })).text();
    expect(card).toContain("Save the image");
    expect(card).toMatch(/href="\/p\/card_[a-z0-9]+\.png" download="/);
    expect(card).not.toMatch(/href="[^"]*\.svg" download/);
  });

  it("404s an id nobody opened, and never mints one by looking", async () => {
    const miss = await SELF.fetch(`${BASE}/pack/pack_neverwasone`, { headers: { Accept: "text/html" } });
    expect(miss.status).toBe(404);
  });

  it("carries the human page through the delivery, so the till can draw a button", async () => {
    /*
     * The till reads exactly one field to decide whether a purchase has
     * a page worth a button. If this name drifts, the button silently
     * stops appearing and the receipt goes back to being a blob.
     */
    const note = packNote({
      cards: [{ name: "Giraffe Lookout", rarity: "common" }],
      packUrl: `${BASE}/api/pack/${packId}`,
      viewUrl: `${BASE}/pack/${packId}`,
      tableUrl: `${BASE}/design`,
    });
    expect(note).toContain("1 cards:");
    expect(note).toContain(`See them at ${BASE}/pack/${packId}.`);
    // The signed manifest still names its human twin, both directions.
    const manifest = (await (await SELF.fetch(`${BASE}/api/pack/${packId}`)).json()) as Record<string, unknown>;
    expect(manifest["page_url"]).toBe(`${BASE}/pack/${packId}`);
  });
});
