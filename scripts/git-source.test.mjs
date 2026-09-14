import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LAYER3,
  levelFromSubject,
  parseLog,
  prNumberFrom,
  readLayer3,
  touchesSpec,
} from "./lib/git-source.mjs";
import { flattenUpdates, isHousekeeping, isConsequential, scoreRow } from "./lib/protocol-screen.mjs";

const REC = "\x1e";
const F = "\x1f";

const x402 = LAYER3.find((s) => s.key === "x402");

/** Build log output the way `git log --name-only` actually emits it. */
function log(commits) {
  return commits.map((c) =>
    `${REC}${c.sha}${F}${c.date}${F}${c.author}${F}${c.subject}${F}${c.body ?? ""}${F}\n\n${(c.files ?? []).join("\n")}\n`
  ).join("");
}

test("a commit parses into the same shape a scout merge has", () => {
  const [row] = parseLog(log([{
    sha: "abc123", date: "2026-09-02", author: "someone",
    subject: "Expand asset transfer methods with `upfront` payment flows (#3145)",
    body: "Adds an upfront flow to the exact scheme.",
    files: ["specs/schemes/exact/scheme_exact.md", "typescript/packages/x402/src/flow.ts"],
  }]), x402);
  assert.equal(row.id, "x402:abc123");
  assert.equal(row.date, "2026-09-02");
  assert.equal(row.title, "Expand asset transfer methods with `upfront` payment flows", "the PR suffix is stripped from the title");
  assert.equal(row.prNumber, 3145);
  assert.equal(row.prUrl, "https://github.com/x402-foundation/x402/pull/3145");
  assert.equal(row.specChange, true);
  assert.equal(row.derived, true);
  assert.deepEqual(row.files.length, 2);
});

test("a commit with no PR reference links to the commit instead", () => {
  const [row] = parseLog(log([{
    sha: "def456", date: "2026-09-01", author: "someone", subject: "direct push", files: ["README.md"],
  }]), x402);
  assert.equal(row.prNumber, null);
  assert.match(row.prUrl, /\/commit\/def456$/);
});

test("a multi-line body survives the record split", () => {
  const [row] = parseLog(log([{
    sha: "a1", date: "2026-09-01", author: "x", subject: "feat: thing (#1)",
    body: "line one\n\nline two\nline three",
    files: ["specs/x402-specification-v2.md"],
  }]), x402);
  assert.match(row.description, /line one/);
  assert.match(row.description, /line three/);
  assert.equal(row.files.length, 1, "body newlines are not mistaken for filenames");
});

test("levels are derived from conventional prefixes, and marked derived", () => {
  assert.deepEqual(levelFromSubject("feat(ts): add thing"), { level: "minor", declaredBreaking: false });
  assert.deepEqual(levelFromSubject("fix: repair thing"), { level: "patch", declaredBreaking: false });
  assert.deepEqual(levelFromSubject("feat(api)!: remove field"), { level: "major", declaredBreaking: true });
  assert.deepEqual(levelFromSubject("Add XRPL payment method"), { level: "patch", declaredBreaking: false });
});

test("a BREAKING CHANGE trailer in the body is picked up", () => {
  const [row] = parseLog(log([{
    sha: "b1", date: "2026-09-01", author: "x", subject: "refactor: move field",
    body: "BREAKING CHANGE: the field moved namespace.", files: ["specs/a.md"],
  }]), x402);
  assert.equal(row.breaking, true);
});

test("prNumberFrom only takes a trailing reference", () => {
  assert.equal(prNumberFrom("fix: thing (#42)"), 42);
  assert.equal(prNumberFrom("fix: closes (#42) and more"), null);
});

test("spec paths are matched by prefix, per repository", () => {
  assert.equal(touchesSpec(["specs/schemes/a.md"], ["specs/"]), true);
  assert.equal(touchesSpec(["go/http/client.go"], ["specs/"]), false);
  assert.equal(touchesSpec(["tips/tip-1096.md"], ["tips/"]), true);
});

