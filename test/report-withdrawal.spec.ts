import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { REPORT_ID, REPORT_META } from "@/store/reports/x402-field-2026-08";

const BASE = "https://scvd.store";

/**
 * WITHDRAWAL IS A PUBLICATION, NOT A DELETION.
 *
 * The August field run went up on 2026-08-19 and came down on
 * 2026-08-20: its largest failure class (616 attempts, 36% of the run)
 * was attributed to sellers "refusing their own advertised terms," and
 * the ledger the report itself commits supports that reading for about
 * 3% of it — 29% were endpoints correctly asking for inputs the
 * instrument never sent, 41% answered with an empty body.
 *
 * The temptation with a bad claim one day old is to delete it. These
 * tests forbid that. The URL keeps answering, the body and signature
 * stay byte-for-byte as published, and the notice rides in FRONT on
 * both dialects — because a research claim that vanishes when it turns
 * out wrong teaches a reader to distrust the ones still up.
 */
describe("the withdrawn report stays up and says so", () => {
  it("carries the withdrawal ahead of the artifact for machines", async () => {
    const response = await SELF.fetch(`${BASE}/api/report/${REPORT_ID}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    const withdrawn = body["withdrawn"] as Record<string, string>;
    expect(withdrawn, "the machine copy does not mention the withdrawal").toBeTruthy();
    expect(withdrawn["at"]).toBe("2026-08-20");
    expect(withdrawn["reason"]).toContain("3%");
    expect(withdrawn["what_stands"]).toContain("669");
    expect(withdrawn["next"]).toContain("re-run");

    // A reader taking one field must meet the withdrawal first.
    expect(Object.keys(body)[0]).toBe("withdrawn");
  });

  it("leaves the published bytes and their signature untouched", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/api/report/${REPORT_ID}`)
    ).json()) as Record<string, unknown>;
    // The claim is still readable in full — that is the point of
    // withdrawing in public rather than deleting.
    expect(String(body["body_markdown"])).toContain(
      "the facilitator/server refusing its own advertised terms",
    );
    expect(body["signature"]).toBeTruthy();
    expect(body["signed_payload"]).toBeTruthy();
    // And the withdrawal is NOT inside the signed payload: a signature
    // covers what was published, which a later retraction must never
    // be able to rewrite.
    expect(String(body["signed_payload"])).not.toContain("withdrawn");
  });

  it("leads the human page with the notice, above the report", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/api/report/${REPORT_ID}`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("Withdrawn 2026-08-20");
    expect(page).toContain("does not stand behind its central finding");
    const noticeAt = page.indexOf("Withdrawn 2026-08-20");
    const reportAt = page.indexOf("Why payments fail");
    expect(noticeAt).toBeGreaterThan(-1);
    expect(reportAt).toBeGreaterThan(noticeAt);
  });

  it("stops advertising the finding on the surfaces that quoted it", async () => {
    const llms = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(llms).toContain("WITHDRAWN");
    expect(llms).toContain("Do not quote its failure rates");

    const doc = (await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json()) as Record<string, string>;
    expect(String(doc["reports_note"])).toContain("withdrawn");
  });

  it("keeps the evidence pointer, since the evidence is what caught it", () => {
    expect(REPORT_META.evidence).toContain("research/field-run-2026-08-18");
  });
});
