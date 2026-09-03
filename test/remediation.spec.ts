import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREFLIGHT_VERSION_NEXT, preflightUrl } from "@/services/preflight";
import { remediationRows } from "@/services/remediation";
import { DEFECT_CLASSES, defectsBySignal } from "@/store/defect-vocabulary";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/**
 * REMEDIATION, BOTH SIDES (2026-09-03, roadmap C1). What this file holds:
 *
 *   - every class answers the buyer as well as the operator, and the
 *     two halves are different sentences;
 *   - a signal resolves to EVERY class it explains (`accepts` is two),
 *     in either spelling;
 *   - the free report carries one row per failed check or raised
 *     advisory a class explains, derived, with the definition URL and
 *     both halves, and nothing on a clean door;
 *   - a refusal says what to do and where the codes are documented;
 *   - the served vocabulary carries the buyer's half.
 */

describe("the vocabulary's two halves", () => {
  it("every class tells the buyer something different from what it tells the operator", () => {
    for (const entry of DEFECT_CLASSES) {
      expect(entry.buyer_hint.length, entry.id).toBeGreaterThan(40);
      expect(entry.buyer_hint, entry.id).not.toBe(entry.repair_hint);
    }
  });

  it("a signal resolves to every class it explains, in either spelling", () => {
    expect(defectsBySignal("accepts").map((entry) => entry.id).sort()).toEqual(["unpayable-payto", "unsignable-offer"]);
    expect(defectsBySignal("discovery-info-fails-schema").map((entry) => entry.id)).toEqual(["discovery-info-invalid"]);
    expect(defectsBySignal("discovery-info-fails-schema (advisory)").map((entry) => entry.id)).toEqual(["discovery-info-invalid"]);
    expect(defectsBySignal("no-such-signal")).toEqual([]);
  });

  it("rows are derived from the signals, one per class, and a clean door has none", () => {
    const rows = remediationRows(BASE, [{ name: "status-402", ok: true }, { name: "accepts", ok: false }], [{ name: "testnet-network" }]);
    expect(rows.map((row) => `${row.kind}:${row.signal}:${row.defect_class}`).sort()).toEqual([
      "advisory:testnet-network:wrong-network",
      "check:accepts:unpayable-payto",
      "check:accepts:unsignable-offer",
    ]);
    for (const row of rows) {
      expect(row.definition_url).toBe(`${BASE}/defects/${row.defect_class}`);
      expect(row.operator).toBeTruthy();
      expect(row.buyer).toBeTruthy();
      expect(row.falsified_by).toBeTruthy();
    }
    expect(remediationRows(BASE, [{ name: "status-402", ok: true }], [])).toEqual([]);
  });
});

describe("the free report and its refusals", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carries a row for each failed check and advisory a class explains, with both halves", async () => {
    // An accepts entry with no asset fails `accepts` (two classes explain it); the testnet raises its advisory.
    const challenge = { x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:84532", amount: "1000", payTo: "0x1111111111111111111111111111111111111111" }] };
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) } }));
    const { status, body } = await preflightUrl("https://door.example/api/paid", testEnv, PREFLIGHT_VERSION_NEXT);
    expect(status).toBe(200);
    const report = body as Record<string, any>;
    expect(Array.isArray(report.remediation)).toBe(true);
    const classes = report.remediation.map((row: { defect_class: string }) => row.defect_class);
    expect(classes).toContain("unsignable-offer");
    expect(classes).toContain("unpayable-payto");
    expect(classes).toContain("wrong-network");
    for (const row of report.remediation) {
      expect(row.operator).toBeTruthy();
      expect(row.buyer).toBeTruthy();
      expect(row.definition_url).toContain("/defects/");
    }
    // Never part of the verdict: the verdict is what the checks say, and nothing here moved it.
    const failed = report.checks.filter((check: { ok: boolean }) => !check.ok).map((check: { name: string }) => check.name);
    for (const row of report.remediation.filter((r: { kind: string }) => r.kind === "check")) expect(failed).toContain(row.signal);
  });

  it("a refusal names the next action and where the codes are documented", async () => {
    const own = await SELF.fetch(`${BASE}/api/preflight/v2`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: `${BASE}/api/buy/hello` }) });
    expect(own.status).toBe(400);
    const body = (await own.json()) as Record<string, any>;
    expect(body.code).toBe("own_host_refused");
    expect(body.next_action).toBeTruthy();
    expect(body.documentation_url).toBe(`${BASE}/api/preflight/v2`);
    const missing = await SELF.fetch(`${BASE}/api/preflight/v2`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const missingBody = (await missing.json()) as Record<string, any>;
    expect(missingBody.code).toBe("url_missing");
    expect(missingBody.next_action).toContain("POST");
  });

  it("the served vocabulary carries the buyer's half on every class, and the class page prints it", async () => {
    const doc = (await (await SELF.fetch(`${BASE}/defects.json`)).json()) as Record<string, any>;
    expect(doc.version).toBe("10");
    for (const entry of doc.classes) expect(entry.buyer_hint, entry.id).toBeTruthy();
    const page = await (await SELF.fetch(`${BASE}/defects/wrong-network`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain("What a buyer does");
  });
});
