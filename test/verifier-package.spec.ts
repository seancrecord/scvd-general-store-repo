import { describe, expect, it } from "vitest";
import packageJson from "../verifier/package.json";
import readme from "../verifier/README.md";
import license from "../verifier/LICENSE?raw";
import verifierSource from "../verifier/x402-verify.js?raw";
import typesSource from "../verifier/x402-verify.d.ts?raw";
import changelog from "../verifier/CHANGELOG.md?raw";
import receiptValid from "../verifier/fixtures/receipt-valid.json";
import receiptWrongKey from "../verifier/fixtures/receipt-wrong-key.json";
import receiptMissingPayer from "../verifier/fixtures/receipt-missing-payer.json";
import offerExpired from "../verifier/fixtures/offer-expired-but-wellformed.json";
import offerTampered from "../verifier/fixtures/offer-tampered-payload.json";
import issuerKeyDocument from "../verifier/fixtures/issuer-key-document.json";
import { DOES_NOT_ESTABLISH, VERIFICATION_URL, verifyOffer, verifyReceipt } from "../verifier/x402-verify.js";

/**
 * THE PACKAGE MANIFEST IS A SET OF CLAIMS, AND CLAIMS GET TESTS.
 *
 * verifier/ became a publishable npm package on 2026-08-03 (the
 * recognition research's "code that imports the service" channel —
 * the one compounding, agent-readable channel we could open from an
 * asset that already existed). Publishing stays keeper-hands per rule
 * 30; what CI holds is that the thing his hand publishes is the thing
 * this repo tested.
 *
 * Everything ships in via vite imports rather than node:fs — the
 * pool has no filesystem, and an import that fails is a louder
 * "file is missing" than any existsSync. The first version of this
 * spec used node:fs and collected ZERO tests under workerd while
 * printing nothing about why; a spec that cannot load is
 * indistinguishable from a spec that passed, which is the vacuous-
 * pass shape this suite keeps hunting in its own instruments.
 */

const manifest = packageJson as Record<string, unknown>;

describe("the npm package tells the truth about itself", () => {
  it("ships exactly the six entries it names: the module, its types, the fixtures, the changelog, the README, the licence", () => {
    const files = manifest["files"] as string[];
    expect([...files].sort()).toEqual(
      ["CHANGELOG.md", "LICENSE", "README.md", "fixtures/", "x402-verify.d.ts", "x402-verify.js"].sort(),
    );
    expect(changelog).toContain(`## ${manifest["version"]} — `);
    // The imports at the top of this file are the existence check:
    // any of these missing fails at build, before a single test runs.
    expect(license).toContain("MIT License");
    expect(verifierSource).toContain("export async function verifyArtifact");
    expect(typesSource).toContain("verifyArtifact");
  });

  it("has zero dependencies, which is the package's whole pitch", () => {
    // "Zero-dependency" appears in the description and the README.
    // A dependency added later must fail here first, loudly, because
    // it breaks the promise every consumer installed on.
    expect(manifest["dependencies"]).toBeUndefined();
    expect(manifest["peerDependencies"]).toBeUndefined();
    expect(manifest["optionalDependencies"]).toBeUndefined();
    expect(String(manifest["description"])).toContain("Zero-dependency");
  });

  it("exports point at the files that ship", () => {
    const exportsMap = manifest["exports"] as Record<
      string,
      { types: string; default: string }
    >;
    const entry = exportsMap["."];
    expect(entry).toBeDefined();
    const files = manifest["files"] as string[];
    expect(files).toContain(entry!.default.replace("./", ""));
    expect(files).toContain(entry!.types.replace("./", ""));
  });

  it("the README carries no vector counts to rot", () => {
    // Yesterday's v1→v2 vector change (3 valid / 10 invalid, was 2/3)
    // caught this README asserting stale counts in prose. The fix is
    // structural: the README points at the vector set, which carries
    // its own counts, and never states one.
    expect(readme).not.toMatch(/\d+\s+valid and \d+\s+invalid/);
    expect(readme).toContain(
      "scvd.store/.well-known/conformance/offer-receipt-vectors.json",
    );
  });

  it("the README names the reference deployment and its live counterpart", () => {
    expect(readme).toContain("/api/conformance/v1");
    // Whitespace-tolerant: prose wraps, and a hard line break inside
    // the phrase must not read as the promise having been removed.
    expect(readme.replace(/\s+/g, " ")).toContain("no call home");
  });

  it("nothing ships beyond the six entries — no process docs in the tarball", () => {
    // PUBLISH.md lived here briefly and was deleted 2026-08-03 after
    // the first publish (keeper's call): an internal process doc in a
    // public repo describes key handling to strangers for no reader's
    // benefit. The publish record lives in the TASKS archive; the
    // versioning policy is the CHANGELOG's own first paragraph since
    // 1.1.0. The files array staying exactly six is the guard.
    const files = manifest["files"] as string[];
    expect(files).toHaveLength(6);
    expect(files.some((file) => /publish/i.test(file))).toBe(false);
    expect(changelog).toContain("Semantic versions");
  });
});

