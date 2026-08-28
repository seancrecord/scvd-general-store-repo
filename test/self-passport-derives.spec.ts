import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { issueSelfPassport } from "@/services/passport";
import { isRecord, type Env } from "@/types";

const testEnv = env as unknown as Env;
const ABOUT = "https://scvd.store";

/**
 * THE SELF-PASSPORT DERIVES OR REFUSES (rule 46; the instrument
 * audit, 2026-08-28).
 *
 * issueSelfPassport used to hardcode verdict:"ready",
 * freshness:"fresh", failed:[] while computing modules whose derived
 * state can be "conflict" — the summary was captioned "DERIVED from
 * the same locals" and was asserted, not derived. The one passport
 * whose subject the census can never probe was the one that could
 * not go dark. These tests are the two halves of the fix: the clean
 * case earns its fresh from the live modules agreeing, and a planted
 * conflict — the self-row blocker's own plant, one catalog claiming
 * a route the others do not — turns the same fields dark, which also
 * turns the chip off (the badges route refuses any freshness that is
 * not fresh/aging/expired).
 */

const liveGetText = async (path: string): Promise<string> => {
  const response = await SELF.fetch(`${ABOUT}${path}`);
  expect(response.status, `${path} did not serve`).toBe(200);
  return response.text();
};

describe("the self-passport's summary is derived, not asserted", () => {
  it("earns ready/fresh from live modules that agree", async () => {
    const passport = await issueSelfPassport(testEnv, new Date(), liveGetText);
    const { payload } = passport;
    expect(payload.modules.every((module) => module.derived === "agree")).toBe(
      true,
    );
    expect(payload.latest?.verdict).toBe("ready");
    expect(payload.freshness).toBe("fresh");
    expect(payload.summary.status).toBe("fresh");
  });

  it("a planted catalog conflict turns the same fields dark — and names the module", async () => {
    const tampered = async (path: string): Promise<string> => {
      const body = await liveGetText(path);
      if (!path.includes("x402")) return body;
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return body;
      }
      if (isRecord(parsed) && Array.isArray(parsed["resources"])) {
        parsed["resources"] = [
          ...parsed["resources"],
          { resourceUrl: `${ABOUT}/api/buy/planted_conflict` },
        ];
        return JSON.stringify(parsed);
      }
      return body;
    };
    const passport = await issueSelfPassport(testEnv, new Date(), tampered);
    const { payload } = passport;
    const disagreeing = payload.modules.filter(
      (module) => module.derived !== "agree",
    );
    expect(
      disagreeing.length,
      "the plant must actually produce a conflicting module",
    ).toBeGreaterThan(0);
    expect(payload.latest?.verdict).toBe("self-conflict");
    expect(payload.freshness).toBe("indeterminate");
    expect(payload.summary.status).toBe("indeterminate");
    // The summary names what disagreed, the way a census passport
    // names its failed checks.
    for (const module of disagreeing) {
      expect(payload.summary.failed ?? []).toContain(module.id);
    }
    // And "indeterminate" is exactly the state the chip route refuses
    // to render — our chip goes dark the same way anyone's does.
  });
});
