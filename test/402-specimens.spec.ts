import { installBuyerHarness, request as quoteRequest } from "./helpers/buyer-harness";
import { SELF } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { getMenuItem } from "@/store";
import { EVIDENCE_TOOLS_SOURCE } from "@/store/evidence-tools";
import verifierReadme from "../verifier/README.md?raw";
installBuyerHarness();

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
  expect(getMenuItem("hello")!.sample_kind).toBe("delivery_outline");
  const response = await SELF.fetch("https://scvd.store/api/buy/hello");
  expect(response.status).toBe(402);
  const body = await response.json() as Record<string, unknown>;
  expect(body["sample"]).toMatchObject({ kind: "delivery_outline", live_observation: false });
  expect(body).not.toHaveProperty("free_demo");
});

it.each([
  ["luckies", "visual_preview", ""],
  ["opening_day", "shared_component", "?url=https%3A%2F%2Fexample.com%2Fpay"],
])("%s describes the actual kind of free example", async (item, kind, query) => {
  const response = await quoteRequest(`https://scvd.store/api/buy/${item}${query}`);
  expect(response.status).toBe(402);
  const body = await response.json() as { sample: { kind: string; live_observation: boolean } };
  expect(body.sample.kind).toBe(kind);
  expect(body.sample.live_observation).toBe(false);
});

it("Opening Day previews its Launch Check component", async () => {
  expect(getMenuItem("opening_day")!.sample_url).toBe(getMenuItem("launch_check")!.sample_url);
});

it("developer discovery links usable installation instructions and states the proof boundary", async () => {
  const response = await SELF.fetch("https://scvd.store/developers", { headers: { Accept: "application/json" } });
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).toContain(EVIDENCE_TOOLS_SOURCE);
  const headings = verifierReadme.split('\n').filter(line => line.startsWith('## '))
    .map(line => line.slice(3).toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-'));
  expect(headings).toContain(new URL(EVIDENCE_TOOLS_SOURCE).hash.slice(1));
  expect(text).toContain("Bitcoin timestamps need an independent OTS verifier");
});
