import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentJourneyStep } from "@/lib/agent-journey";

afterEach(() => vi.restoreAllMocks());

describe("agent journey observations", () => {
  it("joins only declared research and never calls a paid-route 200 a settlement", () => {
    const headers = { "X-SCVD-Study": "11111111-1111-4111-8111-111111111111", "X-SCVD-Study-Consent": "record" };
    const step = agentJourneyStep(new Request("https://scvd.store/api/buy/hello", { headers }), 200);
    expect(step).toMatchObject({ stage: "paid_door", outcome: "http_success", join: "declared_study", study_verified: false });
    const noConsent = agentJourneyStep(new Request("https://scvd.store/menu.json", { headers: { "X-SCVD-Study": headers["X-SCVD-Study"] } }), 200);
    expect(noConsent?.join).toBe("unlinked");
    expect(noConsent).not.toHaveProperty("study_id");
    expect(agentJourneyStep(new Request("https://scvd.store/admin/growth"), 200)).toBeUndefined();
  });
  it("adds a bounded journey step to the existing request log without guessing a model", async () => {
    const log = vi.spyOn(console, "log");
    await SELF.fetch("https://scvd.store/menu.json?source=private-prompt", {
      headers: { "User-Agent": "ora-agent/1", "traceparent": "00-11111111111111111111111111111111-2222222222222222-01" },
    });
    const rows = log.mock.calls.flatMap(([value]) => {
      try { return [JSON.parse(String(value))]; } catch { return []; }
    });
    const row = rows.find(row => row.knock === 1);
    expect(row?.journey).toMatchObject({ stage: "discovery", model: "unknown", join: "unlinked" });
    // A caller's trace header alone is not consent to cross-request tracking.
    expect(JSON.stringify(row)).not.toContain("11111111111111111111111111111111");
    expect(JSON.stringify(row)).not.toContain("private-prompt");
  });
});
