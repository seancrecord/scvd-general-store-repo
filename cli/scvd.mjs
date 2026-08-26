#!/usr/bin/env node
import { readFileSync } from "node:fs";

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

  scvd preflight <url>          Does that x402 door answer a well-formed
                                402? One probe, every check named.
  scvd conformance <file|->     Read a signed offer or receipt (compact
                                JWS) and say whether it holds up. Any
                                issuer's, including ones we compete with.
  scvd verify <id>              Verify anything this store ever signed.
  scvd receipt <file|->         Verify any issuer's receipt JSON and get
                                back a signed verdict.
  scvd onpage <url>             What that page serves a machine reader.
  scvd fresh-set                This week's working x402 doors.
  scvd corpus                   The weekly signed census, whole.
  scvd menu                     What is on the shelf, and for how much.
  scvd catalog                  Every developer resource, from the
                                RFC 9727 API catalog.
  scvd versions                 Every API version served, and any sunset.

Flags
  --json                        Print the server's response verbatim.
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

function printBudget({ remaining, reset }) {
  if (remaining === null || remaining === undefined) return;
  process.stdout.write(
    `\n  ${remaining} probes left this minute; the bucket rolls in ${reset ?? "?"}s.\n`,
  );
}

const COMMANDS = {
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
    process.stdout.write(`${url}\n  verdict: ${report.verdict}\n\n`);
    printChecks(report.checks);
    for (const advisory of report.advisories ?? []) {
      process.stdout.write(`  NOTE  ${advisory.name}: ${advisory.detail}\n`);
    }
    printBudget(result);
    /*
     * `unreachable` is NOT a failure of the endpoint and does not
     * exit 1: the store is explicit that it describes the network
     * path at one moment, and a CI job that reads it as "their door
     * is broken" would be drawing a conclusion the evidence refuses.
     */
    return report.verdict === "not_ready" ? EXIT.verdictNegative : EXIT.ok;
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
    const result = await call("/corpus.json");
    if (options.json) return dump(result);
    return dump(result);
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

function dump(result) {
  process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
  return result.status >= 400 ? EXIT.verdictNegative : EXIT.ok;
}

async function main(argv) {
  const args = [];
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--base") {
      const next = argv[(index += 1)];
      if (!next) fail("--base wants a URL after it.");
      BASE = next.replace(/\/+$/, "");
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
