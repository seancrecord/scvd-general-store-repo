import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { installBuyerHarness, items, shelves, baseline, call, signature } from "./helpers/buyer-harness";

installBuyerHarness();
const invalid = [123, false, null, [], {}];
const kind = (value: unknown) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

for (const catalogItem of MENU_ITEMS) {
  it(`${catalogItem.id}: every advertised string field refuses non-text JSON before quoting`, async () => {
    const item = items.find(entry => entry.id === catalogItem.id)!;
    const tool = shelves(item)[0];
    if (!tool) return; // Only products exposed on this door belong to this matrix.
    const fields = Object.entries(item.spec.inputs.properties).filter(([, spec]) => spec.type === "string");
    expect(fields.length).toBeGreaterThan(0);
    for (const [field] of fields) for (const value of invalid) {
      const reading = await call(item, "mcp", { ...baseline(item), [field]: value }, tool);
      expect(reading.body, `${item.id}.${field}=${kind(value)}`).toMatchObject({
        charged: false, code: "bad_request", input_field: field, expected_type: "string", received_type: kind(value),
      });
      expect(reading.quote).toBe(false);
      expect(reading.verifies).toBe(0);
      expect(reading.settles).toBe(0);
      expect(reading.writes).toEqual([]);
    }
  });
}

for (const field of ["summary", "tag", "win", "detail", "purpose"]) {
  it(`${field}: attaching a payment never permits coercion into the signed good`, async () => {
    const item = items.find(entry => field in entry.spec.inputs.properties && shelves(entry).length > 0)!;
    expect(item).toBeTruthy();
    const tool = shelves(item)[0]!;
    const quote = await call(item, "http", baseline(item));
    expect(quote.offers.length).toBeGreaterThan(0);
    for (const offer of quote.offers) for (const value of [123, false]) {
      const reading = await call(item, "mcp", { ...baseline(item), [field]: value }, tool, signature(offer), crypto.randomUUID());
      expect(reading.body).toMatchObject({ charged: false, code: "bad_request", input_field: field,
        expected_type: "string", received_type: typeof value });
      expect(reading.quote).toBe(false);
      expect(reading.verifies).toBe(0);
      expect(reading.settles).toBe(0);
      expect(reading.writes).toEqual([]);
    }
  });
}
