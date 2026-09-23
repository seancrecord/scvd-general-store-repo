import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, shelves, baseline, call, signature, request, object } from "./helpers/buyer-harness";

installBuyerHarness();
for (const catalogItem of MENU_ITEMS) {
  it(`${catalogItem.id}: refuses an over-limit purpose before either door quotes`, async () => {
    const item = items.find(entry => entry.id === catalogItem.id)!;
    const limit = Number(item.spec.inputs.properties.purpose!.maxLength);
    expect(Number.isInteger(limit)).toBe(true);
    for (const door of ["http", "mcp"] as const) {
      const reading = await call(item, door, { ...baseline(item), purpose: "x".repeat(limit + 1) }, shelves(item)[0]);
      expect(reading.body).toMatchObject({ code: "bad_request", charged: false, input_field: "purpose", max_length: limit });
      expect(reading.quote).toBe(false);
      expect(reading.verifies).toBe(0);
      expect(reading.settles).toBe(0);
      expect(reading.writes).toEqual([]);
    }
  });
}
for (const network of [BASE_NETWORK, POLYGON_NETWORK, SOLANA_NETWORK]) for (const door of ["http", "mcp"] as const) {
  it(`${door} ${network}: a signed request cannot pay to have an overlong purpose truncated`, async () => {
    const item = items.find(entry => entry.id === "hello")!, tool = shelves(item)[0]!;
    const limit = Number(item.spec.inputs.properties.purpose!.maxLength);
    const quote = await call(item, door, {}, tool);
    const offer = quote.offers.find(entry => entry.network === network)!;
    expect(offer).toBeTruthy();
    const reading = await call(item, door, { purpose: "x".repeat(limit + 1) }, tool, signature(offer), crypto.randomUUID());
    expect(reading.body).toMatchObject({ charged: false, code: "bad_request", input_field: "purpose", max_length: limit });
    expect(reading.verifies).toBe(0);
    expect(reading.settles).toBe(0);
    expect(reading.writes).toEqual([]);
  });
  it(`${door} ${network}: legal purpose boundaries survive unchanged in the verified receipt`, async () => {
    const item = items.find(entry => entry.id === "hello")!, tool = shelves(item)[0]!;
    const limit = Number(item.spec.inputs.properties.purpose!.maxLength);
    const inputs = ["", "x", "x".repeat(limit - 1), "x".repeat(limit), "🙂".repeat(limit), " \te\u0301 & ? quoted \"why\"\n "];
    for (const purpose of inputs) {
      const quote = await call(item, door, { purpose }, tool);
      const offer = quote.offers.find(entry => entry.network === network)!;
      expect(offer).toBeTruthy();
      const paid = await call(item, door, { purpose }, tool, signature(offer), crypto.randomUUID());
      expect(paid.protocolError).toBe(false);
      expect(paid.settles).toBe(1);
      const certId = String(paid.body.cert_id ?? object(paid.body.certificate).cert_id);
      const verified = object(await (await request(`/api/verify/${certId}`)).json());
      expect(verified.valid).toBe(true);
      expect(object(verified.certificate).purpose ?? "").toBe(purpose);
    }
  });
}

/**
 * "SHOWN ON ITS RECEIPT" (2026-09-23) is a promise the input schema
 * makes to every buyer, so it is held here rather than trusted: the
 * description says where the words go, and this proves they arrive —
 * on the receipt page a person opens, not only in the signed JSON the
 * test above reads. If the verify page stops printing the row, the
 * description is a lie and this is where it says so.
 *
 * Escaped, because the words are the buyer's and now advertised as
 * something a person reads. Agent-authored text is stored as written
 * and escaped everywhere it renders (AGENTS.md); a purpose is the
 * easiest place on the store to try otherwise.
 */
it("the purpose is shown on the receipt page, escaped, where the schema says it goes", async () => {
  const item = items.find(entry => entry.id === "hello")!, tool = shelves(item)[0]!;
  const description = String(item.spec.inputs.properties.purpose!.description);
  expect(description, "the schema must tell a buyer where the words go").toMatch(/receipt/i);

  const purpose = "Checking the store before my operator <b>pays</b> for an audit";
  const quote = await call(item, "http", { purpose }, tool);
  const offer = quote.offers.find(entry => entry.network === BASE_NETWORK)!;
  const paid = await call(item, "http", { purpose }, tool, signature(offer), crypto.randomUUID());
  expect(paid.settles).toBe(1);
  const certId = String(paid.body.cert_id ?? object(paid.body.certificate).cert_id);

  const page = await (await request(`/api/verify/${certId}`, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
  })).text();
  expect(page).toContain("What your agent said this was for");
  expect(page).toContain("Checking the store before my operator &lt;b&gt;pays&lt;/b&gt; for an audit");
  expect(page, "the buyer's markup must never render as markup").not.toContain("<b>pays</b>");
});
