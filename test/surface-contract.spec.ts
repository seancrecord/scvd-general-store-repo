import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import houseRulesText from "../HOUSE_RULES.md?raw";
import { MENU_ITEMS } from "@/store/menu";
import { NEVER_AUTO_RENEWS, cadenceLine, priceLine } from "@/services/menu-markdown";
import { PROBE_DOOR_ERRORS } from "@/store/surface-contract";

/**
 * THE SURFACE CONTRACT (house rules 57 and 58, adopted 2026-08-29).
 *
 * The keeper ruled two rules in one evening — five things every
 * surface owes an agent, and four more that anything a person reads
 * owes a person. Rule 56 says a rule nothing checks is not tradition
 * but drift, so they arrive with checks or they do not arrive.
 *
 * WHAT THIS FILE HONESTLY DOES AND DOES NOT DO. It does not claim
 * every one of the store's ninety-odd doors satisfies all nine
 * clauses today; that would be a lie a test could not tell the
 * difference about. It holds the clauses that ARE mechanically
 * checkable across the whole shelf — cadence, chiefly, which was
 * missing everywhere and is now required by the type system — and it
 * holds the full nine against /doors, the room built to the rules the
 * evening they were written, so the standard has a worked example
 * that cannot rot. Clause 57.1 was already held elsewhere, by
 * test/no-orphan-capability.spec.ts, and is not duplicated here.
 */

describe("the rules exist to be cited", () => {
  it("carries rules 57 and 58 with the keeper's words attached", () => {
    // Not the text of the rules — those are his ink and get amended.
    // Their PRESENCE, because a rule this file's checks cite by
    // number must not quietly vanish from the file they live in.
    expect(houseRulesText).toMatch(/^57\. /m);
    expect(houseRulesText).toMatch(/^58\. /m);
    // Both were adopted from his own sentences, quoted verbatim; a
    // rule that lost its quotation has been paraphrased by somebody.
    const fiftySeven = houseRulesText.split(/^57\. /m)[1]!.split(/^58\. /m)[0]!;
    expect(fiftySeven).toContain("THE KEEPER'S WORDS, VERBATIM");
    expect(fiftySeven).toContain("haiku");
    const fiftyEight = houseRulesText.split(/^58\. /m)[1]!;
    expect(fiftyEight).toContain("THE KEEPER'S WORDS, VERBATIM");
    expect(fiftyEight).toContain("seo");
  });
});

/**
 * CLAUSE 57.3, ACROSS THE WHOLE SHELF — the one that was missing
 * everywhere. "How much" was on every surface; "for how long" was in
 * nobody's structured data. Four items sell a term and every one of
 * them said so only in English prose, so a buying agent reading
 * menu.json saw $5 and could not learn it bought a week.
 */
describe("every price says what it is buying, and for how long", () => {
  it("makes no item silent about its cadence", () => {
    // A guard over an empty shelf is a guard that cannot fail.
    expect(MENU_ITEMS.length).toBeGreaterThan(20);
    const silent = MENU_ITEMS.filter((item) => !item.cadence).map((item) => item.id);
    expect(silent).toEqual([]);
  });

  it("gives every term item its term, and no one-off a phantom one", () => {
    const termWithoutDays = MENU_ITEMS.filter(
      (item) => item.cadence === "term" && !item.term_days,
    ).map((item) => item.id);
    expect(
      termWithoutDays,
      "a term item does not say how many days one payment covers, which is the whole fact the cadence field exists to carry",
    ).toEqual([]);

    const oneOffWithDays = MENU_ITEMS.filter(
      (item) => item.cadence === "one_off" && item.term_days !== undefined,
    ).map((item) => item.id);
    expect(
      oneOffWithDays,
      "a one-off item carries term_days, which reads as a subscription to anything parsing this",
    ).toEqual([]);
  });

  /**
   * THE FOUR THAT ACTUALLY SELL TIME, pinned by id rather than by
   * count. A count would pass if somebody swapped one for another;
   * these are the doors where a buyer's money buys days, and if that
   * set changes it should change on purpose.
   */
  it("names the four items that sell a stretch of time", () => {
    const term = MENU_ITEMS.filter((item) => item.cadence === "term").map((item) => item.id);
    expect([...term].sort()).toEqual([
      "conformance_watch",
      "recurring_patronage",
      "standing_watch",
      "trust_profile",
    ]);
  });

  /**
   * THE ANSWER TO "IS THIS RECURRING" TRAVELS WITH THE PRICE, on
   * every surface that quotes one — because priceLine is the single
   * place a price is phrased, and the MCP tool list, the catalog, the
   * markdown menu and the item pages all read it.
   */
  it("puts the cadence in the same breath as the amount, everywhere", () => {
    for (const item of MENU_ITEMS) {
      const line = priceLine(item);
      expect(line, `${item.id} does not price in dollars`).toMatch(/^\$/);
      expect(line, `${item.id} does not say what it is buying`).toContain(
        cadenceLine(item),
      );
      expect(line, `${item.id} leaves "is this recurring" unanswered`).toContain(
        NEVER_AUTO_RENEWS,
      );
      if (item.cadence === "term") {
        expect(line).toContain(`${item.term_days}-day term`);
      } else {
        expect(line).toContain("one-off");
      }
    }
  });

  it("serves the cadence to an agent reading the catalog, not only to a page", async () => {
    const body = (await (await SELF.fetch("https://scvd.store/menu.json")).json()) as {
      items: { id: string; cadence?: string; term_days?: number }[];
    };
    expect(body.items.length).toBe(MENU_ITEMS.length);
    const silent = body.items.filter((item) => !item.cadence).map((item) => item.id);
    expect(silent).toEqual([]);
    const watch = body.items.find((item) => item.id === "conformance_watch");
    expect(watch?.cadence).toBe("term");
    expect(watch?.term_days).toBe(7);
  });
});

