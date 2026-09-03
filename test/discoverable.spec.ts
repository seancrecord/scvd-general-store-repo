import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HUMAN_SURFACES } from "@/routes/site-meta";
import { MENU_ITEMS } from "@/store";
import { ROOMS, STOREFRONT_ROOMS, UNLISTED_ROOMS } from "@/store/rooms";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * BEING PUBLISHED, AS OPPOSED TO MERELY EXISTING.
 *
 * Four rooms built between 2026-07-29 and 07-30 — the receipts page,
 * the dependency page, the corrections record and the visitors'
 * register — went live with no sitemap line and no meta description.
 * Every small room in the store renders through one function, and that
 * function emitted no description, no canonical and no og tags at all,
 * so a search engine and an answer engine alike had nothing to quote
 * but whatever text happened to land first on the page.
 *
 * That is the quiet version of not shipping. These tests make it loud:
 * a page in the sitemap must answer, and a page that answers must say
 * what it is. The description field is now REQUIRED by the type, so
 * forgetting one is a compile error rather than a thing discovered
 * months later in a search console nobody opened.
 */
describe("every room in the sitemap is a room", () => {
  /*
   * These three walk every human surface in the store — 71 of them by
   * 2026-09-01 — and did it one fetch after another against the
   * default 5s budget. That is a guard that gets flakier with every
   * room the store ships, and it started tipping over under full-suite
   * contention. Fetched in parallel now; not one assertion changed.
   */
  async function everyPage(): Promise<{ path: string; page: string }[]> {
    return Promise.all(
      HUMAN_SURFACES.map(async (path) => ({
        path,
        page: await (
          await SELF.fetch(`${BASE}${path}`, { headers: HTML })
        ).text(),
      })),
    );
  }

  it("answers on every listed path", async () => {
    const answers = await Promise.all(
      HUMAN_SURFACES.map(async (path) => ({
        path,
        status: (await SELF.fetch(`${BASE}${path}`, { headers: HTML })).status,
      })),
    );
    for (const { path, status } of answers) {
      expect(status, `${path} is in the sitemap and does not answer`).toBe(200);
    }
  });

  it("says what it is, in a sentence something can quote", async () => {
    for (const { path, page } of await everyPage()) {
      const description = /<meta name="description" content="([^"]*)"/.exec(page);
      expect(description, `${path} has no meta description`).toBeTruthy();
      const said = description?.[1] ?? "";
      // Long enough to be an answer, not a keyword smear.
      expect(said.length, `${path}'s description is too thin to quote`).toBeGreaterThan(
        60,
      );
      expect(said.length, `${path}'s description will be truncated`).toBeLessThan(
        320,
      );
    }
  });

  it("gives an answer engine a title and a card to work from", async () => {
    for (const { path, page } of await everyPage()) {
      expect(page, `${path} has no og:title`).toContain('property="og:title"');
      expect(page, `${path} has no og:description`).toContain(
        'property="og:description"',
      );
    }
  });

  it("carries a WebPage node naming its own URL, so a resolver sees an entity and not a file", async () => {
    // AEO fix F22 (2026-09-03): 23 sitemap pages had a description and
    // no structured data. The renderer derives one from the same
    // title and description now; this holds every listed room to it.
    for (const { path, page } of await everyPage()) {
      const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
        (m) => JSON.parse(m[1]!) as { "@type"?: string; "@id"?: string; "@graph"?: unknown[] },
      );
      expect(blocks.length, `${path} carries no structured data`).toBeGreaterThan(0);
      const names = path === "/" ? [`${BASE}/`] : [`${BASE}${path}`];
      const namesItself = blocks.some(
        (b) => names.includes(b["@id"] ?? "") || JSON.stringify(b).includes(`"${names[0]}"`),
      );
      expect(namesItself, `${path}'s structured data never names ${names[0]}`).toBe(true);
    }
  });

  it("carries the four rooms that were built and never published", async () => {
    // The specific regression. Named rather than left to the loop
    // above, because the loop passes trivially if somebody deletes an
    // entry from the list instead of fixing the page.
    for (const path of ["/neighbours", "/stack", "/corrections", "/visitors"]) {
      expect(
        HUMAN_SURFACES as readonly string[],
        `${path} is still missing from the sitemap`,
      ).toContain(path);
    }
  });
});

