#!/usr/bin/env node
/**
 * npm run cold:read — what does the first knock after a deploy cost,
 * and how much of it is ours?
 *
 * THE FIGURE NO DASHBOARD HAS. Every deploy evicts every isolate, and
 * the first request each colo then serves pays for the script to be
 * fetched, compiled and evaluated before a line of ours runs. Workers
 * Logs start their clock after that. The directory that scores this
 * store (x402-list) knocks on every paid door at once every fifteen
 * minutes, and on a quiet colo that burst lands cold — the night of
 * 2026-09-04/05 was eight hours of 1,000ms+ checks with no deploy
 * inside them (research/x402-list-latency-2026-09-05.md). This script
 * reads that cost from outside, the only place it can be read.
 *
 * WHAT IT MEASURES. One knock on a door, then N warm knocks on the
 * same kept-alive socket. For each, the time from "the request could
 * be sent" to "the headers arrived": the TLS handshake is subtracted
 * when the socket is new, so the first knock and the warm ones are
 * the same measure. The store's Server-Timing line says whether the
 * first knock met a cold isolate; the cold penalty is that knock
 * minus the warm median. With --burst it also fires every paid door
 * from /.well-known/x402 at once, one socket each, and counts how
 * many cold isolates a directory-shaped burst wakes.
 *
 * WHAT IT DOES NOT. It buys nothing, signs nothing, writes nothing.
 * Its exit code is a reading, not a gate: 0 always, 2 only when the
 * first door could not be reached at all. A slow cold start is a
 * fact to keep, never a red build.
 *
 * Usage, from the repo root:
 *
 *   npm run cold:read                                  # one door, then six warm
 *   npm run cold:read -- --url=https://scvd.store/api/buy/hello --url=https://<canary>.workers.dev/
 *   npm run cold:read -- --burst                       # every paid door at once
 *   npm run cold:read -- --since=2026-09-05T12:11:00Z  # says whether the deploy had landed
 *   npm run cold:read -- --warm=10 --json
 *   npm run cold:read -- --control=https://x402-list.com/robots.txt   # the vantage's own first-knock cost
 *
 * THE VANTAGE HAS A COST OF ITS OWN (2026-09-05, found the evening the
 * doors went live). Read from a sandbox behind a connecting proxy, a
 * plain static file on a host with no Worker at all showed a first
 * knock 370 ms slower than the warm ones: the proxy opening its
 * upstream connection, invisible to this socket's handshake timing.
 * Every cold penalty read from that sandbox that day carried it, and
 * one derivation compared them to a canary read from a clean machine.
 * So: --control knocks a URL that cannot have a cold start, first and
 * warm, and prints the difference as the vantage's floor. A cold
 * penalty is only worth quoting when it clears that floor by a wide
 * margin, and a floor near zero (a laptop on a plain connection) is
 * the reading to trust.
 *
 * The canary (canary/) is a hello-world Worker with the same
 * Server-Timing line and nothing else; read it beside the store from
 * the same vantage and the difference is our script's share of the
 * cold start, Cloudflare's floor subtracted.
 */
import https from "node:https";
import { performance } from "node:perf_hooks";
import {
  deployLanded,
  parseServerTiming,
  renderBurst,
  renderSummary,
  summarize,
  summarizeBurst,
} from "./lib/cold-read.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name, fallback) => {
  const hit = flag(name);
  if (!hit || !hit.includes("=")) return fallback;
  return hit.slice(hit.indexOf("=") + 1);
};
const values = (name) =>
  args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));

const DEFAULT_DOOR = "https://scvd.store/api/buy/hello";
const urls = values("url").length ? values("url") : [DEFAULT_DOOR];
const warmKnocks = Math.max(0, Number(value("warm", "6")) || 0);
const since = value("since", "");
const json = Boolean(flag("json"));
const burst = Boolean(flag("burst"));
const control = value("control", "");
const TIMEOUT_MS = 20_000;

/**
 * One knock. Resolves when the headers arrive; the body is drained and
 * discarded. `ms` counts from the moment the socket could carry the
 * request (after secureConnect on a fresh socket, at assignment on a
 * reused one) to the response headers.
 */
