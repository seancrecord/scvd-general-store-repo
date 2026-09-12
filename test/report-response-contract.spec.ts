import { SELF, env } from "cloudflare:test";
import { Ajv } from "ajv";
import { beforeAll, expect, it, vi } from "vitest";
import { performLaunchCheck, storeLaunchCheck } from "@/services/launch-check";
import { performGoodBuyerReading, storeGoodBuyerReading } from "@/services/good-buyer";
import { reconcileSettlement, storeReconciliation } from "@/services/settlement-reconciliation";
import { performServiceAudit, storeServiceAudit } from "@/services/service-audit";
import { performOnpageAudit, storeOnpageAudit } from "@/services/onpage-audit";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

const e = env as Env;
const base = "https://scvd.store";
const target = "https://buyer-contract.example/pay";
const now = new Date("2026-09-12T12:00:00Z");
beforeAll(installFacilitatorMock);

it("the payment dry-run contract does not describe a history of settled purchases", async () => {
  const document = await (await SELF.fetch(`${base}/openapi.json`)).json() as {
    paths: Record<string, { get: { responses: { "200": { content: { "application/json": {
      schema: { properties: { reading: { description: string } } };
    } } } } } }>;
  };
  const description = document.paths["/api/good-buyer/{reading_id}"]!.get.responses["200"].content["application/json"].schema.properties.reading.description;
  expect(description).not.toContain("settled purchases");
  expect(description).toContain("declared client");
  expect(description).toContain("No payment");
});

// These are local observations against fixture responses, not paid walks.
// Validate the actual public report against the contract a generated client sees.
async function validateReport(path: string, id: string, payloadKey: string) {
  const document = await (await SELF.fetch(`${base}/openapi.json`)).json() as {
    paths: Record<string, { get: { responses: { "200": { content: { "application/json": { schema: object } } } } } }>;
    components: object;
  };
  const response = await SELF.fetch(`${base}${path.replace(/\{[^}]+\}/, id)}`);
  expect(response.status).toBe(200);
  const body = await response.json() as Record<string, unknown>;
  const validate = new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile({
    ...document.paths[path]!.get.responses["200"].content["application/json"].schema,
    components: document.components,
  });
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  const payload = body[payloadKey] as Record<string, unknown>;
  expect(validate({ ...body, [payloadKey]: { ...payload, verdict: "invented_verdict" } })).toBe(false);
  expect(validate({ ...body, [payloadKey]: { ...payload, signature: 7 } })).toBe(false);
  const missingCertificate = { ...body };
  delete missingCertificate["cert_id"];
  delete missingCertificate["certificate"];
  expect(validate(missingCertificate)).toBe(false);
}

it("a completed unpaid Launch Check can be read through its advertised contract", async () => {
  const check = await performLaunchCheck(e, target, {
    now, fetch: async () => Response.json({ message: "This fixture has no payment gate" }),
  });
  expect(check.verdict).toBe("no_payment_gate");
  await storeLaunchCheck(e, check, "fixture-launch-cert", now.toISOString());
  await validateReport("/api/launch-check/{check_id}", check.check_id, "check");
});

it("a payment dry run can publish its own simulation outcome", async () => {
  const reading = await performGoodBuyerReading(e, target, {}, {
    now, fetch: async () => Response.json({ message: "No payment terms to simulate" }),
  });
  expect(reading.verdict).toBe("cannot_simulate");
  await storeGoodBuyerReading(e, reading, "fixture-reading-cert", now.toISOString());
  await validateReport("/api/good-buyer/{reading_id}", reading.reading_id, "reading");
});

it("a reconciliation with no observed settlement can publish that result", async () => {
  const rpc = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { method: string };
    return Response.json({ jsonrpc: "2.0", id: 1,
      result: request.method === "eth_blockNumber" ? "0x100" : null });
  });
  const report = await reconcileSettlement(e, { txHash: `0x${"ab".repeat(32)}` }, now)
    .finally(() => rpc.mockRestore());
  expect(report.verdict).toBe("no_settlement");
  await storeReconciliation(e, report, "fixture-reconciliation-cert", now.toISOString());
  await validateReport("/api/reconciliation/{reconciliation_id}", report.reconciliation_id, "reconciliation");
});

it("service audit still publishes its own conformance verdict", async () => {
  const audit = await performServiceAudit(e, target, { now,
    fetch: async () => Response.json({ message: "No payment gate" }) });
  expect(audit.verdict).toBe("not_ready");
  await storeServiceAudit(e, audit, "fixture-service-cert", now.toISOString());
  await validateReport("/api/service-audit/{audit_id}", audit.audit_id, "audit");
});

it("on-page audit still publishes its own page verdict", async () => {
  const audit = await performOnpageAudit(e, target, { now,
    fetch: async () => new Response("<html><body>Missing page metadata</body></html>", {
      headers: { "Content-Type": "text/html" },
    }) });
  expect(audit.verdict).toBe("not_ready");
  await storeOnpageAudit(e, audit, "fixture-onpage-cert", now.toISOString());
  await validateReport("/api/onpage-audit/{audit_id}", audit.audit_id, "audit");
});