describe("the rooms the keeper held off the index (F3, 2026-09-03)", () => {
  it("names the three he ruled on, and no others", () => {
    expect(UNLISTED_ROOMS.map((room) => room.path).sort()).toEqual(
      ["/gazette", "/porch", "/zodiac"],
    );
  });

  it("still answer, still say what they are, and tell search crawlers not to index them", async () => {
    for (const room of UNLISTED_ROOMS) {
      const response = await SELF.fetch(`${BASE}${room.path}`, { headers: HTML });
      expect(response.status, `${room.path} is a room and does not answer`).toBe(200);
      const page = await response.text();
      expect(page, `${room.path} has no meta description`).toContain('<meta name="description"');
      expect(page, `${room.path} does not say noindex`).toContain(
        '<meta name="robots" content="noindex">',
      );
    }
  });

  it("are off the sitemap and still rooms", async () => {
    // Off the map is not off the store: the flag removes a sitemap
    // line and adds a noindex, and every surface that derives from
    // ROOMS still carries them.
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    for (const room of UNLISTED_ROOMS) {
      expect(xml, `${room.path} is still on the sitemap`).not.toContain(`<loc>${BASE}${room.path}</loc>`);
      expect(ROOMS, `${room.path} left ROOMS`).toContain(room);
    }
  });
});

describe("the sitemap itself", () => {
  it("lists every human room and every item page", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    for (const path of HUMAN_SURFACES) {
      expect(xml, `${path} missing from sitemap.xml`).toContain(
        `<loc>${BASE}${path}</loc>`,
      );
    }
    // Per-item pages carry the only per-item prose that exists, and the
    // storefront's JSON-LD already names these exact URLs as offer URLs.
    for (const item of MENU_ITEMS) {
      expect(xml, `/menu/${item.id} missing from sitemap.xml`).toContain(
        `<loc>${BASE}/menu/${item.id}</loc>`,
      );
    }
  });

  it("dates every entry, because no date reads as never changed", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    const locs = xml.match(/<loc>/g)?.length ?? 0;
    const mods = xml.match(/<lastmod>/g)?.length ?? 0;
    expect(locs).toBeGreaterThan(0);
    expect(mods).toBe(locs);
  });
});

/**
 * THE SITEMAP IS NOT PUBLICATION EITHER.
 *
 * The four July rooms were fixed by putting them in the sitemap, and
 * then the sitemap became the only place a room had to be: /attestation
 * and /pulse went live listed there and nowhere else — absent from
 * llms.txt, from skill.md, from the x402 discovery document, from the
 * storefront's structured data, and linked from no public page in the
 * store. Every surface below is one an agent or an answer engine
 * actually reads, and a room missing from any of them is a room that
 * reader cannot find.
 */
