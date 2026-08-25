import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_COHERENCE_CLASS,
  discoveryModuleFromCatalogs,
  fetchSelfCatalogs,
  selfRowFromCatalogs,
} from "@/discovery";
import { isRecord } from "@/types";
import ciYml from "../.github/workflows/ci.yml?raw";
import packageJsonRaw from "../package.json?raw";

const ABOUT = "https://scvd.store";
const TEST_SEED = "42".repeat(32);
const AT = "2026-08-24T20:00:00Z";
const CLOCK = "injected-test-clock";
const SELF_ROW_SCRIPT = "vitest run test/self-row-blocker.spec.ts";

/**
 * SELF-ROW IN CI — the release blocker.
 *
 * The join already ran inside npm test. Buried there it is one of
 * two thousand. This spec is the named gate: the same instrument
 * the passport cites, plus a check that CI actually invokes it.
 * The 2026-07-29 correction was a sentence about CI with no job
 * behind it. Do not repeat that.
 */

async function liveCatalogs() {
  return fetchSelfCatalogs(ABOUT, async (path) => {
    const response = await SELF.fetch(`${ABOUT}${path}`);
    expect(response.status, `${path} did not serve`).toBe(200);
    return response.text();
  });
}

describe("the self-row is a named CI step", () => {
  it("package.json and ci.yml invoke this spec, not a cousin", () => {
    const scripts = JSON.parse(packageJsonRaw) as {
      scripts: Record<string, string>;
    };
    expect(scripts.scripts["self-row"]).toBe(SELF_ROW_SCRIPT);
    expect(ciYml).toMatch(/- name: Self-row\n\s+run: npm run self-row/);
  });
});

describe("the live self-row is the instrument we sell", () => {
  it("live catalogs agree, and the passport citation says so", async () => {
    const live = await liveCatalogs();
    const row = selfRowFromCatalogs(live.row);
    expect(row.derived).toBe("agree");
    expect(row.disagreements).toEqual([]);
    const module = await discoveryModuleFromCatalogs(
      live,
      TEST_SEED,
      AT,
      CLOCK,
    );
    expect(module.id).toBe(DISCOVERY_COHERENCE_CLASS);
    expect(module.derived).toBe("agree");
    expect(JSON.stringify(module)).not.toMatch(/score|confidence|rating|rank/i);
  });

  it("a planted extra x402 route is a conflict — the gate can fire", async () => {
    const live = await liveCatalogs();
    expect(selfRowFromCatalogs(live.row).derived).toBe("agree");
    const x402 = JSON.parse(live.bodies["x402_catalog"] ?? "null");
    if (!isRecord(x402) || !Array.isArray(x402["resources"])) {
      throw new Error("live x402 catalog was not an object with resources");
    }
    x402["resources"] = [
      ...x402["resources"],
      { resourceUrl: `${ABOUT}/api/buy/planted_blocker` },
    ];
    live.row.x402 = x402;
    const conflict = selfRowFromCatalogs(live.row);
    expect(conflict.derived).toBe("conflict");
    expect(
      conflict.disagreements.some(
        (row) =>
          row.kind === "route_identity" &&
          row.only_right.includes("planted_blocker"),
      ),
    ).toBe(true);
  });
});
