import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store/menu";
import { cadencePhrase, priceLine } from "@/services/menu-markdown";
import { PAID_EXAMPLES } from "@/routes/how-it-works";

const BASE = "https://scvd.store";

const BROWSER = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/**
 * /how-it-works — the mechanism room (keeper's ask, 2026-08-30).
 *
 * THE GUARD THAT MATTERS MOST HERE IS THE WALK. The page names nine
 * free doors and says what each one answers. That list is typed, and
 * a typed list of URLs is exactly what rots: a door renamed six weeks
 * from now leaves this page confidently pointing at a 404, which is
 * worse than not having listed it. So every URL it names is FETCHED,
 * and a door that stops answering fails the build.
 *
 * It is the same lesson as the withdrawn standing_watch row in
 * docs/SURFACE_CONTRACT_2026-08.md, one level up: derive what can be
 * derived (every price here is read off MENU_ITEMS), and where prose
 * must name something, make the naming checkable.
 */

async function doc(): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}/how-it-works.json`);
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, any>;
}

describe("the room answers both audiences at its own URL", () => {
  it("serves HTML to a browser and JSON to everyone else", async () => {
    const html = await SELF.fetch(`${BASE}/how-it-works`, { headers: BROWSER });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");

    const json = await SELF.fetch(`${BASE}/how-it-works`, {
      headers: { Accept: "application/json" },
    });
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toContain("application/json");
  });

  it("serves the same document at both spellings", async () => {
    const atJson = await (await SELF.fetch(`${BASE}/how-it-works.json`)).json();
    const atBare = await (
      await SELF.fetch(`${BASE}/how-it-works`, { headers: { Accept: "application/json" } })
    ).json();
    // A reader must never be able to catch the two disagreeing.
    expect(atBare).toEqual(atJson);
  });
});

describe("every free door this page names actually answers", () => {
  it("names a real list, or the walk below checks nothing", async () => {
    const body = await doc();
    expect(body.price.free_instruments.length).toBeGreaterThan(5);
  });

  it("walks all of them, and none is a broken promise", async () => {
    const body = await doc();
    const broken: string[] = [];
    for (const entry of body.price.free_instruments as {
      url: string;
      method: string;
      answers: string;
    }[]) {
      expect(entry.answers, `${entry.url} is named without saying what it answers`).toBeTruthy();
      const path = entry.url.replace(BASE, "");
      const response = await SELF.fetch(`${BASE}${path}`);
      /*
       * A POST door answers a GET with 405 or 400 — that is the route
       * existing and refusing, which is what we need to know. Only a
       * 404 means this page points at nothing.
       */
      if (response.status === 404) broken.push(`${entry.method} ${path} -> 404`);
    }
    expect(
      broken,
      `this page promises free doors that are not there:\n${broken.join("\n")}`,
    ).toEqual([]);
  });
});

describe("the paid rungs are the shelf's, never this page's", () => {
  /**
   * READ THE SOURCE LIST, NOT THE RENDERED OUTPUT. The renderer drops
   * an unknown id on purpose, so a guard over the output cannot see a
   * stale one — the first version of this test passed with a planted
   * `spot_check_retired`. Found by mutation, which is the only thing
   * that finds a guard like that.
   */
  it("names no item the shelf does not sell", () => {
    expect(PAID_EXAMPLES.length).toBeGreaterThan(2);
    const stale = PAID_EXAMPLES.filter(
      (rung) => !MENU_ITEMS.some((item) => item.id === rung.id),
    ).map((rung) => rung.id);
    expect(stale, "a rung points at an item the shelf does not carry").toEqual([]);
  });

  it("renders every rung it names, so none is silently dropped", async () => {
    const body = await doc();
    expect((body.price.paid_examples as unknown[]).length).toBe(PAID_EXAMPLES.length);
  });

  it("quotes every price and cadence off MENU_ITEMS", async () => {
    const body = await doc();
    const rungs = body.price.paid_examples as Record<string, unknown>[];
    expect(rungs.length).toBeGreaterThan(2);
    for (const rung of rungs) {
      const item = MENU_ITEMS.find((candidate) => candidate.id === rung["id"])!;
      expect(rung["price"]).toBe(priceLine(item));
      expect(rung["price_usdc"]).toBe(item.price_usdc);
      expect(rung["cadence"]).toBe(item.cadence);
      expect(rung["buy_url"]).toBe(`${BASE}/api/buy/${item.id}`);
      // 57.3 in full: the amount AND for how long, on the agent surface.
      expect(String(rung["price"])).toContain(cadencePhrase(item));
    }
  });

  it("quotes a floor the shelf actually honours", async () => {
    const body = await doc();
    const cheapest = MENU_ITEMS.reduce(
      (low, item) => (item.price_usdc < low ? item.price_usdc : low),
      MENU_ITEMS[0]!.price_usdc,
    );
    expect(body.how_money_works.cheapest_on_the_shelf_usdc).toBe(cheapest);
  });
});

describe("the five questions an agent arrives with (rule 57)", () => {
  it("57.2 — says what it is, what it is for, and what it is not", async () => {
    const body = await doc();
    expect(body.what_this_is).toBeTruthy();
    expect(body.what_you_can_use_it_for).toBeTruthy();
    expect(body.what_this_is_not, "a description that only sells narrows by omission").toBeTruthy();
    expect(body.honest_limits, "the page never says what it cannot tell you").toBeTruthy();
  });

  it("57.3 — free says free, and answers whether anything recurs", async () => {
    const body = await doc();
    expect(body.price.this_surface).toBe("free");
    expect(String(body.how_money_works.recurrence)).toContain("charges again by itself");
  });

  it("57.4 — the outcome, and the errors by name with what to do", async () => {
    const body = await doc();
    expect(body.expected_outcome).toBeTruthy();
    expect(body.how_to_call.smallest_useful_call).toContain("curl");
    const errors = body.errors as Record<string, string>[];
    expect(errors.length).toBeGreaterThan(1);
    for (const error of errors) {
      expect(error["code"], "an error with no code is not a category").toBeTruthy();
      expect(error["means"]).toBeTruthy();
      expect(error["what_to_do"], `${error["code"]} says what it is, not what to do`).toBeTruthy();
    }
  });

  it("57.5 — what it reads, what it stores, and the standards", async () => {
    const body = await doc();
    const security = body.security as Record<string, string>;
    expect(security["what_this_surface_reads"]).toBeTruthy();
    expect(security["what_it_stores_about_you"]).toMatch(/no account/i);
    // The one unverifiable sentence carries the date it was true on.
    expect(security["what_it_stores_about_you"]).toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(security["standards"]).toContain("private-first");
    expect(security["reporting"]).toContain("security.txt");
  });

  /**
   * THE CLAIM REGISTER CAUGHT THIS ONE (2026-08-30, budget 0). The
   * error catalogue says "There is no body to post and no field to
   * fill" — claim-shaped, and unbound until something proves it. It
   * is not a sentence to date, because it is a structural fact about
   * how the route is registered, so it gets derived and checked: the
   * door answers GET and refuses everything else.
   */
  it("really does refuse a body, on both spellings", async () => {
    for (const path of ["/how-it-works", "/how-it-works.json"]) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anything: "at all" }),
      });
      expect(response.status, `${path} accepted a POST it documents as impossible`).toBe(405);
    }
  });

  it("keeps its no-writes claim true by never writing", async () => {
    // The one sentence on the page a reader cannot check for themselves,
    // held the way /doors holds its own: a standing test, not a promise.
    const response = await SELF.fetch(`${BASE}/how-it-works.json`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("the mechanism it describes is a walkable one (rule 55)", () => {
  it("gives every step something the reader can verify without us", async () => {
    const body = await doc();
    const steps = body.how_evidence_is_made as Record<string, unknown>[];
    expect(steps.length).toBe(5);
    for (const step of steps) {
      expect(step["name"]).toBeTruthy();
      expect(step["what_happens"]).toBeTruthy();
      expect(
        step["what_you_can_check"],
        `step "${step["name"]}" asks to be believed and names no way to check it`,
      ).toBeTruthy();
    }
  });

  it("states the order of operations that makes refunds unnecessary", async () => {
    const body = await doc();
    expect(String(body.how_money_works.order_of_operations)).toContain("delivers first");
    expect(String(body.how_money_works.what_money_never_buys)).toContain("verdict");
  });
});

describe("the human half earns its page (rule 58)", () => {
  it("58.1 — one h1, a title, a description and a canonical", async () => {
    const page = await (await SELF.fetch(`${BASE}/how-it-works`, { headers: BROWSER })).text();
    expect(page).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(page).toMatch(/<meta name="description" content="[^"]{50,}"/);
    expect((page.match(/<h1[ >]/g) ?? []).length).toBe(1);
    expect(page).toContain(`<link rel="canonical" href="${BASE}/how-it-works">`);
  });

  it("58.4 — hands a person a literal line for their agent", async () => {
    const page = await (await SELF.fetch(`${BASE}/how-it-works`, { headers: BROWSER })).text();
    expect(page).toContain("Or hand it to your agent");
    expect(page).toContain(`${BASE}/how-it-works.json`);
  });
});
