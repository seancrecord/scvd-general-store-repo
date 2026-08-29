import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";
import { buildFixtureSet } from "@/lib/conformance-fixtures";
import { checkConformance } from "@/services/conformance";
import { cachedPublicKeyHex } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * THE FIXTURES DESK (2026-08-27). What an integrator will pin, held
 * here first: every fixture's promised verdict re-earned against the
 * desk, every signature re-verified over the canonical string with an
 * independent reconstruction, and the tamper cases proven to FAIL —
 * because a fixture set only exercised on its passing cases teaches
 * integrators to build gates that fail open.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

describe("the set holds its own promises", () => {
  it("every fixture's expectation matches the live desk, field by field", async () => {
    // buildFixtureSet already refuses on mismatch; running the loop
    // again HERE means a drift fails the suite even if someone later
    // weakens the route's refusal.
    const set = await buildFixtureSet(testEnv);
    expect(set.fixtures.length).toBeGreaterThanOrEqual(6);
    for (const fixture of set.fixtures) {
      const outcome = await checkConformance(
        fixture.call as Parameters<typeof checkConformance>[0],
        testEnv,
      );
      expect(outcome.status, fixture.id).toBe(200);
      const verdict = outcome.verdict as unknown as Record<string, unknown>;
      for (const [field, expected] of Object.entries(fixture.expect)) {
        expect(verdict[field], `${fixture.id}.${field}`).toBe(expected);
      }
    }
  });

  it("the canonical signed input is exactly what the signature covers", async () => {
    const set = await buildFixtureSet(testEnv);
    const storeKey = hexToBytes(await cachedPublicKeyHex(testEnv.SIGNING_KEY));
    for (const fixture of set.fixtures) {
      const [header, body, signature] = fixture.artifact.split(".");
      expect(fixture.canonical_signed_input, fixture.id).toBe(
        `${header}.${body}`,
      );
      if (fixture.id === "unknown-signer" || fixture.tampered_from) {
        continue;
      }
      // Independent verification: raw ed25519 over the canonical
      // string, no store code in the loop.
      const padded =
        (signature ?? "").replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - ((signature ?? "").length % 4)) % 4);
      const signatureBytes = Uint8Array.from(atob(padded), (ch) =>
        ch.charCodeAt(0),
      );
      const valid = await ed25519.verifyAsync(
        signatureBytes,
        new TextEncoder().encode(fixture.canonical_signed_input),
        storeKey,
      );
      expect(valid, `${fixture.id} signature over canonical input`).toBe(true);
    }
  });

  it("the tamper and unknown-signer cases FAIL, by construction", async () => {
    const set = await buildFixtureSet(testEnv);
    const failing = set.fixtures.filter(
      (fixture) =>
        fixture.tampered_from || fixture.id === "unknown-signer",
    );
    expect(failing.length).toBeGreaterThanOrEqual(3);
    for (const fixture of failing) {
      expect(fixture.expect["verdict"], fixture.id).toBe("does_not_conform");
    }
  });

  it("nothing served is payable: zero payTo, marked resourceUrl", async () => {
    const set = await buildFixtureSet(testEnv);
    for (const fixture of set.fixtures) {
      const payload = fixture.payload;
      if (typeof payload["payTo"] === "string") {
        expect(payload["payTo"], fixture.id).toBe(
          "0x0000000000000000000000000000000000000000",
        );
      }
      expect(String(payload["resourceUrl"]), fixture.id).toContain(
        "?fixture=conformance-desk",
      );
    }
  });

  it("the digest re-derives from the served artifacts", async () => {
    const set = await buildFixtureSet(testEnv);
    const canonical = JSON.stringify(
      set.fixtures.map((fixture) => ({
        id: fixture.id,
        artifact: fixture.artifact,
      })),
    );
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(set.fixture_set_digest).toBe(hex);
  });

  it("is deterministic: two builds, identical bytes", async () => {
    const first = await buildFixtureSet(testEnv);
    const second = await buildFixtureSet(testEnv);
    expect(first.fixture_set_digest).toBe(second.fixture_set_digest);
    expect(first.fixtures.map((f) => f.artifact)).toEqual(
      second.fixtures.map((f) => f.artifact),
    );
  });
});

describe("the door", () => {
  it("GET /api/conformance/v1/fixtures serves the set", async () => {
    const response = await SELF.fetch(`${BASE}/api/conformance/v1/fixtures`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["fixture_set_digest"]).toBeTruthy();
    expect(Array.isArray(body["fixtures"])).toBe(true);
    expect(body["signer_registry"]).toBeTruthy();
    const instructions = body["how_to_integrate_fail_closed"] as string[];
    expect(instructions.some((line) => line.includes("tamper"))).toBe(true);
  });
});
