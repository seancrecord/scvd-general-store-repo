#!/usr/bin/env node
/**
 * npm run indexnow — tell Bing which URLs changed, after a deploy.
 *
 * IndexNow (indexnow.org) is one POST: host, key, where the key file
 * lives on the host, and a list of URLs. Bing verifies the key by
 * fetching it back from /indexnow/{key}.txt (routes/site-meta.ts),
 * then crawls the URLs within hours rather than whenever Bingbot
 * next wanders by. Bing's index is what ChatGPT search cites from,
 * which is the whole reason this exists (docs/AEO_PROMPT_READ_2026-09-02.md).
 *
 * The URL list is the live sitemap, read after the deploy, so the
 * script never carries a typed list of pages. No key in the
 * environment means "skipped", exit 0: a deploy must not fail
 * because a notification could not be sent.
 */

const base = (process.env.STORE_BASE_URL ?? "https://scvd.store").replace(/\/+$/, "");
const key = process.env.INDEXNOW_KEY;
const endpoint = process.env.INDEXNOW_ENDPOINT ?? "https://api.indexnow.org/indexnow";

if (!key || !/^[a-f0-9]{32}$/.test(key)) {
  console.log("indexnow: no INDEXNOW_KEY in the environment (32 hex chars); skipped.");
  process.exit(0);
}

const sitemap = await fetch(`${base}/sitemap.xml`).then((r) => r.text());
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urls.length === 0) {
  console.log("indexnow: the sitemap listed no URLs; nothing to send.");
  process.exit(0);
}

const host = new URL(base).host;
const body = {
  host,
  key,
  keyLocation: `${base}/indexnow/${key}.txt`,
  // The protocol caps a submission at 10,000 URLs; the sitemap is nowhere near.
  urlList: urls.slice(0, 10_000),
};

if (process.argv.includes("--dry-run")) {
  console.log(`indexnow: would send ${body.urlList.length} URLs for ${host} to ${endpoint}`);
  process.exit(0);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
// 200 and 202 both mean accepted; 4xx means the key or the host is wrong.
console.log(`indexnow: ${response.status} for ${body.urlList.length} URLs on ${host}`);
process.exit(response.ok ? 0 : 1);
