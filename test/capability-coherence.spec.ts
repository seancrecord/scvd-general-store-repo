import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_COHERENCE_CLASS,
  capabilityFromA2a,
  capabilityFromMcp,
  capabilityFromX402,
  capabilityRowVerdict,
  normalizeTransport,
} from "@/discovery";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";

/**
 * CAPABILITY COHERENCE (landscape §11 #4), catalog-only.
 *
 * Chains on the two x402 catalogs. Primary transport on the A2A
 * card vs the MCP pointer. A dimension one side never stated is
 * not_observed. No live probe. No scores.
 */

async function fetchJson(path: string): Promise<unknown> {
  const response = await SELF.fetch(`${ABOUT}${path}`);
  expect(response.status, `${path} did not serve`).toBe(200);
  return response.json();
}

describe("capability_coherence is a registered class, not a score", () => {
  it("names the join class the registry already carries", () => {
    expect(CAPABILITY_COHERENCE_CLASS).toBe("capability_coherence");
  });
});

describe("transport spellings collapse to one token", () => {
  it("treats MCP and streamable-http as the same door", () => {
    expect(normalizeTransport("MCP")).toBe("mcp");
    expect(normalizeTransport("streamable-http")).toBe("mcp");
    expect(normalizeTransport("HTTP+x402")).toBe("http+x402");
  });
});

describe("chain joins on payment catalogs", () => {
  it("agrees when two x402 surfaces publish the same networks", () => {
    const body = { networks: ["eip155:8453", "eip155:137"] };
    const verdict = capabilityRowVerdict([
      {
        surface: "x402_catalog",
        claim: capabilityFromX402(body, ABOUT, ABOUT, "x402_catalog")!,
      },
      {
        surface: "x402_thin",
        claim: capabilityFromX402(body, ABOUT, ABOUT, "x402_thin")!,
      },
    ]);
    expect(verdict.derived).toBe("agree");
    expect(verdict.disagreements).toEqual([]);
    expect(verdict.not_observed.filter((row) => row.field === "chains")).toEqual(
      [],
    );
  });

  it("conflicts when a planted chain is on only one catalog", () => {
    const verdict = capabilityRowVerdict([
      {
        surface: "x402_catalog",
        claim: capabilityFromX402(
          { networks: ["eip155:8453", "eip155:84532"] },
          ABOUT,
          ABOUT,
          "x402_catalog",
        )!,
      },
      {
        surface: "x402_thin",
        claim: capabilityFromX402(
          { networks: ["eip155:8453"] },
          ABOUT,
          ABOUT,
          "x402_thin",
        )!,
      },
    ]);
    expect(verdict.derived).toBe("conflict");
    expect(verdict.disagreements.map((row) => row.field)).toContain("chains");
  });

  it("treats chains the other catalog never stated as not_observed", () => {
    const verdict = capabilityRowVerdict([
      {
        surface: "x402_catalog",
        claim: capabilityFromX402(
          { networks: ["eip155:8453"] },
          ABOUT,
          ABOUT,
          "x402_catalog",
        )!,
      },
      {
        surface: "a2a_agent_card",
        claim: capabilityFromA2a(
          { capabilities: { streaming: false } },
          ABOUT,
          ABOUT,
        )!,
      },
    ]);
    expect(verdict.derived).toBe("agree");
    expect(verdict.not_observed.map((row) => row.field)).toContain("chains");
    expect(verdict.not_observed.map((row) => row.field)).toContain("streaming");
  });
});

describe("primary transport on agent cards", () => {
  it("agrees when A2A prefers MCP and the MCP card says streamable-http", () => {
    const verdict = capabilityRowVerdict([
      {
        surface: "a2a_agent_card",
        claim: capabilityFromA2a(
          {
            preferredTransport: "MCP",
            additionalInterfaces: [{ url: `${ABOUT}/llms.txt`, transport: "HTTP+x402" }],
          },
          ABOUT,
          ABOUT,
        )!,
      },
      {
        surface: "mcp_card",
        claim: capabilityFromMcp({ transport: "streamable-http" }, ABOUT, ABOUT)!,
      },
    ]);
    expect(verdict.derived).toBe("agree");
    expect(
      verdict.disagreements.filter((row) => row.field === "primary_transport"),
    ).toEqual([]);
  });
});

describe("our own catalogs agree on the dimensions they both state", () => {
  it("the two x402 documents publish the same networks", async () => {
    const rich = await fetchJson("/.well-known/x402.json");
    const thin = await fetchJson("/.well-known/x402");
    expect(isRecord(rich)).toBe(true);
    expect(isRecord(thin)).toBe(true);
    const verdict = capabilityRowVerdict([
      {
        surface: "x402_catalog",
        claim: capabilityFromX402(rich, ABOUT, `${ABOUT}/.well-known/x402.json`)!,
      },
      {
        surface: "x402_thin",
        claim: capabilityFromX402(thin, ABOUT, `${ABOUT}/.well-known/x402`, "x402_thin")!,
      },
    ]);
    expect(verdict.derived, JSON.stringify(verdict.disagreements)).toBe("agree");
    expect(verdict.disagreements.map((row) => row.field)).not.toContain("chains");
  });

  it("A2A preferredTransport and the MCP card name the same door", async () => {
    const a2a = await fetchJson("/.well-known/a2a.json");
    const mcp = await fetchJson("/.well-known/mcp");
    const verdict = capabilityRowVerdict([
      {
        surface: "a2a_agent_card",
        claim: capabilityFromA2a(a2a, ABOUT, `${ABOUT}/.well-known/a2a.json`)!,
      },
      {
        surface: "mcp_card",
        claim: capabilityFromMcp(mcp, ABOUT, `${ABOUT}/.well-known/mcp`)!,
      },
    ]);
    expect(verdict.derived, JSON.stringify(verdict.disagreements)).toBe("agree");
    expect(
      verdict.disagreements.filter((row) => row.field === "primary_transport"),
    ).toEqual([]);
  });
});