/**
 * THE SWEEP (begun 2026-08-29). /doors was the worked example; these
 * are the doors an agent meets BEFORE it ever pays us, and the sweep
 * found the same three holes in all three of them — in the three
 * best-documented files in the repository.
 *
 * Every one of them described, at length and by name, the failures it
 * finds in OTHER people's endpoints. Not one said what IT returns
 * when the caller gets it wrong. That is the shape worth naming: the
 * documentation was generous everywhere except about its own failure
 * path, which is the only part a caller is holding when things go
 * wrong.
 *
 * THE REGISTRY IS THE COVERAGE STATEMENT. A door listed here is under
 * the contract and checked; a door absent from it is not claimed to
 * be. Adding a row is how the sweep advances, and the row fails until
 * the door answers — which is the opposite of a doc that says
 * "everything complies".
 */
const DOORS_UNDER_CONTRACT = [
  { path: "/api/preflight/v1", dials_out: true, paid_rung: true },
  { path: "/api/before-you-pay/v1", dials_out: true, paid_rung: true },
  /*
   * THE DESK HAS NO PAID RUNG ON PURPOSE, and the first draft of this
   * guard was wrong to demand one. It requires every door to point at
   * an upsell — and the conformance desk has refused one in writing
   * since it shipped: "a paid verdict has a customer, and a customer
   * for a verdict is how verdicts start bending." Forcing a rung here
   * would have made the store sell the one thing it decided not to.
   *
   * So the flag is false and the clause below demands the REFUSAL be
   * on the record instead. A door with no upsell must have declined
   * one out loud; silence is the thing 57.3 actually forbids.
   */
  { path: "/api/conformance/v1", dials_out: false, paid_rung: false },
] as const;

