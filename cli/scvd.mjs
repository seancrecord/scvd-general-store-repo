#!/usr/bin/env node
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { inspectionExitCodeFor, renderInspectionLines } from "./inspection.js";

/**
 * scvd — THE OFFICIAL COMMAND LINE FOR scvd.store, zero dependencies.
 *
 * WHY IT EXISTS. Every instrument this wraps was already free, public
 * and documented: POST /api/preflight/v2 checks any x402 door, POST
 * /api/conformance/v1 reads any issuer's signed offer or receipt, GET
 * /api/verify/{id} verifies anything this store ever signed, and the
 * corpus and fresh set are plain JSON. A readiness audit still scored
 * the store partial on "CLI tool available", and the reason is worth
 * writing down rather than arguing with: a developer with a broken
 * x402 endpoint does not want to compose a curl with a JSON body and
 * pipe it through jq. They want to type one line and be told what is
 * wrong. Between those two things sits every integration that never
 * happened.
 *
 * WHAT IT IS NOT. Not a client for the paid shelf. It cannot sign a
 * payment, it holds no key, it stores nothing, and it asks for no
 * credential — the store's standing rule is that it never asks anyone
 * to hand over key material, and a CLI is exactly where that rule
 * would be easiest to break quietly. Paid purchases stay where they
 * belong: an x402 client you already trust, or the MCP server.
 *
 * NO DEPENDENCIES, DELIBERATELY, for the same reason bin/
 * scvd-mcp-bridge.mjs has none. Node 18+ has fetch. A tool that runs
 * on somebody else's machine and has an empty supply chain is a tool
 * nobody has to audit.
 *
 * EVERY COMMAND PRINTS THE SERVER'S OWN JSON with `--json`, so this
 * is a convenience over the API and never a second source of truth.
 * The human rendering below is a rendering; the evidence is what the
 * store signed and served.
 */

/**
 * The origin, and it is a `let` on purpose: `--base` exists so this
 * tool can be pointed at a staging deployment or at a fork, which is
 * the whole reason a CLI beats a hardcoded curl in a runbook.
 */
let BASE = (process.env.SCVD_BASE_URL ?? "https://scvd.store").replace(
  /\/+$/,
  "",
);

/**
 * Read from package.json rather than typed here — the same drift the
 * tab's server hit when its handshake reported 0.2.0 while the
 * package said 0.3.0. npm always ships package.json in the tarball.
 */
const VERSION = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

function usage() {
  return `scvd ${VERSION} — the command line for ${BASE}

  scvd init [--dry-run] [--yes] [--verifier] [--dir <path>]
                                Wire the store's MCP door into the agent
                                hosts found on this machine (Claude Code,
                                Cursor; Codex gets a snippet to paste).
                                Shows the exact change and asks first.
                                No network, no key, no account.
  scvd inspect <url>            Observed protocols, advertised terms and
                                gaps; no payment or signature verification.
  scvd preflight <url>          Does that x402 door answer a well-formed
                                402? One probe, every check named.
  scvd conformance <file|->     Read a signed offer or receipt (compact
                                JWS) and say whether it holds up. Any
                                issuer's, including ones we compete with.
  scvd look <url>               What the store holds about that door: one
                                live preflight beside the signed history,
                                counts with denominators, never a score.
  scvd before-you-pay <url>     Will a stock x402 client pay that door,
      [--cap <usd>]             and which accept would it sign? A dry run;
                                nothing is signed, nothing is paid.
  scvd verify <id>              Verify anything this store ever signed.
  scvd receipt <file|->         Verify any issuer's receipt JSON and get
                                back a signed verdict.
  scvd onpage <url>             What that page serves a machine reader.
  scvd fresh-set                This week's working x402 doors.
  scvd corpus [--since <week>]  The weekly signed census index; with
                                --since, what moved since that week.
  scvd corpus-index [--limit <n>] [--cursor <cursor>]
                                One compact metadata page, with its gaps
                                and next link. No snapshots fetched.
  scvd host <host>              Every signed round that met a host,
                                the gaps by reason, the tier, the cite.
  scvd cite <host> [--week <w>] The citation for a host's row — the
                                last probed one, or the week named —
                                as one line and as JSON.
  scvd reproduce <url> [--since <week>]
                                Probe the door now and set it against
                                the signed row: same, moved,
                                instrument_moved, not_comparable or
                                no_such_round, both sides named.
  scvd month [YYYY-MM]          The state of x402 for one month: the
                                closing week beside every round's door-
                                weeks, defects by name, the month before.
  scvd feeds                    The Atom feeds: the brief, the corpus,
                                corrections, disagreements.
  scvd menu                     What is on the shelf, and for how much.
  scvd catalog                  Every developer resource, from the
                                RFC 9727 API catalog.
  scvd versions                 Every API version served, and any sunset.
  scvd trade check <item> [f|-] Sign a trade order against the SANDBOX
                                account with its published secret and
                                ask the check desk which of the four
                                signature checks pass. Nothing delivered.
  scvd trade order <item> [f|-] The same, delivered: real goods, marked
                                test, booked to nobody.

Flags
  --json                        Print the server's response verbatim.
  --dry-run, --yes, --verifier, --dir <path>
                                init only: look without writing; consent
                                up front; wire the free verifier door
                                instead of the store; the project to wire.
  --since <week>, --week <week> A signed week as the corpus spells it,
                                e.g. 2026-W34.
  --base <url>                  Point at another origin (or SCVD_BASE_URL).
  --version, --help

Nothing here needs an account, a key, or a wallet. This tool never asks
for a credential and cannot spend money: paid shelves take a signed
x402 payment per request, which belongs in an x402 client or the MCP
server at ${BASE}/mcp.
`;
}

