#!/usr/bin/env node
/**
 * npm run oasf:taxonomy:check — read the OASF taxonomy back from
 * agntcy/oasf and refuse any drift from what the record declares.
 *
 * WHY THIS EXISTS. Every other value in the record is derived from a
 * file in this tree. The taxonomy ids cannot be: they are defined
 * upstream, and a Worker has no business fetching them at request
 * time. AT_SCALE rule 1's other arm applies — if a value cannot be
 * derived, the tool refuses. This is the refusal.
 *
 * WHAT IT CHECKS, AND WHY EACH PART EARNS ITS PLACE.
 *   - The tag's own schema/version.json matches the schema_version the
 *     record declares. A Directory server validates a record's skills
 *     against the taxonomy for the record's OWN declared version, so
 *     these two disagreeing is the failure that looks like a validator
 *     bug and is not one.
 *   - Every level of every name resolves to a real class file at that
 *     tag. A row naming a class that no longer exists is not a smaller
 *     problem than a wrong id: it is unmatchable.
 *   - Each level's `extends` names the level above it. A file that
 *     still exists at the same path while its parent moved would pass
 *     a path check and be wrong.
 *   - The id is RECOMPUTED from the uid of each level and compared to
 *     the declared number, rather than the number being trusted.
 *
 * NETWORK, SO NOT IN THE OFFLINE SUITE. Wired beside listings:check
 * and doors:live, not beside the tests: a green suite must not depend
 * on GitHub being up.
 */
import { pathToFileURL } from "node:url";
import { RECORD_ORIGIN, loadRecordModule } from "./cut-oasf.mjs";

/** Raw file at the pinned tag. The API host is not used: raw is enough and needs no token. */
const raw = (tag, path) => `https://raw.githubusercontent.com/agntcy/oasf/${tag}/${path}`;

/** A probe that could not run, kept apart from a probe that ran and found nothing. */
class Unreachable extends Error {}

/**
 * 404 means the class is not there; ANYTHING ELSE means this check did
 * not run. AT_SCALE rule 5 — a null result from a probe that cannot
 * run is not evidence of absence — and the cost of getting this wrong
 * is specific: a rate-limited or offline run would report every row as
 * drift and send somebody to "fix" a table that was correct.
 */
async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new Unreachable(`could not reach ${url}: ${cause instanceof Error ? cause.message : cause}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Unreachable(`${url} answered ${res.status}`);
  return res.json();
}

/**
 * OASF puts a class either at `<dir>/<name>.json` (a leaf) or at
 * `<dir>/<name>/<name>.json` (a level that has children of its own).
 * Both spellings are live in 1.1.0 — `finance_and_business/payments`
 * is the first, `technology/blockchain` the second — so resolution
 * tries both rather than assuming the shape.
 */
async function fetchClass(tag, family, segments) {
  const dir = ["schema", family, ...segments].join("/");
  const last = segments[segments.length - 1];
  for (const path of [`${dir}/${last}.json`, `${dir}.json`]) {
    const cls = await fetchJson(raw(tag, path));
    if (cls) return { cls, path };
  }
  return null;
}

/** OASF's id: the first level's uid, then every level below it padded to two digits. */
export function composeId(uids) {
  return Number(uids.map((uid, i) => (i === 0 ? String(uid) : String(uid).padStart(2, "0"))).join(""));
}

/** Resolve one declared row upstream and report what upstream actually says. */
export async function resolveRow(tag, family, name) {
  const segments = name.split("/");
  const base = family === "domains" ? "base_domain" : "base_skill";
  const uids = [];
  const problems = [];
  for (let i = 0; i < segments.length; i += 1) {
    const found = await fetchClass(tag, family, segments.slice(0, i + 1));
    if (!found) {
      problems.push(`${name}: no class file for "${segments.slice(0, i + 1).join("/")}" at ${tag}`);
      return { id: null, problems };
    }
    const expected = i === 0 ? base : segments[i - 1];
    if (found.cls.extends !== expected) {
      problems.push(`${name}: ${found.path} extends "${found.cls.extends}", expected "${expected}"`);
    }
    if (found.cls.name !== segments[i]) {
      problems.push(`${name}: ${found.path} is named "${found.cls.name}", expected "${segments[i]}"`);
    }
    uids.push(found.cls.uid);
  }
  return { id: composeId(uids), problems };
}

async function main() {
  // The same bundle the cut reads, so the check and the file it guards
  // can never be looking at two different definitions.
  const declared = await loadRecordModule();
  const tag = declared.OASF_TAXONOMY_TAG;
  const problems = [];

  const version = await fetchJson(raw(tag, "schema/version.json"));
  if (!version) {
    problems.push(`agntcy/oasf has no schema/version.json at ${tag} — is the tag right?`);
  } else if (version.version !== declared.OASF_SCHEMA_VERSION) {
    problems.push(
      `${tag} is OASF schema ${version.version}, but the record declares schema_version ${declared.OASF_SCHEMA_VERSION}`,
    );
  }

  const rows = [
    ...declared.OASF_DOMAINS.map((row) => ({ ...row, family: "domains" })),
    ...declared.OASF_SKILLS.map((row) => ({ ...row, family: "skills" })),
  ];
  for (const row of rows) {
    const { id, problems: found } = await resolveRow(tag, row.family, row.name);
    problems.push(...found);
    if (id !== null && id !== row.id) {
      problems.push(`${row.name}: upstream uids compose to ${id}, the record declares ${row.id}`);
    }
    console.log(`  ${id === row.id && found.length === 0 ? "ok  " : "DRIFT"} ${row.family.slice(0, -1)} ${row.name} = ${id ?? "?"}`);
  }

  /** The modules the record declares must be real classes too — read off the record, not listed again. */
  const modules = declared.oasfRecord(RECORD_ORIGIN).modules.map((module) => module.name);
  for (const module of modules) {
    const cls = await fetchJson(raw(tag, `schema/modules/${module}.json`));
    if (!cls) problems.push(`module ${module} is not defined in agntcy/oasf at ${tag}`);
    console.log(`  ${cls ? "ok  " : "DRIFT"} module ${module}`);
  }

  if (problems.length > 0) {
    console.error(`\nagntcy/oasf ${tag} disagrees with src/lib/oasf-record.ts:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      "\nFix the table in src/lib/oasf-record.ts (and re-cut with npm run oasf:cut).\n" +
        "Do NOT move OASF_TAXONOMY_TAG without re-running this: ids are validated\n" +
        "against the taxonomy for the record's own declared schema_version.",
    );
    process.exit(1);
  }
  console.log(`\nagntcy/oasf ${tag}: ${rows.length} taxonomy rows and ${modules.length} modules agree with the record.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof Unreachable)) throw error;
    /**
     * Exit 2, not 1: "the taxonomy disagrees" and "I could not read
     * the taxonomy" are different answers, and a CI step that treats
     * them alike will one day report a GitHub outage as a bad record.
     */
    console.error(`\nagntcy/oasf could not be read, so this check made no finding:\n  ${error.message}`);
    process.exit(2);
  }
}