describe("the doors under the contract answer all five questions", () => {
  it("covers more than one door, or the sweep has not started", () => {
    expect(DOORS_UNDER_CONTRACT.length).toBeGreaterThan(2);
  });

  for (const door of DOORS_UNDER_CONTRACT) {
    it(`${door.path} — 57.2, what it is and what it is for`, async () => {
      const doc = (await (
        await SELF.fetch(`https://scvd.store${door.path}`)
      ).json()) as Record<string, any>;
      expect(doc.summary, `${door.path} has no summary`).toBeTruthy();
      // The honest half: every one of these says what it CANNOT do,
      // which is the clause's real test — a description that only
      // sells is a description that narrows by omission.
      const limits =
        doc.what_it_cannot_check ?? doc.what_it_cannot_tell_you ?? null;
      expect(limits, `${door.path} never says what it cannot do`).toBeTruthy();
    });

    it(`${door.path} — 57.3, free or paid with the cadence`, async () => {
      const doc = (await (
        await SELF.fetch(`https://scvd.store${door.path}`)
      ).json()) as Record<string, any>;
      const text = JSON.stringify(doc);
      expect(text, `${door.path} never says it is free`).toMatch(/[Ff]ree/);
      /*
       * A LADDER THAT NAMES A BUY URL MUST NAME ITS PRICE. This is the
       * exact hole the sweep opened on: four buy URLs on the preflight
       * doc, not one price or cadence between them.
       */
      const rungs = (doc.the_ladder?.paid ?? []) as Record<string, unknown>[];
      for (const rung of rungs) {
        expect(rung["price_usdc"], `a paid rung on ${door.path} has no amount`).toBeTruthy();
        expect(["one_off", "term"]).toContain(rung["cadence"]);
        expect(String(rung["price"])).toContain("charges again by itself");
        expect(String(rung["buy_url"])).toContain("/api/buy/");
      }
      if (door.paid_rung) {
        expect(
          rungs.length,
          `${door.path} names no paid path at all. Either point at one, or set paid_rung false here and say in the door's own body why it refuses to have one.`,
        ).toBeGreaterThan(0);
      } else {
        expect(
          doc.why_it_is_free,
          `${door.path} has no paid rung and does not say why. A door that declines to sell an upgrade has made a decision, and 57.3 wants the decision, not the silence.`,
        ).toBeTruthy();
        expect(rungs.length, `${door.path} declares no paid rung but serves one`).toBe(0);
      }
    });

    it(`${door.path} — 57.4, the outcome and the errors by name`, async () => {
      const doc = (await (
        await SELF.fetch(`https://scvd.store${door.path}`)
      ).json()) as Record<string, any>;
      expect(doc.expected_outcome, `${door.path} never states its success shape`).toBeTruthy();
      const errors = (doc.errors ?? []) as Record<string, string>[];
      expect(errors.length, `${door.path} documents nobody's failures but other people's`).toBeGreaterThan(1);
      for (const error of errors) {
        expect(error["code"], "an error with no code is not a category").toBeTruthy();
        expect(error["means"]).toBeTruthy();
        expect(
          error["what_to_do"],
          `${error["code"]} says what it is and not what to do about it`,
        ).toBeTruthy();
      }
    });

    it(`${door.path} — 57.5, what it does in your name and what we hold to`, async () => {
      const doc = (await (
        await SELF.fetch(`https://scvd.store${door.path}`)
      ).json()) as Record<string, any>;
      const security = doc.security as Record<string, string> | undefined;
      expect(security, `${door.path} has no security block at all`).toBeTruthy();
      expect(security!["what_this_does_in_your_name"]).toBeTruthy();
      expect(security!["what_it_stores_about_you"]).toBeTruthy();
      expect(security!["what_we_never_do"]).toContain("No account");
      expect(security!["standards"]).toContain("private-first");
      expect(security!["reporting"]).toContain("security.txt");
      if (door.dials_out) {
        expect(
          security!["what_this_does_in_your_name"],
          "a door that dials a URL you named must say so in its own security block",
        ).toMatch(/outbound GET/);
      }
    });
  }
});

/**
 * THE CODES ARE ON THE WIRE, not only in the documentation. A
 * published error catalogue that the door does not actually emit is
 * the same defect as an undocumented one, wearing better clothes.
 */