/** Exit codes a script can branch on, rather than grepping prose. */
const EXIT = {
  ok: 0,
  /** The instrument ran and the answer was "no". */
  verdictNegative: 1,
  /** The caller asked for something impossible. */
  usage: 2,
  /** The store, or the network between here and it, did not answer. */
  unreachable: 3,
};

function fail(message, code = EXIT.usage) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function call(path, { method = "GET", body } = {}) {
  const url = `${BASE}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": `scvd-cli/${VERSION} (+${BASE}/developers)`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    fail(
      `Could not reach ${url}: ${error.message}\nThat is a fact about the network between you and the store, not about your endpoint.`,
      EXIT.unreachable,
    );
  }
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail(
      `${url} answered ${response.status} with something that is not JSON.`,
      EXIT.unreachable,
    );
  }
  /**
   * THE RATE LIMIT, SURFACED RATHER THAN SWALLOWED. The store began
   * returning the IETF RateLimit fields on its metered paths in
   * August; a client that reads them and says nothing is no better
   * than one that never looked.
   */
  const remaining = response.headers.get("ratelimit-remaining");
  const reset = response.headers.get("ratelimit-reset");
  return { status: response.status, json, remaining, reset };
}

function readInput(argument) {
  if (!argument) fail("Give me a file path, or - to read stdin.");
  if (argument === "-") return readFileSync(0, "utf8").trim();
  return readFileSync(argument, "utf8").trim();
}

/** ✓ / ✗ without pretending a terminal supports anything else. */
function mark(ok) {
  return ok ? "PASS" : "FAIL";
}

function printChecks(checks = []) {
  for (const check of checks) {
    process.stdout.write(`  ${mark(check.ok)}  ${check.name}\n`);
    if (!check.ok && check.detail) {
      process.stdout.write(`        ${check.detail}\n`);
    }
  }
}

/**
 * WHAT TO DO ABOUT IT, both sides — the server's own rows, printed,
 * never derived here: the store joins each failed check or advisory to
 * its defect class and carries the operator's half and the buyer's
 * half with the definition URL. Absent on older servers and on a clean
 * door, and then nothing prints.
 */
function printRemediation(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  process.stdout.write("\n");
  for (const row of rows) {
    process.stdout.write(`  FIX   ${row.signal} → ${row.defect_class} (${row.definition_url})\n`);
    if (row.operator) process.stdout.write(`        operator: ${row.operator}\n`);
    if (row.buyer) process.stdout.write(`        buyer:    ${row.buyer}\n`);
  }
}

/**
 * THE SECOND WIRE (0.2.0, servers from 2026-09-04): which protocols the
 * door speaks, and the MPP battery's own checks when it speaks MPP. The
 * verdict line above stays x402's; a door on the other wire is not
 * broken, and this is where the tool says so.
 */
function printProtocols(report) {
  if (!Array.isArray(report.protocols_spoken)) return;
  process.stdout.write(`  protocols spoken: ${report.protocols_spoken.length > 0 ? report.protocols_spoken.join(", ") : "none read"}\n`);
  const mpp = report.mpp;
  if (!mpp || !mpp.spoken) return;
  process.stdout.write(`  MPP battery (${mpp.battery}, ${mpp.spec}):\n`);
  for (const check of mpp.checks ?? []) {
    process.stdout.write(`    ${mark(check.ok)}  ${check.name}\n`);
    if (!check.ok && check.detail) process.stdout.write(`          ${check.detail}\n`);
  }
  for (const advisory of mpp.advisories ?? []) {
    process.stdout.write(`    NOTE  ${advisory.name}: ${advisory.detail}\n`);
  }
}

function printBudget({ remaining, reset }) {
  if (remaining === null || remaining === undefined) return;
  process.stdout.write(
    `\n  ${remaining} probes left this minute; the bucket rolls in ${reset ?? "?"}s.\n`,
  );
}

/**
 * THE SANDBOX SIGNER (2026-09-03). Signs with the sandbox's PUBLISHED
 * secret, read off /api/trade/contract rather than typed here, so this
 * command never holds a credential of anyone's: a marketplace proving
 * its integration copies the same four headers with its own secret in
 * its own code (the snippets on /trade.md). The promise below the help
 * — this tool never asks for a credential — stays true by construction.
 */
async function signedTradeRequest(itemId, bodyArgument, door) {
  const contract = await call("/api/trade/contract");
  const sandbox = (contract.json.accounts ?? []).find((row) => row.published_secret);
  if (!sandbox) fail("The store's contract lists no sandbox account to sign against.", EXIT.unreachable);
  const body = bodyArgument
    ? readInput(bodyArgument)
    : JSON.stringify({ summary: "a sandbox order from scvd-cli", order_ref: `cli-${Date.now()}` });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", sandbox.published_secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");
  const path = door === "check"
    ? `/api/trade/${sandbox.account}/check`
    : `/api/trade/${sandbox.account}/${itemId}`;
  const url = `${BASE}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": `scvd-cli/${VERSION} (+${BASE}/developers)`,
        "X-Trade-Key": sandbox.published_provider_key,
        "X-Trade-Timestamp": timestamp,
        "X-Trade-Nonce": nonce,
        "X-Trade-Signature": `sha256=${signature}`,
      },
      body,
    });
  } catch (error) {
    fail(`Could not reach ${url}: ${error.message}`, EXIT.unreachable);
  }
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail(`${url} answered ${response.status} with something that is not JSON.`, EXIT.unreachable);
  }
  return { status: response.status, json, remaining: null, reset: null };
}

