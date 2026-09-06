import { expect, it } from "vitest";
import { installBuyerHarness, items, shelves, call, signature, clean, object, request } from "./helpers/buyer-harness";

installBuyerHarness();
for (const door of ["http", "mcp"] as const) {
  it(`${door}: a fresh purchase binds the corrected claim, while identical inputs reuse the same case`, async () => {
    const item = items.find(item => item.id === "the_case_file")!, tool = shelves(item)[0]!;
    const args = { tx_hash: `0x${"de".repeat(32)}`, claim: "SCVD-E2E-first-claim" };
    const offers = (await call(item, door, args, tool)).offers;
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      await clean();
      const first = await call(item, door, args, tool, signature(offer), crypto.randomUUID());
      expect(first.settles).toBe(1);
      const corrected = { ...args, claim: "SCVD-E2E-corrected-claim" };
      const second = await call(item, door, corrected, tool, signature(offer), crypto.randomUUID());
      expect(second.settles).toBe(1);
      const bought = object(second.body.case_file);
      expect(object(bought.declared).claim).toBe(corrected.claim);
      expect(bought.case_id).not.toBe(object(first.body.case_file).case_id);
      const again = await call(item, door, corrected, tool, signature(offer), crypto.randomUUID());
      expect(object(again.body.case_file).case_id).toBe(bought.case_id);
      expect(again.body.reused).toBe(true);
      const certId = second.body.cert_id ?? object(second.body.certificate).cert_id;
      const checked = object(await (await request(`/api/verify/${String(certId)}`)).json());
      expect(checked.valid).toBe(true);
      expect(object(checked.certificate).attests).toBe(bought.evidence_hash);
    }
  });
}
