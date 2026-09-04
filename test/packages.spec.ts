import { describe, expect, it } from "vitest";
import ciYml from "../.github/workflows/ci.yml?raw";
import rootPackage from "../package.json";
import snapshot from "../defects/defects.json";
import defectsPackage from "../defects/package.json";
import preflightPackage from "../x402-preflight/package.json";
import corpusPackage from "../corpus-client/package.json";
import starterPackage from "../mcp-starter/package.json";
import { DEFECT_CLASSES, DEFECT_VOCABULARY_VERSION, EVIDENCE_LABELS, VOCABULARY_CHANGELOG } from "@/store/defect-vocabulary";

/**
 * THE PACKAGES (2026-09-03, roadmap C5b). What this file holds:
 *
 *   - scvd-defects ships the tree's own vocabulary: the snapshot is
 *     the classes, labels and changelog exactly, at the served version,
 *     and the package's minor version is that version — so a vocabulary
 *     change fails here until `npm run defects:cut` is run;
 *   - every package names its directory in the repository field and
 *     ships a README, a licence and a changelog;
 *   - CI runs the packages' suites as a named step and the gates do too.
 */

const files: Record<string, string> = {
  ...(import.meta.glob("../x402-preflight/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../corpus-client/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../defects/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../mcp-starter/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
};

describe("scvd-defects carries the tree's vocabulary, not a copy that can drift", () => {
  it("is the classes, the labels and the changelog exactly, at the served version", () => {
    expect(snapshot.version, "run: npm run defects:cut").toBe(DEFECT_VOCABULARY_VERSION);
    expect(snapshot.classes, "run: npm run defects:cut").toEqual(JSON.parse(JSON.stringify(DEFECT_CLASSES)));
    expect(snapshot.evidence_labels).toEqual(JSON.parse(JSON.stringify(EVIDENCE_LABELS)));
    expect(snapshot.changelog).toEqual(JSON.parse(JSON.stringify(VOCABULARY_CHANGELOG)));
    expect(defectsPackage.version.split(".")[1]).toBe(DEFECT_VOCABULARY_VERSION);
  });
});

describe("every package is shaped like the ones already published", () => {
  const packages = [
    ["x402-preflight", preflightPackage],
    ["corpus-client", corpusPackage],
    ["defects", defectsPackage],
    ["mcp-starter", starterPackage],
  ] as const;

  it("names its directory, and ships a README, a licence and a dated changelog", () => {
    for (const [directory, manifest] of packages) {
      expect(manifest.repository.directory, manifest.name).toBe(directory);
      expect(manifest.license).toBe("MIT");
      for (const shipped of ["README.md", "LICENSE", "CHANGELOG.md"]) {
        expect(manifest.files, `${manifest.name} does not ship ${shipped}`).toContain(shipped);
        expect(files[`../${directory}/${shipped}`], `${directory}/${shipped} is missing`).toBeTruthy();
      }
      expect(files[`../${directory}/CHANGELOG.md`]).toMatch(new RegExp(`## ${manifest.version.replace(/\\./g, "\\\\.")} — \\d{4}-\\d{2}-\\d{2}`));
      expect(files[`../${directory}/README.md`]).toMatch(/## Versioning/);
      expect(Object.keys(manifest).includes("dependencies"), `${manifest.name} has dependencies`).toBe(false);
    }
  });

  it("CI runs the packages' suites as a named step, and so do the gates", () => {
    expect(rootPackage.scripts["packages:test"]).toContain("x402-preflight");
    expect(rootPackage.scripts["packages:test"]).toContain("mcp-starter");
    expect(rootPackage.scripts["gates"]).toContain("npm run packages:test");
    expect(ciYml).toMatch(/- name: The packages\n\s+run: npm run packages:test/);
  });
});
