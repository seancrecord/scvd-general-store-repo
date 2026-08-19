import * as ed25519 from "@noble/ed25519";
import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Certificate } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE COLD READ, EXTENDED TO THE REMAINING SIGNED SURFACES (B8).
 *
 * The method's record: on 2026-07-30 it found two certificate defects
 * that 446 tests had missed, because every one of those tests verified
 * through the same function that signed — sign with f, verify with f,
 * and f's blind spots are invisible forever. verify-as-a-stranger.spec
 * closed that hole for certificates; these tests close it for the
 * trust list, the house ledger, the stack disclosure, and the badge.
 *
 * The rule, same as there: nothing from src/lib/signing. The payload
 * is rebuilt from the SERVED bytes exactly the way each surface's own
 * signature_covers instruction says to — "every field above signature,
 * in the order served" — and checked with the raw library against the
 * key the surface hands out AND the key at the well-known door. If
 * either arrangement ever fails, a stranger following our printed
 * instructions cannot check the document, whatever our own helpers
 * think.
 */

const HEX = /^[0-9a-f]+$/;

function bytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * The instruction, followed literally: every field above `signature`,
 * in the order served. JSON member order survives parse/stringify in
 * JS, so this reproduces the signed bytes — unless a surface ever
 * drifts from its own instruction, which is the failure this exists
 * to catch (a field slipped in AFTER signature would be served
 * unsigned and unverifiable, exactly the certificates defect's shape).
 */
function strangerPayload(body: Record<string, unknown>): string {
  const above: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "signature") break;
    above[key] = value;
  }
  return JSON.stringify(above);
}

async function verifyRaw(
  payload: string,
  signature: string,
  publicKey: string,
): Promise<boolean> {
  if (!HEX.test(signature) || !HEX.test(publicKey)) return false;
  return ed25519.verifyAsync(
    bytes(signature),
    new TextEncoder().encode(payload),
    bytes(publicKey),
  );
}

async function fetchSurface(path: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  expect(response.status, `${path} did not answer 200`).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function wellKnownKey(): Promise<string> {
  const body = await fetchSurface("/.well-known/scvd-signing-key");
  return String(body["public_key"]);
}

const SIGNED_SURFACES = ["/trust-list.json", "/house-ledger.json", "/stack"];

describe("the signed surfaces verify with nothing but their own bytes", () => {
  for (const path of SIGNED_SURFACES) {
    it(`${path} verifies coldly, against its key and the well-known one`, async () => {
      const body = await fetchSurface(path);
      expect(body["signature"], `${path} serves no signature`).toBeTruthy();
      const payload = strangerPayload(body);
      expect(
        await verifyRaw(
          payload,
          String(body["signature"]),
          String(body["public_key"]),
        ),
        `${path}: rebuilding "every field above signature, in the order served" does not verify — a stranger following the printed instruction cannot check this document`,
      ).toBe(true);
      // The key on the surface must be the key at the door; a surface
      // quietly signing with a stray key would still self-verify.
      expect(String(body["public_key"])).toBe(await wellKnownKey());
    });
  }

  it("a tampered field breaks the signature, so the coverage is real", async () => {
    const body = await fetchSurface("/stack");
    const tampered = { ...body, version: "forged" };
    expect(
      await verifyRaw(
        strangerPayload(tampered),
        String(body["signature"]),
        String(body["public_key"]),
      ),
      "changing a served field left the signature valid — the signature does not actually cover the document",
    ).toBe(false);
  });
});

describe("the badge closes its loop back to the crypto", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("a real patron's badge names a verify URL that actually verifies", async () => {
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const paid = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    const purchase = (await paid.json()) as Record<string, unknown>;
    const cert = purchase["certificate"] as Certificate;

    const badge = await SELF.fetch(
      `${BASE}/badges/${cert.patron_number}.svg`,
    );
    expect(badge.status).toBe(200);
    expect(badge.headers.get("Content-Type")).toContain("image/svg+xml");
    const svg = await badge.text();
    // The badge's one checkable claim is the verify URL it prints.
    expect(svg).toContain(`/api/verify/${cert.cert_id}`);

    // Follow it the way a stranger reading the badge would.
    const verified = (await (
      await SELF.fetch(`${BASE}/api/verify/${cert.cert_id}`)
    ).json()) as Record<string, unknown>;
    expect(verified["valid"]).toBe(true);
    expect(
      await verifyRaw(
        String(verified["signed_payload"]),
        String(verified["signature"]),
        String(verified["public_key"]),
      ),
      "the badge points at a verify URL whose bytes do not check out",
    ).toBe(true);
  });

  it("no badge hangs on the wall for a number nobody holds", async () => {
    expect((await SELF.fetch(`${BASE}/badges/999999.svg`)).status).toBe(404);
  });

  it("the free sticker is served and is actually an SVG", async () => {
    const sticker = await SELF.fetch(`${BASE}/badges/sticker.svg`);
    expect(sticker.status).toBe(200);
    expect(await sticker.text()).toContain("<svg");
  });
});
