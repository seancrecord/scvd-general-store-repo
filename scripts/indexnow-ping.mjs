#!/usr/bin/env node
/**
 * npm run indexnow — tell Bing which URLs changed, after a deploy.
 *
 * IndexNow (indexnow.org) is one POST: host, key, where the key file
 * lives on the host, and a list of URLs. Bing verifies the key by
 * fetching it back from /{key}.txt (routes/site-meta.ts; at the root,
 * because a key vouches only for its own directory and below),
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

// THE KEY FILE, CHECKED BEFORE THE PING (2026-09-03). The first live run
// came back 422 with no explanation, and the only two causes IndexNow
// names are a URL off the host (the sitemap is derived, so no) and a
// key that fails their schema. A key file that 404s because the Worker
// secret and the shell's INDEXNOW_KEY differ looks exactly like that
// from the outside. So: fetch our own key file first, the way Bing will,
// and say plainly which side is wrong before sending anything.
const keyLocation = `${base}/${key}.txt`;
const keyFile = await fetch(keyLocation).then(async (r) => ({ status: r.status, text: (await r.text()).trim() }));
if (keyFile.status !== 200 || keyFile.text !== key) {
  console.error(
    `indexnow: ${keyLocation} answered ${keyFile.status}` +
      (keyFile.status === 200 ? ` with a different key` : "") +
      `; the Worker's INDEXNOW_KEY secret and this shell's INDEXNOW_KEY differ, or the secret is not deployed. ` +
      `Run \`wrangler secret put INDEXNOW_KEY\` with this exact value, then try again.`,
  );
  process.exit(1);
}

const body = {
  host,
  key,
  keyLocation,
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
// 200 and 202 both mean accepted. 400 is a malformed request, 403 a key
// IndexNow could not verify, 422 a URL off the host or a key outside
// their schema, 429 too many pings. Print whatever body came back, since
// the status alone explained nothing the first time.
console.log(`indexnow: ${response.status} for ${body.urlList.length} URLs on ${host}`);
if (!response.ok) {
  const detail = (await response.text()).trim();
  if (detail) console.error(`indexnow: ${detail}`);
}
process.exit(response.ok ? 0 : 1);
