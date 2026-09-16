import { describe, expect, it } from "vitest";
import ciYml from "../.github/workflows/ci.yml?raw";
import readme from "../README.md?raw";
import publishYml from "../.github/workflows/publish-npm.yml?raw";
import rootPackage from "../package.json";
import snapshot from "../defects/defects.json";
import defectsPackage from "../defects/package.json";
import NPM_CONTENT from "../registry/npm-content.json";
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

/**
 * THE FIXTURES THE PACKAGE SHIPS ARE THE TREE'S (2026-09-12). scvd-defects
 * carries recorded doors and settlement responses so a client can be
 * tested offline; the copies under defects/fixtures were kept by hand
 * and nothing held them to test/fixtures. Now a fixture added or
 * changed in the tree fails here until the package copy matches,
 * byte for byte — the same discipline the vocabulary snapshot has.
 */
const treeFixtures: Record<string, string> = {
  ...(import.meta.glob("./fixtures/doors/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("./fixtures/settlement-responses/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
};
const packageFixtures: Record<string, string> = {
  ...(import.meta.glob("../defects/fixtures/doors/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../defects/fixtures/settlement-responses/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
};

describe("scvd-defects ships the tree's fixtures, byte for byte", () => {
  it("every recorded door and settlement response in test/fixtures is in defects/fixtures, and nothing else is", () => {
    const strip = (path: string) => path.replace(/^.*\/fixtures\//, "");
    const tree = Object.fromEntries(Object.entries(treeFixtures).map(([path, raw]) => [strip(path), raw]));
    const shipped = Object.fromEntries(Object.entries(packageFixtures).map(([path, raw]) => [strip(path), raw]));
    expect(Object.keys(tree).length).toBeGreaterThan(0);
    expect(Object.keys(shipped).sort(), "cp test/fixtures/{doors,settlement-responses}/*.json into defects/fixtures/").toEqual(Object.keys(tree).sort());
    for (const [name, raw] of Object.entries(tree)) {
      expect(shipped[name], `defects/fixtures/${name} differs from test/fixtures/${name}`).toBe(raw);
    }
  });
});

/**
 * THE RECORD OF WHAT EACH PACKAGE SHIPS (2026-09-13).
 *
 * scvd-defects 0.14.0 went to npm at 18:32Z on 2026-09-12. At 20:25Z
 * the fixture-provenance change merged and rewrote every file under
 * `defects/fixtures/`, with no version bump, because nothing required
 * one: the guard above holds the package's fixture copies to the
 * tree's, and both moved together. So one version number named two
 * different sets of bytes, and `npm run listings:check` compared the
 * numbers and said they agreed.
 *
 * `registry/npm-content.json` closes it: a per-file sha256 of exactly
 * what each package ships, at the version in its manifest, cut by
 * `npm run npm-content:cut`, which REFUSES to record changed bytes
 * under an unchanged version. This file is the guard on that guard —
 * a stale record would silently disarm the refusal, which is the
 * failure test/published-record.spec.ts was written for after the
 * same shape went wrong on the ClawHub bundle.
 *
 * It says nothing about any registry. Once a version is bumped,
 * listings:check reports the tree ahead of npm until a human presses
 * the publish workflow.
 */
const shipped: Record<string, string> = {
  ...(import.meta.glob("../x402-preflight/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../x402-preflight/fixtures/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../corpus-client/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../defects/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../defects/fixtures/doors/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../defects/fixtures/settlement-responses/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../mcp-starter/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
};

describe("the record of what each package ships is the tree's, at the tree's version", () => {
  const manifests: Record<string, { version: string }> = {
    "scvd-preflight": preflightPackage,
    "scvd-corpus-client": corpusPackage,
    "scvd-defects": defectsPackage,
    "scvd-mcp-starter": starterPackage,
  };

  it("names every publishable package, at the version its manifest carries", () => {
    expect(Object.keys(NPM_CONTENT.packages).sort()).toEqual(Object.keys(manifests).sort());
    for (const [name, entry] of Object.entries(NPM_CONTENT.packages)) {
      expect(entry.version, `${name}: run npm run npm-content:cut`).toBe(manifests[name]!.version);
      expect(Object.keys(entry.files).length, `${name} ships nothing`).toBeGreaterThan(0);
      // package.json is always shipped, whatever the files list says.
      expect(Object.keys(entry.files)).toContain("package.json");
    }
  });

  it("records the sha256 of exactly the bytes in the tree, file for file", async () => {
    for (const [name, entry] of Object.entries(NPM_CONTENT.packages)) {
      for (const [file, recorded] of Object.entries(entry.files)) {
        const bytes = shipped[`../${entry.directory}/${file}`];
        expect(bytes, `${entry.directory}/${file} is recorded but not in the tree`).toBeTruthy();
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bytes!));
        const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
        expect(hex, `${name}: ${file} changed — run npm run npm-content:cut (it refuses without a version bump)`).toBe(recorded);
      }
    }
  });

  it("records every fixture the packages ship, so a new one cannot slip in unrecorded", () => {
    const recorded = new Set(
      Object.entries(NPM_CONTENT.packages).flatMap(([, entry]) =>
        Object.keys(entry.files).map((file) => `../${entry.directory}/${file}`),
      ),
    );
    const fixturesInTree = Object.keys(shipped).filter((path) => path.includes("/fixtures/"));
    expect(fixturesInTree.length).toBeGreaterThan(0);
    for (const path of fixturesInTree) {
      expect(recorded.has(path), `${path} is shipped but not recorded — run npm run npm-content:cut`).toBe(true);
    }
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

// Keep the first-release selection, directory mapping and test route together.
describe.each([corpusPackage, defectsPackage, starterPackage, preflightPackage])("$name can take the provenance publication path", (manifest) => {
  it("is selectable, resolves its manifest directory and runs its own tests", () => {
    const name = manifest.name;
    const directory = manifest.repository.directory;
    expect(publishYml).toContain(`- ${name}\n`);
    const lines = publishYml.split("\n").map((line) => line.trim().replace(/\s+/g, " "));
    expect(lines).toContain(`${name}) DIR=${directory} ;;`);
    expect(lines).toContain(`${name}) node --test ${directory}/*.test.mjs ;;`);
  });
});

/**
 * THE MAP HAS TO COVER THE TREE (2026-09-16).
 *
 * README.md carries a directory map that names each publishable
 * directory beside the package it becomes. It is the first place
 * anybody looks to find out what is in here, which makes it the first
 * place that can lie by omission.
 *
 * IT DID. x402-preflight-py/ and x402-preflight-go/ were published to
 * PyPI and the Go module proxy and never added to the map, so for the
 * length of a day the map said this repository holds one preflight
 * client when it holds three. Nothing failed, because nothing was
 * checking — a map that is a subset of the tree reads as complete, and
 * that is worse than no map at all.
 *
 * So the map is now derived against, not trusted. Every top-level
 * directory carrying a package manifest — package.json, pyproject.toml
 * or go.mod, which is to say every directory that CAN be published —
 * must appear in the map. The set comes from the tree at build time via
 * import.meta.glob rather than from a list somebody has to remember to
 * edit, because a hand-maintained list of things-to-check has the exact
 * failure mode this test exists to catch.
 *
 * This is deliberately one-directional. A directory in the map without
 * a manifest is fine and there are several — till/, src/, action/ — and
 * they are there because a reader needs them, which is the map's job.
 * The rule is only that nothing publishable is invisible.
 */
describe("the README's directory map covers everything publishable", () => {
  const MANIFESTS: Record<string, string> = {
    ...(import.meta.glob("../*/package.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
    ...(import.meta.glob("../*/pyproject.toml", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
    ...(import.meta.glob("../*/go.mod", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  };

  /** Top-level directory names that carry a manifest, deduped. */
  const publishable = [
    ...new Set(
      Object.keys(MANIFESTS)
        .map((path) => path.split("/")[1]!)
        .filter((dir) => dir !== "node_modules"),
    ),
  ].sort();

  it("finds the publishable directories from the tree, not from a list", () => {
    // If this number moves, a package was added or removed — which is
    // exactly when the map below needs looking at.
    expect(publishable.length, `found: ${publishable.join(", ")}`).toBeGreaterThanOrEqual(10);
    expect(publishable).toContain("x402-preflight");
    expect(publishable).toContain("x402-preflight-py");
    expect(publishable).toContain("x402-preflight-go");
  });

  it.each(publishable)("names %s in the map", (dir) => {
    // The map's own spelling: the directory at the start of a line,
    // with its trailing slash, the way every existing entry is written.
    const named = new RegExp(`^${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "m").test(readme);
    expect(
      named,
      `${dir}/ carries a package manifest but does not appear in README.md's directory map. ` +
        `A reader looking for it will not find it. Add a line for it beside the others.`,
    ).toBe(true);
  });
});
