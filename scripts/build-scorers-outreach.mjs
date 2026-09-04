#!/usr/bin/env node
/**
 * npm run outreach:build — render the table from the register.
 *
 * Reads registry/scorers-outreach.json (the hand-edited fact) and
 * writes registry/scorers-outreach.md (the derived look). Run it
 * after any JSON edit; the test holds the pair identical, so a
 * forgotten render is a failing build, not a quiet drift.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderMarkdown } from "./lib/scorers-outreach.mjs";

const REGISTER = new URL("../registry/scorers-outreach.json", import.meta.url);
const TABLE = new URL("../registry/scorers-outreach.md", import.meta.url);

const register = JSON.parse(readFileSync(REGISTER, "utf8"));
writeFileSync(TABLE, renderMarkdown(register));
console.log(`rendered ${register.systems.length} systems into registry/scorers-outreach.md`);
