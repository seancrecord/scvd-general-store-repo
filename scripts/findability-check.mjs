#!/usr/bin/env node
/**
 * npm run findability:check — walk the table in lib/findability.mjs
 * against this tree and the live store, print present / missing /
 * unreachable per signal. Exit 0 always: it is a reading for the desk.
 * `--base <url>` reads another host; `--repo-only` skips the network.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SIGNALS, readAll, render } from "./lib/findability.mjs";

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://scvd.store";
const repoOnly = args.includes("--repo-only");
const root = resolve(new URL("..", import.meta.url).pathname);

const readers = {
  readRepo: async (path) => existsSync(resolve(root, path)),
  readSite: async (path) => {
    if (repoOnly) throw new Error("repo-only");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { "User-Agent": "scvd-findability-check/1 (+https://scvd.store)", Accept: "*/*" },
        redirect: "manual",
        signal: controller.signal,
      });
      return response.status;
    } finally {
      clearTimeout(timer);
    }
  },
};

const rows = await readAll(SIGNALS, readers);
console.log(render(rows));
