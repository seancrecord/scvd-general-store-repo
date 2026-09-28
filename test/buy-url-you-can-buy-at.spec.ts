import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { buyUrlTemplate, buyerLinks } from "@/lib/buyer-contract";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { ladderRung } from "@/services/menu-markdown";
import { deeperRungs } from "@/store/go-deeper";
import { ROOMS } from "@/store/rooms";
import { MENU_ITEMS, getMenuItem } from "@/store";
import type { MenuItem } from "@/types";
import { decodePaymentRequired, buildPaymentSignature } from "./helpers/payment";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
const OUTSIDE = { "User-Agent": "buyer-client/1.0" };
beforeAll(() => { installFacilitatorMock(); });

/**
 * THE BUY URL THAT COULD NOT BE BOUGHT AT. `buy_url` is bare for every
 * item and refuses the purchase it advertises on the input-taking
 * doors. x402 v2 has nowhere left to publish the rule, so the fix is a
 * URL that does not need the rule read.
 */
describe("buy_url_template: the door with its inputs already in place", () => {
  it("is emitted for every item, one key with one type", () => {
    for (const item of MENU_ITEMS) {
      const links = buyerLinks(item, BASE);
      expect(typeof links.buy_url_template, item.id).toBe("string");
      expect(links.buy_url_template, item.id).toContain(`/api/buy/${item.id}`);
    }
  });

  it("carries every required input as a <slot>, and nothing where none is needed", () => {
    for (const item of MENU_ITEMS) {
      const required = buyInputSchema(item).required ?? [];
      const template = buyUrlTemplate(item, BASE);
      if (required.length === 0) {
        expect(template, item.id).toBe(`${BASE}/api/buy/${item.id}`);
        continue;
      }
      for (const name of required) {
        expect(template, item.id).toContain(`${name}=<${name}>`);
      }
    }
  });

  /**
   * The same string in all three places a buyer might look, so none of
   * them teaches a different URL.
   */
  it("agrees character for character with the 402's retry_url_template", async () => {
    const item = getMenuItem("settlement_attestation") as MenuItem;
    const probe = await SELF.fetch(`${BASE}/api/buy/${item.id}`, { headers: OUTSIDE });
    const declared = decodePaymentRequired(probe).extensions?.["required-inputs"] as
      | { retry_url_template: string }
      | undefined;
    expect(declared?.retry_url_template).toBe(buyUrlTemplate(item, BASE));
  });

  /**
   * THE REGRESSION THIS MUST NOT CAUSE (2026-07-26, again 2026-09-11):
   * a bare probe of buy_url must still answer 402, or every indexer
   * and directory checker reads the door as dead.
   */
  it("leaves buy_url bare, and a bare probe still answers 402", async () => {
    for (const id of ["settlement_attestation", "spot_check", "the_confession"]) {
      const item = getMenuItem(id) as MenuItem;
      expect(buyerLinks(item, BASE).buy_url_template).not.toBe(`${BASE}/api/buy/${id}`);
      const probe = await SELF.fetch(`${BASE}/api/buy/${id}`, { headers: OUTSIDE });
      expect(probe.status, id).toBe(402);
    }
  });

  /**
   * The served documents, not just the helper: the compact input
   * contract and the catalog are what a planning agent actually reads,
   * and they are where a bare buy_url was being handed out.
   */
  it("reaches the documents a planning agent reads", async () => {
    const compact = await (await SELF.fetch(`${BASE}/menu/spot_check?view=compact`, { headers: OUTSIDE })).json() as Record<string, unknown>;
    expect(compact.buy_url).toBe(`${BASE}/api/buy/spot_check`);
    expect(compact.buy_url_template).toBe(`${BASE}/api/buy/spot_check?host=<host>`);

    const catalog = await (await SELF.fetch(`${BASE}/api/catalog/v1`, { headers: OUTSIDE })).json() as { items: Record<string, unknown>[] };
    const row = catalog.items.find((entry) => entry.id === "settlement_attestation");
    expect(row?.buy_url_template).toBe(`${BASE}/api/buy/settlement_attestation?tx_hash=<tx_hash>`);
    /*
     * The bounded row is budgeted (test/discovery-budget.spec.ts) and
     * has no required_params at all, so here the key is emitted ONLY
     * where the bare door will not serve — its presence IS the signal.
     * That is the opposite rule from the full catalog above, and both
     * are deliberate.
     */
    for (const entry of catalog.items) {
      const item = getMenuItem(String(entry.id)) as MenuItem;
      const needsInput = (buyInputSchema(item).required ?? []).length > 0;
      expect(typeof entry.buy_url_template === "string", String(entry.id)).toBe(needsInput);
    }
  });

  /** The template, filled in, is a URL the stock x402 loop can actually buy. */
  it("a filled template pays through where the bare door refuses", async () => {
    const filled = `${BASE}/api/buy/spot_check?host=example.com`;
    const probe = await SELF.fetch(filled, { headers: OUTSIDE });
    expect(probe.status).toBe(402);
    const challenge = decodePaymentRequired(probe);
    // The stock loop retries the resource it was challenged for.
    expect(challenge.resource.url).toBe(filled);
    const paid = await SELF.fetch(challenge.resource.url, {
      headers: { ...OUTSIDE, "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) },
    });
    expect(paid.status).toBe(200);

    // And the bare door, signed the same way, is still refused before
    // the gate — no money moved, which is the honest half of this.
    const bare = await SELF.fetch(`${BASE}/api/buy/spot_check`, { headers: OUTSIDE });
    const bareChallenge = decodePaymentRequired(bare);
    const refused = await SELF.fetch(bareChallenge.resource.url, {
      headers: { ...OUTSIDE, "PAYMENT-SIGNATURE": buildPaymentSignature(bareChallenge.accepts[0]!) },
    });
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as Record<string, unknown>;
    expect(body.charged).toBe(false);
    // The refusal now hands back the URL instead of only the field name.
    expect(body.buy_url_template).toBe(buyUrlTemplate(getMenuItem("spot_check") as MenuItem, BASE));
    expect(String(body.next_action)).toContain("buy_url_template");
  });
});

/**
 * THE DOCUMENTS ONE HOP AFTER A FREE READ (2026-09-28, off the decline
 * desk's second reading). The 2026-09-21 fix reached the catalog, the
 * compact contract and the refusal, and the reading beside every
 * missing-input decline said the buyable URL was now "in every
 * document they read". It was not. The ladder rungs a preflight or a
 * look hands back, the paid examples on /how-it-works, the deeper
 * reads on /doors, the room footers, the markdown twin of every item
 * page and the answer-engine copy at /what all still named the bare
 * door — and every one of those rungs is an input-taking item, because
 * a buyer reaches them with a subject already in hand. These are the
 * places a buyer is standing when it decides to pay, so they carry the
 * template too, and buy_url stays bare beside it for the probe rule.
 */
describe("every document that names a buy door after a free read carries the template", () => {
  const inputTaking = MENU_ITEMS.filter((item) => (buyInputSchema(item).required ?? []).length > 0);

  it("the ladder rung a preflight or a look hands back", () => {
    for (const id of ["service_audit", "launch_check", "conformance_watch", "standing_watch", "passport_refresh", "operator_statement"]) {
      const rung = ladderRung(BASE, id, "why") as Record<string, unknown>;
      const item = getMenuItem(id) as MenuItem;
      expect(rung.buy_url, id).toBe(`${BASE}/api/buy/${id}`);
      expect(rung.buy_url_template, id).toBe(buyUrlTemplate(item, BASE));
      // Not one of these rungs is buyable at its bare door.
      expect(rung.buy_url_template, id).not.toBe(rung.buy_url);
    }
  });

  it("the paid examples on /how-it-works and the deeper reads on /doors", async () => {
    const how = (await (await SELF.fetch(`${BASE}/how-it-works.json`, { headers: OUTSIDE })).json()) as { price: { paid_examples: Record<string, unknown>[] } };
    const doors = (await (await SELF.fetch(`${BASE}/doors.json`, { headers: OUTSIDE })).json()) as { price: { deeper: Record<string, unknown>[] } };
    for (const rung of [...how.price.paid_examples, ...doors.price.deeper]) {
      const item = getMenuItem(String(rung.id)) as MenuItem;
      expect(rung.buy_url, item.id).toBe(`${BASE}/api/buy/${item.id}`);
      expect(rung.buy_url_template, item.id).toBe(buyUrlTemplate(item, BASE));
    }
    expect(how.price.paid_examples.length).toBeGreaterThan(0);
    expect(doors.price.deeper.length).toBeGreaterThan(0);
  });

  it("the room footer's agent line, on every room that sells a deeper read", async () => {
    const rooms = ROOMS.filter((room) => (room.deeper?.length ?? 0) > 0 && !room.writes_its_own_deeper);
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      const [first] = deeperRungs(room.path);
      const item = getMenuItem(first!.id) as MenuItem;
      expect(first!.buy_url_template, room.path).toBe(buyUrlTemplate(item, BASE));
      const page = await (await SELF.fetch(`${BASE}${room.path}`, { headers: { ...OUTSIDE, Accept: "text/html" } })).text();
      // The literal line a person hands to their agent, HTML-escaped.
      expect(page, room.path).toContain(buyUrlTemplate(item, BASE).replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    }
  });

  it("the markdown twin of every input-taking item page", async () => {
    for (const item of inputTaking) {
      const md = await (await SELF.fetch(`${BASE}/menu/${item.id}`, { headers: { ...OUTSIDE, Accept: "text/markdown" } })).text();
      const buy = md.split("\n").find((line) => line.startsWith("- **buy:**"));
      expect(buy, item.id).toContain(`\`GET ${buyUrlTemplate(item, BASE)}\``);
      const required = md.split("\n").find((line) => line.startsWith("- **required inputs:**"));
      expect(required, item.id).toBeDefined();
      for (const name of buyInputSchema(item).required ?? []) {
        expect(required, item.id).toContain(`\`${name}\``);
      }
      // The bare door is still named, as the thing that quotes and refuses.
      expect(required, item.id).toContain(`${BASE}/api/buy/${item.id}\``);
    }
  });

  it("and leaves the markdown twin of an input-less item as it was", async () => {
    const md = await (await SELF.fetch(`${BASE}/menu/hello`, { headers: { ...OUTSIDE, Accept: "text/markdown" } })).text();
    expect(md).toContain(`- **buy:** \`GET ${BASE}/api/buy/hello\``);
    expect(md).not.toContain("- **required inputs:**");
  });

  /**
   * The onboarding documents, which taught the bare door as step one
   * and never named the template: a buyer arriving from skill.md,
   * agents.md or the guide learned the URL that refuses the purchase.
   */
  it("the buying steps in skill.md, agents.md and the guide", async () => {
    for (const path of ["/skill.md", "/agents.md", "/llms-full.txt"]) {
      const text = await (await SELF.fetch(`${BASE}${path}`, { headers: OUTSIDE })).text();
      expect(text, path).toContain("buy_url_template");
      expect(text, path).toContain("<slot>");
    }
  });

  it("the answer-engine copy at /what", async () => {
    const what = (await (await SELF.fetch(`${BASE}/what`, { headers: OUTSIDE })).json()) as { one_question_per_shelf: { answer: string }[] };
    const spot = getMenuItem("spot_check") as MenuItem;
    const answer = what.one_question_per_shelf.find((pair) => pair.answer.includes(`"${spot.name}"`));
    expect(answer?.answer).toContain(`Buy: GET ${buyUrlTemplate(spot, BASE)}`);
    const hello = getMenuItem("hello") as MenuItem;
    const plain = what.one_question_per_shelf.find((pair) => pair.answer.includes(`"${hello.name}"`));
    if (plain) expect(plain.answer).toContain(`Buy: GET ${BASE}/api/buy/hello —`);
  });
});
