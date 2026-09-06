import { expect, it, vi } from "vitest";
import { createOrRenewPass } from "@/services/patronage";
import { KV_KEYS } from "@/lib/kv-keys";
import { installBuyerHarness, items, shelves, call, signature, clean, sourceEnv } from "./helpers/buyer-harness";

installBuyerHarness();
for (const door of ["http", "mcp"] as const) {
  it(`${door}: an invalid renewal never quotes or settles a replacement pass`, async () => {
    const item = items.find(item => item.id === "recurring_patronage")!, tool = shelves(item)[0]!;
    const offers = (await call(item, door, {}, tool)).offers;
    expect(offers.length).toBeGreaterThan(0);
    const original = await createOrRenewPass(sourceEnv, { patronNumber: 1 });
    const invalid: unknown[] = ["pass_doesnotexist", "", "   ", "x".repeat(600),
      `${original.pass.pass_id}?`, ` ${original.pass.pass_id} `];
    if (door === "mcp") invalid.push(null, {}, [], false, 123);
    for (const pass_id of invalid) {
      const quote = await call(item, door, { pass_id }, tool);
      expect(quote.body).toMatchObject({ charged: false, code: "bad_request", input_field: "pass_id" });
      expect(quote.offers).toEqual([]);
      expect(quote.writes).toEqual([]);
      for (const offer of offers) {
        const paid = await call(item, door, { pass_id }, tool, signature(offer), crypto.randomUUID());
        expect(paid.body).toMatchObject({ charged: false, code: "bad_request", input_field: "pass_id" });
        expect(paid.verifies).toBe(0);
        expect(paid.settles).toBe(0);
        expect(paid.writes).toEqual([]);
      }
    }
  });

  it(`${door}: a valid renewal extends exactly the purchased pass on every rail`, async () => {
    const item = items.find(item => item.id === "recurring_patronage")!, tool = shelves(item)[0]!;
    const offers = (await call(item, door, {}, tool)).offers;
    for (const offer of offers) {
      await clean();
      const first = await call(item, door, {}, tool, signature(offer), crypto.randomUUID());
      expect(first.body.renewed).toBe(false);
      const renewed = await call(item, door, { pass_id: first.body.pass_id }, tool, signature(offer), crypto.randomUUID());
      expect(renewed.settles).toBe(1);
      expect(renewed.body.pass_id).toBe(first.body.pass_id);
      expect(renewed.body.renewed).toBe(true);
      expect(Date.parse(String(renewed.body.expires_at)) - Date.parse(String(first.body.expires_at))).toBe(30 * 86400_000);
    }
  });

  for (const when of ["after quote", "during verification"]) {
    it(`${door}: a pass disappearing ${when} refuses before settlement`, async () => {
      const item = items.find(item => item.id === "recurring_patronage")!, tool = shelves(item)[0]!;
      const original = await createOrRenewPass(sourceEnv, { patronNumber: 1 });
      const pass_id = original.pass.pass_id;
      const offers = (await call(item, door, { pass_id }, tool)).offers;
      expect(offers.length).toBeGreaterThan(0);
      const key = KV_KEYS.patronagePass(pass_id);
      let restoreFetch: (() => void) | undefined;
      if (when === "after quote") await sourceEnv.PATRONS.delete(key);
      else {
        const originalFetch = globalThis.fetch;
        const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
          const response = await originalFetch(...args);
          if (String(args[0] instanceof Request ? args[0].url : args[0]).endsWith("/x402/verify")) {
            await sourceEnv.PATRONS.delete(key);
          }
          return response;
        });
        restoreFetch = () => spy.mockRestore();
      }
      const result = await call(item, door, { pass_id }, tool, signature(offers[0]!), crypto.randomUUID()).finally(() => restoreFetch?.());
      expect(result.body).toMatchObject({ charged: false, code: "bad_request", input_field: "pass_id" });
      expect(result.settles).toBe(0);
      expect(result.writes).toEqual([]);
    });
  }
}

it("the fulfillment service never substitutes a new pass for an explicit missing renewal", async () => {
  for (const passId of ["pass_doesnotexist", ""]) {
    await expect(createOrRenewPass(sourceEnv, { patronNumber: 1, passId })).rejects.toThrow();
  }
  expect((await sourceEnv.PATRONS.list({ prefix: "pass:" })).keys).toEqual([]);
});
