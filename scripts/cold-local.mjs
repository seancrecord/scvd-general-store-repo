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
 * THE DOORS BESIDE THE STORE (2026-09-05, the doors Worker). The same
 * reading is taken for src/doors.ts, the Worker that answers the
 * unpaid knock on /api/buy/*, and two facts are held rather than
 * printed: its script stays under a third of the store's (DOORS_BUDGET
 * below — a doors Worker that grew past that has lost its reason to
 * exist), and its bundle never carries src/services/fulfillment.ts,
 * the delivery floor, because a Worker that could deliver is a Worker
 * that could be made to. Either failing exits 1; that is the one gate
 * in this file.
 *
 * Usage, from the repo root (needs node_modules; the gates install it):
 *
 *   npm run cold:local              # bundle both, then five starts of each
 *   npm run cold:local -- --runs=9
 *   npm run cold:local -- --json
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
/** A third of the store as it stood when the doors were cut (3,522,782 bytes). */
const DOORS_BUDGET = 1_000_000;
const DELIVERY_FLOOR = "src/services/fulfillment.ts";

const require = createRequire(import.meta.url);
const workerd = require.resolve("@cloudflare/workerd-linux-64/bin/workerd").replace(/\/bin\/workerd$/, "/bin/workerd");

const dir = mkdtempSync(join(tmpdir(), "scvd-cold-local-"));
try {
  // 1. The bundles, exactly as a deploy would make them: the store from
  //    the root config, the doors from theirs, each into its own dir.
  const dirs = { store: join(dir, "store"), doors: join(dir, "doors") };
  const built = {};
  // wrangler names the output after the entry file: index.js for the
  // store (src/index.ts), doors.js for the doors (src/doors.ts).
  for (const [name, config, entry] of [["store", null, "index.js"], ["doors", "doors/wrangler.jsonc", "doors.js"]]) {
    const argv = ["wrangler", "deploy", "--dry-run", "--outdir", dirs[name]];
    if (config) argv.push("-c", config);
    const result = spawnSync("npx", argv, { encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    if (result.status !== 0) {
      console.error(result.stdout, result.stderr);
      process.exit(2);
    }
    const files = readdirSync(dirs[name]).filter((f) => f.endsWith(".js"));
    built[name] = {
      entry,
      textModules: files.filter((f) => f !== entry),
      bytes: Buffer.byteLength(readFileSync(join(dirs[name], entry))),
      map: existsSync(join(dirs[name], `${entry}.map`)) ? JSON.parse(readFileSync(join(dirs[name], `${entry}.map`), "utf8")) : null,
    };
  }
  const bytes = built.store.bytes;

  // 2. Three workerd configs: the store, the doors, and a script that
  //    does nothing. Each entry's text modules ride along as text.
  writeFileSync(join(dir, "trivial.js"), "export default { fetch() { return new Response('ok'); } };\n");
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
  const bindings = `bindings = [ (name = "STORE_BASE_URL", text = "https://scvd.store") ]`;
  for (const name of ["store", "doors"]) {
    const b = built[name];
    const modules = [`(name = "${b.entry}", esModule = embed "${name}/${b.entry}")`]
      .concat(b.textModules.map((f) => `(name = "${f}", text = embed "${name}/${f}")`))
      .join(", ");
    const extra =
      name === "store"
        ? `durableObjectNamespaces = [ (className = "TradeNonceStore", uniqueKey = "trade") ],
  durableObjectStorage = (inMemory = void),
  bindings = [ (name = "STORE_BASE_URL", text = "https://scvd.store"), (name = "TRADE_NONCES", durableObjectNamespace = "TradeNonceStore") ],`
        : `${bindings},`;
    writeFileSync(join(dir, `${name}.capnp`), config(modules, extra));
  }

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
  const doors = [];
  for (let i = 0; i < runs; i += 1) trivial.push(await startOnce("trivial"));
  for (let i = 0; i < runs; i += 1) store.push(await startOnce("store"));
  for (let i = 0; i < runs; i += 1) doors.push(await startOnce("doors"));

  // 4. The two facts held, not printed.
  const doorsSources = built.doors.map?.sources ?? [];
  const carriesDelivery = doorsSources.some((src) => src.replace(/\\/g, "/").endsWith(DELIVERY_FLOOR));
  const overBudget = built.doors.bytes > DOORS_BUDGET;

  const reading = {
    read_at: new Date().toISOString(),
    script_bytes: bytes,
    doors_bytes: built.doors.bytes,
    doors_budget_bytes: DOORS_BUDGET,
    runs,
    trivial_startup_ms: trivial,
    store_startup_ms: store,
    doors_startup_ms: doors,
    trivial_median_ms: median(trivial),
    store_median_ms: median(store),
    doors_median_ms: median(doors),
    our_share_ms: median(store) - median(trivial),
    doors_share_ms: median(doors) - median(trivial),
    doors_carries_delivery: carriesDelivery,
    doors_over_budget: overBudget,
  };
  if (json) {
    console.log(JSON.stringify(reading, null, 2));
  } else {
    console.log(`cold local, ${reading.read_at}`);
    console.log(`  script            ${bytes.toLocaleString("en-US")} bytes (the store, minified, as deployed)`);
    console.log(`  doors             ${built.doors.bytes.toLocaleString("en-US")} bytes (src/doors.ts, minified, as deployed; budget ${DOORS_BUDGET.toLocaleString("en-US")})`);
    console.log(`  nothing           ${reading.trivial_median_ms} ms   median of ${runs} workerd starts [${trivial.join(", ")}]`);
    console.log(`  the store         ${reading.store_median_ms} ms   median of ${runs} workerd starts [${store.join(", ")}]`);
    console.log(`  the doors         ${reading.doors_median_ms} ms   median of ${runs} workerd starts [${doors.join(", ")}]`);
    console.log(`  ours, store       ${reading.our_share_ms} ms   compile plus top-level evaluation, this machine`);
    console.log(`  ours, doors       ${reading.doors_share_ms} ms   the same, for the Worker the directory knocks on`);
  }
  if (carriesDelivery) {
    console.error(`\nThe doors bundle carries ${DELIVERY_FLOOR}. A Worker that answers the unpaid knock must not be able to deliver; find the import that dragged the floor in (npx esbuild --metafile from src/doors.ts) and cut it.`);
    process.exitCode = 1;
  }
  if (overBudget) {
    console.error(`\nThe doors script is ${built.doors.bytes.toLocaleString("en-US")} bytes, over its ${DOORS_BUDGET.toLocaleString("en-US")} byte budget. It exists to be small; move what grew, or raise the budget in scripts/cold-local.mjs with a reason.`);
    process.exitCode = 1;
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
