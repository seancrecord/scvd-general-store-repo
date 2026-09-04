#!/usr/bin/env node
/**
 * npm run outreach:check — has a scorer's page started carrying one of our rows?
 *
 * Reads registry/scorers-outreach.json, fetches each entry's url, and
 * looks for a verify URL, a corpus URL, or the cite_json shape of this
 * store on the page (scripts/lib/citations.mjs does the matching — the
 * same matcher the citation watch uses, so "noticed" means the same
 * thing in both directions). A page that newly carries a citation is
 * printed as CITATION FOUND with the URLs seen, so a citation is
 * noticed before anyone tells us; that is the run's news, not a
 * failure, and the exit code stays 0. `unreadable` is printed and is
 * not a finding about the citation. Prints, never edits (the keeper's
 * standing rule): setting cites_since is a human edit to the JSON.
 *
 *   npm run outreach:check                       # read, report
 *   npm run outreach:check -- --base=http://localhost:8787
 */
import { readFileSync } from "node:fs";
import { citationsOn } from "./lib/citations.mjs";

const REGISTER = new URL("../registry/scorers-outreach.json", import.meta.url);
const args = process.argv.slice(2);
const value = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
};
const base = (value("base") ?? process.env.STORE_BASE_URL ?? "https://scvd.store").replace(/\/+$/, "");

const register = JSON.parse(readFileSync(REGISTER, "utf8"));
const systems = Array.isArray(register.systems) ? register.systems : [];

if (systems.length === 0) {
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), base, systems: [], note: "The register is empty; nothing to watch." }, null, 2));
  process.exit(0);
}

async function read(url) {
  try {
    const response = await fetch(url, { headers: { "user-agent": "scvd-outreach-check/1 (+https://scvd.store/scorers)" }, redirect: "follow" });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const report = [];
for (const system of systems) {
  const fetched = await read(system.url);
  if (fetched.error || fetched.status !== 200) {
    report.push({ name: system.name, url: system.url, verdict: "unreadable", reason: fetched.error ?? `HTTP ${fetched.status}`, citations: [] });
    continue;
  }
  const citations = citationsOn(fetched.text, system.base ?? base);
  report.push({ name: system.name, url: system.url, verdict: citations.length > 0 ? "cited" : "none", citations });
}

const cited = report.filter((entry) => entry.verdict === "cited");
const unreadable = report.filter((entry) => entry.verdict === "unreadable");
for (const entry of cited) {
  console.log(`CITATION FOUND  ${entry.name}  ${entry.url}`);
  for (const url of entry.citations) console.log(`  carries ${url}`);
}
console.log(
  JSON.stringify(
    { checked_at: new Date().toISOString(), base, total: report.length, cited: cited.length, unreadable: unreadable.length, systems: report },
    null,
    2,
  ),
);
process.exit(0);
