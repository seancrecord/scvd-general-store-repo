import { describe, expect, it } from "vitest";
import {
  EVIDENCE_SCHEMA_V1,
  canonicalEvidenceBytes,
  envelopeCoverage,
  roundTrips,
  validateEnvelopePayload,
  type EvidenceEnvelopePayload,
} from "@/evidence";

/**
 * ROADMAP 1.1 ACCEPTANCE: the schema round-trips; the validator
 * rejects each malformed fixture. Every malformed fixture below is
 * the valid one with EXACTLY ONE thing wrong, and the assertion pins
 * the defect code — a fixture red for two reasons proves neither
 * (the battery discipline, applied to the envelope's own tests).
 */

function validPayload(): EvidenceEnvelopePayload {
  return {
    methodology: {
      schema: EVIDENCE_SCHEMA_V1,
      battery_version: "3.4.0",
    },
    subject: {
      endpoint: "https://example-door.com/api/paid",
      protocol: "x402",
      protocol_version: "v2",
      chain: "eip155:8453",
      rail: "usdc:eip155:8453",
    },
    observation: {
      status: 402,
      accepts_entries: 2,
    },
    evidence: {
      headers: { "content-type": "application/json" },
      body_sha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    },
    observer: {
      key_id: "scvd-2026-06",
      software_version: "0.1.0",
      battery_version: "3.4.0",
      vantage: "cloudflare-workers/single-vantage",
    },
    at: "2026-08-24T18:00:00Z",
    clock: "injected-test-clock",
    derived: {
      verdict: "challenge_well_formed",
      checks: {
        "x402.endpoint.status-402": "pass",
        "x402.endpoint.delivery": "not_checked",
      },
    },
    limitations: {
      does_not_prove: ["that paying this door yields goods"],
      not_checked: ["delivery"],
    },
    coverage: envelopeCoverage("preflight", {
      chain: "eip155:8453",
    })!,
    key: {
      key_id: "scvd-2026-06",
      in_service_from: "2026-06-01",
    },
    authorization: {
      key_registry_url: "https://scvd.store/.well-known/scvd-signing-key",
      anchor_log_url: "https://scvd.store/.well-known/anchor-log.json",
    },
  };
}

describe("the evidence envelope schema (1.1)", () => {
  it("accepts the valid fixture with zero defects", () => {
    const verdict = validateEnvelopePayload(validPayload());
    expect(verdict.ok).toBe(true);
  });

  it("round-trips: canonical bytes reparse to identical canonical bytes", () => {
    const payload = validPayload();
    expect(roundTrips(payload)).toBe(true);
    // And canonicalization is order-independent, which is the whole
    // point of JCS: a shuffled twin yields the same bytes.
    const shuffled = JSON.parse(
      JSON.stringify(payload),
    ) as EvidenceEnvelopePayload;
    expect(canonicalEvidenceBytes(shuffled)).toBe(
      canonicalEvidenceBytes(payload),
    );
  });

  it("the canonical bytes never contain a signature field", () => {
    // The easy mistake: handing the whole signed envelope where the
    // payload belongs. The bytes must be the RIGHT preimage anyway.
    const signed = { ...validPayload(), signature: "deadbeef" };
    const bytes = canonicalEvidenceBytes(signed);
    expect(bytes).not.toContain('"signature"');
    expect(bytes).toBe(canonicalEvidenceBytes(validPayload()));
  });
});

