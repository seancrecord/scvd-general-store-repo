import { expect, it } from "vitest";
import { installBuyerHarness, items, baseline, shelves, call, signature, clean } from "./helpers/buyer-harness";

installBuyerHarness();
for (const [id, field] of [
  ["context_anchor", "summary"], ["the_confession", "confession"],
  ["coffees_for_closers", "win"], ["graffiti_on_a_train", "tag"],
] as const) for (const door of ["http", "mcp"] as const) {
  it(`${door}/${id}: never quotes or settles for text containing NUL`, async () => {
    const item = items.find(item => item.id === id)!;
    const tool = shelves(item)[0]!;
    const good = { ...baseline(item), [field]: "SCVD-E2E-valid-text" };
    const quote = await call(item, door, good, tool);
    expect(quote.offers.length).toBeGreaterThan(0);
    for (const value of ["\0", " \0\t", "SCVD-E2E-before\0after"]) {
      const args = { ...good, [field]: value };
      const unpaid = await call(item, door, args, tool);
      expect(unpaid.body).toMatchObject({ charged: false, code: "bad_request", input_field: field });
      expect(unpaid.offers).toEqual([]);
      expect(unpaid.verifies).toBe(0);
      expect(unpaid.settles).toBe(0);
      expect(unpaid.writes).toEqual([]);
      for (const offer of quote.offers) {
        await clean();
        const refused = await call(item, door, args, tool, signature(offer), crypto.randomUUID());
        expect(refused.body).toMatchObject({ charged: false, code: "bad_request", input_field: field });
        expect(refused.offers).toEqual([]);
        expect(refused.verifies).toBe(0);
        expect(refused.settles).toBe(0);
        expect(refused.writes).toEqual([]);
      }
    }
  });
}