/**
 * scvd init — THE ONE COMMAND THAT WRITES A FILE, and why it exists.
 *
 * Every other command here is a read. This one wires the store's MCP
 * door into the agent hosts a developer already runs, because the
 * route that used to do that — a marketplace listing per host — is
 * fifteen submissions deep and mostly pending (DISTRIBUTION.md), while
 * the thing a host actually reads is one small JSON file in the
 * project. The developer can write that file themselves in ten
 * seconds if they know its shape; this prints the shape and, with
 * their yes, writes it.
 *
 * WHAT IT WILL NOT DO. It never touches a file outside the project it
 * is pointed at: a host's user-level configuration is theirs, and a
 * tool that edits ~/.claude.json or ~/.codex/config.toml on a guess
 * is the kind of tool nobody should run. Codex keeps its servers in
 * TOML at user level, so Codex gets a snippet printed, never a write.
 * It never overwrites an entry that already exists under the same
 * name with a different value: that is somebody's decision, and it
 * says so and exits 1. It never writes without consent — --yes, or a
 * y at a terminal; with neither it prints the plan and stops. It
 * never asks for a credential, because there is none to ask for: the
 * door is a public URL. And it makes no network call at all.
 *
 * WHICH DOOR. The store door (/mcp) by default, as this repository's
 * own .mcp.json and plugin manifest wire it; --verifier wires the
 * free-only door (/mcp/verifier) instead, for a host that must never
 * list a paid tool. Not both: the free tools appear on both doors
 * under different names, and two of each is noise for a model.
 */
const INIT_SERVER = { store: "scvd-store", verifier: "scvd-verifier" };

function initHosts(home, project) {
  const has = (...parts) => existsSync(join(...parts));
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      found: has(home, ".claude") || has(home, ".claude.json") || has(project, ".claude"),
      file: join(project, ".mcp.json"),
      note: "Claude Code reads this file from the project root; the same shape the agent-plugins format uses.",
      entry: (url) => ({ type: "http", url }),
    },
    {
      id: "cursor",
      name: "Cursor",
      found: has(home, ".cursor") || has(project, ".cursor"),
      file: join(project, ".cursor", "mcp.json"),
      note: "Cursor, project scope; the remote-server shape its documentation gives.",
      entry: (url) => ({ url }),
    },
    {
      id: "codex",
      name: "Codex",
      found: has(home, ".codex"),
      file: null,
      note: "Codex keeps servers in TOML at user level. Printed for you to paste; this tool writes nothing outside the project.",
      snippet: (name, url) => `[mcp_servers.${name}]\nurl = "${url}"`,
    },
  ];
}

function readJsonFile(file) {
  if (!existsSync(file)) return { exists: false, json: {} };
  const text = readFileSync(file, "utf8");
  try {
    const json = JSON.parse(text);
    if (!json || typeof json !== "object" || Array.isArray(json)) return { exists: true, json: null };
    return { exists: true, json };
  } catch {
    return { exists: true, json: null };
  }
}

function planInit(options) {
  const home = homedir();
  const project = resolve(options.dir ?? process.cwd());
  const name = options.verifier ? INIT_SERVER.verifier : INIT_SERVER.store;
  const url = `${BASE}${options.verifier ? "/mcp/verifier" : "/mcp"}`;
  const hosts = initHosts(home, project);
  const found = hosts.filter((host) => host.found);
  const rows = [];
  const targets = found.length > 0 ? found : [{ ...hosts[0], name: "no host detected — the portable file", found: false }];
  for (const host of targets) {
    if (!host.file) {
      rows.push({ host: host.name, file: null, server: name, url, status: "print_only", note: host.note, snippet: host.snippet(name, url) });
      continue;
    }
    const existing = readJsonFile(host.file);
    const entry = host.entry(url);
    let status = "add";
    if (existing.exists && existing.json === null) status = "unreadable";
    else {
      const current = existing.json.mcpServers?.[name];
      if (current !== undefined) status = JSON.stringify(current) === JSON.stringify(entry) ? "already" : "conflict";
    }
    rows.push({
      host: host.name, file: host.file, shown: relative(process.cwd(), host.file) || host.file,
      server: name, url, status, note: host.note, entry,
      ...(status === "conflict" ? { current: existing.json.mcpServers[name] } : {}),
    });
  }
  return { project, found: found.map((host) => host.name), server: name, url, rows };
}

function writeInitRow(row) {
  const existing = readJsonFile(row.file);
  const json = existing.json ?? {};
  const next = { ...json, mcpServers: { ...(json.mcpServers ?? {}), [row.server]: row.entry } };
  mkdirSync(dirname(row.file), { recursive: true });
  writeFileSync(row.file, `${JSON.stringify(next, null, 2)}\n`);
}

