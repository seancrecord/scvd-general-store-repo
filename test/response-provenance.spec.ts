import { describe, expect, it } from "vitest";
import {
  RESPONSE_PROVENANCE_CLASS,
  canonicalizerIsFit,
  checkResponseProvenance,
} from "@/services/response-provenance";
import { jcsCanonicalize } from "@/lib/jcs";

// A well-formed GVP-shaped response whose responseHash is correct by construction.
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return (
    "sha256:" +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

const INPUTS = { state: "DE" };
const FP = {
  endpoint: "/v1/llc-cost",
  inputs: INPUTS,
  result: { filingFee: 110, franchiseFlat: 300, year1Total: 410 },
  method: "year1 = filingFee + franchiseFlat",
  dataVintage: "2026-07",
};

async function goodArtifact(): Promise<{ response: Record<string, unknown>; inputs: unknown }> {
  return {
    inputs: INPUTS,
    response: {
      endpoint: FP.endpoint,
      /*
       * A COPY, NOT THE MODULE-LEVEL OBJECT.
       *
       * Handing back FP.result by reference makes every fixture share
       * one object, so any case that mutates what it was given edits
       * the source of every later case. The oversized case below pads
       * the result past MAX_RESPONSE_PROVENANCE_CHARS; with a shared
       * reference that padding is permanent, and every subsequent
       * artifact exceeds the ceiling and comes back
       * `applies: false, ok: null` instead of the refusal each case
       * is actually asserting about.
       */
      result: structuredClone(FP.result),
      provenance: {
        method: FP.method,
        dataVintage: FP.dataVintage,
        responseHash: await sha256Hex(jcsCanonicalize(FP)),
      },
    },
  };
}

describe("response-provenance re-derivation (GVP)", () => {
  it("GVP §8.1: the desk's canonicalizer reproduces the published vectors", async () => {
    expect(await canonicalizerIsFit()).toBe(true);
  });

  it("a correct responseHash re-derives (ok, not a finding)", async () => {
    const r = await checkResponseProvenance(await goodArtifact());
    expect(r.applies).toBe(true);
    expect(r.self_ok).toBe(true);
    expect(r.ok).toBe(true);
    // A pass carries NO class slug — a defect-class name on a clean host is a false accusation.
    expect(r.class).toBeNull();
  });

  it("an oversized response_provenance is refused, not re-derived", async () => {
    const a = await goodArtifact();
    (a.response.result as Record<string, unknown>).padding = "x".repeat(70_000);
    const r = await checkResponseProvenance(a);
    expect(r.applies).toBe(false);
    expect(r.ok).toBeNull();
    expect(r.class).toBeNull();
  });

  const mutations: Array<[string, (a: { response: Record<string, unknown>; inputs: unknown }) => void]> = [
    ["result mutated", (a) => ((a.response.result as Record<string, unknown>).year1Total = 999)],
    ["inputs mutated", (a) => (a.inputs = { state: "CA" })],
    ["endpoint swapped", (a) => (a.response.endpoint = "/v1/paycheck")],
    ["method reworded", (a) => ((a.response.provenance as Record<string, unknown>).method = "x")],
    ["dataVintage changed", (a) => ((a.response.provenance as Record<string, unknown>).dataVintage = "2026-08")],
  ];
  for (const [label, mutate] of mutations) {
    it(`adversarial: ${label} -> a finding`, async () => {
      const a = await goodArtifact();
      mutate(a);
      const r = await checkResponseProvenance(a);
      expect(r.ok).toBe(false);
      expect(r.class).toBe(RESPONSE_PROVENANCE_CLASS);
    });
  }

  it("the finding is a disjunction that names neither branch and carries falsified_by + scope", async () => {
    const a = await goodArtifact();
    (a.response.result as Record<string, unknown>).year1Total = 1;
    const r = await checkResponseProvenance(a);
    expect(r.asserts).toMatch(/Either the artifact was altered, or it was issued/);
    expect(r.asserts).toMatch(/cannot and does not say which/);
    expect(r.falsified_by).toBeTruthy();
    expect(r.scope).toMatch(/THIS IS THE ARTIFACT YOU GAVE US/);
    expect(r.scope).not.toMatch(/origin fetch/i); // it must not claim to have fetched anything
  });

  it("a missing fixed-point member is a finding, not a pass", async () => {
    const a = await goodArtifact();
    delete (a.response.provenance as Record<string, unknown>).dataVintage;
    const r = await checkResponseProvenance(a);
    expect(r.ok).toBe(false);
    expect(r.class).toBe(RESPONSE_PROVENANCE_CLASS);
  });

  it("no declared responseHash -> not applicable (not a finding)", async () => {
    const a = await goodArtifact();
    delete (a.response.provenance as Record<string, unknown>).responseHash;
    const r = await checkResponseProvenance(a);
    expect(r.applies).toBe(false);
    expect(r.ok).toBeNull();
    expect(r.class).toBeNull();
  });

  it("no response object -> applies:false, nothing re-derived", async () => {
    const r = await checkResponseProvenance({ inputs: INPUTS });
    expect(r.applies).toBe(false);
    expect(r.ok).toBeNull();
  });
});
