import { expect, it } from "vitest";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, tools, shelves, call, signature, request, object } from "./helpers/buyer-harness";

installBuyerHarness();
it("the first paid tool accepts every optional field advertised for its products", async () => {
  const simple = tools.find(tool => tool.name === "buy_simple")!;
  const ids = simple.inputSchema.properties.item_id!.enum as string[];
  expect(ids.length).toBeGreaterThan(0);
  expect(simple.inputSchema.required).toEqual(["item_id"]);
  for (const id of ids) {
    const item = items.find(entry => entry.id === id)!;
    for (const [field, spec] of Object.entries(item.spec.inputs.properties)) {
      expect(simple.inputSchema.properties[field], `${id}.${field} disappeared at the first paid tool`).toMatchObject(spec);
    }
  }
});
for (const network of [BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK]) {
  it(`${network}: a schema-following buyer retains purpose through both simple and theme shelves`, async () => {
    const simple = tools.find(tool => tool.name === "buy_simple")!;
    const ids = simple.inputSchema.properties.item_id!.enum as string[];
    for (const id of ids) {
      const item = items.find(entry => entry.id === id)!;
      const purpose = `SCVD-E2E-${crypto.randomUUID()}`;
      const doors = shelves(item);
      expect(doors.map(tool => tool.name)).toContain("buy_simple");
      expect(doors.length).toBeGreaterThan(1);
      let firstAmount: string | undefined;
      for (const tool of doors) {
        // A literal client does not guess fields the discovered schema forbids.
        expect(tool.inputSchema.properties.purpose?.type, `${tool.name} forbids the buyer's purpose`).toBe("string");
        const quote = await call(item, "mcp", { purpose }, tool);
        const offer = quote.offers.find(entry => entry.network === network)!;
        expect(offer).toBeTruthy();
        firstAmount ??= offer.amount;
        expect(offer.amount).toBe(firstAmount);
        const paid = await call(item, "mcp", { purpose }, tool, signature(offer), crypto.randomUUID());
        expect(paid.protocolError).toBe(false);
        const verified = object(await (await request(`/api/verify/${paid.body.cert_id}`)).json());
        expect(verified.valid).toBe(true);
        expect(object(verified.certificate).purpose).toBe(purpose);
      }
    }
  });
}
