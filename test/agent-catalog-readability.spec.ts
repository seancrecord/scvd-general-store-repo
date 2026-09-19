import { LLMS_INDEX_CHARACTER_BUDGET, SCANNER_BUDGET_BYTES } from "@/store/reader-limits";
import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import Ajv from "ajv/dist/2020";
import { MENU_ITEMS } from "@/store/menu";
import { buyInputSchema, buyInputExample } from "@/lib/bazaar-discovery";
import { publicationCollections } from "@/lib/publication-checkout";
import { saveAlmanacEntry, removeAlmanacEntry } from "@/services/almanac-store";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
const record = (value: unknown) => value as Record<string, unknown>;
const ajv = new Ajv({ strict: false, validateFormats: false });
async function document() { return record(await (await SELF.fetch(`${BASE}/openapi.json`)).json()); }

describe("agent catalog contracts and reading budgets", () => {
  beforeAll(() => installFacilitatorMock());
  it.each([
    ["operator_statement", "wallet"], ["the_statement", "wallet"],
    ["provenance_check", "address"], ["the_case_file", "tx_hash"], ["spot_check", "host"],
  ])("%s rejects placeholder syntax without rejecting its worked input", (id, field) => {
    const item = MENU_ITEMS.find(item => item.id === id)!;
    const schema = buyInputSchema(item);
    const validate = ajv.compile({ type: "object", ...schema });
    const example = buyInputExample(item);
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...example, [field]: "string" })).toBe(false);
  });
  it("names the product input contract rather than the signing template", async () => {
    const menu = record(await (await SELF.fetch(`${BASE}/menu.json`)).json());
    for (const value of menu.items as unknown[]) {
      const row = record(value);
      expect(record(row.at_a_glance).input).not.toContain("payload_template");
      expect(record(row.at_a_glance).input).toContain(row.input_contract_url);
    }
  });
  it("keeps archived collections explicitly separate from current publications", () => {
    const collections = publicationCollections(BASE);
    expect(collections).toContainEqual({ index_url: `${BASE}/zodiac/archive?view=compact`, status: "archived" });
    expect(collections).toContainEqual({ index_url: `${BASE}/almanac?view=compact`, status: "active" });
  });
  it("makes menu search scope explicit and offers current publications separately", async () => {
    const response = record(await (await SELF.fetch(`${BASE}/api/catalog/v1?q=almanac`)).json());
    expect(response.scope).toBe("active_menu");
    expect(response.publications).toContainEqual({ index_url: `${BASE}/almanac?view=compact`, status: "active" });
    expect(response.publications).toContainEqual({ index_url: `${BASE}/zodiac/archive?view=compact`, status: "archived" });
  });
  it("declares current keeper pages without expanding the archive into paid operations", async () => {
    const saved = await saveAlmanacEntry(env as Env, { title: "Discovery fixture", markdown: "# Discovery fixture\n\nA keeper entry outside static seeds.", date: "2026-09-15", today: "2026-09-15" });
    expect(saved.saved?.slug).toBe("discovery-fixture");
    try {
      const doc = await document();
      const paths = record(doc.paths);
      const op = record(record(paths["/almanac/{slug}"]).get);
      const parameter = (op.parameters as unknown[]).map(record).find(p => p.name === "slug")!;
      expect(record(parameter.schema).enum).toContain("discovery-fixture");
      expect((await SELF.fetch(`${BASE}/almanac/discovery-fixture`)).status).toBe(402);
      expect(Object.keys(paths).filter(p => p.startsWith("/zodiac/archive/") || p.startsWith("/gazette/issue-"))).toEqual([]);
    } finally { await removeAlmanacEntry(env as Env, "discovery-fixture"); }
  });
  it("keeps a retained Gazette issue in its archive index, outside active paid operations", async () => {
    const key = KV_KEYS.gazetteIssue(999);
    await (env as Env).ORDERS.put(key, JSON.stringify({ issue_number: 999, title: "Archived discovery fixture",
      date: "2026-09-15", markdown: "# Archived discovery fixture", contributors: [], tip_ids: [],
      signature: "fixture", public_key: "fixture" }));
    try {
      const index = await (await SELF.fetch(`${BASE}/gazette?view=compact`)).text();
      expect(index).toContain("Archived discovery fixture");
      const paths = record((await document()).paths);
      expect(paths["/gazette/issue-999"]).toBeUndefined();
    } finally { await (env as Env).ORDERS.delete(key); }
  });
  it("only advertises order polling for purchases that return a queue ticket", async () => {
    const paths = record((await document()).paths);
    for (const [path, value] of Object.entries(paths)) {
      const op = record(record(value).get ?? {});
      if (!op["x-payment"]) continue;
      const item = MENU_ITEMS.find(item => path === `/api/buy/${item.id}`);
      const queued = item?.fulfillment === "human_queue";
      expect(Boolean(op["x-async-job"]), path).toBe(queued);
      const response = record(record(op.responses)["200"]);
      expect(Boolean(record(response.links ?? {}).order), path).toBe(queued);
    }
  });
  it("publishes the same worked query inputs through standard OpenAPI examples", async () => {
    const paths = record((await document()).paths);
    for (const item of MENU_ITEMS) {
      const op = record(record(paths[`/api/buy/${item.id}`]).get);
      for (const [field, value] of Object.entries(buyInputExample(item))) {
        const parameter = (op.parameters as unknown[]).map(record).find(p => p.name === field && p.in === "query");
        if (parameter) expect(parameter.example, `${item.id}.${field}`).toEqual(value);
      }
    }
  });
  it("keeps a short linked index and a full guide, with room below existing limits", async () => {
    const index = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    const full = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    /*
     * The index budget is spelled once, in store/reader-limits, where
     * the machine-surface ceiling for /llms.txt already reads it and
     * test/llms-modular holds the same number (a typed 25_000 sat
     * here until 2026-09-19, a second and stricter copy of the same
     * budget that nobody reconciled with the register — the defect
     * AT_SCALE rule 1 names, and the one the scanner budget on the
     * line below was fixed for the same day).
     */
    expect(index.length).toBeLessThan(LLMS_INDEX_CHARACTER_BUDGET);
    expect(index).toMatch(/^- \[[^\]]+\]\(https:\/\/scvd.store\/developers\/llms.txt\)/m);
    expect(full).toContain("Well well. Come in then.");
    const spec = await (await SELF.fetch(`${BASE}/openapi.json`)).text();
    const bytes = new TextEncoder().encode(spec).length;
    console.log(JSON.stringify({ index_characters: index.length, index_bytes: new TextEncoder().encode(index).length, openapi_bytes: bytes }));
    // The scanner budget, spelled once in store/reader-limits (a typed 620,000 sat here until 2026-09-19); the production-shape reading is test/openapi-headroom.spec.ts.
    expect(bytes).toBeLessThan(SCANNER_BUDGET_BYTES);
  });
});
