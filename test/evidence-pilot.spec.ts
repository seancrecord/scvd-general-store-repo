import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";
describe("SCVD Attestation pilot", () => {
  it("offers a human purchase path and an explicitly unsigned sample", async () => {
    const page = await SELF.fetch(`${BASE}/evidence-pilot`, { headers: { Accept: "text/html" } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("mailto:");
    expect(html).toContain("Request this pilot");
    const sample = await SELF.fetch(`${BASE}/api/evidence-pilot/sample`);
    expect(sample.status).toBe(200);
    const data = await sample.json() as { sample: boolean; signature?: string };
    expect(data.sample).toBe(true);
    expect(data.signature).toBeUndefined();
  });
  it("requires keeper authentication to commission a watch", async () => {
    const result = await SELF.fetch(`${BASE}/admin/evidence-pilot`, { method: "POST", body: "{}" });
    expect(result.status).toBe(401);
  });
});

import { beforeEach, afterEach, vi } from "vitest";
import type { Env } from "@/types";
import { EVIDENCE_PILOT } from "@/store/evidence-pilot";
import { startEvidencePilot, pilotReportBody, signedPilotReport } from "@/services/evidence-pilot";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { canonicalizeConformancePass, type ConformancePass, type ConformanceWatchRecord } from "@/services/conformance-watch";
import { KV_KEYS } from "@/lib/kv-keys";
import { jcsCanonicalize } from "@/lib/jcs";

const testEnv = env as unknown as Env;
const START = Date.parse("2026-10-07T12:00:00Z");
const DAY = 24 * 3600_000;
const id = () => `cwatch_pilot_${crypto.randomUUID().replaceAll("-", "")}`;
const auth = { Authorization: `Basic ${btoa("keeper:test-admin-password")}` };
async function start() { return startEvidencePilot(testEnv, id(), "https://merchant.example/x402", START); }
async function row(record: ConformanceWatchRecord, day: number, verdict: ConformancePass["verdict"] = "ready", battery = "test-battery"): Promise<ConformancePass> {
  const pass = { at: new Date(START + day * DAY + 3600_000).toISOString(), verdict,
    failed: verdict === "not_ready" ? ["test-check"] : [], advisories: [], battery };
  const signed = await signMessage(canonicalizeConformancePass(record.watch_id, record.url, pass), testEnv.SIGNING_KEY);
  return { ...pass, signature: signed.signature, public_key: signed.publicKey };
}
beforeEach(async () => {
  const listing = await testEnv.ORDERS.list({ prefix: `${KV_KEYS.conformanceWatchPrefix}cwatch_pilot_` });
  await Promise.all(listing.keys.map(key => testEnv.ORDERS.delete(key.name)));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("pilot report evidence", () => {
  it("commissions a bounded term, preserves retries and refuses a conflicting id", async () => {
    const record = await start();
    expect(Date.parse(record.ends_at) - Date.parse(record.started_at)).toBe(EVIDENCE_PILOT.duration_days * DAY);
    expect((await startEvidencePilot(testEnv, record.watch_id, record.url, START + DAY)).started_at).toBe(record.started_at);
    await expect(startEvidencePilot(testEnv, record.watch_id, "https://different.example/x402", START)).rejects.toThrow();
    expect(JSON.parse(record.commission!.signed_payload).terms.price_usd).toBe(EVIDENCE_PILOT.price_usd);
  });
  it.each(["https://127.0.0.1/", "https://user:secret@merchant.example/", "https://merchant.example/?key=sensitive", "http://merchant.example/", "https://merchant.example/#private"])("refuses unsafe pilot target %s", async url => {
    await expect(startEvidencePilot(testEnv, id(), url, START)).rejects.toThrow();
  });
  it("counts covered days, not rows, and leaves refusals and blindness as gaps", async () => {
    const record = await start();
    record.passes = [await row(record, 0), await row(record, 0.5), await row(record, 2, "refused"),
      { ...await row(record, 3, "unreachable"), observer_status: "degraded" }];
    const body = pilotReportBody(record, START + 4.5 * DAY);
    expect(body.coverage).toMatchObject({ elapsed_days: 4, days_with_conformance_checks: 1, days_without_conformance_checks: 3 });
    expect(body.days.map(day => day.gap)).toEqual([null, "no_attempt", "no_conformance_result", "no_conformance_result"]);
    expect(body.window.complete).toBe(false);
  });
  it("separates criteria changes from changed behavior", async () => {
    const record = await start();
    record.passes = [await row(record, 0), await row(record, 1, "not_ready"), await row(record, 2, "ready", "new-battery")];
    expect(pilotReportBody(record, START + 3 * DAY).changes.map(change => change.kind)).toEqual(["checks_changed", "criteria_changed"]);
  });
  it("verifies independently, and editing or deleting a report row breaks the commitment", async () => {
    const record = await start(); record.passes = [await row(record, 0)];
    const result = await signedPilotReport(testEnv, record, START + DAY);
    expect(result.signed_payload).toBe(jcsCanonicalize(result.report));
    expect(await verifyMessageSignature(result.signed_payload, result.signature, result.public_key)).toBe(true);
    const modified = structuredClone(result.report); modified.observations[0]!.verdict = "not_ready";
    expect(await verifyMessageSignature(jcsCanonicalize(modified), result.signature, result.public_key)).toBe(false);
    modified.observations = [];
    expect(await verifyMessageSignature(jcsCanonicalize(modified), result.signature, result.public_key)).toBe(false);
    record.passes[0]!.failed = ["invented"];
    await expect(signedPilotReport(testEnv, record, START + DAY)).rejects.toThrow("Invalid observation signature");
  });
  it("refuses changed commission terms and out-of-window observations", async () => {
    const record = await start(); record.url = "https://different.example/";
    await expect(signedPilotReport(testEnv, record, START + DAY)).rejects.toThrow("Commission mismatch");
    const clean = await start(); clean.passes = [await row(clean, -1)];
    expect(() => pilotReportBody(clean, START + DAY)).toThrow("Observation outside report window");
  });
  it("closes the denominator at the term end and counts a wholly unobserved term", async () => {
    const record = await start();
    const report = pilotReportBody(record, START + EVIDENCE_PILOT.duration_days * DAY);
    expect(report.window.complete).toBe(true);
    expect(report.coverage.days_without_conformance_checks).toBe(EVIDENCE_PILOT.duration_days);
  });
});
describe("pilot activation and export", () => {
  it("requires explicit agreement and rejects cross-site admin requests", async () => {
    const form = new URLSearchParams({ pilot_id: id(), url: "https://merchant.example/x402" });
    expect((await SELF.fetch(`${BASE}/admin/evidence-pilot`, { method: "POST", headers: auth, body: form })).status).toBe(400);
    form.set("agreed", "yes");
    expect((await SELF.fetch(`${BASE}/admin/evidence-pilot`, { method: "POST", headers: { ...auth, Origin: "https://elsewhere.example" }, body: form })).status).toBe(403);
  });
  it("starts through the keeper form and downloads JSON even with a browser Accept header", async () => {
    const form = new URLSearchParams({ pilot_id: id(), url: "https://merchant.example/x402", agreed: "yes" });
    const result = await SELF.fetch(`${BASE}/admin/evidence-pilot`, { method: "POST", headers: auth, body: form, redirect: "manual" });
    expect(result.status).toBe(303);
    const location = result.headers.get("Location")!;
    const json = await SELF.fetch(`${BASE}${location}?download=1`, { headers: { Accept: "text/html" } });
    expect(json.status).toBe(200); expect(json.headers.get("Content-Type")).toContain("application/json");
    const artifact = await json.json() as { signed_payload: string; signature: string; public_key: string };
    expect(await verifyMessageSignature(artifact.signed_payload, artifact.signature, artifact.public_key)).toBe(true);
    expect((await SELF.fetch(`${BASE}${location}`, { headers: { Accept: "text/html" } })).status).toBe(200);
  });
  it("puts the export before the rows and explains gaps in readable language", async () => {
    vi.useFakeTimers(); vi.setSystemTime(START + 3 * DAY);
    const record = await start();
    const response = await SELF.fetch(`${BASE}/api/evidence-pilot/${record.watch_id}`, { headers: { Accept: "text/html" } });
    const html = await response.text();
    expect(html).toContain("No attempt recorded");
    expect(html).toContain("2026-10-07 12:00:00 UTC");
    expect(html.indexOf("Download signed JSON")).toBeLessThan(html.indexOf("<table>"));
  });
  it("does not invent a report for an unknown id", async () => {
    expect((await SELF.fetch(`${BASE}/api/evidence-pilot/${id()}`)).status).toBe(404);
  });
});