describe("a named error category is what the door really sends", () => {
  it("names the category on a real refusal", async () => {
    const response = await SELF.fetch("https://scvd.store/api/preflight/v1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, string>;
    expect(body["code"]).toBe("url_unparseable");
    // The English sentence is unchanged and still served: the codes
    // are additive, so nothing reading the old shape breaks.
    expect(body["error"]).toBeTruthy();
  });

  it("refuses our own hostname by name rather than by prose", async () => {
    const response = await SELF.fetch("https://scvd.store/api/preflight/v1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://scvd.store/api/buy/hello" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, string>;
    expect(body["code"]).toBe("own_host_refused");
  });

  it("publishes every code it can emit, and emits nothing it did not publish", async () => {
    const doc = (await (
      await SELF.fetch("https://scvd.store/api/preflight/v1")
    ).json()) as Record<string, any>;
    const published = new Set(
      (doc.errors as { code: string }[]).map((error) => error.code),
    );
    // The two we just provoked, plus the ones the source declares.
    for (const code of PROBE_DOOR_ERRORS.map((error) => error.code)) {
      expect(published.has(code), `${code} is emitted but not published`).toBe(true);
    }
  });
});

/**
 * THE WORKED EXAMPLE. /doors was built to rules 57 and 58 the evening
 * they were adopted, and this holds it to all nine clauses so the
 * standard has one place it is demonstrably met rather than only
 * described.
 */
describe("/doors answers the five questions an agent arrives with", () => {
  async function body(): Promise<Record<string, any>> {
    return (await (await SELF.fetch("https://scvd.store/doors.json")).json()) as Record<
      string,
      any
    >;
  }

  it("57.2 — says what it is and what it is for, without narrowing it", async () => {
    const json = await body();
    expect(json.what_this_is).toBeTruthy();
    expect(json.what_you_can_use_it_for).toBeTruthy();
    // The clause's actual test: it must not foreclose uses. The
    // sentence says so out loud, which is the only way a check can
    // tell an open description from a closed one.
    expect(json.what_you_can_use_it_for).toContain("no use case we are reserving");
  });

  it("57.3 — says free or paid, with the cadence of anything paid", async () => {
    const json = await body();
    expect(json.price.this_surface).toBe("free");
    expect(json.price.deeper.length).toBeGreaterThan(2);
    for (const deeper of json.price.deeper) {
      expect(deeper.price_usdc, `${deeper.id} has no amount`).toBeGreaterThan(0);
      expect(["one_off", "term"]).toContain(deeper.cadence);
      if (deeper.cadence === "term") expect(deeper.term_days).toBeGreaterThan(0);
      expect(deeper.price).toContain(NEVER_AUTO_RENEWS);
      expect(deeper.buy_url).toContain("/api/buy/");
    }
  });

  it("57.4 — hands a small model the call, the outcome and the errors by name", async () => {
    const json = await body();
    expect(json.how_to_call.the_whole_list).toContain("/doors.json");
    expect(json.how_to_call.authentication).toBeTruthy();
    expect(json.how_to_call.smallest_useful_call).toContain("curl");
    expect(json.expected_outcome).toContain("200");
    expect(json.errors.length).toBeGreaterThan(1);
    for (const error of json.errors) {
      expect(error.code, "an error with no name is not a category").toBeTruthy();
      expect(error.means).toBeTruthy();
      // The half that makes it actionable rather than merely labelled.
      expect(error.what_to_do, `${error.code} says what it is and not what to do`).toBeTruthy();
    }
    expect(json.faq.length).toBeGreaterThan(2);
  });

  it("57.5 — says what it holds, what it never holds, and what we are kept to", async () => {
    const json = await body();
    expect(json.security.what_it_stores_about_you).toContain("Nothing");
    expect(json.security.what_the_data_is).toBeTruthy();
    expect(json.security.integrity).toContain("ed25519");
    expect(json.security.standards).toBeTruthy();
    expect(json.security.reporting).toContain("security.txt");
  });
});

describe("/doors earns its page for a person", () => {
  const BROWSER = {
    Accept: "text/html,application/xhtml+xml",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  };

  async function html(): Promise<string> {
    const response = await SELF.fetch("https://scvd.store/doors", { headers: BROWSER });
    expect(response.status).toBe(200);
    return response.text();
  }

  it("58.1 — is findable by search, which is not the same as findable by an agent", async () => {
    const page = await html();
    expect(page).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(page).toMatch(/<meta name="description" content="[^"]{50,}"/);
    expect((page.match(/<h1>/g) ?? []).length).toBe(1);
    expect(page).toContain('<link rel="canonical" href="https://scvd.store/doors">');
    // The structured data for what the page actually holds.
    expect(page).toContain(`"@type":"Dataset"`);
  });

  it("58.3 and 58.4 — names the free path first, then the paid one, with prices", async () => {
    const page = await html();
    const freeAt = page.indexOf("Free, and first");
    const paidAt = page.indexOf("Paid, if you want our labour");
    expect(freeAt).toBeGreaterThan(-1);
    expect(paidAt).toBeGreaterThan(freeAt);
    // Every paid line carries its own price, read off the shelf.
    for (const id of ["spot_check", "service_audit", "trust_profile"]) {
      expect(page).toContain(`/menu/${id}`);
    }
    expect(page).toContain("$21");
  });

  /**
   * 58.4's SECOND HALF, and it is the one this store keeps
   * forgetting: a person must be able to hand the deeper read to
   * their agent instead of doing it themselves. That means a literal
   * line they can paste, not an invitation to go and read the API
   * documentation.
   */
  it("58.4 — gives a person something to paste at their own agent", async () => {
    const page = await html();
    expect(page).toContain("Or hand it to your agent");
    expect(page).toContain("https://scvd.store/doors.json");
    expect(page).toContain("/api/buy/service_audit");
  });
});
