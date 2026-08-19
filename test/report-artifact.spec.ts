import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { REPORT_BODY, REPORT_ID } from "@/store/reports/x402-field-2026-08";
// Evidence read as raw text: the workers pool has no filesystem, and
// vite serves ?raw in tests. Test-only imports — the Worker build
// never sees these files.
import ledgerRaw from "../research/field-run-2026-08-18/ledger.jsonl?raw";
import transfersRaw from "../research/field-run-2026-08-18/usdc-transfers.json?raw";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * THE REPORT IS A SIGNED CLAIM, SO ITS NUMBERS ARE RECOMPUTED HERE
 * from the committed evidence — a signed report with a wrong number
 * is a signed wrong number, and this suite makes that a build failure
 * instead of a corrections entry. The ledger and on-chain record live
 * in this same repository; nothing here trusts the report's author.
 */

function ledger(): Array<Record<string, unknown>> {
  return ledgerRaw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("the report's numbers re-derive from the committed ledger", () => {
  it("headline figures match the evidence, digit for digit", () => {
    const entries = ledger();
    const paid = entries.filter((entry) => entry.paid);
    const spend = paid.reduce(
      (sum, entry) => sum + Number(entry.amount_usd ?? 0),
      0,
    );
    const domains = new Set(entries.map((entry) => entry.domain)).size;
    expect(entries.length).toBe(1707);
    expect(paid.length).toBe(489);
    expect(domains).toBe(1589);
    expect(spend.toFixed(4)).toBe("5.7355");
    // The body states exactly these figures.
    expect(REPORT_BODY).toContain("1,707 purchase attempts");
    expect(REPORT_BODY).toContain("489 recorded successful purchases");
    expect(REPORT_BODY).toContain("1,589 domains");
    expect(REPORT_BODY).toContain("$5.7355");
  });

  it("the on-chain reconciliation matches usdc-transfers.json", () => {
    const transfers = JSON.parse(transfersRaw) as Array<{ value: number }>;
    const total = transfers.reduce((sum, t) => sum + t.value, 0);
    expect(transfers.length).toBe(669);
    expect(total.toFixed(6)).toBe("6.396969");
    expect(REPORT_BODY).toContain("669 transfers");
    expect(REPORT_BODY).toContain("$6.396969");
    // 669 settled on chain minus 489 recorded = the 180 the report names.
    expect(REPORT_BODY).toContain("180 settlements");
  });

  it("the largest failure class is stated as the ledger counts it", () => {
    const entries = ledger();
    const rejected400 = entries.filter(
      (entry) => entry.error === "Payment failed: 400",
    ).length;
    expect(rejected400).toBe(616);
    expect(REPORT_BODY).toContain("616");
  });
});

describe("the report serves as a signed artifact, free", () => {
  it("serves JSON with the signature over bytes that bind the body", async () => {
    const artifact = (await (
      await SELF.fetch(`${BASE}/api/report/${REPORT_ID}`)
    ).json()) as Record<string, unknown>;
    expect(artifact.report_id).toBe(REPORT_ID);
    expect(String(artifact.signed_payload)).toContain(
      String(artifact.body_sha256),
    );
    expect(String(artifact.signature)).toMatch(/^[0-9a-f]{128}$/);
    // sha256 of the served body equals the bound digest.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(String(artifact.body_markdown)),
    );
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(artifact.body_sha256).toBe(hex);
  });

  it("verifies at /api/verify like every other artifact class", async () => {
    const verdict = (await (
      await SELF.fetch(`${BASE}/api/verify/${REPORT_ID}`)
    ).json()) as Record<string, unknown>;
    expect(verdict.valid).toBe(true);
    expect(verdict.artifact_class).toBe("ecosystem_report");
    expect(String(verdict.report_url)).toContain(`/api/report/${REPORT_ID}`);
  });

  it("renders as a readable page at the same URL", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/api/report/${REPORT_ID}`, { headers: HTML })
    ).text();
    expect(page).toContain("walked with a wallet");
    expect(page).toContain("489");
    expect(page).toContain(`/api/verify/${REPORT_ID}`);
  });

  it("is discoverable from llms.txt and the x402 discovery document", async () => {
    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain(`/api/report/${REPORT_ID}`);
    const x402 = (await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json()) as Record<string, unknown>;
    expect(JSON.stringify(x402)).toContain(`/api/report/${REPORT_ID}`);
  });
});
