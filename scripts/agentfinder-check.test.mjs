import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * THE AGENT FINDER DRAWER (2026-09-10). registry/agentfinder/ holds the
 * entries the keeper submits to github/agentfinder-catalog, the
 * community catalog behind GitHub Copilot's agent finder. Nothing here
 * publishes (rule 30); this test holds the drafts to two things:
 *
 *  1. The catalog's own validator, ported clause for clause from
 *     scripts/generate_ai_catalog.py in that repository as read on
 *     2026-09-10, so a PR is not refused on a field this repo could
 *     have checked.
 *  2. AT_SCALE rule 1: a value that lives elsewhere is not hand-typed
 *     here without the tool refusing drift. The MCP entry repeats
 *     server.json's version and description; the skill entries point
 *     at files that must exist on the default branch.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = join(ROOT, "registry", "agentfinder", "catalog");
const PUBLISHER = "seancrecord";
const REPO = "seancrecord/scvd-general-store-repo";
const SOURCE_SET_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function entries() {
  const dir = join(DRAWER, PUBLISHER);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, entry: JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}

test("the drawer has one publisher directory, named for the GitHub account", () => {
  assert.deepEqual(readdirSync(DRAWER), [PUBLISHER]);
  assert.ok(entries().length >= 1);
});

test("file names are kebab-case and one augment per file", () => {
  for (const { name } of entries()) {
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*\.json$/, `${name} is not kebab-case`);
  }
});

test("every entry passes the catalog's own validation rules", () => {
  for (const { name, entry } of entries()) {
    for (const field of ["identifier", "displayName"]) {
      assert.equal(typeof entry[field], "string", `${name}: ${field} must be a string`);
      assert.ok(entry[field].trim(), `${name}: ${field} must be non-empty`);
    }
    assert.ok(
      ["type", "mediaType"].some((f) => typeof entry[f] === "string" && entry[f].trim()),
      `${name}: type or mediaType must be a non-empty string`,
    );
    const hasUrl = entry.url !== undefined && entry.url !== null;
    const hasData = entry.data !== undefined && entry.data !== null;
    assert.notEqual(hasUrl, hasData, `${name}: exactly one of url or data is required`);
    if (hasUrl) {
      const url = new URL(entry.url);
      assert.ok(["http:", "https:"].includes(url.protocol), `${name}: url must be http(s)`);
      assert.ok(url.hostname, `${name}: url must have a host`);
      assert.equal(url.username, "", `${name}: url must not carry credentials`);
      assert.equal(url.password, "", `${name}: url must not carry credentials`);
    }
    assert.ok(entry.identifier.startsWith("urn:ai:"), `${name}: identifier must start with urn:ai:`);
    if (entry.version !== undefined) {
      assert.equal(typeof entry.version, "string");
      assert.ok(entry.version.trim(), `${name}: version must be non-empty`);
    }
    if (entry.tags !== undefined) {
      assert.ok(Array.isArray(entry.tags), `${name}: tags must be an array`);
      for (const tag of entry.tags) assert.ok(typeof tag === "string" && tag.trim(), `${name}: empty tag`);
      assert.equal(new Set(entry.tags).size, entry.tags.length, `${name}: duplicate tags`);
      assert.ok(!entry.tags.includes("canvas-only"), `${name}: nothing here is a canvas`);
    }
    const metadata = entry.metadata;
    if (metadata !== undefined) {
      assert.equal(typeof metadata, "object", `${name}: metadata must be an object`);
      const { sourceSet, repoPath } = metadata;
      if (sourceSet !== undefined || repoPath !== undefined) {
        assert.match(sourceSet ?? "", SOURCE_SET_PATTERN, `${name}: sourceSet must be owner/repo`);
        assert.ok(typeof repoPath === "string" && repoPath.trim(), `${name}: repoPath must be non-empty`);
        assert.ok(!repoPath.startsWith("/") && !repoPath.includes("\\"), `${name}: repoPath must be relative`);
        assert.ok(
          repoPath.split("/").every((part) => part && part !== "." && part !== ".."),
          `${name}: repoPath must be a safe relative path`,
        );
        assert.equal(decodeURIComponent(repoPath), repoPath, `${name}: repoPath must not be encoded`);
      }
    }
    // The catalog asks for one or two sentences.
    const sentences = entry.description.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;
    assert.ok(sentences <= 2, `${name}: description runs to ${sentences} sentences; the catalog asks for one or two`);
  }
});

