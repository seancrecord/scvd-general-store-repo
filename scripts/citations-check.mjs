#!/usr/bin/env node
/**
 * npm run citations:check — do the systems /scorers names still cite us?
 *
 * Reads src/store/citing-systems.json, the one file the page renders,
 * fetches each listed system's citing URL, and looks for a verify or
 * corpus URL of this store on it. `gone` fails the run: the page is
 * then making a claim its check no longer supports, and the fix is to
 * remove the entry or find the new citing URL. `unreadable` is
 * printed and does not fail: a page we could not read is not a page
 * that stopped citing us. An empty register passes and says so.
 * Prints, never edits (the keeper's standing rule).
 */
import { readFileSync } from "node:fs";
import { exitCodeFor, judge } from "./lib/citations.mjs";

const REGISTER = new URL("../src/store/citing-systems.json", import.meta.url);
const register = JSON.parse(readFileSync(REGISTER, "utf8"));
const systems = Array.isArray(register.systems) ? register.systems : [];
if (systems.length === 0) {
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), systems: [], note: "No system is listed; nothing to watch. /scorers says so. The outreach register's own check is npm run outreach:check." }, null, 2));
  process.exit(0);
}

async function read(url) {
  try {
    const response = await fetch(url, { headers: { "user-agent": "scvd-citations-check/1 (+https://scvd.store/scorers)" }, redirect: "follow" });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const verdicts = [];
for (const system of systems) {
  verdicts.push(judge(system, await read(system.cites_at)));
}
console.log(JSON.stringify({ checked_at: new Date().toISOString(), systems: verdicts }, null, 2));
process.exit(exitCodeFor(verdicts));
