import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import { REFUND_POLICY } from "@/store/refund-policy";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { installLaborAdmissionHarness } from "./helpers/labor-admission";

const BASE = "https://scvd.store";

const BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/*
 * Human-labour doors refuse rather than quote when the keeper's
 * shelf cannot be read, so the harness that makes those doors
 * answerable is what lets this file test them at all.
 */
installLaborAdmissionHarness();

/**
 * WHAT A BUYER LEARNS BEFORE PAYING (2026-09-21).
 *
 * Two cold runs — one integrator, one first-time buyer, both
 * read-only, neither paying — converged on the same gap from opposite
 * directions: the things that decide whether to transact were in
 * prose, on a different page, or on a surface the reader was not
 * looking at.
 */

describe("the browser paywall names what the door needs", () => {
  it("names every required input, on the page a person actually reads", async () => {
    /*
     * The integrator's finding, and it is the price-template defect in
     * a third costume: the requirement rode the challenge description,
     * the JSON body, the bazaar extension and the item page, and was
     * absent from the one surface rendered for human eyes.
     */
    const withInputs = MENU_ITEMS.filter(
      (item) => (buyInputSchema(item).required ?? []).some((name) => name !== "agent_name"),
    );
    expect(withInputs.length, "no item requires an input to test with").toBeGreaterThan(0);

    for (const item of withInputs) {
      const page = await (
        await SELF.fetch(`${BASE}/api/buy/${item.id}`, { headers: BROWSER })
      ).text();
      for (const name of (buyInputSchema(item).required ?? []).filter((n) => n !== "agent_name")) {
        expect(page, `${item.id}'s browser page never names ?${name}=`).toContain(`?${name}=`);
      }
    }
  });

  it("does not invent a requirement on doors that have none", async () => {
    const withoutInputs = MENU_ITEMS.filter(
      (item) => (buyInputSchema(item).required ?? []).every((name) => name === "agent_name"),
    );
    expect(withoutInputs.length).toBeGreaterThan(0);
    const page = await (
      await SELF.fetch(`${BASE}/api/buy/${withoutInputs[0]!.id}`, { headers: BROWSER })
    ).text();
    expect(page).not.toContain("This door needs");
  });

  it("calls the practice counter what it is", async () => {
    /*
     * The buyer run: the link labelled "Browser checkout tools" lands
     * on /try, which is the practice counter, not a checkout tool. A
     * mislabelled link on a paywall is the worst place for one — the
     * reader is already deciding whether this store is careful.
     */
    const page = await (
      await SELF.fetch(`${BASE}/api/buy/hello`, { headers: BROWSER })
    ).text();
    expect(page).toContain("practice counter");
    expect(page).not.toContain("Browser checkout tools");
  });
});

describe("the refund terms are readable by a machine before it pays", () => {
  it("rides the catalog a planning agent reads first", async () => {
    const menu = (await (
      await SELF.fetch(`${BASE}/menu.json`, { headers: { Accept: "application/json" } })
    ).json()) as Record<string, unknown>;

    const terms = menu["refund_terms"] as Record<string, unknown>;
    expect(terms, "menu.json carries no refund terms").toBeTruthy();

    // The pair a machine acts on, and the reason they are separate
    // fields: one half is mechanical and the other is a person.
    expect(terms["breach_detection"]).toBe("timed_sweep");
    expect(terms["payment"]).toBe("by_hand");

    // Derived from the one policy document, never a second copy.
    expect(terms["commitment"]).toBe(REFUND_POLICY.commitment);
    expect(terms["mechanism"]).toBe(REFUND_POLICY.mechanism);
    expect(terms["instant_items"]).toBe(REFUND_POLICY.instant_items);

    expect(terms["terms_url"]).toContain("/rights");
    expect(terms["record_url"]).toContain("/fulfillment-log");
    expect(terms["if_the_store_closes_url"]).toContain("/wind-down");
  });

  it("puts the same promise in fields on every human-fulfilled 402", async () => {
    const human = MENU_ITEMS.filter((item) => item.fulfillment === "human_queue");
    expect(human.length).toBeGreaterThan(0);

    let quoted = 0;
    for (const item of human) {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`, {
        headers: { Accept: "application/json" },
      });
      /*
       * A human-labour door behind a closed shutter refuses rather
       * than quoting a price the keeper cannot honour, and a refusal
       * carries no terms because there is nothing to agree to. Assert
       * on the doors that actually quoted, and require that some did.
       */
      if (response.status !== 402) continue;
      quoted += 1;
      const body = (await response.json()) as Record<string, unknown>;

      const refund = body["refund"] as Record<string, unknown>;
      expect(refund, `${item.id}'s 402 carries no refund fields`).toBeTruthy();
      // Derived from the item's own window, so it cannot drift from
      // the prose beside it.
      expect(refund["window_hours"]).toBe(item.sla_hours ?? 168);
      expect(refund["breach_detection"]).toBe("timed_sweep");
      expect(refund["payment"]).toBe("by_hand");
      // The prose stays for the person; the fields are beside it.
      expect(String(body["refund_promise"])).toContain("your money back");
    }
    expect(quoted, "no human-fulfilled door quoted, so nothing was checked").toBeGreaterThan(0);
  });
});

describe("the headline promise says which half is mechanical", () => {
  it("keeps the promise and names the person who keeps it", () => {
    const line = STORE_METADATA.refund_policy;
    // Unchanged obligations, still guarded by claim-chain.spec.ts.
    expect(line.toLowerCase()).toContain("money back");
    expect(line.toLowerCase()).not.toContain("automatic");

    /*
     * What the 2026-07-27 fix missed. Deleting the word left an
     * unconditional transfer with no actor and no delay in it, which
     * a cold buyer read as programmatic. Each clause below is a thing
     * somebody can go and check, which is why the line is longer now
     * and claims more rather than less.
     */
    expect(line, "the sweep that finds the miss is not mentioned").toMatch(/finds the miss/i);
    expect(line, "the buyer is not told they need not notice").toMatch(/without you having to notice or ask/i);
    expect(line, "the hand that pays is not named").toMatch(/by hand/i);
    expect(line, "the public record is not named").toMatch(/ledger|transaction hash/i);
    expect(line, "the delay is still implied away").toMatch(/not instant/i);
  });
});
