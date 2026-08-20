import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { ServiceAuditRecord } from "@/services/service-audit";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * THE AUDIT BADGE — the displayable half of the verification
 * marketplace, and the rules /criteria pinned before it existed:
 * every badge is a DATED observation (the date rides the verdict
 * line), the criteria version is printed, the label links to the
 * signed report, and ALL FOUR verdicts render — a badge desk that
 * renders only good news is an endorsement desk.
 */

function record(
  auditId: string,
  verdict: ServiceAuditRecord["audit"]["verdict"],
): ServiceAuditRecord {
  return {
    audit: {
      audit_id: auditId,
      url: "https://door.example/api/thing",
      observed_at: "2026-08-20T01:30:00.000Z",
      criteria: "preflight-v1",
      verdict,
      checks: [],
      advisories: [],
      evidence_hash: "0".repeat(64),
      scope: "test fixture",
      signature: "ab".repeat(64),
      public_key: "cd".repeat(32),
      signature_covers: "test fixture",
    },
    cert_id: "cert_badgetest",
    created_at: "2026-08-20T01:30:01.000Z",
  };
}

async function storeFixture(
  auditId: string,
  verdict: ServiceAuditRecord["audit"]["verdict"],
): Promise<void> {
  await testEnv.PATRONS.put(
    KV_KEYS.serviceAudit(auditId),
    JSON.stringify(record(auditId, verdict)),
  );
}

describe("the audit badge", () => {
  it("renders a purchased audit as a dated, criteria-cited, report-linked label", async () => {
    await storeFixture("saudit_badge01", "ready");
    const response = await SELF.fetch(`${BASE}/badges/audit/saudit_badge01.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    const svg = await response.text();
    // The date shares the verdict line — the /criteria shape: it ages.
    expect(svg).toContain("ANSWERED READY • 2026-08-20");
    expect(svg).toContain("door.example");
    expect(svg).toContain("criteria preflight-v1");
    expect(svg).toContain("never a score");
    expect(svg).toContain("/api/service-audit/saudit_badge01");
  });

  it("renders the negative as readily as the positive", async () => {
    await storeFixture("saudit_badge02", "not_ready");
    await storeFixture("saudit_badge03", "unreachable");
    await storeFixture("saudit_badge04", "refused");
    for (const [id, line] of [
      ["saudit_badge02", "NOT READY"],
      ["saudit_badge03", "UNREACHABLE"],
      ["saudit_badge04", "NOT PROBED"],
    ] as const) {
      const svg = await (
        await SELF.fetch(`${BASE}/badges/audit/${id}.svg`)
      ).text();
      expect(svg).toContain(line);
    }
  });

  it("404s an audit that was never purchased", async () => {
    const response = await SELF.fetch(
      `${BASE}/badges/audit/saudit_neverwas.svg`,
    );
    expect(response.status).toBe(404);
  });

  it("is named on the report it renders", async () => {
    await storeFixture("saudit_badge05", "ready");
    const report = (await (
      await SELF.fetch(`${BASE}/api/service-audit/saudit_badge05`)
    ).json()) as Record<string, unknown>;
    expect(report["badge_url"]).toBe(
      `${BASE}/badges/audit/saudit_badge05.svg`,
    );
    expect(String(report["what_this_is_not"])).toContain("ages");
  });
});
