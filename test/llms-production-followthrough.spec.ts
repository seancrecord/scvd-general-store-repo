import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import { LLMS_AREAS } from "@/routes/llms";
import { LLMS_INDEX_ALARM_CHARACTERS, LLMS_INDEX_CHARACTER_BUDGET } from "@/store/reader-limits";
import type { Env } from "@/types";
import { productionShape } from "./helpers/production-shape";

const BASE = "https://scvd.store";
const configured = productionShape(env as unknown as Env);

// Date text must not change between the canonical read and its aliases.
beforeAll(() => vi.setSystemTime(new Date("2026-09-30T12:00:00Z")));
afterAll(() => vi.useRealTimers());

async function read(path: string, bindings = configured): Promise<string> {
  const response = await app.request(`${BASE}${path}`, {}, bindings);
  expect(response.status, path).toBe(200);
  return response.text();
}

describe("guides with production payment options", () => {
  it("keeps the index and every non-menu area inside their existing budgets", async () => {
    expect((await read("/llms.txt")).length).toBeLessThan(LLMS_INDEX_ALARM_CHARACTERS);
    for (const area of LLMS_AREAS.filter(area => area.slug !== "menu")) {
      expect((await read(`${area.path}/llms.txt`)).length, area.slug).toBeLessThan(LLMS_INDEX_CHARACTER_BUDGET);
    }
  });

  for (const enabled of [true, false]) {
    it(`serves identical developer aliases with native checkout ${enabled ? "enabled" : "disabled"}`, async () => {
      const bindings = { ...configured, MPP_CHECKOUT_ENABLED: String(enabled), UCP_CHECKOUT_ENABLED: String(enabled) };
      const canonical = await read("/developers/llms.txt", bindings);
      for (const alias of ["/docs/llms.txt", "/api/llms.txt"]) {
        const response = await app.request(`${BASE}${alias}`, {}, bindings);
        expect(response.status, alias).toBe(200);
        expect(response.headers.get("Link")).toContain(`<${BASE}/developers/llms.txt>; rel="canonical"`);
        expect(await response.text(), alias).toBe(canonical);
      }
    });
  }

  it("retains every original section whole and in exactly one guide", async () => {
    const full = await read("/llms-full.txt");
    const texts = [await read("/llms.txt")];
    for (const area of LLMS_AREAS) texts.push(await read(`${area.path}/llms.txt`));
    for (const section of full.split(/^## /m).slice(1)) {
      const heading = section.split("\n")[0]!;
      const homes = texts.filter(text => text.includes(`## ${heading}\n`));
      expect(homes.length, heading).toBe(1);
      expect(homes[0], heading).toContain(`## ${section}`.trimEnd());
    }
  });
});