describe("a room is published on every surface, or it is not published", () => {
  it("is named in llms.txt", async () => {
    /*
     * THE COMPLETE GUIDE, since the 2026-08-27 split. /llms.txt is now
     * an index — 14kB against a 30,000-character convention — and the
     * depth lives in five per-area files it links. Every room is still
     * named in the guide; /llms-full.txt is where the guide is served
     * whole, which is what this assertion was always about.
     *
     * That the split loses no section, and duplicates none, is held by
     * test/llms-modular.spec.ts rather than assumed here.
     */
    const text = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    for (const room of ROOMS) {
      expect(text, `llms.txt never mentions ${room.path}`).toContain(room.path);
    }
  });

  it("is linked from the front of the store, where a crawler starts", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    for (const room of STOREFRONT_ROOMS) {
      expect(page, `nothing on the storefront links to ${room.path}`).toContain(
        `href="${room.path}"`,
      );
    }
  });

  it("is in the storefront's structured data, where an engine looks", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(
      page,
    );
    expect(block, "the storefront has no JSON-LD at all").toBeTruthy();
    const data = JSON.parse((block?.[1] ?? "{}").replace(/\\u003c/g, "<"));
    const urls = new Set(
      (data.subjectOf ?? []).map((entry: { url: string }) => entry.url),
    );
    for (const room of STOREFRONT_ROOMS) {
      expect(urls, `${room.path} is missing from subjectOf`).toContain(
        `${BASE}${room.path}`,
      );
    }
  });

  it("stays off the front entirely when the keeper held it back", async () => {
    /**
     * The other direction, and the one that matters more. The first
     * draft of the derived footer linked every room including the
     * pulse, which the keeper had explicitly held off the storefront —
     * so a "harmonize everything" change quietly overruled a standing
     * instruction, and his own test caught it rather than me. A room
     * flagged off the front must be absent from the LINKS and from the
     * STRUCTURED DATA both: JSON-LD is the storefront speaking too.
     */
    const held = ROOMS.filter((room) => room.on_storefront === false);
    expect(held.length, "nothing is held back; this test is asleep").toBeGreaterThan(
      0,
    );
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    for (const room of held) {
      /**
       * PRECISION FIX 2026-08-21: bare toContain(room.path) false-
       * alarmed the day a SHELF ITEM's id started with a held room's
       * name — /menu/passport_refresh contains "/passport", but the
       * item on the front is the shelf speaking, not the held room.
       * The needle now requires the path to end at a word boundary,
       * so the ROOM stays unnameable while items may share its stem.
       */
      const asRoomLink = new RegExp(
        `${room.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
      );
      expect(
        asRoomLink.test(page),
        `the storefront names ${room.path} anyway`,
      ).toBe(false);
    }
  });

  it("calls itself the same thing here as in its own title", async () => {
    // The names in ROOMS feed the structured data and the storefront
    // footer. A page that renames itself and leaves this list behind
    // would have an engine answering under a title nobody uses.
    for (const room of ROOMS) {
      const page = await (
        await SELF.fetch(`${BASE}${room.path}`, { headers: HTML })
      ).text();
      // Titles ship HTML-escaped; the apostrophes in "The Keeper's
      // Almanac" arrive as entities. Unescape rather than escape the
      // expectation, so this reads as the name a person would say.
      const title = (/<title>([^<]*)<\/title>/.exec(page)?.[1] ?? "")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
      expect(title, `${room.path} does not call itself "${room.name}"`).toContain(
        room.name,
      );
    }
  });
});

describe("what a signature is worth, on the surfaces that carry the key", () => {
  /**
   * Narrower than the loop above and deliberately so. skill.md and the
   * x402 document are curated rather than exhaustive — they do not owe
   * a line to every room — but they are where a machine reader picks up
   * the signing key, and handing over a key without handing over what
   * it proves is the underdeclaration this page was built to end.
   */
  it("rides beside the key in skill.md", async () => {
    const text = await (await SELF.fetch(`${BASE}/skill.md`)).text();
    expect(text).toContain("/attestation");
    expect(text).toContain("/pulse");
  });

  it("rides beside the key in the x402 discovery document", async () => {
    const doc = (await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json()) as Record<string, string>;
    expect(doc.signing_key, "the key is served here").toBeTruthy();
    expect(doc.attestation, "what the key proves is not").toBe(
      `${BASE}/attestation`,
    );
    expect(doc.pulse).toBe(`${BASE}/pulse.json`);
  });

  it("rides beside the key in menu.json, the document that carries the shelf", async () => {
    /**
     * The one surface where a cold reader never reached verification
     * at all. It was handed the signing key and an itemized shelf of
     * novelties, with no verify endpoint and no attestation page in
     * the document, and filed the store as an art project — a fair
     * reading of what it was given. This is the most-fetched document
     * here, so it is the worst place for the shelf to do all the
     * talking.
     */
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      store: Record<string, string>;
    };
    expect(menu.store.signing_key, "the key is served here").toBeTruthy();
    expect(menu.store.verify, "and no way to check what it signed").toContain(
      "/api/verify/",
    );
    expect(menu.store.attestation).toContain("/attestation");
    expect(menu.store.corrections).toContain("/corrections");
  });

  it("documents the routes that take money, contra a cold reader", async () => {
    /**
     * A cold cataloguer reported on 2026-07-30 that the paid routes
     * "carry only a summary, with no parameters, no 402 response
     * documented, and no price." THAT WAS WRONG, and it was repeated
     * as a finding before being checked — buyItemOperation has emitted
     * parameters from buyInputSchema, a 402, and x-payment prices since
     * 07-27. The report is the reason this test exists: an outside
     * claim about our own surfaces is a thing to verify, not a thing to
     * act on, and the way to close it permanently is an assertion
     * rather than a memory.
     */
    const spec = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      paths: Record<string, { get?: Record<string, unknown> }>;
    };
    const paid = Object.entries(spec.paths).filter(([path]) =>
      path.startsWith("/api/buy/"),
    );
    expect(paid.length, "no paid routes in the contract at all").toBeGreaterThan(
      0,
    );
    for (const [path, entry] of paid) {
      const op = entry.get ?? {};
      const payment = op["x-payment"] as
        | { price_usdc_options?: number[] }
        | undefined;
      expect(op["responses"], `${path} documents no responses`).toHaveProperty(
        "402",
      );
      expect(
        payment?.price_usdc_options?.length,
        `${path} names no price`,
      ).toBeGreaterThan(0);
      expect(op["parameters"], `${path} declares no parameters`).toBeDefined();
    }
  });

  it("is a documented endpoint, not just a page", async () => {
    const spec = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      paths: Record<string, unknown>;
    };
    for (const path of ["/attestation", "/pulse.json", "/corrections"]) {
      expect(spec.paths, `${path} is not in the contract`).toHaveProperty(path);
    }
  });
});

/**
 * ANSWERING IN THE WORDS THE QUESTION IS ASKED IN.
 *
 * A buyer-side evaluation checklist looks for "reputation system,
 * dispute handling, escrow." Those three strings appeared nowhere on
 * this store, so a checklist scored us as having none of them — while
 * the refund promise, the refund ledger with its transaction hash and
 * the corrections record all existed, stated in our vocabulary rather
 * than in the one being searched for.
 *
 * The honest half matters as much as the findable half: there IS no
 * escrow here, and the answer leads with that. This test holds both —
 * the words are present, and the absence is still admitted.
 */
describe("the dispute question, in the evaluator's vocabulary", () => {
  const ASKED = ["escrow", "dispute", "reputation"];

  it("is answered where a reader and an answer engine both find it", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/what`, { headers: HTML })
    ).text();
    for (const word of ASKED) {
      expect(page.toLowerCase(), `/what never says "${word}"`).toContain(word);
    }
  });

  it("is in the FAQ data, not only in the prose around it", async () => {
    // The same trap the visitors' register and /pulse.json both hit:
    // a page can carry a word in a heading and still have nothing
    // structured to lift. /what's FAQPage JSON-LD is built from these
    // pairs, so the pair is what has to carry it.
    const body = (await (await SELF.fetch(`${BASE}/what`)).json()) as {
      faq: Array<{ question: string; answer: string }>;
    };
    const pair = body.faq.find((entry) =>
      ASKED.every((word) => entry.question.toLowerCase().includes(word)),
    );
    expect(pair, "no single FAQ pair asks the checklist's question").toBeTruthy();
    expect(pair?.answer).toContain("/corrections");
    expect(pair?.answer).toContain("/api/refund/");
  });

  it("still admits there is no escrow", async () => {
    const body = (await (await SELF.fetch(`${BASE}/what`)).json()) as {
      faq: Array<{ question: string; answer: string }>;
    };
    const answers = body.faq.map((entry) => entry.answer).join(" ");
    expect(
      answers,
      "naming escrow without denying it reads as claiming one",
    ).toMatch(/no escrow/i);
  });
});

