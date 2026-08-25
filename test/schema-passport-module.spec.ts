import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_COHERENCE_CLASS,
  fetchSelfCatalogs,
  schemaModuleFromCatalogs,
} from "@/discovery";
import { EVIDENCE_SCHEMA_V1 } from "@/evidence";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";
const TEST_SEED = "42".repeat(32);
const AT = "2026-08-24T20:00:00Z";
const CLOCK = "injected-test-clock";

/**
 * SCHEMA ON THE PASSPORT — the self-passport cites schema_coherence
 * the same way it cites discovery_coherence. Live OpenAPI and x402
 * agree. A planted required field is a conflict. MCP is named
 * not_checked: it is a live RPC, not a fetched catalog. No scores.
 */

async function liveCatalogs() {
  return fetchSelfCatalogs(ABOUT, async (path) => {
    const response = await SELF.fetch(`${ABOUT}${path}`);
    expect(response.status, `${path} did not serve`).toBe(200);
    return response.text();
  });
}

describe("the self-passport cites the schema join", () => {
  it("lands schema_coherence as agree beside discovery_coherence", async () => {
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
          }>;
        };
      };
    };
    const schema = json.the_example.payload.modules.find(
      (module) => module.id === SCHEMA_COHERENCE_CLASS,
    );
    expect(schema).toBeDefined();
    expect(schema?.schema).toBe(EVIDENCE_SCHEMA_V1);
    expect(schema?.derived).toBe("agree");
    expect(schema?.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(schema?.not_checked).toContain("mcp_tools");
    expect(JSON.stringify(schema)).not.toMatch(/score|confidence|rating|rank/i);
  });
});

describe("a planted required field is a conflict", () => {
  it("stays agree on the live catalogs, conflicts when x402 grows a field", async () => {
    const live = await liveCatalogs();
    const agree = await schemaModuleFromCatalogs(live, TEST_SEED, AT, CLOCK);
    expect(agree.derived).toBe("agree");
    expect(agree.id).toBe(SCHEMA_COHERENCE_CLASS);

    const x402 = JSON.parse(live.bodies["x402_catalog"] ?? "null");
    if (!isRecord(x402) || !Array.isArray(x402["resources"])) {
      throw new Error("live x402 catalog was not an object with resources");
    }
    live.bodies["x402_catalog"] = JSON.stringify({
      ...x402,
      resources: x402["resources"].map((resource) => {
        if (!isRecord(resource) || typeof resource["resourceUrl"] !== "string") {
          return resource;
        }
        if (!resource["resourceUrl"].endsWith("/api/buy/launch_check")) {
          return resource;
        }
        const schema = isRecord(resource["inputSchema"])
          ? resource["inputSchema"]
          : {};
        const required = Array.isArray(schema["required"])
          ? schema["required"]
          : [];
        return {
          ...resource,
          inputSchema: { ...schema, required: [...required, "planted"] },
        };
      }),
    });
    const conflict = await schemaModuleFromCatalogs(live, TEST_SEED, AT, CLOCK);
    expect(conflict.derived).toBe("conflict");
    expect(conflict.evidence_hash).not.toBe(agree.evidence_hash);
  });
});
