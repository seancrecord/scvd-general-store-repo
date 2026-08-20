import { describe, expect, it } from "vitest";
import packageJson from "../verifier/package.json";
import readme from "../verifier/README.md";
import license from "../verifier/LICENSE?raw";
import verifierSource from "../verifier/x402-verify.js?raw";
import typesSource from "../verifier/x402-verify.d.ts?raw";

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
  it("ships exactly the four files it names", () => {
    const files = manifest["files"] as string[];
    expect(files.sort()).toEqual(
      ["LICENSE", "README.md", "x402-verify.d.ts", "x402-verify.js"].sort(),
    );
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

  it("nothing ships beyond the four files — no process docs in the tarball", () => {
    // PUBLISH.md lived here briefly and was deleted 2026-08-03 after
    // the first publish (keeper's call): an internal process doc in a
    // public repo describes key handling to strangers for no reader's
    // benefit. The publish record and versioning policy live in
    // the TASKS archive; the files array staying exactly four is the guard.
    const files = manifest["files"] as string[];
    expect(files).toHaveLength(4);
  });
});