describe("llms.txt, the map agents actually read", () => {
  it("names the rooms that exist now", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    for (const path of ["/neighbours", "/visitors", "/stack", "/corrections"]) {
      expect(text, `llms.txt never mentions ${path}`).toContain(path);
    }
  });

  it("carries no hardcoded count of anything", async () => {
    // A count in a static document is a lie with a timer on it — the
    // exact defect deleted from the published skill bundle two days
    // earlier, which had said "twenty-one items" against a shelf of
    // twenty-three. llms.txt said "five of them" about a corrections
    // record that now holds six.
    const text = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(text).not.toMatch(
      /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty[- ]\w+)\s+(of them|items|corrections|entries|goods)\b/i,
    );
  });
});

/**
 * THE SHELF AS GOOGLE'S MERCHANT PIPELINE READS IT.
 *
 * Search Console parsed the storefront's ItemList on 2026-08-16 and
 * called all twenty-three products invalid for a missing image, then
 * warned on availability, return policy and shipping. An invalid
 * product earns no merchant listing at all, so the whole block was
 * decorative. These pin the four fields at the shape the pipeline
 * checks, on every product, so the twenty-fourth item cannot ship
 * bare. The offer URL is pinned to the item page too: it pointed at
 * the 402 door, which reads as a crawl error to anything that cannot
 * pay.
 */
