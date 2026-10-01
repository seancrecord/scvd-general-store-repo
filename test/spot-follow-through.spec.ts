import { SELF } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const BASE = "https://scvd.store";
beforeAll(() => installMultiPurchaseFacilitatorMock());
async function buy(item: string, params: Record<string, string>) {
  const url = `${BASE}/api/buy/${item}?${new URLSearchParams(params)}`;
  const quote = await SELF.fetch(url);
  expect(quote.status).toBe(402);
  return SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(decodePaymentRequired(quote).accepts[0]!) } });
}
it("offers both book-reading additions with discoverable inputs", () => {
  for (const [id, required] of [["change_check", "baseline_cert_id"], ["batch_spot_check", "hosts"]]) {
    const item = MENU_ITEMS.find(row => row.id === id);
    expect(item, id).toBeDefined();
    expect(buyInputSchema(item!).required).toContain(required);
  }
});
it("delivers a retained original and an optional human note beside a spot check", async () => {
  const res = await buy("spot_check", {host:"follow-through.example"});
  expect(res.status).toBe(200);
  const body = await res.json() as { view_url:string; certificate:{cert_id:string}; counter_note:{text:string; optional:boolean}; follow_up:{options:{item:string; listing_url:string}[]} };
  expect(body.counter_note.optional).toBe(true);
  expect(body.counter_note.text).toContain("follow-through.example");
  expect(body.follow_up.options.map(row => row.item)).toContain("change_check");
  const original = await SELF.fetch(body.view_url, {headers:{Accept:"application/json"}});
  expect(original.status).toBe(200);
  const page = await SELF.fetch(body.view_url, {headers:{Accept:"text/html"}});
  expect(await page.text()).toContain("A note for your human");
});
it("compares an original signed spot check without mistaking a new request time for new evidence", async () => {
  const first = await buy("spot_check", {host:"change-test.example"});
  const body = await first.json() as {certificate:{cert_id:string}};
  const res = await buy("change_check", {host:"change-test.example", baseline_cert_id:body.certificate.cert_id});
  expect(res.status).toBe(200);
  const result = await res.json() as { change_check:{comparison:{state:string}}; evidence_hash:string; certificate:{attests:string} };
  expect(result.change_check.comparison.state).toBe("no_new_observations");
  expect(result.certificate.attests).toBe(result.evidence_hash);
});
it("assembles the entire host set into one bound batch", async () => {
  const res = await buy("batch_spot_check", {hosts:JSON.stringify(["one.example","two.example"])});
  expect(res.status).toBe(200);
  const body = await res.json() as { batch_spot_check:{readings:{record:{host:string}}[]}; certificate:{attests:string}; evidence_hash:string };
  expect(body.batch_spot_check.readings.map(row => row.record.host)).toEqual(["one.example","two.example"]);
  expect(body.certificate.attests).toBe(body.evidence_hash);
});
it("refuses unavailable baselines and malformed batches before quoting", async () => {
  for (const path of ["change_check?host=one.example&baseline_cert_id=cert_missing", "batch_spot_check?hosts=%5B%22one.example%22%2C%22ONE.example%22%5D"]) {
    const response = await SELF.fetch(`${BASE}/api/buy/${path}`);
    expect(response.status).toBe(400);
    expect(response.headers.has("PAYMENT-REQUIRED")).toBe(false);
  }
});

it("keeps the original and its binding intact on a retry", async () => {
  const url = `${BASE}/api/buy/batch_spot_check?hosts=${encodeURIComponent(JSON.stringify(["retry-one.example","retry-two.example"]))}`;
  const quote = await SELF.fetch(url);
  const headers = { "PAYMENT-SIGNATURE": buildPaymentSignature(decodePaymentRequired(quote).accepts[0]!), "Idempotency-Key": "spot-followthrough-retry" };
  const first = await SELF.fetch(url, {headers});
  const second = await SELF.fetch(url, {headers});
  expect(first.status).toBe(200); expect(second.status).toBe(200);
  const a = await first.json() as {observation:unknown;certificate:unknown};
  const b = await second.json() as {observation:unknown;certificate:unknown};
  expect(b.observation).toEqual(a.observation); expect(b.certificate).toEqual(a.certificate);
});
