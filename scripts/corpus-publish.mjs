#!/usr/bin/env node
/**
 * npm run corpus:publish — mirror the newest signed round to Zenodo and
 * Hugging Face, after the Sunday walk. See scripts/lib/corpus-publish.mjs
 * for what is derived and why.
 *
 * Reads the live index, asks each mirror what it already holds, and
 * sends only what is missing: the new round file(s), plus the index
 * and the tiers file, which change every round. Zenodo gets a new
 * version under the same concept DOI; Hugging Face gets one commit.
 *
 * Tokens: ZENODO_TOKEN (a personal access token with deposit:write
 * and deposit:actions) and HF_TOKEN (a write token). Either missing
 * means that mirror is skipped with a line saying so, never a failed
 * run: the corpus is published on the site regardless.
 *
 *   --dry-run   read the live index and print the plan; touch nothing
 */
import { createHash } from "node:crypto";
import {
  anchorsFrom,
  commitSummary,
  hfCommitBody,
  plan,
  weekOf,
  zenodoMetadataFor,
} from "./lib/corpus-publish.mjs";

const base = (process.env.STORE_BASE_URL ?? "https://scvd.store").replace(/\/+$/, "");
const dryRun = process.argv.includes("--dry-run");
const zenodoApi = process.env.ZENODO_API ?? "https://zenodo.org/api";
const hfApi = process.env.HF_API ?? "https://huggingface.co";
const zenodoToken = process.env.ZENODO_TOKEN;
const hfToken = process.env.HF_TOKEN;

async function getJson(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
async function getBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// 1. The live index, and what it says about itself.
const index = await getJson(`${base}/corpus.json`);
const { doi, conceptId, hfRepo } = anchorsFrom(index);
const p = plan(index, []); // refined per mirror below
if (!p.latest) {
  console.log("corpus:publish: the index lists no rounds; nothing to mirror.");
  process.exit(0);
}
const latestDoc = await getJson(p.latest.url);
const week = weekOf(latestDoc);
const today = new Date().toISOString().slice(0, 10);
console.log(`corpus:publish: latest round ${p.latest.sequence} (${week}); DOI ${doi ?? "none"}; Hugging Face ${hfRepo ?? "none"}`);

if (dryRun) {
  console.log(`corpus:publish: dry run. Would send ${p.always.join(", ")} and any round file a mirror lacks, up to ${p.latest.name}.`);
  process.exit(0);
}

// The bytes every mirror gets this round.
const files = new Map();
files.set("corpus.json", Buffer.from(JSON.stringify(index)));
files.set("tiers.json", await getBytes(`${base}/corpus/tiers.json`));

// 2. Zenodo: a new version under the concept DOI, carrying what the last version lacks.
async function publishZenodo() {
  if (!zenodoToken || !conceptId) {
    console.log(`zenodo: skipped (${!zenodoToken ? "no ZENODO_TOKEN" : "no concept DOI on the index"}).`);
    return;
  }
  const auth = { Authorization: `Bearer ${zenodoToken}` };
  const latest = await getJson(`${zenodoApi}/records/${conceptId}`, { headers: auth });
  const held = (latest.files ?? []).map((f) => f.key ?? f.filename);
  const zp = plan(index, held);
  if (zp.nothingNew) {
    console.log(`zenodo: version ${latest.metadata?.version ?? "?"} already holds ${p.latest.name}; nothing to send.`);
    return;
  }
  const draft = await getJson(`${zenodoApi}/deposit/depositions/${latest.id}/actions/newversion`, { method: "POST", headers: auth });
  const draftUrl = draft.links?.latest_draft;
  const dep = await getJson(draftUrl, { headers: auth });
  const bucket = dep.links.bucket;
  for (const r of zp.missingRounds) files.set(r.name, await getBytes(r.url));
  for (const name of [...zp.missingRounds.map((r) => r.name), ...zp.always]) {
    const body = files.get(name);
    const put = await fetch(`${bucket}/${name}`, { method: "PUT", headers: { ...auth, "Content-Type": "application/octet-stream" }, body });
    if (!put.ok) throw new Error(`zenodo: PUT ${name} → ${put.status}`);
    console.log(`zenodo: uploaded ${name} (${body.length} bytes)`);
  }
  const metadata = zenodoMetadataFor(dep.metadata, week, today);
  await getJson(`${zenodoApi}/deposit/depositions/${dep.id}`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ metadata }),
  });
  const published = await getJson(`${zenodoApi}/deposit/depositions/${dep.id}/actions/publish`, { method: "POST", headers: auth });
  console.log(`zenodo: published version ${week} as ${published.doi ?? published.metadata?.doi ?? "(doi pending)"}; concept DOI unchanged.`);
}

