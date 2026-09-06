import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { wellKnownRoutes } from "@/routes/well-known";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
type Trust = Record<string, unknown> & {
  identity: string;
  signature: string;
  attestations: Array<{
    type: string; uri: string; mediaType: string;
  }>;
  trustSchema: { governanceUri: string };
  provenance: Array<{ relation: string; sourceId: string; sourceDigest: string }>;
};
type Manifest = { host: { trustManifest: Trust }; entries: Array<{ type: string; mediaType: string; url: string; trustManifest: Trust }> };

async function manifest(): Promise<Manifest> {
  const response = await SELF.fetch(`${BASE}/.well-known/ard.json`);
  expect(response.status).toBe(200);
  return response.json();
}

async function profile() {
  return await (await SELF.fetch(`${BASE}/attestation`, { headers: { Accept: "application/json" } })).json() as {
    artifact_classes: Array<{ id: string; signs: string; does_not_prove: string }>;
    ard_trust_verification: { anchor_check: string };
  };
}

async function catalogMatches(body: Manifest): Promise<boolean> {
  const copy = JSON.parse(JSON.stringify(body)) as {
    host: Record<string, unknown>; entries: Array<Record<string, unknown>>;
  };
  delete copy.host.trustManifest;
  for (const entry of copy.entries) delete entry.trustManifest;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(copy)));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const source = body.host.trustManifest.provenance?.find((row) => row.sourceId === `${BASE}/.well-known/ard.json`);
  return source?.sourceDigest === `sha256:${hex}`;
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}
function encode(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Independent serializer for this JSON-only fixture, never the production JCS helper.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function verify(trust: Trust, overrideKey?: JsonWebKey): Promise<boolean> {
  expect(typeof trust.signature).toBe("string");
  const parts = trust.signature.split(".");
  expect(parts).toHaveLength(3);
  const [header, payload, signature] = parts as [string, string, string];
  expect(payload).toBe("");
  const protectedHeader = JSON.parse(new TextDecoder().decode(decode(header))) as { alg: string; kid: string };
  expect(protectedHeader.alg).toBe("EdDSA");
  const did = await (await SELF.fetch(`${BASE}/.well-known/did.json`)).json() as {
    id: string; assertionMethod: string[];
    verificationMethod: Array<{ id: string; publicKeyJwk: JsonWebKey }>;
  };
  expect(did.assertionMethod).toContain(protectedHeader.kid);
  const jwk = did.verificationMethod.find((method) => method.id === protectedHeader.kid)!.publicKeyJwk;
  const directory = await (await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`)).json() as { public_key: string };
  expect([...decode(jwk.x!)].map((b) => b.toString(16).padStart(2, "0")).join("")).toBe(directory.public_key);
  const key = await crypto.subtle.importKey("jwk", overrideKey ?? jwk, { name: "Ed25519" }, false, ["verify"]);
  const { signature: omitted, ...unsigned } = trust;
  return crypto.subtle.verify("Ed25519", key, decode(signature), new TextEncoder().encode(`${header}.${encode(canonical(unsigned))}`));
}

describe("ARD trust signatures use the existing identity and publish their limits", () => {
  it("verifies offline with the certificate key, including every extracted entry", async () => {
    const body = await manifest();
    expect(await verify(body.host.trustManifest)).toBe(true);
    expect(body.host.trustManifest.identity).toBe(`did:web:${new URL(BASE).host}`);
    expect(body.entries.length).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(entry.trustManifest).toEqual(body.host.trustManifest);
      expect(entry.mediaType).toBe(entry.type);
    }
  });

  it("breaks when identity, anchor evidence, the profile or the signature are altered", async () => {
    const { host: { trustManifest: trust } } = await manifest();
    expect(await verify(trust)).toBe(true);
    for (const field of Object.keys(trust).filter((key) => key !== "signature")) {
      const changed = structuredClone(trust);
      changed[field] = "altered";
      expect(await verify(changed), field).toBe(false);
    }
    const changed = structuredClone(trust);
    changed.attestations[0]!.uri = "https://attacker.invalid/anchor-log.json";
    expect(await verify(changed)).toBe(false);
    const badSignature = { ...trust, signature: `${trust.signature.slice(0, -4)}AAAA` };
    expect(await verify(badSignature)).toBe(false);
    const [header, , signature] = trust.signature.split(".");
    const changedHeader = JSON.parse(new TextDecoder().decode(decode(header!))) as Record<string, unknown>;
    changedHeader.typ = "altered";
    expect(await verify({ ...trust, signature: `${encode(JSON.stringify(changedHeader))}..${signature}` })).toBe(false);
    expect(await verify(trust, { kty: "OKP", crv: "Ed25519", x: "PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw" })).toBe(false);
  });

  it("survives JSON reordering, and the signed provenance detects a copied trust envelope", async () => {
    const body = await manifest();
    expect(await verify(body.host.trustManifest)).toBe(true);
    expect(await catalogMatches(body)).toBe(true);
    const reordered = Object.fromEntries(Object.entries(body.host.trustManifest).reverse()) as Trust;
    expect(await verify(reordered)).toBe(true);
    const removed = structuredClone(body);
    removed.entries.pop();
    expect(await catalogMatches(removed)).toBe(false);
    const added = structuredClone(body);
    added.entries.push({ ...added.entries[0]!, url: "https://attacker.invalid/extra" });
    expect(await catalogMatches(added)).toBe(false);
    body.entries[0]!.url = "https://attacker.invalid/forged-resource";
    expect(await verify(body.host.trustManifest)).toBe(true);
    expect(await catalogMatches(body)).toBe(false);
    const limits = (await profile()).artifact_classes.find((row) => row.id === "ard_trust_manifest")!.does_not_prove;
    expect(limits).toMatch(/accurate today/i);
  });

  it("publishes the independent proof and continuity requirements without claiming verification", async () => {
    const { host: { trustManifest: trust } } = await manifest();
    expect(await verify(trust)).toBe(true);
    const attestation = trust.attestations.find((row) => row.uri === `${BASE}/.well-known/anchor-log.json`)!;
    expect(attestation).toBeDefined();
    expect(attestation.mediaType).toBe("application/json");
    expect(trust.trustSchema.governanceUri).toBe(`${BASE}/attestation#ard_trust_manifest`);
    const check = (await profile()).ard_trust_verification.anchor_check;
    expect(check).toMatch(/existed_by.status/);
    expect(check).toMatch(/bitcoin_confirmed or covered_by_later_anchor/);
    expect(check).toMatch(/Bitcoin block headers/);
    expect(check).toMatch(/checkpoint/);
    expect(check).toMatch(/declared_only/);
    expect(check).toMatch(/outgoing key/i);
    expect(trust).not.toHaveProperty("verified");
  });

  it("publishes the same byte boundary and limits on the attestation page", async () => {
    const { host: { trustManifest: trust } } = await manifest();
    expect(await verify(trust)).toBe(true);
    const spec = await profile();
    const row = spec.artifact_classes.find((entry) => entry.id === "ard_trust_manifest")!;
    expect(row).toBeDefined();
    expect(row.signs).toMatch(/RFC 8785/);
    const html = await (await SELF.fetch(trust.trustSchema.governanceUri, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain('id="ard_trust_manifest"');
    expect(html).toContain("accurate today");
    expect(html).toContain("Bitcoin block headers");
  });

  it("refuses a signing failure instead of silently returning an unsigned manifest", async () => {
    const response = await wellKnownRoutes.request("/.well-known/ard.json", {}, {
      ...env as Env, SIGNING_KEY: "invalid-test-key",
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("invalid-test-key");
  });
});
