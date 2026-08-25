import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  COVERAGE_REGISTRATIONS,
  KNOWN_CHAINS,
  PROTOCOL_FAMILIES,
  SANDBOX_CHAIN,
  coverageMatrix,
  envelopeCoverage,
  protocolFamily,
  publicCoverageDocument,
} from "@/evidence";
import { BASE_EVM, POLYGON_EVM } from "@/lib/base-rpc";
import {
  BASE_NETWORK,
  POLYGON_NETWORK,
  SOLANA_NETWORK,
} from "@/lib/payments";
import { SOLANA_CHAIN } from "@/lib/solana-rpc";

const BASE = "https://scvd.store";

/**
 * M1 / roadmap 1.4: the coverage matrix is DERIVED from registrations
 * that cite the chain ids the implementing modules already export.
 * A brochure that said "we observe three chains" used to be a
 * store-wide claim; the matrix says it per class, and `none` is a
 * value. This spec would fail if a registration pointed at an id
 * KNOWN_CHAINS does not know, or if a row omitted a known chain.
 */

describe("the coverage matrix is derived, not typed", () => {
  it("every registration's chain ids are in KNOWN_CHAINS", () => {
    const known = new Set(KNOWN_CHAINS);
    const strangers: string[] = [];
    for (const entry of COVERAGE_REGISTRATIONS) {
      for (const chain of Object.keys(entry.depths)) {
        if (!known.has(chain)) {
          strangers.push(`${entry.class_id}:${chain}`);
        }
      }
    }
    expect(strangers).toEqual([]);
  });

  it("every row states every known chain, sandbox included as none unless registered", () => {
    for (const row of coverageMatrix()) {
      expect(Object.keys(row.chains).sort()).toEqual([...KNOWN_CHAINS].sort());
      expect(row.chains[SANDBOX_CHAIN]).toBe("none");
    }
  });

  it("attestation and the statement read the three live rails the RPC modules name", () => {
    const attestation = coverageMatrix().find(
      (row) => row.class_id === "settlement_attestation",
    );
    expect(attestation?.chains[BASE_EVM.caip2]).toBe("read");
    expect(attestation?.chains[POLYGON_EVM.caip2]).toBe("read");
    expect(attestation?.chains[SOLANA_CHAIN]).toBe("read");
    expect(attestation?.chains[SANDBOX_CHAIN]).toBe("none");
  });

  it("the field walk is the till's Base rail, not a second typed id", () => {
    const walk = coverageMatrix().find((row) => row.class_id === "launch_check");
    expect(walk?.chains[BASE_NETWORK]).toBe("walk");
    expect(walk?.chains[POLYGON_NETWORK]).toBe("none");
    expect(walk?.chains[SOLANA_NETWORK]).toBe("none");
  });

  it("the till cites the same three rail constants payments.ts exports", () => {
    const till = coverageMatrix().find((row) => row.class_id === "till");
    expect(till?.chains[BASE_NETWORK]).toBe("till");
    expect(till?.chains[POLYGON_NETWORK]).toBe("till");
    expect(till?.chains[SOLANA_NETWORK]).toBe("till");
  });

  it("a class without a chain dimension reports none on the subject chain", () => {
    const block = envelopeCoverage("preflight", { chain: "none" });
    expect(block?.depth).toBe("none");
    expect(block?.class_row[BASE_NETWORK]).toBe("challenge");
  });

  it("an unknown class cannot mint a coverage block", () => {
    expect(envelopeCoverage("vibes", { chain: BASE_NETWORK })).toBeNull();
  });

  it("discovery surfaces are protocol-registry rows, not a schema change", () => {
    for (const id of [
      "x402_bazaar",
      "mcp_card",
      "a2a_agent_card",
      "llms_txt",
      "openapi",
      "menu_json",
    ]) {
      expect(protocolFamily(id), id).toBeDefined();
    }
    expect(protocolFamily("discovery_coherence")).toBeDefined();
    expect(protocolFamily("schema_coherence")).toBeDefined();
    expect(PROTOCOL_FAMILIES.some((family) => family.id === "mpp")).toBe(false);
  });
});

describe("the coverage document is served, not restated", () => {
  it("GET /.well-known/coverage.json is the publicCoverageDocument", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/coverage.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { matrix: unknown; schema: string };
    expect(body.schema).toBe("scvd-coverage/v1");
    expect(body.matrix).toEqual(publicCoverageDocument(BASE).matrix);
  });

  it("GET /coverage.json is the same document", async () => {
    const wellKnown = await (
      await SELF.fetch(`${BASE}/.well-known/coverage.json`)
    ).json();
    const alias = await (await SELF.fetch(`${BASE}/coverage.json`)).json();
    expect(alias).toEqual(wellKnown);
  });
});
