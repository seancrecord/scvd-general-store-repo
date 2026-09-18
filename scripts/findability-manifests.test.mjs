import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * THE MANIFESTS OTHER TOOLS READ (2026-09-11), held to the manifests
 * this repo already keeps — AT_SCALE rule 1: a version or a sentence
 * that lives in plugin.json / server.json is not retyped in the Claude
 * Code plugin, the marketplace, the Gemini extension or the citation
 * without a test refusing the drift.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

const root = read("plugin.json");
const server = read("server.json");
const pkg = read("package.json");
const mcpUrl = server.remotes[0].url;

test("the Claude Code plugin manifest repeats plugin.json and points at the store's MCP door", () => {
  const plugin = read(".claude-plugin/plugin.json");
  assert.equal(plugin.name, root.name);
  assert.equal(plugin.version, root.version);
  assert.equal(plugin.description, root.description);
  assert.deepEqual(plugin.author, root.author);
  assert.equal(plugin.homepage, root.homepage);
  assert.equal(plugin.repository, root.repository);
  assert.equal(plugin.license, root.license);
  assert.deepEqual(plugin.keywords, root.keywords);
  assert.deepEqual(plugin.mcpServers, { "scvd-store": { type: "http", url: mcpUrl } });
});

test("the marketplace lists exactly the plugin at the repository root", () => {
  const market = read(".claude-plugin/marketplace.json");
  assert.equal(market.owner.name, root.author.name);
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, root.name);
  assert.equal(market.plugins[0].source, "./");
  assert.equal(market.plugins[0].version, root.version);
  assert.equal(market.metadata.version, root.version);
});

test("Claude's combined plugin MCP sources expose only the store, not contributor browser tools", () => {
  // Claude adds the root .mcp.json to the inline manifest. Checking only
  // the manifest missed the contributor Chrome server in customer installs.
  const effective = {
    ...read(".mcp.json").mcpServers,
    ...read(".claude-plugin/plugin.json").mcpServers,
  };
  assert.deepEqual(effective, { "scvd-store": { type: "http", url: mcpUrl } });
});

test("the Gemini extension carries the same identity and MCP door without loading contributor instructions", () => {
  const gemini = read("gemini-extension.json");
  assert.equal(gemini.name, root.name);
  assert.equal(gemini.version, root.version);
  assert.equal(gemini.description, root.description);
  assert.deepEqual(gemini.mcpServers, { "scvd-store": { httpUrl: mcpUrl } });
  // Gemini discovers skills/ itself. Loading this repository's AGENTS.md
  // makes a customer session inherit our build, commit and keeper rules.
  assert.equal(gemini.contextFileName, undefined);
  assert.equal(existsSync(join(ROOT, "GEMINI.md")), false,
    "review any new default context file before injecting it into customer sessions");
  const skills = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  assert.ok(skills.length > 0, "the extension must ship task guidance");
  for (const skill of skills) {
    const entry = readFileSync(join(ROOT, "skills", skill.name, "SKILL.md"), "utf8");
    assert.ok(entry.startsWith("---\n"), `${skill.name} needs discoverable metadata`);
    assert.match(entry, /^description: .+/m);
  }
});

test("CITATION.cff cites the corpus's concept DOI and this repository, and nothing it does not have", () => {
  const cff = readFileSync(join(ROOT, "CITATION.cff"), "utf8");
  const doi = readFileSync(join(ROOT, "src/store/corpus-dataset.ts"), "utf8").match(/export const CORPUS_DATASET_DOI = "([^"]+)"/)[1];
  assert.match(cff, /^cff-version: 1\.2\.0$/m);
  assert.ok(cff.includes(`value: "${doi}"`), "the DOI must be the concept DOI the code declares");
  const repoUrl = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  assert.ok(cff.includes(`repository-code: "${repoUrl}"`));
  assert.match(cff, /^license: MIT$/m);
  assert.ok(!/(zenodo\.22284888)/.test(cff), "the version DOI goes stale weekly; only the concept DOI is cited");
});
