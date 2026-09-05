#!/usr/bin/env node
/**
 * npm run cold:local — what does this tree's script cost to start,
 * before a line of it runs?
 *
 * THE HALF OF THE COLD START THAT IS OURS. A cold isolate pays twice:
 * once for Cloudflare to find, fetch and house the script (theirs),
 * once for V8 to compile it and run its top level (ours). The live
 * reading (scripts/cold-read.mjs) sees the sum. This script reads
 * our half alone, on this machine: it bundles the tree exactly as a
 * deploy would (wrangler --dry-run), starts the real workerd on it,
 * and times spawn to first open port. workerd compiles and evaluates
 * the script at startup, so that figure minus the same figure for a
 * script that does nothing is compile plus top-level evaluation of
 * ours. First taken 2026-09-05: 29 ms for nothing, 183 ms for the
 * store, so 154 ms of compile and evaluation for a 3.5 MB script on
 * that box — of a 430 ms penalty measured live the same hour.
 * (research/x402-list-latency-2026-09-05.md.)
 *
 * WHY IT MATTERS. Compile is close to linear in bytes, so this is the
 * number a bundle diet moves, and the number that says whether one is
 * worth its risk before anything is cut. Runs on any machine with the
 * tree installed; the absolute figure is that machine's, the ratio
 * between the two scripts is the tree's.
 *
 * Usage, from the repo root (needs node_modules; the gates install it):
 *
 *   npm run cold:local              # bundle, then five starts of each
 *   npm run cold:local -- --runs=9
 *   npm run cold:local -- --json
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const runs = Math.max(1, Number(value("runs", "5")) || 5);
const json = args.includes("--json");
const PORT = 8798;

const require = createRequire(import.meta.url);
const workerd = require.resolve("@cloudflare/workerd-linux-64/bin/workerd").replace(/\/bin\/workerd$/, "/bin/workerd");

const dir = mkdtempSync(join(tmpdir(), "scvd-cold-local-"));
try {
  // 1. The bundle, exactly as a deploy would make it.
  const built = spawnSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", dir], {
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (built.status !== 0) {
    console.error(built.stdout, built.stderr);
    process.exit(2);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  const entry = files.find((f) => f === "index.js");
  const textModules = files.filter((f) => f !== "index.js");
  const bytes = Buffer.byteLength(require("node:fs").readFileSync(join(dir, entry)));

  // 2. Two workerd configs: the store, and a script that does nothing.
  writeFileSync(join(dir, "trivial.js"), "export default { fetch() { return new Response('ok'); } };\n");
  const modules = [`(name = "index.js", esModule = embed "index.js")`]
    .concat(textModules.map((f) => `(name = "${f}", text = embed "${f}")`))
    .join(", ");
  const config = (mod, extra) => `using Workers = import "/workerd/workerd.capnp";
const config :Workers.Config = (
  services = [ (name = "main", worker = .w) ],
  sockets = [ (name = "http", address = "127.0.0.1:${PORT}", http = (), service = "main") ]
);
const w :Workers.Worker = (
  modules = [ ${mod} ],
  compatibilityDate = "2026-07-01",
  compatibilityFlags = ["nodejs_compat"],
  ${extra}
);
`;
  writeFileSync(join(dir, "trivial.capnp"), config(`(name = "trivial.js", esModule = embed "trivial.js")`, ""));
  writeFileSync(
    join(dir, "store.capnp"),
    config(
      modules,
      `durableObjectNamespaces = [ (className = "TradeNonceStore", uniqueKey = "trade") ],
  durableObjectStorage = (inMemory = void),
  bindings = [ (name = "STORE_BASE_URL", text = "https://scvd.store"), (name = "TRADE_NONCES", durableObjectNamespace = "TradeNonceStore") ],`,
    ),
  );

  // 3. Spawn, wait for the port, kill. Startup includes compile + eval.
  const portOpen = () =>
    new Promise((resolve) => {
      const sock = connect(PORT, "127.0.0.1");
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => { sock.destroy(); resolve(false); });
    });
  async function startOnce(name) {
    const t0 = performance.now();
    const child = spawn(workerd, ["serve", join(dir, `${name}.capnp`)], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d; });
    let exited = false;
    child.once("exit", () => { exited = true; });
    for (let i = 0; i < 1200 && !exited; i += 1) {
      if (await portOpen()) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const ms = Math.round(performance.now() - t0);
    const died = exited;
    child.kill();
    await new Promise((r) => (exited ? r() : child.once("exit", r)));
    if (died) throw new Error(`${name}: workerd exited before opening the port\n${stderr.slice(0, 600)}`);
    return ms;
  }
  const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const trivial = [];
  const store = [];
  for (let i = 0; i < runs; i += 1) trivial.push(await startOnce("trivial"));
  for (let i = 0; i < runs; i += 1) store.push(await startOnce("store"));
  const reading = {
    read_at: new Date().toISOString(),
    script_bytes: bytes,
    runs,
    trivial_startup_ms: trivial,
    store_startup_ms: store,
    trivial_median_ms: median(trivial),
    store_median_ms: median(store),
    our_share_ms: median(store) - median(trivial),
  };
  if (json) {
    console.log(JSON.stringify(reading, null, 2));
  } else {
    console.log(`cold local, ${reading.read_at}`);
    console.log(`  script            ${bytes.toLocaleString("en-US")} bytes (minified, as deployed)`);
    console.log(`  nothing           ${reading.trivial_median_ms} ms   median of ${runs} workerd starts [${trivial.join(", ")}]`);
    console.log(`  the store         ${reading.store_median_ms} ms   median of ${runs} workerd starts [${store.join(", ")}]`);
    console.log(`  ours              ${reading.our_share_ms} ms   compile plus top-level evaluation, this machine`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