// 3. Hugging Face: one commit with the same files.
async function publishHuggingFace() {
  if (!hfToken || !hfRepo) {
    console.log(`huggingface: skipped (${!hfToken ? "no HF_TOKEN" : "no dataset URL on the index"}).`);
    return;
  }
  const auth = { Authorization: `Bearer ${hfToken}` };
  const tree = await getJson(`${hfApi}/api/datasets/${hfRepo}/tree/main`, { headers: auth });
  const held = tree.map((e) => e.path);
  const hp = plan(index, held);
  if (hp.nothingNew) {
    console.log(`huggingface: ${hfRepo} already holds ${p.latest.name}; nothing to send.`);
    return;
  }
  for (const r of hp.missingRounds) if (!files.has(r.name)) files.set(r.name, await getBytes(r.url));
  const names = [...hp.missingRounds.map((r) => r.name), ...hp.always];
  // Ask the Hub how each file must travel (inline or LFS).
  const pre = await getJson(`${hfApi}/api/datasets/${hfRepo}/preupload/main`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ files: names.map((n) => ({ path: n, size: files.get(n).length, sample: files.get(n).subarray(0, 512).toString("base64") })) }),
  });
  const modes = new Map((pre.files ?? []).map((f) => [f.path, f.uploadMode]));
  const commitFiles = [];
  const lfs = [];
  for (const n of names) {
    const body = files.get(n);
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (modes.get(n) === "lfs") lfs.push({ path: n, sha256, size: body.length, body });
    else commitFiles.push({ path: n, mode: "regular", base64: body.toString("base64") });
  }
  if (lfs.length) {
    const batch = await getJson(`${hfApi}/datasets/${hfRepo}.git/info/lfs/objects/batch`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/vnd.git-lfs+json", Accept: "application/vnd.git-lfs+json" },
      body: JSON.stringify({ operation: "upload", transfers: ["basic"], hash_algo: "sha256", objects: lfs.map((f) => ({ oid: f.sha256, size: f.size })) }),
    });
    for (const obj of batch.objects ?? []) {
      const f = lfs.find((x) => x.sha256 === obj.oid);
      const action = obj.actions?.upload;
      if (!action) { commitFiles.push({ path: f.path, mode: "lfs", sha256: f.sha256, size: f.size }); continue; } // already stored
      const put = await fetch(action.href, { method: "PUT", headers: action.header ?? {}, body: f.body });
      if (!put.ok) throw new Error(`huggingface: LFS PUT ${f.path} → ${put.status}`);
      commitFiles.push({ path: f.path, mode: "lfs", sha256: f.sha256, size: f.size });
    }
  }
  const commit = await fetch(`${hfApi}/api/datasets/${hfRepo}/commit/main`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/x-ndjson" },
    body: hfCommitBody(commitSummary(week, p.latest.sequence), commitFiles),
  });
  if (!commit.ok) throw new Error(`huggingface: commit → ${commit.status} ${(await commit.text()).slice(0, 300)}`);
  console.log(`huggingface: committed ${names.join(", ")} to ${hfRepo}.`);
}

let failed = false;
for (const step of [publishZenodo, publishHuggingFace]) {
  try {
    await step();
  } catch (error) {
    failed = true;
    console.error(String(error?.message ?? error));
  }
}
process.exit(failed ? 1 : 0);