async function askYes(question) {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise((resolveAnswer) => rl.question(question, resolveAnswer));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

const COMMANDS = {
  async init(args, options) {
    if (args.length > 0) fail("scvd init takes flags only: --dry-run, --yes, --verifier, --dir <path>.");
    const plan = planInit(options);
    const writable = plan.rows.filter((row) => row.status === "add");
    const conflicts = plan.rows.filter((row) => row.status === "conflict" || row.status === "unreadable");
    const describe = (row) => {
      if (row.status === "print_only") return `  ${row.host}: print only — paste this yourself:\n${row.snippet.split("\n").map((line) => `      ${line}`).join("\n")}\n    (${row.note})`;
      const verb = { add: "add", already: "already there, unchanged", conflict: `KEPT AS IS — ${row.server} already names ${JSON.stringify(row.current)}; not overwriting a decision that is not mine`, unreadable: "KEPT AS IS — the file is not JSON this tool can read; not overwriting it" }[row.status];
      return `  ${row.shown}: ${verb}${row.status === "add" ? ` ${row.server} → ${row.url}` : ""}\n    (${row.note})`;
    };
    const header = `scvd init — wire ${plan.url} into the agent hosts found here. No network, no key, no account.\n  project: ${plan.project}\n  found: ${plan.found.length > 0 ? plan.found.join(", ") : "none (the portable .mcp.json is offered anyway)"}\n`;
    if (!options.json) process.stdout.write(`${header}${plan.rows.map(describe).join("\n")}\n`);
    if (options.dryRun) {
      if (options.json) process.stdout.write(`${JSON.stringify({ ...plan, written: [], dry_run: true }, null, 2)}\n`);
      else process.stdout.write("\nDry run: nothing written.\n");
      return conflicts.length > 0 ? EXIT.verdictNegative : EXIT.ok;
    }
    let written = [];
    if (writable.length > 0) {
      const consent = options.yes ? true : await askYes(`\nWrite ${writable.length} file${writable.length === 1 ? "" : "s"}? [y/N] `);
      if (consent === null) {
        if (options.json) process.stdout.write(`${JSON.stringify({ ...plan, written: [], refused: "no terminal to ask on" }, null, 2)}\n`);
        else process.stdout.write("\nNothing written: no terminal to ask on. Re-run with --yes to consent, or --dry-run to look.\n");
        return EXIT.usage;
      }
      if (!consent) {
        if (!options.json) process.stdout.write("\nNothing written.\n");
        else process.stdout.write(`${JSON.stringify({ ...plan, written: [], refused: "declined" }, null, 2)}\n`);
        return EXIT.ok;
      }
      for (const row of writable) {
        writeInitRow(row);
        written.push(row.file);
        if (!options.json) process.stdout.write(`wrote ${row.shown}\n`);
      }
    } else if (!options.json) {
      process.stdout.write("\nNothing to write.\n");
    }
    if (options.json) process.stdout.write(`${JSON.stringify({ ...plan, written }, null, 2)}\n`);
    return conflicts.length > 0 ? EXIT.verdictNegative : EXIT.ok;
  },

  async inspect(args, options) {
    const url = args[0];
    if (!url || args.length !== 1) fail("scvd inspect <url> — one endpoint to observe without payment.");
    const result = await call("/api/preflight/v2", { method: "POST", body: { url } });
    const reading = { status: result.status, body: result.json };
    process.stdout.write(options.json ? `${JSON.stringify(result.json, null, 2)}\n` : `${renderInspectionLines(reading).join("\n")}\n`);
    return inspectionExitCodeFor(reading);
  },

  async trade(args, options) {
    const [door, itemId, bodyArgument] = args;
    if (door !== "check" && door !== "order") {
      fail("scvd trade check|order <item_id> [file|-] — check reports the signature checks; order delivers on the sandbox.");
    }
    if (!itemId) fail("scvd trade check|order <item_id> — a menu id at the counter, e.g. context_anchor.");
    const result = await signedTradeRequest(itemId, bodyArgument, door);
    if (options.json) return dump(result);
    if (door === "check") {
      const report = result.json;
      process.stdout.write(`  would pass: ${report.would_pass}${report.first_failure ? ` (first failure: ${report.first_failure})` : ""}\n`);
      const checks = report.checks ?? {};
      process.stdout.write(`  ${mark(checks.headers?.missing?.length === 0)}  headers present\n`);
      process.stdout.write(`  ${mark(checks.provider_key === "ok" || checks.provider_key === "not_in_this_dialect")}  provider key\n`);
      process.stdout.write(`  ${mark(checks.timestamp?.within_window === true)}  timestamp within window (skew ${checks.timestamp?.skew_seconds ?? "?"}s)\n`);
      process.stdout.write(`  ${mark(checks.nonce?.shape_ok !== false)}  nonce shape\n`);
      process.stdout.write(`  ${mark(checks.signature?.verified_with !== "none")}  signature (${checks.signature?.verified_with ?? "?"})\n`);
      process.stdout.write(`  ${mark(checks.replay === "fresh")}  replay (${checks.replay ?? "?"})\n`);
      return report.would_pass ? EXIT.ok : EXIT.verdictNegative;
    }
    if (result.status !== 200) {
      process.stdout.write(`${result.json.code ?? result.status}: ${result.json.error ?? ""}\n`);
      return EXIT.verdictNegative;
    }
    process.stdout.write(`  delivered: ${result.json.item_id} (${result.json.settled_via})\n  certificate: ${result.json.certificate?.cert_id}\n  verify: ${result.json.verify_url}\n`);
    return EXIT.ok;
  },

  async preflight(args, options) {
    const url = args[0];
    if (!url) fail("scvd preflight <url> — the URL a buyer would GET.");
    const result = await call("/api/preflight/v2", {
      method: "POST",
      body: { url },
    });
    if (options.json) return dump(result);
    if (result.status === 429) {
      process.stdout.write(`${result.json.error}\n`);
      return EXIT.unreachable;
    }
    const report = result.json;
    if (report.error) {
      process.stdout.write(`${report.error}\n`);
      return EXIT.usage;
    }
    process.stdout.write(`${url}\n  verdict: ${report.verdict}\n`);
    printProtocols(report);
    process.stdout.write("\n");
    printChecks(report.checks);
    for (const advisory of report.advisories ?? []) {
      process.stdout.write(`  NOTE  ${advisory.name}: ${advisory.detail}\n`);
    }
    printRemediation(report.remediation);
    printBudget(result);
    /*
     * `unreachable` is NOT a failure of the endpoint and does not
     * exit 1: the store is explicit that it describes the network
     * path at one moment, and a CI job that reads it as "their door
     * is broken" would be drawing a conclusion the evidence refuses.
     */
    return report.verdict === "not_ready" ? EXIT.verdictNegative : EXIT.ok;
  },

  /**
   * THE LOOK (0.2.0): the free door that answers "what do you hold
   * about this door?" — one live preflight folded with the signed
   * chain. Rendered as the two halves and the one comparison the door
   * adds; every number the store served travels with its denominator,
   * and the tool prints nothing it did not receive.
   */
  async look(args, options) {
    const url = args[0];
    if (!url) fail("scvd look <url> — the x402 door to look at.");
    const result = await call("/api/look/v1", { method: "POST", body: { url } });
    if (options.json) return dump(result);
    if (result.status === 429) {
      process.stdout.write(`${result.json.error}\n`);
      return EXIT.unreachable;
    }
    const report = result.json;
    if (report.error) {
      process.stdout.write(`${report.error}\n`);
      if (report.next_action) process.stdout.write(`  next: ${report.next_action}\n`);
      return EXIT.usage;
    }
    process.stdout.write(`${report.url}\n  ${report.headline}\n\n`);
    const now = report.now ?? {};
    process.stdout.write(`  now:   ${now.verdict} (${now.battery ?? "?"})`);
    if ((now.failed ?? []).length > 0) process.stdout.write(` — failed: ${now.failed.join(", ")}`);
    process.stdout.write("\n");
    const held = report.held ?? {};
    if (held.never_met) {
      process.stdout.write("  held:  never met — the chain holds no round for this host\n");
    } else {
      process.stdout.write(
        `  held:  probed ${held.rounds_probed} of ${held.rounds_since_first_sighting} rounds since first sighting; last signed verdict ${held.last_probed_round?.verdict ?? "?"} (${held.last_probed_round?.week ?? "?"}); tier ${held.tier?.tier ?? "?"} on ${held.tier?.fraction ?? "?"}\n`,
      );
    }
    const against = report.now_against_held ?? {};
    process.stdout.write(`  now against held: ${against.line ?? "?"} — ${against.detail ?? ""}\n`);
    printRemediation(now.the_door?.remediation);
    printBudget(result);
    return now.verdict === "not_ready" ? EXIT.verdictNegative : EXIT.ok;
  },

  /**
   * THE DRY RUN (0.2.0): will YOUR client pay this door. The verdict
   * is about the buyer, not the door — a well-shaped 402 a stock
   * client refuses on the buyer's own machine is the case that loses
   * money quietly. --cap sets the client's per-payment ceiling in USD;
   * without it the answer is for a client configured with nothing.
   */
  async "before-you-pay"(args, options) {
    const url = args[0];
    if (!url) fail("scvd before-you-pay <url> [--cap <usd>] — the door you are about to pay.");
    const body = { url };
    if (options.cap !== undefined) {
      const cap = Number(options.cap);
      if (!Number.isFinite(cap) || cap <= 0) fail("--cap wants a positive number of US dollars.");
      body.client_profile = { max_amount_per_payment_usd: cap };
    }
    const result = await call("/api/before-you-pay/v1", { method: "POST", body });
    if (options.json) return dump(result);
    if (result.status === 429) {
      process.stdout.write(`${result.json.error}\n`);
      return EXIT.unreachable;
    }
    const report = result.json;
    if (report.error) {
      process.stdout.write(`${report.error}\n`);
      if (report.next_action) process.stdout.write(`  next: ${report.next_action}\n`);
      return EXIT.usage;
    }
    const client = report.your_client ?? {};
    process.stdout.write(`${report.url}\n  will your client pay: ${report.will_your_client_pay}\n`);
    if (client.chosen) {
      const c = client.chosen;
      process.stdout.write(`  would sign accept ${c.index}: ${c.network} ${c.asset} ${c.amount_atomic} atomic${c.amount_usd !== null && c.amount_usd !== undefined ? ` ($${c.amount_usd})` : ""}${c.signing_window_seconds ? `, ${c.signing_window_seconds}s to sign` : ""}\n`);
    }
    if (client.throws_with) process.stdout.write(`  throws: ${client.throws_with}\n`);
    for (const dropped of client.dropped ?? []) {
      process.stdout.write(`  DROP  accept ${dropped.index} (${dropped.network}) at ${dropped.stage}: ${dropped.why}\n`);
    }
    for (const hazard of client.hazards ?? []) {
      process.stdout.write(`  NOTE  ${hazard.name}: ${hazard.detail}\n`);
    }
    if (client.cap_applied) process.stdout.write(`  cap applied: ${client.cap_applied}\n`);
    const door = report.the_door ?? {};
    process.stdout.write(`  the door: ${door.verdict ?? "?"}${(door.checks ?? []).some((check) => !check.ok) ? ` — failed: ${door.checks.filter((check) => !check.ok).map((check) => check.name).join(", ")}` : ""}\n`);
    printRemediation(door.remediation);
    printBudget(result);
    /*
     * The exit code follows the BUYER'S answer: would_throw means a
     * payment attempt fails on this machine, which is what a script
     * asks. cannot_simulate is a finding about the door, and the
     * preflight is the instrument for it, so it exits 0 here.
     */
    return report.will_your_client_pay === "would_throw" ? EXIT.verdictNegative : EXIT.ok;
  },

  async conformance(args, options) {
    const artifact = readInput(args[0]);
    const result = await call("/api/conformance/v1", {
      method: "POST",
      body: { artifact },
    });
    if (options.json) return dump(result);
    const report = result.json;
    if (report.error) {
      process.stdout.write(`${report.error}\n`);
      return EXIT.usage;
    }
    process.stdout.write(`  verdict: ${report.verdict}\n\n`);
    printChecks(report.checks);
    if (report.not_checked?.length) {
      process.stdout.write(`\n  Not checked:\n`);
      for (const line of report.not_checked) {
        process.stdout.write(`    - ${line}\n`);
      }
    }
    return report.verdict === "valid" ? EXIT.ok : EXIT.verdictNegative;
  },

  async receipt(args, options) {
    const raw = readInput(args[0]);
    let document;
    try {
      document = JSON.parse(raw);
    } catch {
      fail("That file is not JSON. A receipt goes in whole, as served.");
    }
    const result = await call("/api/verify-receipt", {
      method: "POST",
      body: document,
    });
    if (options.json) return dump(result);
    const report = result.json;
    process.stdout.write(`  verdict: ${report.verdict ?? report.error}\n\n`);
    printChecks(report.checks);
    return report.verdict === "valid" ? EXIT.ok : EXIT.verdictNegative;
  },

  async verify(args, options) {
    const id = args[0];
    if (!id) fail("scvd verify <id> — a cert id, or any artifact id.");
    const result = await call(`/api/verify/${encodeURIComponent(id)}`);
    if (options.json) return dump(result);
    if (result.status === 404) {
      process.stdout.write(`No artifact here under ${id}.\n`);
      return EXIT.verdictNegative;
    }
    const report = result.json;
    process.stdout.write(
      `  ${id}: ${report.valid === true ? "signature verifies" : "DOES NOT VERIFY"}\n`,
    );
    if (report.signed_at) process.stdout.write(`  signed ${report.signed_at}\n`);
    if (report.public_key_hex) {
      process.stdout.write(`  key ${report.public_key_hex}\n`);
    }
    process.stdout.write(
      `\n  You do not have to take this from us: the exact signed bytes and\n  the public key are in the response (--json), and any ed25519\n  library checks them offline.\n`,
    );
    return report.valid === true ? EXIT.ok : EXIT.verdictNegative;
  },

  async onpage(args, options) {
    const url = args[0];
    if (!url) fail("scvd onpage <url> — the page to read, as served.");
    const result = await call("/api/onpage/v1", {
      method: "POST",
      body: { url },
    });
    if (options.json) return dump(result);
    const report = result.json;
    if (report.error) {
      process.stdout.write(`${report.error}\n`);
      return EXIT.usage;
    }
    process.stdout.write(`${url}\n  verdict: ${report.verdict}\n\n`);
    printChecks(report.checks);
    return report.verdict === "not_ready" ? EXIT.verdictNegative : EXIT.ok;
  },

  async "fresh-set"(_args, options) {
    const result = await call("/fresh-set");
    if (options.json) return dump(result);
    const set = result.json;
    for (const row of set.doors ?? set.hosts ?? []) {
      process.stdout.write(
        `  ${row.host ?? row.url}${row.cheapest_usdc ? `  $${row.cheapest_usdc}` : ""}\n`,
      );
    }
    return EXIT.ok;
  },

  async corpus(_args, options) {
    if (options.week) {
      const result = await call(`/corpus/diff.json?since=${encodeURIComponent(options.week)}`);
      return dump(result);
    }
    const result = await call("/corpus.json");
    return dump(result);
  },

  async "corpus-index"(args, options) {
    if (args.length || options.week || options.cap !== undefined) {
      fail("scvd corpus-index [--limit <n>] [--cursor <cursor>] — one metadata page; use corpus --since for a diff.");
    }
    const query = new URLSearchParams();
    if (options.limit !== undefined) query.set("limit", options.limit);
    if (options.cursor !== undefined) query.set("cursor", options.cursor);
    const suffix = query.toString() ? `?${query}` : "";
    // Returning next is deliberate: another page or snapshot is another caller decision.
    const result = await call(`/corpus/index.json${suffix}`);
    if (result.status < 400 && (result.json === null || typeof result.json !== "object" || Array.isArray(result.json))) {
      fail("The compact corpus page did not return a JSON object.", EXIT.unreachable);
    }
    return dump(result);
  },

  async host(args, options) {
    const host = args[0];
    if (!host) fail("scvd host <host> — the hostname, e.g. example.com.");
    const result = await call(`/corpus/host/${encodeURIComponent(host)}.json`);
    if (options.json) return dump(result);
    if (result.status === 404) {
      process.stdout.write(`${result.json.error}\n`);
      return EXIT.verdictNegative;
    }
    const history = result.json;
    process.stdout.write(
      `${host}\n  tier: ${history.tier?.line ?? "?"}\n  probed ${history.rounds_probed} of ${history.rounds_since_first_sighting} rounds since first sighting; missed ${history.rounds_gapped}\n\n`,
    );
    for (const round of history.timeline ?? []) {
      process.stdout.write(
        `  ${round.week}  ${round.probed ? String(round.verdict).padEnd(12) : `gap: ${round.gap}`.padEnd(12)}  ${(round.failed ?? []).join(", ")}\n`,
      );
    }
    if (history.cite) {
      process.stdout.write(`\n  cite: ${history.cite}\n`);
    }
    return EXIT.ok;
  },

  async cite(args, options) {
    const host = args[0];
    if (!host) fail("scvd cite <host> [--week <week>] — the host whose row you are citing.");
    const result = await call(`/corpus/host/${encodeURIComponent(host)}.json`);
    if (result.status === 404) {
      process.stdout.write(`${result.json.error}\n`);
      return EXIT.verdictNegative;
    }
    const history = result.json;
    let cite = history.cite_json ? { text: history.cite ?? "", markdown: markdownFor(history.cite_json), json: history.cite_json } : null;
    if (options.week) {
      const round = (history.timeline ?? []).find((entry) => entry.week === options.week);
      if (!round) {
        process.stdout.write(
          `No signed row for ${host} in ${options.week}. Weeks held: ${(history.timeline ?? []).map((entry) => entry.week).join(", ") || "none"}.\n`,
        );
        return EXIT.verdictNegative;
      }
      if (!round.probed) {
        process.stdout.write(
          `The row for ${host} in ${options.week} is a gap (${round.gap}), not an observation. Cite it as a gap: ${round.entry_url}\n`,
        );
        return EXIT.verdictNegative;
      }
      cite = citeShape(history.cite_json, host, round);
    }
    if (!cite) {
      process.stdout.write(`${host} has no probed row yet; a gap is cited as a gap, never as a zero.\n`);
      return EXIT.verdictNegative;
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify(cite.json, null, 2)}\n`);
      return EXIT.ok;
    }
    process.stdout.write(`${cite.text}\n\n${cite.markdown}\n\n${JSON.stringify(cite.json, null, 2)}\n`);
    return EXIT.ok;
  },

  async reproduce(args, options) {
    const url = args[0];
    if (!url) fail("scvd reproduce <url> [--since <week>] — the door, as a buyer would GET it.");
    const result = await call("/api/look/v1", {
      method: "POST",
      body: { url, ...(options.week ? { since: options.week } : {}) },
    });
    if (options.json) return dump(result);
    if (result.status === 429) {
      process.stdout.write(`${result.json.error}\n`);
      return EXIT.unreachable;
    }
    const report = result.json;
    if (report.error) {
      process.stdout.write(`${report.error}\n`);
      return EXIT.usage;
    }
    const r = report.reproduce ?? {};
    process.stdout.write(`${url}\n  class: ${r.class}\n  ${r.detail}\n`);
    if (r.compared_with) {
      process.stdout.write(
        `\n  row:  ${r.compared_with.week}  ${r.compared_with.verdict}  ${(r.compared_with.failed ?? []).join(", ")}  ${r.compared_with.entry_url}\n  live: ${r.live?.battery}  ${r.live?.verdict}  ${(r.live?.failed ?? []).join(", ")}\n`,
      );
    }
    if (r.cite) process.stdout.write(`\n  cite: ${r.cite.text}\n`);
    process.stdout.write(`\n  rule: ${r.rule_url}\n`);
    printBudget(result);
    /*
     * Exit codes a script can branch on: 0 same, 1 moved or
     * instrument_moved (something to look at), 3 not comparable or no
     * such round (nothing was compared, which is not a finding about
     * the door).
     */
    if (r.class === "same") return EXIT.ok;
    if (r.class === "moved" || r.class === "instrument_moved") return EXIT.verdictNegative;
    return EXIT.unreachable;
  },

  /** THE MONTH (0.2.0): one month of the corpus, closing week beside door-weeks, never divided. */
  async month(args, options) {
    const which = args[0];
    if (which && !/^\d{4}-\d{2}$/.test(which)) fail("scvd month [YYYY-MM] — a calendar month, e.g. 2026-08.");
    const result = await call(which ? `/corpus/month/${which}` : "/corpus/month");
    if (options.json) return dump(result);
    const state = result.json;
    if (state.error) {
      process.stdout.write(`${state.error}\n`);
      return EXIT.usage;
    }
    const line = (label, reading) =>
      process.stdout.write(`  ${label.padEnd(12)} listed ${reading.listed}  probed ${reading.probed}  payable ${reading.payable}  not payable ${reading.not_payable}  unreachable ${reading.unreachable}  offers seen ${reading.offers_seen}\n`);
    process.stdout.write(`${state.name ?? "The state of x402"}, ${state.month}\n  weeks in the month: ${(state.weeks ?? []).length}\n`);
    if (state.closing) line(`closing ${state.closing.week ?? ""}`.trim(), state.closing);
    if (state.door_weeks) line(`door-weeks (${state.door_weeks.rounds} rounds)`, state.door_weeks);
    for (const defect of state.defects ?? []) {
      process.stdout.write(`  DEFECT  ${defect.id}: ${defect.door_weeks} door-weeks\n`);
    }
    if (Array.isArray(state.months_held) && state.months_held.length > 0) {
      process.stdout.write(`  months held: ${state.months_held.join(", ")}\n`);
    }
    if (state.what_this_is_not) process.stdout.write(`\n  ${state.what_this_is_not}\n`);
    return EXIT.ok;
  },

  /** THE FEEDS (0.2.0): the four Atom feeds, by address, from the store's own index. */
  async feeds(_args, options) {
    const result = await call("/feeds");
    if (options.json) return dump(result);
    for (const feed of result.json.feeds ?? []) {
      process.stdout.write(`  ${String(feed.title ?? feed.path).padEnd(28)} ${feed.url ?? feed.path}\n`);
      if (feed.summary) process.stdout.write(`      ${feed.summary}\n`);
    }
    return EXIT.ok;
  },

  async menu(_args, options) {
    const result = await call("/menu.json");
    if (options.json) return dump(result);
    for (const item of result.json.items ?? []) {
      process.stdout.write(
        `  ${item.id.padEnd(26)} $${String(item.price_usdc).padStart(7)}  ${item.name}\n`,
      );
    }
    return EXIT.ok;
  },

  async catalog(_args, options) {
    const result = await call("/.well-known/api-catalog");
    if (options.json) return dump(result);
    for (const entry of result.json.linkset ?? []) {
      process.stdout.write(`  ${entry.title ?? entry.anchor}\n`);
      for (const relation of ["service-desc", "service-doc", "service-meta"]) {
        for (const link of entry[relation] ?? []) {
          process.stdout.write(`      ${relation.padEnd(13)} ${link.href}\n`);
        }
      }
    }
    return EXIT.ok;
  },

  async versions(_args, options) {
    const result = await call("/deprecation");
    if (options.json) return dump(result);
    for (const row of result.json.versions ?? []) {
      process.stdout.write(
        `  ${row.path.padEnd(26)} ${row.status.padEnd(10)} since ${row.since}  sunset: ${row.sunset ?? "none announced"}\n`,
      );
    }
    return EXIT.ok;
  },
};

/**
 * The cite shape for a named week, built from the row the way the
 * store builds it (services/cite.ts): the same fields, so a citation
 * printed here and one printed by the store are one shape.
 */
function markdownFor(json) {
  return `[scvd.store corpus, ${json.host ? `${json.host}, ` : ""}week ${json.week}, snapshot ${json.sequence}](${json.cites}) — sha256 \`${json.digest}\``;
}

function citeShape(template, host, round) {
  const base = (template?.index ?? `${BASE}/corpus.json`).replace(/\/corpus\.json$/, "");
  const text = `scvd.store, host row ${host}, week ${round.week}, snapshot ${round.sequence}, sha256 ${round.digest}, observed ${round.taken_at}; bytes at ${round.entry_url}.`;
  const markdown = `[scvd.store corpus, ${host}, week ${round.week}, snapshot ${round.sequence}](${round.entry_url}) — sha256 \`${round.digest}\``;
  return {
    text,
    markdown,
    json: {
      cites: round.entry_url,
      host,
      week: round.week,
      sequence: round.sequence,
      observed_at: round.taken_at,
      digest: round.digest,
      rows: `${base}/corpus/host/${host}.json`,
      index: `${base}/corpus.json`,
      license: "CC-BY-4.0",
      how: `${base}/scorers`,
    },
  };
}

function dump(result) {
  process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
  return result.status >= 400 ? EXIT.verdictNegative : EXIT.ok;
}

async function main(argv) {
  const args = [];
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") { options.json = true; continue; }
    else if (argument === "--since" || argument === "--week") {
      const next = argv[(index += 1)];
      if (!next || !/^[0-9]{4}-W[0-9]{2}$/.test(next)) {
        fail(`${argument} wants a signed week as the corpus spells it, e.g. 2026-W34.`);
      }
      options.week = next;
      continue;
    } else if (argument === "--base") {
      const next = argv[(index += 1)];
      if (!next) fail("--base wants a URL after it.");
      BASE = next.replace(/\/+$/, "");
      continue;
    }
    if (argument === "--limit" || argument === "--cursor") {
      const next = argv[(index += 1)];
      if (!next || next.startsWith("--")) fail(`${argument} wants a value after it.`);
      if (argument === "--limit" && (!/^\d+$/.test(next) || !Number.isSafeInteger(Number(next)) || Number(next) < 1)) {
        fail("--limit wants a positive whole number; the server sets the maximum.");
      }
      options[argument.slice(2)] = next;
      continue;
    }
    if (argument === "--dry-run") { options.dryRun = true; continue; }
    if (argument === "--yes" || argument === "-y") { options.yes = true; continue; }
    if (argument === "--verifier") { options.verifier = true; continue; }
    if (argument === "--dir") {
      const next = argv[(index += 1)];
      if (!next || next.startsWith("--")) fail("--dir wants a project directory after it.");
      options.dir = next;
      continue;
    }
    if (argument === "--cap") {
      const next = argv[(index += 1)];
      if (!next) fail("--cap wants a number of US dollars after it.");
      options.cap = next;
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(usage());
      return EXIT.ok;
    } else if (argument === "--version" || argument === "-v") {
      process.stdout.write(`${VERSION}\n`);
      return EXIT.ok;
    } else args.push(argument);
  }
  const [command, ...rest] = args;
  if (!command) {
    process.stdout.write(usage());
    return EXIT.ok;
  }
  if (command !== "corpus-index" && (options.limit !== undefined || options.cursor !== undefined)) {
    fail("--limit and --cursor belong to corpus-index.");
  }
  if (command !== "init" && (options.dryRun || options.yes || options.verifier || options.dir !== undefined)) {
    fail("--dry-run, --yes, --verifier and --dir belong to init.");
  }
  const handler = COMMANDS[command];
  if (!handler) {
    fail(`No command "${command}". Run scvd --help for the whole set.`);
  }
  return handler(rest, options);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code ?? EXIT.ok),
  (error) => fail(String(error?.stack ?? error), EXIT.unreachable),
);
