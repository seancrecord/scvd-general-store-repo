import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { priceTiersUsdc } from "@/lib/payments";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor } from "./helpers/labor-admission";
import { items, call, shelves, request, object } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
it("OpenAPI distinguishes the current starting-price range from optional payment tiers", async () => {
  const doc = object(await (await request("/openapi.json")).json());
  const guidance = String(object(doc.info)["x-guidance"]);
  const starting = items.map(item => item.price_usdc);
  const tiers = MENU_ITEMS.flatMap(priceTiersUsdc);
  expect(guidance).toContain(`Starting prices run $${Math.min(...starting)}–$${Math.max(...starting)}`);
  expect(guidance).toContain(`optional payment tiers reach $${Math.max(...tiers)}`);
});
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${door} ${network}: a receipt's settlement-attestation price matches that good's current offer`, async () => {
    const item = items.find(i => i.id === "hello")!;
    const offer = (await call(item, "mcp", {}, shelves(item)[0]!)).offers.find(o => o.network === network)!;
    const bought = await sendLabor(item.id, door, {}, await signLabor(offer), crypto.randomUUID());
    expect(bought.refused).toBe(false);
    const recommendation = object(bought.body.attest_this_purchase);
    const target = items.find(i => i.id === "settlement_attestation")!;
    expect(recommendation.price_usdc).toBe(target.price_usdc);
    expect(String(recommendation.note)).toContain(`$${target.price_usdc} buys`);
    const quoted = await request(String(recommendation.url));
    expect(quoted.status).toBe(402);
    const challenge = object(JSON.parse(atob(quoted.headers.get("PAYMENT-REQUIRED")!)));
    expect((challenge.accepts as Record<string,unknown>[]).every(offer => Number(offer.amount) / 1_000_000 === target.price_usdc)).toBe(true);
  });
}
