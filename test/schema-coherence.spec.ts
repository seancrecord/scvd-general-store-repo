import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_COHERENCE_CLASS,
  schemaFromMcpTools,
  schemaFromOpenApi,
  schemaFromX402,
  schemaRowVerdict,
} from "@/discovery";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";

/**
 * SCHEMA COHERENCE (landscape §11).
 *
 * Identity joins already ask whether catalogs name the same doors.
 * This battery asks whether the required inputs on those doors
 * agree. No scores. A route present on only one schema-bearing
 * surface is not_observed, not a conflict.
 *
 * Live OpenAPI and x402.json share buyInputSchema — they must agree.
 * MCP tools/list is fixture-only here: that catalog is a POST, and
 * discovery already refuses to call tools/list in a stranger's name.
 */

async function fetchJson(path: string): Promise<unknown> {
  const response = await SELF.fetch(`${ABOUT}${path}`);
  expect(response.status, `${path} did not serve`).toBe(200);
  return response.json();
}

function openapiWithRequired(route: string, required: string[]): unknown {
  return {
    paths: {
      [`/api/buy/${route}`]: {
        get: {
          parameters: required.map((name) => ({
            name,
            in: "query",
            required: true,
          })),
        },
      },
    },
  };
}

function x402WithRequired(route: string, required: string[]): unknown {
  return {
    resources: [
      {
        resourceUrl: `${ABOUT}/api/buy/${route}`,
        inputSchema: { type: "object", required },
      },
    ],
  };
}

describe("schema_coherence is a registered class, not a score", () => {
  it("names the join class the registry already carries", () => {
    expect(SCHEMA_COHERENCE_CLASS).toBe("schema_coherence");
  });
});

describe("required-input joins", () => {
  it("agrees when two surfaces require the same fields", () => {
    const verdict = schemaRowVerdict([
      {
        surface: "openapi",
        claims: schemaFromOpenApi(
          openapiWithRequired("launch_check", ["url"]),
          ABOUT,
          ABOUT,
        ),
      },
      {
        surface: "x402_catalog",
        claims: schemaFromX402(
          x402WithRequired("launch_check", ["url"]),
          ABOUT,
          ABOUT,
        ),
      },
    ]);
    expect(verdict.derived).toBe("agree");
    expect(verdict.disagreements).toEqual([]);
    expect(verdict.not_observed).toEqual([]);
  });

  it("conflicts when the required sets differ — the gate can fire", () => {
    const verdict = schemaRowVerdict([
      {
        surface: "openapi",
        claims: schemaFromOpenApi(
          openapiWithRequired("launch_check", ["url"]),
          ABOUT,
          ABOUT,
        ),
      },
      {
        surface: "x402_catalog",
        claims: schemaFromX402(
          x402WithRequired("launch_check", ["url", "planted"]),
          ABOUT,
          ABOUT,
        ),
      },
    ]);
    expect(verdict.derived).toBe("conflict");
    expect(verdict.disagreements).toEqual([
      {
        left_surface: "openapi",
        right_surface: "x402_catalog",
        route: "launch_check",
        only_left: [],
        only_right: ["planted"],
      },
    ]);
  });

  it("a route on only one schema surface is not_observed, not a conflict", () => {
    const verdict = schemaRowVerdict([
      {
        surface: "openapi",
        claims: schemaFromOpenApi(
          openapiWithRequired("launch_check", ["url"]),
          ABOUT,
          ABOUT,
        ),
      },
      {
        surface: "x402_catalog",
        claims: schemaFromX402(
          x402WithRequired("standing_watch", ["url"]),
          ABOUT,
          ABOUT,
        ),
      },
    ]);
    expect(verdict.derived).toBe("agree");
    expect(verdict.disagreements).toEqual([]);
    expect(verdict.not_observed).toEqual([
      {
        route: "launch_check",
        present_on: "openapi",
        missing_on: "x402_catalog",
      },
      {
        route: "standing_watch",
        present_on: "x402_catalog",
        missing_on: "openapi",
      },
    ]);
  });

  it("strips MCP item_id so the selector is not a false conflict", () => {
    const mcp = schemaFromMcpTools(
      {
        tools: [
          {
            itemIds: ["launch_check"],
            inputSchema: {
              required: ["item_id"],
              allOf: [
                {
                  if: { properties: { item_id: { const: "launch_check" } } },
                  then: { required: ["item_id", "url"] },
                },
              ],
            },
          },
        ],
      },
      ABOUT,
      ABOUT,
    );
    expect(mcp).toEqual([
      {
        route: "launch_check",
        surface: "mcp_tools",
        required: ["url"],
        about: ABOUT,
        fetched_from: ABOUT,
      },
    ]);
  });

  it("a cluster item with no allOf branch claims empty required, not silence", () => {
    const mcp = schemaFromMcpTools(
      {
        tools: [
          {
            itemIds: ["hello", "launch_check"],
            inputSchema: {
              allOf: [
                {
                  if: { properties: { item_id: { const: "launch_check" } } },
                  then: { required: ["url"] },
                },
              ],
            },
          },
        ],
      },
      ABOUT,
      ABOUT,
    );
    expect(mcp.map((claim) => claim.route).sort()).toEqual([
      "hello",
      "launch_check",
    ]);
    expect(mcp.find((claim) => claim.route === "hello")?.required).toEqual([]);
  });
});

describe("live OpenAPI and x402.json share one input schema", () => {
  it("the published catalogs agree on every paid route they both name", async () => {
    const openapi = await fetchJson("/openapi.json");
    const x402 = await fetchJson("/.well-known/x402.json");
    const verdict = schemaRowVerdict([
      {
        surface: "openapi",
        claims: schemaFromOpenApi(openapi, ABOUT, `${ABOUT}/openapi.json`),
      },
      {
        surface: "x402_catalog",
        claims: schemaFromX402(x402, ABOUT, `${ABOUT}/.well-known/x402.json`),
      },
    ]);
    expect(JSON.stringify(verdict)).not.toMatch(/score|confidence|rating|rank/i);
    expect(verdict.derived).toBe("agree");
    expect(verdict.disagreements).toEqual([]);
    expect(verdict.not_observed).toEqual([]);
    if (!isRecord(x402) || !Array.isArray(x402["resources"])) {
      throw new Error("live x402 catalog was not an object with resources");
    }
    expect(
      schemaFromX402(x402, ABOUT, ABOUT).some(
        (claim) => claim.route === "launch_check" && claim.required.includes("url"),
      ),
    ).toBe(true);
  });

  it("a planted extra required field on x402 is a conflict", async () => {
    const openapi = await fetchJson("/openapi.json");
    const x402 = await fetchJson("/.well-known/x402.json");
    if (!isRecord(x402) || !Array.isArray(x402["resources"])) {
      throw new Error("live x402 catalog was not an object with resources");
    }
    const planted = {
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
    };
    const verdict = schemaRowVerdict([
      {
        surface: "openapi",
        claims: schemaFromOpenApi(openapi, ABOUT, ABOUT),
      },
      {
        surface: "x402_catalog",
        claims: schemaFromX402(planted, ABOUT, ABOUT),
      },
    ]);
    expect(verdict.derived).toBe("conflict");
    expect(
      verdict.disagreements.some(
        (row) => row.route === "launch_check" && row.only_right.includes("planted"),
      ),
    ).toBe(true);
  });
});