test("the impact line states what was touched and invents nothing", () => {
  const [spec] = parseLog(log([{ sha: "s", date: "2026-09-01", author: "x", subject: "s (#1)", files: ["specs/a.md"] }]), x402);
  const [sdk] = parseLog(log([{ sha: "k", date: "2026-09-01", author: "x", subject: "k (#2)", files: ["go/http/a.go"] }]), x402);
  assert.match(spec.impact, /Touches the specification \(specs\/a\.md\)/);
  assert.match(sdk.impact, /no specification path touched/);
});

test("a spec change is consequential even though git declared nothing", () => {
  const row = { breaking: false, specChange: true, level: "patch", title: "chore: tidy the scheme table", description: "" };
  assert.equal(isConsequential(row), true);
  assert.equal(isHousekeeping(row), false, "a spec commit is never demoted by its subject line");
  const scored = scoreRow({ ...row, tags: [], surfaces: ["x402-wire"] });
  assert.equal(scored.band, "act");
  assert.match(scored.reasons[0], /touches the specification/);
});

test("an SDK commit calling itself a chore is demoted", () => {
  const row = { breaking: false, specChange: false, level: "patch", title: "chore(deps): bump reth", description: "" };
  assert.equal(isHousekeeping(row), true);
  assert.equal(scoreRow({ ...row, tags: ["payment"], surfaces: ["x402-wire"] }).band, "log");
});

test("git rows flow through the screen's scorer onto layer-3 surfaces", () => {
  const map = {
    x402: {
      name: "x402", maintainers: "x402 Foundation", repo: x402.url, launchDate: "2026-04-02",
      source: "git", layer: "3 our rail",
      updates: parseLog(log([{
        sha: "c1", date: "2026-09-09", author: "x",
        subject: "docs(specs): correct v2 §8 discovery fields to match the wire format (#3067)",
        files: ["specs/x402-specification-v2.md"],
      }]), x402),
    },
  };
  const [row] = flattenUpdates(map, "2026-09-14");
  assert.equal(row.source, "git");
  assert.equal(row.band, "act");
  assert.ok(row.surfaces.includes("preflight-battery"));
  assert.ok(row.surfaces.includes("x402-wire"));
});

test("an empty read is an error, never a quiet protocol", () => {
  const { map, failures } = readLayer3({
    since: "2026-06-16", cacheDir: "/nonexistent",
    sources: [x402],
    read: () => { throw new Error("git-source: x402 returned no commits since 2026-06-16 — the read is broken, not the protocol"); },
  });
  assert.deepEqual(Object.keys(map), []);
  assert.equal(failures.length, 1);
  assert.match(failures[0].error, /the read is broken, not the protocol/);
});

test("one unreachable repository does not take the others down", () => {
  const ok = { name: "MPP", maintainers: "m", repo: "u", launchDate: "2026-03-18", source: "git", updates: [] };
  const { map, failures } = readLayer3({
    since: "2026-06-16", cacheDir: "/tmp",
    sources: [{ ...x402, name: "x402" }, { key: "mpp", name: "MPP", url: "u", specPaths: [] }],
    read: (s) => { if (s.key === "x402") throw new Error("clone refused"); return ok; },
  });
  assert.deepEqual(Object.keys(map), ["MPP"]);
  assert.deepEqual(failures.map((f) => f.source), ["x402"]);
});

test("the x402 source points at the foundation repo, not the frozen mirror", () => {
  assert.equal(x402.url, "https://github.com/x402-foundation/x402");
  assert.match(x402.supersedes, /coinbase\/x402/);
  const tempo = LAYER3.find((s) => s.key === "tempo");
  assert.deepEqual(tempo.onlyPaths, ["tips/"], "the Rust node stays out of frame");
  assert.ok(tempo.scopeNote, "a scoped source must say so in the report");
});
