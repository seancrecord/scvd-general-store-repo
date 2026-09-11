import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

// The live rule is the first fenced expression in the doc; the
// superseded one follows it, kept for the record.
const fences = [...doc.matchAll(/```\n([^`]+?)\n```/g)].map((m) => m[1].trim());
const live = fences[0] ?? "";
const superseded = fences[1] ?? "";

/** Every route pattern the store mounts, read off src/routes and src/index.ts. */
function routePatterns() {
  const files = readdirSync(join(ROOT, "src/routes")).filter((f) => f.endsWith(".ts")).map((f) => join(ROOT, "src/routes", f));
  files.push(join(ROOT, "src/index.ts"));
  const patterns = new Set();
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(/\.(?:get|post|all|on)\("([^"]+)"/g)) patterns.add(m[1]);
  }
  return [...patterns];
}

test("the live rule blocks on what is asked for, never on a user-agent alone", () => {
  assert.ok(live.startsWith("not cf.client.bot and ("), "verified crawlers stay on the honest 404");
  assert.ok(!live.includes("http.user_agent"), "a user-agent clause is what failed the readiness scanners");
  assert.ok(live.trimEnd().endsWith(")"), "nothing may follow the closing parenthesis: a trailing character was the parse error of 2026-09-11");
  assert.ok(!live.includes(" matches "), "regex operators are not on every plan");
});

test("no probe fragment is a substring of any route the store serves", () => {
  const fragments = [
    ...[...live.matchAll(/http\.request\.uri\.path contains "([^"]+)"/g)].map((m) => m[1]),
    ...[...live.matchAll(/ends_with\(http\.request\.uri\.path, "([^"]+)"\)/g)].map((m) => m[1]),
  ];
  // ends_with is a function in Cloudflare's language; written as an
  // operator it fails to parse (the 1:852 error of 2026-09-11).
  assert.ok(!/path ends_with/.test(live), "ends_with must be written as a function");
  assert.ok(fragments.length >= 20, "the fragment list did not parse");
  const routes = routePatterns();
  assert.ok(routes.length > 200, "the router did not parse");
  for (const fragment of fragments) {
    const hit = routes.find((route) => route.includes(fragment));
    assert.equal(hit, undefined, `probe fragment ${fragment} would block the store's own route ${hit}`);
  }
});

test("the superseded rule is kept for the record and named only roster crawlers", () => {
  const source = readFileSync(join(ROOT, "src/lib/crawlers.ts"), "utf8");
  const roster = new Set([...source.matchAll(/^\s*"([^"]+)",\s*$/gm)].map((m) => m[1]));
  const names = [...superseded.matchAll(/http\.user_agent contains "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 5, "the superseded expression is missing from the doc");
  for (const name of names) assert.ok(roster.has(name), `${name} is not on the roster`);
});