/**
 * THE ONE-CALL FRONT DOOR (1.1.0, 2026-09-03, roadmap A1). One call,
 * bounded evidence back; the key never comes from the artifact; the
 * fixtures that ship are the published vectors' bytes.
 */
describe("verifyReceipt and verifyOffer return bounded evidence", () => {
  it("a valid receipt against the key the caller holds: valid, a scope naming the key, what it does not establish, where to reproduce it", async () => {
    const result = await verifyReceipt({ receipt: receiptValid.receipt, publicKey: receiptValid.publicKeyHex });
    expect(result.valid).toBe(true);
    expect(result.kind).toBe("receipt");
    expect(result.scope).toContain("the key supplied by the caller");
    expect(result.doesNotEstablish).toEqual([...DOES_NOT_ESTABLISH.receipt]);
    expect(result.doesNotEstablish.join(" ")).toMatch(/settlement/);
    expect(result.doesNotEstablish.join(" ")).toMatch(/delivery/);
    expect(result.verificationUrl).toBe(VERIFICATION_URL);
    expect(result.issuer.kid).toBe(receiptValid.kid);
  });

  it("the same receipt against a key that did not sign it fails on the signature and says so", async () => {
    const result = await verifyReceipt({ receipt: receiptWrongKey.receipt, publicKey: receiptWrongKey.publicKeyHex });
    expect(result.valid).toBe(false);
    expect(result.scope).toMatch(/^Not verified: signature:/);
    expect(result.checks.find((check) => check.name === "signature")?.ok).toBe(false);
  });

  it("a receipt missing a required field fails on the schema, never silently", async () => {
    const result = await verifyReceipt({ receipt: receiptMissingPayer.receipt, publicKey: receiptMissingPayer.publicKeyHex });
    expect(result.valid).toBe(false);
    expect(result.scope).toContain("schema");
  });

  it("resolves the issuer's key from issuerKeyUrl, never from the artifact, and names the URL in the scope", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify(issuerKeyDocument), { status: 200 })) as unknown as typeof fetch;
    const result = await verifyReceipt(
      { receipt: receiptValid.receipt, issuerKeyUrl: "https://issuer.test/.well-known/did.json" },
      { fetch: fetchImpl },
    );
    expect(result.valid).toBe(true);
    expect(result.scope).toContain("https://issuer.test/.well-known/did.json");
    expect(result.issuer.keyUrl).toBe("https://issuer.test/.well-known/did.json");
    const missing = await verifyReceipt(
      { receipt: receiptValid.receipt, issuerKeyUrl: "https://issuer.test/nothing.json" },
      { fetch: (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch },
    );
    expect(missing.valid).toBe(false);
    expect(missing.scope).toContain("HTTP 404");
  });

  it("an expired offer is valid bytes with expiry advisory; a tampered one is not", async () => {
    const expired = await verifyOffer({ offer: offerExpired.offer, publicKey: offerExpired.publicKeyHex });
    expect(expired.valid).toBe(true);
    expect(expired.checks.find((check) => check.name === "expiry")?.ok).toBe(false);
    expect(expired.doesNotEstablish).toEqual([...DOES_NOT_ESTABLISH.offer]);
    const tampered = await verifyOffer({ offer: offerTampered.offer, publicKey: offerTampered.publicKeyHex });
    expect(tampered.valid).toBe(false);
  });

  it("refuses a missing artifact plainly", async () => {
    const result = await verifyReceipt({} as never);
    expect(result.valid).toBe(false);
    expect(result.scope).toContain("input.receipt");
  });
});
