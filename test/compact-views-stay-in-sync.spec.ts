import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * THE COMPACT VIEWS, PINNED TO THE SHELF (2026-09-21).
 *
 * An agent review flagged these as good and asked for the one thing
 * they lacked: "the compact catalog (menu.json?view=compact) and the
 * per-item ?view=compact input contracts are referenced from the full
 * listings — good. Add a check (or a test) that they stay in sync when
 * listings change."
 *
 * They are in sync by construction today: compactCatalog pages over
 * MENU_ITEMS and compactItemContract spreads the SAME compactItemRow,
 * so neither can quote a field the other does not. That is an
 * implementation detail, though, and the review is asking for the
 * property rather than the mechanism — because the mechanism is
 * exactly what a later refactor changes. A paged view is the shape
 * that rots quietly: add an item, and a page-size assumption or a
 * hand-maintained second list drops it off the last page where nobody
 * looks.
 *
 * So this walks the paging to its end and asserts the shelf comes back
 * whole, item for item and field for field, against both the compact
 * contract and the full listing.
 */

type Row = Record<string, unknown>;

async function json(path: string): Promise<Row> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  expect(response.status, path).toBe(200);
  return (await response.json()) as Row;
}

/** Every row of the compact catalog, followed to the last page. */
async function walkCompactCatalog(): Promise<Row[]> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let path: string | null = "/menu.json?view=compact";

  while (path) {
    // A loop here would hang the suite rather than fail it.
    expect(seen.has(path), `paging revisited ${path}`).toBe(false);
    seen.add(path);

    const page: Row = await json(path);
    rows.push(...(page["items"] as Row[]));

    const next = page["next"];
    expect(
      next === null || typeof next === "string",
      "next must be a URL or an explicit null",
    ).toBe(true);
    expect(page["has_more"], `${path}: has_more disagrees with next`).toBe(next !== null);

    path = next === null ? null : new URL(next as string).pathname + new URL(next as string).search;
  }
  return rows;
}

describe("the compact views stay in sync with the shelf", () => {
  it("returns every item exactly once across all pages", async () => {
    const rows = await walkCompactCatalog();
    const ids = rows.map((row) => row["id"] as string);

    expect(ids.length, "the compact catalog dropped or duplicated items").toBe(
      MENU_ITEMS.length,
    );
    expect([...new Set(ids)].length, "an item appeared on two pages").toBe(ids.length);
    expect(ids.slice().sort()).toEqual(MENU_ITEMS.map((item) => item.id).sort());
  });

  it("agrees with its own totals", async () => {
    const first = await json("/menu.json?view=compact");
    expect(first["total"]).toBe(MENU_ITEMS.length);
    expect(first["pages"]).toBe(
      Math.ceil(MENU_ITEMS.length / (first["limit"] as number)),
    );
    expect(first["offset"]).toBe(0);
    expect(first["page"]).toBe(0);
    expect((first["items"] as Row[]).length).toBe(first["returned"]);
  });

  it("gives each row the same fields as that item's own compact contract", async () => {
    /*
     * The row and the contract share a builder today. This asserts the
     * consequence rather than the fact: every field the paged row
     * carries, the item's own view carries, with the same value. The
     * contract is free to say MORE — it is the one-item document — but
     * it can never disagree.
     */
    const rows = await walkCompactCatalog();
    for (const row of rows) {
      const id = row["id"] as string;
      const contract = await json(`/menu/${id}?view=compact`);
      for (const [key, value] of Object.entries(row)) {
        expect(contract[key], `${id}.${key} differs between the two compact views`).toEqual(
          value,
        );
      }
    }
  });

  it("quotes the same price and inputs as the full listing", async () => {
    /*
     * The compact views exist so a small-context agent can plan a
     * purchase without the full catalog. That only holds while the two
     * agree on the fields a purchase actually turns on.
     */
    const full = (await json("/menu.json"))["items"] as Row[];
    const rows = await walkCompactCatalog();

    for (const row of rows) {
      const id = row["id"] as string;
      const listing = full.find((entry) => entry["id"] === id);
      expect(listing, `${id} is on the compact shelf but not the full one`).toBeTruthy();

      expect(row["price_usdc"], `${id}: price differs from the full listing`).toEqual(
        listing!["price_usdc"],
      );
      expect(
        row["price_tiers_usdc"],
        `${id}: tiers differ from the full listing`,
      ).toEqual(listing!["price_tiers_usdc"]);
      expect(
        row["required_params"],
        `${id}: required inputs differ from the full listing`,
      ).toEqual(listing!["required_params"]);
      expect(row["buy_url"], `${id}: buy url differs`).toEqual(listing!["buy_url"]);
    }
  });

  it("names a required input in the compact contract wherever the shelf does", async () => {
    /*
     * The failure this guards is the one the decline desk already paid
     * for once: a door that needs a parameter, listed somewhere that
     * does not say so. A planning agent reading only the compact view
     * must not be able to reach that state.
     */
    for (const item of MENU_ITEMS) {
      const contract = await json(`/menu/${item.id}?view=compact`);
      const schema = contract["input_schema"] as { required?: string[] };
      const required = (contract["required_params"] as string[]) ?? [];
      expect(Array.isArray(required), `${item.id} has no required_params array`).toBe(true);
      for (const name of schema.required ?? []) {
        // agent_name is disclosure, never a product input.
        if (name === "agent_name") continue;
        expect(required, `${item.id}: input_schema requires ${name}, required_params omits it`).toContain(
          name,
        );
      }
    }
  });

  it("refuses a page past the end rather than serving an empty shelf", async () => {
    const first = await json("/menu.json?view=compact");
    const response = await SELF.fetch(
      `${BASE}/menu.json?view=compact&page=${first["pages"]}`,
      { headers: { Accept: "application/json" } },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as Row;
    expect(body["code"]).toBe("bad_page");
    expect(body["charged"]).toBe(false);
  });
});