describe("the shelf's products hold up as merchant listings", () => {
  async function shelfProducts() {
    const html = await (await SELF.fetch(BASE, { headers: HTML })).text();
    const blocks = [
      ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ];
    const list = blocks
      .map((block) => JSON.parse(block[1]!.replace(/\\u003c/g, "<")))
      .find((node) => node["@type"] === "ItemList");
    expect(list, "the storefront emits no ItemList node").toBeTruthy();
    return (list.itemListElement as Array<{ item: Record<string, any> }>).map(
      (entry) => entry.item,
    );
  }

  it("every product carries an image, which is the field that voided all of them", async () => {
    const products = await shelfProducts();
    expect(products.length).toBe(MENU_ITEMS.length);
    for (const product of products) {
      expect(String(product.image ?? ""), `${product.name} has no image`).toMatch(
        /^https:\/\/scvd\.store\/.+/,
      );
    }
  });

  it("every offer states availability, returns and shipping, and lands on a page that answers", async () => {
    const products = await shelfProducts();
    for (const product of products) {
      const offer = product.offers;
      expect(String(offer.availability), `${product.name} states no availability`).toContain(
        "https://schema.org/",
      );
      expect(
        offer.hasMerchantReturnPolicy?.["@type"],
        `${product.name} has no return policy`,
      ).toBe("MerchantReturnPolicy");
      expect(
        offer.shippingDetails?.["@type"],
        `${product.name} has no shipping details`,
      ).toBe("OfferShippingDetails");
      // The item page, not the 402 buy door: a URL in markup is an
      // invitation to crawl, and the buy door answers 4xx by design.
      expect(String(offer.url), `${product.name}'s offer points at the buy door`).toMatch(
        /\/menu\//,
      );
    }
  });

  it("a human-queue item's handling window is its own sla_hours, never a typed number", async () => {
    const products = await shelfProducts();
    for (const item of MENU_ITEMS) {
      const product = products.find((entry) => entry.url.endsWith(`/menu/${item.id}`));
      const days =
        product?.offers?.shippingDetails?.deliveryTime?.handlingTime?.maxValue;
      expect(days, `${item.id}'s handling window went missing`).toBe(
        Math.ceil((item.sla_hours ?? 0) / 24),
      );
    }
  });
});

/**
 * THE BUYER-SIDE QUESTIONS EXIST WHERE AN ANSWER ENGINE LOOKS.
 *
 * The 2026-08-18 query sweep found every pre-purchase question a
 * buyer actually types — "check an x402 endpoint before paying",
 * "is this service legitimate", "free x402 conformance check" —
 * answered by other people's tools or by nobody, while this store's
 * FAQ spoke only seller-side. The pairs now exist; these pin them to
 * both surfaces (/what JSON and the FAQPage JSON-LD) so a copy edit
 * cannot quietly drop the register buyers search in.
 */
describe("the buyer-side questions are published on /what", () => {
  const BUYER_QUESTIONS = [
    "How do I check an x402 endpoint before paying it?",
    "Is this x402 service legitimate? (asked about anyone, us included)",
    "Is there a free x402 conformance check?",
  ];

  it("answers them in the JSON register", async () => {
    const body = (await (await SELF.fetch(`${BASE}/what`)).json()) as {
      faq: Array<{ question: string; answer: string }>;
    };
    const questions = body.faq.map((pair) => pair.question);
    for (const q of BUYER_QUESTIONS) {
      expect(questions, `missing buyer-side pair: ${q}`).toContain(q);
    }
    // The legitimacy answer must refuse the verdict, not render one —
    // scoring operators is the thing rule 43 forbids by name.
    const legit = body.faq.find((pair) => pair.question.startsWith("Is this x402 service legitimate"));
    expect(legit?.answer).toMatch(/does not keep scores|No instrument here answers/);
  });

  it("carries them in the FAQPage JSON-LD, where engines read", async () => {
    const html = await (await SELF.fetch(`${BASE}/what`, { headers: HTML })).text();
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    const data = JSON.parse((block?.[1] ?? "{}").replace(/\\u003c/g, "<")) as {
      mainEntity?: Array<{ name: string }>;
    };
    const names = (data.mainEntity ?? []).map((entity) => entity.name);
    for (const q of BUYER_QUESTIONS) {
      expect(names, `${q} is missing from the FAQPage markup`).toContain(q);
    }
  });

  it("names only doors that answer", async () => {
    // Each new answer points at free surfaces; a named URL that 404s
    // would be the exact defect the sitemap test exists to catch.
    for (const path of ["/conformance", "/.well-known/trust.json", "/corrections"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, `${path} is cited in a buyer-side answer and does not answer`).toBe(200);
    }
  });
});

/**
 * THE HANDOFF LINES ON THE FRONT DOOR. Journey two is a human finding
 * the store and telling their agent; until 2026-08-18 that journey
 * ended at prose about us rather than a sentence to hand over. Two
 * copyable lines now live in the human door; if either leaves the
 * page, the journey breaks silently, so a test says so instead.
 */
describe("the human door hands the agent something to carry", () => {
  it("renders both handoff lines in copyable form", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    expect(page).toContain("Read https://scvd.store/llms.txt and tell me");
    expect(page).toContain("claude mcp add --transport http scvd-store https://scvd.store/mcp");
  });
});
