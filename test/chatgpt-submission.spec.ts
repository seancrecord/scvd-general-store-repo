import { describe, expect, it } from "vitest";
import submission from "../chatgpt-app-submission.json";
import { VERIFIER_TITLE, verifierToolCatalog } from "@/routes/mcp-verifier";
import validOffer from "../verifier/fixtures/offer-valid.json";
import tamperedOffer from "../verifier/fixtures/offer-tampered-payload.json";

describe("the ChatGPT verifier submission draft", () => {
  it("declares exactly the served tools and their actual hints", () => {
    const catalog = verifierToolCatalog("https://scvd.store");
    expect(Object.keys(submission.tools).sort()).toEqual(catalog.map((tool) => String(tool["name"])).sort());
    for (const [name, tool] of Object.entries(submission.tools)) {
      const served = catalog.find((entry) => entry["name"] === name)!;
      expect(served["annotations"]).toMatchObject(tool.annotations);
    }
    expect(submission.app_info.display_name).toBe(VERIFIER_TITLE);
    expect(submission.app_info.subtitle.length).toBeLessThanOrEqual(30);
  });

  it("provides the required cases with real action names and complete public fixtures", () => {
    expect(submission.schema_version).toBe(1);
    expect(submission.test_cases).toHaveLength(5);
    expect(submission.negative_test_cases).toHaveLength(3);
    expect(submission.test_cases.map((test) => test.tools_triggered).sort()).toEqual(Object.keys(submission.tools).sort());
    for (const test of submission.negative_test_cases) expect(test.tools_triggered).toBeNull();
    const offers = submission.test_cases.find((test) => test.tools_triggered === "verify_x402_receipt")!;
    expect(offers.user_prompt).toContain(validOffer.offer);
    expect(offers.user_prompt).toContain(tamperedOffer.offer);
    expect(offers.user_prompt).toContain(validOffer.publicKeyHex);
  });
});