function knock(url, agent) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    let sendableAt = null;
    const req = https.request(
      url,
      {
        agent,
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "User-Agent": "scvd-cold-read/1 (+https://scvd.store)",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const headersAt = performance.now();
        const timing = parseServerTiming(res.headers["server-timing"]);
        res.resume();
        res.on("end", () =>
          resolve({
            url,
            status: res.statusCode,
            ms: Math.round(headersAt - (sendableAt ?? startedAt)),
            handshake_ms: sendableAt === null ? 0 : Math.round(sendableAt - startedAt),
            timing,
          }),
        );
      },
    );
    req.on("socket", (socket) => {
      if (socket.connecting || !socket.encrypted || socket.authorized === undefined) {
        socket.once("secureConnect", () => {
          sendableAt = performance.now();
        });
      }
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ url, status: null, ms: NaN, error: error.message, timing: {} }));
    req.end();
  });
}

async function readDoor(url) {
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const knocks = [await knock(url, agent)];
  for (let i = 0; i < warmKnocks; i += 1) knocks.push(await knock(url, agent));
  agent.destroy();
  return knocks;
}

async function paidDoors(base) {
  const origin = new URL(base).origin;
  const res = await fetch(`${origin}/.well-known/x402`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`discovery answered ${res.status}`);
  const doc = await res.json();
  const doors = [];
  for (const r of doc.resources ?? []) {
    // The discovery document names each door as `resource` (a string,
    // x402 v2) and repeats it as `resourceUrl`; older readers wrote
    // `resource.url`. Any of the three, GET doors on the paid shelf only.
    const url =
      typeof r.resource === "string" ? r.resource : (r.resourceUrl ?? r.resource?.url ?? r.url);
    if (typeof url !== "string") continue;
    if ((r.method ?? "GET").toUpperCase() !== "GET") continue;
    if (new URL(url).pathname.startsWith("/api/buy/")) doors.push(url);
  }
  return [...new Set(doors)];
}

async function readBurst(base) {
  const doors = await paidDoors(base);
  const agent = new https.Agent({ keepAlive: false, maxSockets: Infinity });
  const readings = await Promise.all(
    doors.map(async (url) => ({ path: new URL(url).pathname, ...(await knock(url, agent)) })),
  );
  agent.destroy();
  return readings;
}

const observation = { read_at: new Date().toISOString(), since: since || null, control: null, doors: [], burst: null };
let exitCode = 0;
const out = [];

if (control) {
  const knocks = await readDoor(control);
  const first = knocks[0];
  const warm = knocks.slice(1).map((k) => k.ms);
  const warmMedian = warm.length ? [...warm].sort((a, b) => a - b)[Math.floor(warm.length / 2)] : null;
  const floor = Number.isFinite(first.ms) && warmMedian !== null ? Math.max(0, first.ms - warmMedian) : null;
  observation.control = { url: control, first_ms: first.ms, warm_median_ms: warmMedian, vantage_floor_ms: floor };
  out.push(
    Number.isFinite(first.ms)
      ? `${control}\n  control       ${String(first.ms).padStart(6)} ms   first knock on a host with no cold start; warm median ${warmMedian ?? "-"} ms\n  vantage floor ${String(floor ?? "-").padStart(6)} ms   what this vantage adds to any first knock; a cold penalty must clear it by a wide margin`
      : `${control}\n  control unreachable: ${first.error ?? "no answer"}`,
  );
}

for (const url of urls) {
  const knocks = await readDoor(url);
  const summary = summarize(knocks);
  if (!Number.isFinite(knocks[0].ms)) {
    out.push(`${url}\n  unreachable: ${knocks[0].error ?? "no answer"}`);
    if (url === urls[0]) exitCode = 2;
    observation.doors.push({ url, unreachable: knocks[0].error ?? "no answer" });
    continue;
  }
  const landed = deployLanded(summary.first_age_s, since);
  observation.doors.push({ url, ...summary, deploy: landed, knocks });
  out.push(renderSummary(url, summary, landed));
}

if (burst && exitCode === 0) {
  try {
    const readings = await readBurst(urls[0]);
    const summary = summarizeBurst(readings);
    observation.burst = { base: new URL(urls[0]).origin, ...summary, readings };
    out.push(renderBurst(new URL(urls[0]).origin, summary));
  } catch (error) {
    out.push(`burst: could not read the shelf (${error.message})`);
    observation.burst = { error: error.message };
  }
}

if (json) {
  console.log(JSON.stringify(observation, null, 2));
} else {
  console.log(`cold read, ${observation.read_at}`);
  console.log(out.join("\n\n"));
}
process.exit(exitCode);
