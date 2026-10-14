import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { escapeHtml } from "@/lib/sanitize";
import { signMessage } from "@/lib/signing";
import { AUDIT_SCOPE, storeServiceAudit, type ServiceAuditObservation, type ServiceAuditRecord } from "@/services/service-audit";
import { getReport, reportIds, REPORT_PAGE_UPDATED } from "@/services/reports";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const ID = "saudit_page_fixture";
const PATH = `/api/service-audit/${ID}`;
const AT = "2026-09-01T12:00:00.000Z";
let record: ServiceAuditRecord;

async function seed(overrides: Partial<ServiceAuditObservation> = {}) {
  const observation: ServiceAuditObservation = {
    audit_id: ID, url: "https://merchant.example/buy", observed_at: AT,
    criteria: "preflight-v1", verdict: "not_ready",
    checks: [
      { name: "status-402", ok: true, detail: "HTTP 402" },
      { name: "challenge-parse", ok: false, detail: "Missing challenge" },
      { name: "rail", ok: true, detail: "Partial reading", not_judged: ["settlement"] },
    ],
    advisories: [{ name: "coverage", detail: "No paid request" }],
    evidence_hash: "a".repeat(64), scope: AUDIT_SCOPE, ...overrides,
  };
  const signed = await signMessage(JSON.stringify(observation), testEnv.SIGNING_KEY);
  record = await storeServiceAudit(testEnv, { ...observation, signature: signed.signature,
    public_key: signed.publicKey, signature_covers: "All observation fields in served order." }, "cert_fixture", AT);
}

function nodes(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]!) as Record<string, unknown>);
}