describe("the validator rejects each malformed fixture", () => {
  function expectDefect(payload: unknown, code: string): void {
    const verdict = validateEnvelopePayload(payload);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.defects).toContain(code);
      // One thing wrong, one defect — a fixture red twice proves
      // neither rule.
      expect(verdict.defects).toHaveLength(1);
    }
  }

  it("missing schema id", () => {
    const payload = validPayload();
    // @ts-expect-error deliberately corrupting the fixture
    payload.methodology = { battery_version: "3.4.0" };
    expectDefect(payload, "envelope.methodology.schema-missing");
  });

  it("missing battery version", () => {
    const payload = validPayload();
    payload.methodology = { schema: EVIDENCE_SCHEMA_V1 };
    expectDefect(payload, "envelope.methodology.battery-missing");
  });

  it("unregistered protocol family", () => {
    const payload = validPayload();
    // mpp is registered since 2026-09-04 (its battery exists); ap2 has no reader yet and stays unregistered.
    payload.subject.protocol = "ap2";
    expectDefect(payload, "subject.protocol.unregistered");
  });

  it("unregistered protocol version", () => {
    const payload = validPayload();
    payload.subject.protocol_version = "v9";
    expectDefect(payload, "subject.protocol_version.unregistered");
  });

  it("malformed CAIP-2 chain", () => {
    const payload = validPayload();
    payload.subject.chain = "base mainnet";
    expectDefect(payload, "subject.chain.caip2-grammar");
  });

  it("malformed rail", () => {
    const payload = validPayload();
    payload.subject.rail = "dogecoin:eip155:8453";
    expectDefect(payload, "subject.rail.malformed");
  });

  it("a chain we never met but well-formed is a VALID subject", () => {
    // The M2 rule: a new chain is a new row, never a schema change.
    const payload = validPayload();
    payload.subject.chain = "eip155:196";
    payload.subject.rail = "usdc:eip155:196";
    expect(validateEnvelopePayload(payload).ok).toBe(true);
  });

  it("a fourth check state", () => {
    const payload = validPayload();
    payload.derived.checks["x402.endpoint.status-402"] =
      "passed" as unknown as "pass";
    expectDefect(
      payload,
      "envelope.derived.check-state-invalid:x402.endpoint.status-402",
    );
  });

  it("a confidence scalar hiding inside derived", () => {
    const payload = validPayload();
    (payload.derived as unknown as Record<string, unknown>)["detail"] = {
      confidence: 0.93,
    };
    expectDefect(payload, "envelope.derived.refused-field:confidence");
  });

  it("limitations omitted instead of stated", () => {
    const payload = validPayload();
    // @ts-expect-error deliberately corrupting the fixture
    delete payload.limitations;
    expectDefect(payload, "envelope.limitations.missing");
  });

  it("an unnamed clock", () => {
    const payload = validPayload();
    payload.clock = "";
    expectDefect(payload, "envelope.clock.unnamed");
  });

  it("a local-time at", () => {
    const payload = validPayload();
    payload.at = "2026-08-24T14:00:00-04:00";
    expectDefect(payload, "envelope.at.not-utc-instant");
  });

  it("a key without its service window", () => {
    const payload = validPayload();
    // @ts-expect-error deliberately corrupting the fixture
    payload.key = { key_id: "scvd-2026-06" };
    expectDefect(payload, "envelope.key.window-missing");
  });

  it("coverage omitted instead of stated", () => {
    const payload = validPayload();
    // @ts-expect-error deliberately corrupting the fixture
    delete payload.coverage;
    expectDefect(payload, "envelope.coverage.missing");
  });

  it("an unregistered coverage class", () => {
    const payload = validPayload();
    payload.coverage.class_id = "vibes";
    expectDefect(payload, "envelope.coverage.class-unregistered");
  });

  it("missing authorization pointers", () => {
    const payload = validPayload();
    // @ts-expect-error deliberately corrupting the fixture
    delete payload.authorization;
    expectDefect(payload, "envelope.authorization.missing");
  });

  it("a defective envelope reports EVERY defect, not the first", () => {
    const payload = validPayload();
    payload.clock = "";
    payload.subject.chain = "base mainnet";
    const verdict = validateEnvelopePayload(payload);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.defects).toContain("envelope.clock.unnamed");
      expect(verdict.defects).toContain("subject.chain.caip2-grammar");
    }
  });
});
