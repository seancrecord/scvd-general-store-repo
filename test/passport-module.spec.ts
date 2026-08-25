import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_COHERENCE_CLASS,
  discoveryModuleFromCatalogs,
  fetchSelfCatalogs,
} from "@/discovery";
import { EVIDENCE_SCHEMA_V1 } from "@/evidence";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";
const TEST_SEED = "42".repeat(32);
const AT = "2026-08-24T20:00:00Z";
const CLOCK = "injected-test-clock";

/**
 * PASSPORT MODULE — the self-passport cites discovery_coherence
 * instead of inventing a second product. Live catalogs agree. A
 * planted extra x402 buy route is a conflict. No scores.
 */

async function liveCatalogs() {
  return fetchSelfCatalogs(ABOUT, async (path) => {
    const response = await SELF.fetch(`${ABOUT}${path}`);
    expect(response.status, `${path} did not serve`).toBe(200);
    return response.text();
  });
}

describe("the self-passport cites the join", () => {
  it("lands discovery_coherence as agree on the live self-row", async () => {
    const json = (await (
      await SELF.fetch(`${ABOUT}/passport`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      the_example: {
        payload: {
          modules: Array<{
            id: string;
            schema: string;
            evidence_hash: string;
            derived: string;
            not_checked: string[];
            does_not_prove: string[];
          }>;
        };
      };
    };
    const module = json.the_example.payload.modules[0];
    expect(json.the_example.payload.modules).toHaveLength(1);
    expect(module?.id).toBe(DISCOVERY_COHERENCE_CLASS);
    expect(module?.schema).toBe(EVIDENCE_SCHEMA_V1);
    expect(module?.derived).toBe("agree");
    expect(module?.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(module?.not_checked).toContain("same_operator");
    expect(JSON.stringify(module)).not.toMatch(/score|confidence|rating|rank/i);

    const html = await (
      await SELF.fetch(`${ABOUT}/passport`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain("discovery_coherence");
    expect(html).toContain("agree");
  });
});

describe("a planted catalog disagreement is a conflict", () => {
  it("stays agree on the live catalogs, conflicts when x402 grows a private route", async () => {
    const live = await liveCatalogs();
    const agree = await discoveryModuleFromCatalogs(
      live,
      TEST_SEED,
      AT,
      CLOCK,
    );
    expect(agree.derived).toBe("agree");

    const x402 = JSON.parse(live.bodies["x402_catalog"] ?? "null");
    if (!isRecord(x402) || !Array.isArray(x402["resources"])) {
      throw new Error("live x402 catalog was not an object with resources");
    }
    x402["resources"] = [
      ...x402["resources"],
      { resourceUrl: `${ABOUT}/api/buy/planted_only` },
    ];
    live.bodies["x402_catalog"] = JSON.stringify(x402);
    live.row.x402 = x402;
    const conflict = await discoveryModuleFromCatalogs(
      live,
      TEST_SEED,
      AT,
      CLOCK,
    );
    expect(conflict.derived).toBe("conflict");
    expect(conflict.evidence_hash).not.toBe(agree.evidence_hash);
  });
});
