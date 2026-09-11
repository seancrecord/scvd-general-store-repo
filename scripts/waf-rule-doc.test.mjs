import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * THE WAF RULE NAMES ONLY CRAWLERS THE STORE WELCOMES (2026-09-11).
 * docs/CLOUDFLARE_WAF_SPOOFED_CRAWLERS.md carries a paste-ready
 * expression blocking unverified requests that claim a crawler's
 * name. Every name it claims must be on the roster robots.txt
 * welcomes (src/lib/crawlers.ts, read here as the data file it is),
 * a name retired there must not linger here, and the expression must
 * never block on the name alone.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(ROOT, "docs/CLOUDFLARE_WAF_SPOOFED_CRAWLERS.md"), "utf8");
const source = readFileSync(join(ROOT, "src/lib/crawlers.ts"), "utf8");

function rosterOf(constant) {
  const block = source.match(new RegExp(`export const ${constant}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`))?.[1] ?? "";
  // Strip comments, then read the quoted tokens.
  const stripped = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...stripped.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const roster = new Set([...rosterOf("NAMED_AI_CRAWLERS"), ...rosterOf("SEARCH_CRAWLERS")]);
const expression = doc.match(/```\n\((http\.user_agent[\s\S]*?)\n```/)?.[1] ?? "";
const names = [...expression.matchAll(/http\.user_agent contains "([^"]+)"/g)].map((m) => m[1]);

test("the roster was read, not guessed", () => {
  assert.ok(roster.has("GPTBot") && roster.has("Googlebot"), "the crawler file did not parse");
  assert.ok(roster.size > 30);
});

test("the rule names the big five and nothing outside the roster", () => {
  assert.ok(names.length >= 5, "no expression found in the doc");
  for (const name of names) assert.ok(roster.has(name), `${name} is in the WAF rule but not on the roster`);
  for (const must of ["ClaudeBot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "Claude-User"]) assert.ok(names.includes(must), must);
});

test("the rule blocks only when the claim is unverified", () => {
  assert.ok(expression.includes("and not cf.client.bot"), "the verified-bot boolean every plan has");
  assert.ok(expression.trimEnd().endsWith("cf.client.bot"), "nothing may follow the field: a trailing character is the parse error of 2026-09-11");
});

test("the unverifiable names stay off the list", () => {
  for (const off of ["YouBot", "KimiBot", "ora-agent", "GrokBot", "DeepSeekBot", "TavilyBot"]) {
    assert.ok(!names.includes(off), `${off} cannot be verified and would be blocked while robots.txt welcomes it`);
  }
});