test("a skill entry points at a SKILL.md that exists in this repository, on main", () => {
  const skills = entries().filter(({ entry }) => entry.mediaType === "application/ai-skill");
  assert.ok(skills.length >= 1);
  for (const { name, entry } of skills) {
    assert.equal(entry.metadata.sourceSet, REPO, `${name}: sourceSet is not this repository`);
    assert.ok(entry.metadata.repoPath.endsWith("SKILL.md"), `${name}: a skill is defined by a SKILL.md`);
    assert.ok(existsSync(join(ROOT, entry.metadata.repoPath)), `${name}: ${entry.metadata.repoPath} does not exist`);
    assert.equal(
      entry.url,
      `https://github.com/${REPO}/blob/main/${entry.metadata.repoPath}`,
      `${name}: url must be the blob URL of repoPath on main`,
    );
    assert.equal(
      entry.identifier,
      `urn:ai:github.com:${REPO.replace("/", ":")}:${name.replace(/\.json$/, "")}`,
      `${name}: identifier must follow urn:ai:github.com:<publisher>:<repo>:<name>`,
    );
    // The SKILL.md's own frontmatter name is the augment's name.
    const frontmatter = readFileSync(join(ROOT, entry.metadata.repoPath), "utf8").match(/^---\n([\s\S]*?)\n---/);
    assert.ok(frontmatter, `${name}: SKILL.md has no frontmatter`);
    const skillName = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    assert.equal(skillName, name.replace(/\.json$/, ""), `${name}: file name must equal the skill's frontmatter name`);
  }
});

test("a plugin entry points at the Claude Code plugin manifest and names its capabilities", () => {
  const plugins = entries().filter(({ entry }) => entry.mediaType === "application/vnd.github.copilot-plugin");
  assert.equal(plugins.length, 1);
  const [{ name, entry }] = plugins;
  assert.equal(entry.metadata.sourceSet, REPO);
  assert.equal(entry.metadata.repoPath, ".claude-plugin/plugin.json");
  assert.ok(existsSync(join(ROOT, entry.metadata.repoPath)), "the plugin manifest must exist");
  assert.equal(entry.url, `https://github.com/${REPO}/blob/main/${entry.metadata.repoPath}`);
  assert.equal(entry.identifier, `urn:ai:github.com:${REPO.replace("/", ":")}:${name.replace(/\.json$/, "")}`);
  // Not a canvas: it carries the capability tags the catalog reserves for real plugins.
  assert.ok(entry.tags.includes("mcp-server") && entry.tags.includes("skill"));
  assert.ok(!entry.tags.includes("canvas-only"));
  const manifest = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  assert.ok(entry.description.startsWith(manifest.description), `${name}: description must open with the manifest's own sentence`);
});

test("the MCP entry repeats server.json, never a hand-typed copy of it", () => {
  const mcp = entries().filter(({ entry }) => entry.mediaType === "application/mcp-server+json");
  assert.equal(mcp.length, 1, "one MCP entry: the store; the tab joins when its registry version catches up");
  const [{ name, entry }] = mcp;
  const manifest = JSON.parse(readFileSync(join(ROOT, "server.json"), "utf8"));
  assert.equal(entry.version, manifest.version, `${name}: version differs from server.json`);
  assert.equal(entry.description, manifest.description, `${name}: description differs from server.json`);
  assert.equal(entry.displayName, manifest.title, `${name}: displayName differs from server.json title`);
  assert.equal(
    entry.url,
    `https://registry.modelcontextprotocol.io/v0/servers/${encodeURIComponent(manifest.name)}/versions/${manifest.version}`,
    `${name}: url must be the registry's version URL for server.json's name and version`,
  );
  // The identifier mirrors the shape GitHub's own MCP feed produces
  // (urn:ai:registry.modelcontextprotocol.io:<namespace>:<name>), so the
  // catalog generator's dedupe-by-identifier drops the feed's copy
  // rather than listing the store twice if that feed ever carries it.
  assert.equal(entry.identifier, `urn:ai:registry.modelcontextprotocol.io:${manifest.name.replace("/", ":")}`);
  assert.equal(entry.metadata.repository, manifest.repository.url);
  assert.equal(entry.metadata.websiteUrl, manifest.websiteUrl);
});
