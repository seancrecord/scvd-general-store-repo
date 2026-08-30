import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";

const BASE = "https://scvd.store";

/** The two classes that knock on an endpoint the buyer named. */
const FETCHES = new Set(["subject_fetch", "subject_purchase"]);

/**
 * RULE 57 ON THE PAID SHELF.
 *
 * Measured 2026-08-30, the second leg of the sweep
 * docs/SURFACE_CONTRACT_2026-08.md recorded as owed: every one of the
 * 26 shelf items answered ZERO of rule 57's remaining four questions.
 * Price and cadence were covered everywhere — the type system had
 * required them since the rule was adopted — and what an agent gets
 * back, what can go wrong, and what we hold ourselves to were
 * published nowhere per item.
 *
 * The answers derive. 104 hand-written paragraphs about a buy path
 * that is ONE code path is 104 chances to describe it wrongly, and
 * the failure mode of a stale safety paragraph is worse than a stale
 * item count. So the checks below hold two things: that every item
 * answers all four, and that the DERIVATIONS are true of each door —
 * a sold-out error only where stock exists, an outbound-fetch
 * sentence only where the schema takes something to fetch.
 *
 * The roster is MENU_ITEMS. An item listed tomorrow is held tomorrow.
 */

async function listing(id: string): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}/menu/${id}`, {
    headers: { Accept: "application/json" },
  });
  expect(response.status, `/menu/${id} does not answer`).toBe(200);
  return (await response.json()) as Record<string, any>;
}

describe("the roster is the shelf, and it is not empty", () => {
  it("has a shelf to walk", () => {
    expect(MENU_ITEMS.length).toBeGreaterThan(20);
  });

  it("puts the deeper contract one hop from the catalogue", async () => {
    // 57.1: a URL a reader has to construct is not findable.
    const menu = (await (
      await SELF.fetch(`${BASE}/menu.json`, { headers: { Accept: "application/json" } })
    ).json()) as { items: Array<Record<string, any>> };
    for (const entry of menu.items) {
      expect(entry.listing_url, `${entry.id} is in the catalogue with no page`).toBe(
        `${BASE}/menu/${entry.id}`,
      );
    }
  });
});

describe.each(MENU_ITEMS.map((item) => item.id))("/menu/%s", (id) => {
  const item = MENU_ITEMS.find((candidate) => candidate.id === id)!;
  const schema = buyInputSchema(item);
  const required = schema.required ?? [];

  it("57.2 — says what it is for without narrowing it to one errand", async () => {
    const json = await listing(id);
    const forWhat = String(json.what_you_can_use_it_for ?? "");
    expect(forWhat.length).toBeGreaterThan(120);
    expect(forWhat).toContain("no use case we are reserving");
    // The thing that makes a PAID artifact worth buying is that it
    // survives leaving this store; the sentence has to say so.
    expect(forWhat).toContain("free forever");
  });

  it("57.4 — says what comes back, including who does the work", async () => {
    const json = await listing(id);
    const outcome = String(json.expected_outcome ?? "");
    expect(outcome).toContain("200");
    if (item.fulfillment === "human_queue") {
      expect(outcome, `${id} is human-fulfilled and does not say so`).toContain(
        String(item.sla_hours ?? 168),
      );
    } else {
      expect(outcome).toContain("same response");
    }
    if (item.term_days !== undefined) {
      expect(outcome, `${id} sells a term and does not state it`).toContain(
        String(item.term_days),
      );
    }
  });

  it("57.4 — names the error categories, and only the true ones", async () => {
    const json = await listing(id);
    const errors = json.errors as Array<Record<string, any>>;
    const codes = errors.map((error) => String(error.code));
    expect(codes).toContain("payment_required");
    expect(codes).toContain("unknown_item");
    for (const error of errors) {
      expect(typeof error.http).toBe("number");
      expect(String(error.means).length).toBeGreaterThan(30);
      expect(
        String(error.what_to_do).length,
        `${error.code} on ${id} says what it is and not what to do`,
      ).toBeGreaterThan(40);
    }
    // The derivations, held against the door's own facts. A published
    // error category that cannot happen is as misleading as a missing
    // one — it tells a client to handle a branch that never fires.
    expect(codes.includes("missing_input")).toBe(required.length > 0);
    expect(codes.includes("sold_out")).toBe(
      item.weekly_inventory !== undefined || item.stocked === true,
    );
    expect(codes.includes("subject_refused")).toBe(FETCHES.has(item.reads));
  });

  it("57.5 — says what it reads, what it keeps, and that the goods are signed", async () => {
    const json = await listing(id);
    const security = (json.security ?? {}) as Record<string, string>;
    expect(Object.keys(security).length).toBeGreaterThan(0);
    expect(String(security.what_this_surface_reads).length).toBeGreaterThan(120);
    expect(String(security.what_it_stores_about_you).length).toBeGreaterThan(80);
    expect(String(security.what_the_data_is).length).toBeGreaterThan(60);
    expect(security.standards).toContain("private-first");
    expect(security.reporting).toContain("security.txt");
    // The paid shelf's actual difference from the free instruments,
    // which say NOT SIGNED in the same field.
    expect(security.integrity).toContain("THIS ONE IS SIGNED");
    expect(security.integrity).toContain(item.name);

    /*
     * The claim that would matter most if it were backwards. A door
     * that reaches nothing must SAY it reaches nothing, and one that
     * knocks on somebody's endpoint must say that instead — checked
     * against the item's declared class, not against a guess about
     * its inputs, because the guess was wrong the first time.
     */
    if (FETCHES.has(item.reads)) {
      expect(security.what_this_surface_reads).toContain("the endpoint you name");
      expect(security.what_this_surface_reads).not.toContain(
        "makes no outbound request",
      );
    } else if (item.reads === "chain_read") {
      expect(security.what_this_surface_reads).toContain("public chain state");
      expect(security.what_this_surface_reads).toContain(
        "No request is made to any endpoint of yours",
      );
    } else {
      expect(
        security.what_this_surface_reads,
        `${id} reaches nothing and does not say so`,
      ).toContain("makes no outbound request at all");
    }
    if (item.reads === "subject_purchase") {
      // The strongest thing on the shelf. It must never be described
      // as a mere look, and it must say whose money moves.
      expect(security.what_this_surface_reads).toContain("real payment");
      expect(security.what_this_surface_reads).toContain("Your money is not spent");
    }
    // Never, on any door, a request for something that could spend.
    expect(security.what_this_surface_reads).toContain("never asks for a credential");
  });
});
