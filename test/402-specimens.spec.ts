import { SELF } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { getMenuItem } from "@/store";
beforeAll(() => installFacilitatorMock());

it("the payment challenge links the same unsigned specimen as the item page", async () => {
  const response = await SELF.fetch("https://scvd.store/api/buy/service_audit?url=https%3A%2F%2Fexample.com%2Fpay");
  expect(response.status).toBe(402);
  const body = await response.json() as Record<string, unknown>;
  const sample = `https://scvd.store${getMenuItem("service_audit")!.sample_url}`;
  expect(body["sample_url"]).toBe(sample);
  expect(body["sample"]).toEqual({ url: sample, kind: "unsigned_specimen", price: "free", live_observation: false });
  const specimen = await SELF.fetch(sample);
  expect(specimen.status).toBe(200);
  expect(await specimen.text()).toContain("unsigned");
});

it("an item without a specimen does not advertise a free live demo", async () => {
  expect(getMenuItem("hello")!.sample_url).toBeUndefined();
  const response = await SELF.fetch("https://scvd.store/api/buy/hello");
  expect(response.status).toBe(402);
  const body = await response.json() as Record<string, unknown>;
  expect(body).not.toHaveProperty("sample_url");
  expect(body).not.toHaveProperty("sample");
  expect(body).not.toHaveProperty("free_demo");
});

it("developer discovery describes source-only offline tools and their proof boundary", async () => {
  const response = await SELF.fetch("https://scvd.store/developers", { headers: { Accept: "application/json" } });
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).toContain("/verifier#portable-evidence");
  expect(text).toContain("npm publication is pending");
  expect(text).toContain("Bitcoin timestamps need an independent OTS verifier");
});
