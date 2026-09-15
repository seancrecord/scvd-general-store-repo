import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("keeps the literal buyer task within the reconciliation's observable scope", async () => {
  const compact = await SELF.fetch("https://scvd.store/menu/settlement_reconciliation?view=compact", { headers: { Accept: "application/json" } });
  expect(compact.status).toBe(200);
  const item = await compact.json() as { task: string };
  expect(item.task).toContain("fixed value");
  expect(item.task).toContain("declared ceiling");
  expect(item.task).toContain("no cap is observable");
  expect(item.task).not.toContain("Prove an agent's spend stayed inside");

  const response = await SELF.fetch("https://scvd.store/openapi.json");
  expect(response.status).toBe(200);
  const spec = await response.json() as { paths: Record<string, { get: { summary: string } }> };
  expect(spec.paths["/api/buy/settlement_reconciliation"]?.get.summary).toBe(item.task);
});