describe("a purchased audit earns its existing page", () => {
  beforeEach(() => seed());

  it("renders the dated saved finding, limits and verification without rewriting the audit", async () => {
    const before = await testEnv.PATRONS.get(KV_KEYS.serviceAudit(ID));
    const response = await SELF.fetch(`${BASE}${PATH}`, { headers: { Accept: "text/html" } });
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="${BASE}${PATH}">`);
    expect(html).toContain("merchant.example");
    expect(html).toContain(AT);
    expect(html).toContain(record.audit.criteria);
    expect(html).toContain(record.audit.verdict);
    expect(html).toContain("2 of 3 recorded checks passed");
    expect(html).toContain("Not judged: settlement");
    expect(html).toContain(escapeHtml(AUDIT_SCOPE));
    expect(html.indexOf(escapeHtml(AUDIT_SCOPE))).toBeLessThan(html.indexOf("<h2>Checks</h2>"));
    expect(html).toContain('/api/verify/cert_fixture');
    expect(html).toContain('/corrections');
    expect(html).toContain('/conformance');
    expect(html).toContain('/menu/service_audit');
    const report = nodes(html).find(node => node["@type"] === "Report");
    expect(report).toMatchObject({ url: `${BASE}${PATH}`, datePublished: AT, identifier: ID });
    expect(await testEnv.PATRONS.get(KV_KEYS.serviceAudit(ID))).toBe(before);
  });

  it("keeps default and explicit JSON intact, including the browser's JSON link", async () => {
    const original = await (await SELF.fetch(`${BASE}${PATH}`)).json() as { audit: unknown };
    expect(original.audit).toEqual(record.audit);
    const browser = await SELF.fetch(`${BASE}${PATH}`, { headers: { Accept: "text/html" } });
    const html = await browser.text();
    expect(html).toContain(`href="${PATH}?format=json"`);
    for (const [suffix, accept] of [["", "application/json"], ["?format=json", "text/html"]]) {
      const response = await SELF.fetch(`${BASE}${PATH}${suffix}`, { headers: { Accept: accept! } });
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual(original);
    }
  });

  it("serves readable HTML to search crawlers with cache variation", async () => {
    const response = await SELF.fetch(`${BASE}${PATH}`, { headers: { Accept: "*/*", "User-Agent": "Googlebot" } });
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(response.headers.get("vary")).toContain("User-Agent");
  });

  it("escapes retained endpoint text and check details in HTML and structured data", async () => {
    const hostile = '</script><img src=x onerror="alert(1)">';
    await seed({ url: `https://merchant.example/?q=${hostile}`,
      checks: [{ name: hostile, detail: hostile, ok: false, not_judged: [hostile] }],
      advisories: [{ name: hostile, detail: hostile }] });
    const html = await (await SELF.fetch(`${BASE}${PATH}`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).not.toContain(hostile);
    expect(html).toContain(escapeHtml(hostile));
    expect(nodes(html).find(node => node["@type"] === "Report")).toBeTruthy();
  });

  it.each(["unreachable", "refused", "method_unresolved"] as const)("does not turn an empty %s reading into a pass", async verdict => {
    await seed({ verdict, checks: [], advisories: [] });
    const html = await (await SELF.fetch(`${BASE}${PATH}`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("No checks recorded");
    expect(html).toContain(verdict);
    expect(html).not.toContain("0 of 0 recorded checks passed");
  });

  it("keeps unknown ids a 404", async () => {
    const response = await SELF.fetch(`${BASE}/api/service-audit/never-minted`, { headers: { Accept: "text/html" } });
    expect(response.status).toBe(404);
  });
});

describe("published research has a discovery path and an honest archive label", () => {
  it("lists every published report in both maps and the existing corpus hub", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    const md = await (await SELF.fetch(`${BASE}/sitemap.md`)).text();
    const html = await (await SELF.fetch(`${BASE}/corpus`, { headers: { Accept: "text/html" } })).text();
    const json = await (await SELF.fetch(`${BASE}/corpus`, { headers: { Accept: "application/json" } })).json() as { reports: { url: string; withdrawn: unknown }[] };
    for (const id of reportIds()) {
      const report = getReport(id)!;
      const url = `${BASE}/api/report/${id}`;
      const entry = xml.split("<url>").find(entry => entry.includes(`<loc>${url}</loc>`));
      expect(entry).toBeTruthy();
      const lastmod = /<lastmod>(.*?)<\/lastmod>/.exec(entry!)?.[1];
      expect(lastmod).toBeTruthy();
      expect(lastmod! >= REPORT_PAGE_UPDATED).toBe(true);
      expect(lastmod! >= (report.meta.withdrawn?.at ?? report.meta.published)).toBe(true);
      expect(md).toContain(url);
      expect(html).toContain(`href="/api/report/${id}"`);
      expect(json.reports.find(entry => entry.url === url)?.withdrawn).toEqual(report.meta.withdrawn);
      if (report.meta.withdrawn) expect(html).toContain(`Withdrawn ${report.meta.withdrawn.at}`);
    }
  });

  it("makes withdrawal visible in search metadata, with one heading and original signed bytes", async () => {
    for (const id of reportIds()) {
      const path = `/api/report/${id}`;
      const report = getReport(id)!;
      const html = await (await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } })).text();
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      expect(html).toContain(`href="${path}?format=json"`);
      expect(html).toContain('href="/corpus"');
      const structured = nodes(html).find(node => node["@type"] === "Report");
      expect(structured).toMatchObject({ datePublished: report.meta.published });
      if (report.meta.withdrawn) {
        expect(/<title>(.*?)<\/title>/.exec(html)?.[1]).toContain("Withdrawn");
        expect(/<meta name="description" content="([^"]*)"/.exec(html)?.[1]).toContain("Withdrawn");
        expect(structured?.dateModified).toBe(report.meta.withdrawn.at);
      }
      const original = await (await SELF.fetch(`${BASE}${path}`)).json();
      const linked = await (await SELF.fetch(`${BASE}${path}?format=json`, { headers: { Accept: "text/html" } })).json();
      expect(linked).toEqual(original);
    }
  });
});
