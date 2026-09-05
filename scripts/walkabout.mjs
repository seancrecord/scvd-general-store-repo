#!/usr/bin/env node
/**
 * THE WALKABOUT RUNNER — the wiring half. The rules live in
 * scripts/lib/walkabout.mjs and WALKABOUT.md; this file only fetches,
 * signs, and appends.
 *
 *   node scripts/walkabout.mjs derive   [--out targets.json]
 *   node scripts/walkabout.mjs walk     --targets targets.json [--dry-run]
 *   node scripts/walkabout.mjs reconcile <ledger.jsonl>
 *   node scripts/walkabout.mjs report   <ledger.jsonl> [--out report.md]
 *
 * Environment (a .env file in the repo root is read):
 *   FIELD_WALLET_KEY   secp256k1 private key, 0x-hex, of a wallet listed
 *                      in src/store/house-wallets.json. Refused otherwise.
 *   BASE_RPC_URL       Base JSON-RPC (default https://mainnet.base.org).
 *   WBA_SIGNING_KEY    optional ed25519 seed, 64 hex: signs egress per
 *                      RFC 9421 the way the store's own Worker does.
 *   STORE_BASE_URL     default https://scvd.store.
 *
 * Rule 1 as amended 2026-09-01: one run per ISO week at the defaults
 * ($0.05 / $10 / one per domain) is standing-approved. Anything above
 * a default needs --override "<the keeper's words>"; a second run in
 * the same week needs --second-run "<the keeper's words>". Both are
 * written into the ledger's run line, so the approval is part of the
 * record and not a memory.
 */

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import * as ed25519 from "@noble/ed25519";
import {
  BASE_USDC,
  DEFAULT_CAPS,
  TRANSFER_TOPIC,
  UA,
  bodyRecord,
  buildAuthorization,
  capsNeedPress,
  chooseAccept,
  classifyPaid,
  deriveTargets,
  headersRecord,
  hostOf,
  isoWeek,
  ledgerWeek,
  parseChallenge,
  paymentHeader,
  reconcile,
  renderReport,
  ruleCheck,
  screenAddress,
  summarize,
  transferFromLog,
  typedData,
} from "./lib/walkabout.mjs";

const REPO_ROOT = new URL("..", import.meta.url);
const STORE_BASE_URL = process.env.STORE_BASE_URL ?? "https://scvd.store";
const RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function blockNumber() {
  return Number(BigInt(await rpc("eth_blockNumber", [])));
}

function houseWallets() {
  return JSON.parse(
    readFileSync(new URL("src/store/house-wallets.json", REPO_ROOT), "utf8"),
  ).wallets.map((w) => w.address);
}

/* ---------- Web Bot Auth (RFC 9421), the Worker's minimum, ported ---------- */

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}
function b64url(bytes) {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function wbaMaterial(seedHex) {
  if (!seedHex || !/^[0-9a-fA-F]{64}$/.test(seedHex)) return null;
  const seed = Buffer.from(seedHex, "hex");
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  const x = b64url(publicKey);
  const canonical = `{"crv":"Ed25519","kty":"OKP","x":"${x}"}`;
  const { createHash } = await import("node:crypto");
  const thumbprint = b64url(createHash("sha256").update(canonical).digest());
  return { seed, thumbprint };
}

async function wbaHeaders(material, targetUrl) {
  if (!material) return {};
  const authority = new URL(targetUrl).host;
  const agent = new URL(STORE_BASE_URL).origin;
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300;
  const { randomBytes } = await import("node:crypto");
  const nonce = b64(randomBytes(32));
  const params = `("@authority" "signature-agent");created=${created};expires=${expires};keyid="${material.thumbprint}";alg="ed25519";nonce="${nonce}";tag="web-bot-auth"`;
  const base = [
    `"@authority": ${authority}`,
    `"signature-agent": "${agent}"`,
    `"@signature-params": ${params}`,
  ].join("\n");
  const signature = await ed25519.signAsync(
    new TextEncoder().encode(base),
    material.seed,
  );
  return {
    "Signature-Agent": `"${agent}"`,
    "Signature-Input": `sig1=${params}`,
    Signature: `sig1=:${b64(signature)}:`,
  };
}

/**
 * The signing desk: when the runner holds no seed but does hold the
 * keeper's admin password, the Worker signs each request's authority
 * and the seed stays in Cloudflare (POST /admin/wba/sign). Any failure
 * falls back to the unsigned request — unsigned is honest; a half-made
 * proof is a claim — and is counted so the run line can say so.
 */
const signDesk = {
  password: process.env.STORE_ADMIN_PASSWORD ?? null,
  failures: 0,
};

async function wbaHeadersRemote(targetUrl) {
  if (!signDesk.password) return {};
  try {
    const response = await fetch(`${STORE_BASE_URL}/admin/wba/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`keeper:${signDesk.password}`).toString("base64")}`,
        "User-Agent": UA,
      },
      body: JSON.stringify({ url: targetUrl }),
    });
    if (!response.ok) {
      signDesk.failures += 1;
      return {};
    }
    const { headers } = await response.json();
    return headers ?? {};
  } catch {
    signDesk.failures += 1;
    return {};
  }
}

async function signedHeaders(material, targetUrl) {
  if (material) return wbaHeaders(material, targetUrl);
  return wbaHeadersRemote(targetUrl);
}

/* ---------- derive ---------- */

async function derive(flags) {
  const ledgerPath = new URL(
    "research/field-run-2026-08-18/ledger.jsonl",
    REPO_ROOT,
  );
  const ledgerLines = existsSync(ledgerPath)
    ? readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean)
    : [];
  let corpusHosts = [];
  try {
    const corpus = await (await fetch(`${STORE_BASE_URL}/corpus.json`)).json();
    const latest = corpus.index?.[corpus.index.length - 1];
    if (latest?.url) {
      const snapshot = await (await fetch(latest.url)).json();
      corpusHosts = snapshot.snapshot?.round?.hosts ?? [];
      console.log(`corpus ${latest.week}: ${corpusHosts.length} host rows`);
    }
  } catch (error) {
    console.warn(`corpus unread (${error.message}); deriving from the ledger alone`);
  }
  const targets = deriveTargets({ ledgerLines, corpusHosts });
  const out = flags.out ?? "targets.json";
  writeFileSync(out, `${JSON.stringify(targets, null, 2)}\n`);
  console.log(`${targets.length} targets → ${out}`);
}

/* ---------- walk ---------- */

/**
 * Rule 1's one-run-a-week guard, over every walk ledger under
 * research/ — not only the ones this runner named.
 *
 * It used to ask two narrower questions than the rule it enforces:
 * only `field-run-*` directories, and only ledgers opening with a
 * `run` line. Both holes were live on 2026-09-04, and together: the
 * walk of 2026-09-02 sat in `research/x402-walk-ledger/` with no run
 * line, in the same ISO week, and a second run would have passed the
 * guard silently. A guard that answers "no prior run" because it did
 * not look is worse than no guard, because it reports as though it
 * did. ledgerWeek() reads the week out of whatever the file carries.
 */
function priorRunThisWeek(week) {
  const researchDir = new URL("research/", REPO_ROOT);
  if (!existsSync(researchDir)) return null;
  for (const name of readdirSync(researchDir)) {
    const ledger = join(researchDir.pathname, name, "ledger.jsonl");
    if (!existsSync(ledger)) continue;
    if (ledgerWeek(readFileSync(ledger, "utf8")) === week) return name;
  }
  return null;
}

async function walk(flags) {
  if (!flags.targets) fail("walk needs --targets <file> (see: derive)");
  const targets = JSON.parse(readFileSync(flags.targets, "utf8"));
  const dryRun = Boolean(flags["dry-run"]);
  const caps = {
    perItemUsd: Number(flags["per-item"] ?? DEFAULT_CAPS.perItemUsd),
    runUsd: Number(flags["run-cap"] ?? DEFAULT_CAPS.runUsd),
    perDomain: Number(flags["per-domain"] ?? DEFAULT_CAPS.perDomain),
  };
  let approval = "standing weekly approval — WALKABOUT.md rule 1 as amended 2026-09-01, at the defaults";
  if (capsNeedPress(caps)) {
    if (typeof flags.override !== "string" || !flags.override.trim()) {
      fail(
        `caps above the defaults ($${DEFAULT_CAPS.perItemUsd} / $${DEFAULT_CAPS.runUsd} / ${DEFAULT_CAPS.perDomain} per domain) leave the standing approval. Pass --override "<the keeper's words>" or lower the caps.`,
      );
    }
    approval = `per-run press: ${flags.override.trim()}`;
  }
  const week = isoWeek();
  const prior = priorRunThisWeek(week);
  if (prior && !dryRun) {
    if (typeof flags["second-run"] !== "string" || !flags["second-run"].trim()) {
      fail(
        `a run already exists for ${week} (${prior}). The standing approval is one run per week; a second needs --second-run "<the keeper's words>".`,
      );
    }
    approval += ` · second run this week: ${flags["second-run"].trim()}`;
  }

  const key = process.env.FIELD_WALLET_KEY;
  if (!key && !dryRun) fail("FIELD_WALLET_KEY is not set");
  const account = key ? privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`) : null;
  const wallet = account?.address ?? "(dry run, no wallet)";
  const house = houseWallets();
  if (account && !house.some((a) => a.toLowerCase() === wallet.toLowerCase())) {
    fail(
      `${wallet} is not in src/store/house-wallets.json. No undeclared wallet ever walks (WALKABOUT.md, gate zero). List it, merge, deploy, then run.`,
    );
  }

  const material = await wbaMaterial(process.env.WBA_SIGNING_KEY);
  const date = new Date().toISOString().slice(0, 10);
  const outDir = flags.out ?? join("research", `field-run-${date}`);
  mkdirSync(outDir, { recursive: true });
  const ledgerPath = join(outDir, "ledger.jsonl");
  if (existsSync(ledgerPath) && !dryRun) {
    fail(`${ledgerPath} already exists; a run never appends to another run's ledger.`);
  }
  const append = (entry) => appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`);

  const startBlock = dryRun ? null : await blockNumber();
  const startedAt = new Date().toISOString();
  append({
    kind: "run",
    started: startedAt,
    week,
    wallet,
    caps,
    approval,
    ua: UA,
    web_bot_auth: material ? "local_seed" : signDesk.password ? "signing_desk" : false,
    targets_file: flags.targets,
    targets: targets.length,
    dry_run: dryRun,
    start_block: startBlock,
    rpc: RPC_URL.replace(/\/\/([^@]+)@/, "//<redacted>@"),
  });
  console.log(`walkabout ${date} · ${targets.length} targets · wallet ${wallet}`);
  console.log(`caps $${caps.perItemUsd}/item $${caps.runUsd}/run ${caps.perDomain}/domain · ${approval}`);
  if (dryRun) console.log("DRY RUN: nothing is signed, nothing is paid.");

  const state = { spentUsd: 0, domains: {} };
  const delayMs = Number(flags.delay ?? 750);
  const limit = flags.limit ? Number(flags.limit) : Infinity;
  let attempts = 0;

  for (const target of targets) {
    if (attempts >= limit) break;
    if (state.spentUsd >= caps.runUsd) {
      console.log(`run cap reached at $${state.spentUsd.toFixed(4)}`);
      break;
    }
    const url = typeof target === "string" ? target : target.url;
    const domain = hostOf(url);
    if (!domain) continue;
    attempts += 1;
    const entry = {
      kind: "attempt",
      ts: new Date().toISOString(),
      url,
      domain,
      method: "GET",
      ua_sent: UA,
      web_bot_auth: material ? "local_seed" : signDesk.password ? "signing_desk" : false,
      signing_desk_failures: signDesk.failures,
    };
    try {
      const headers = { "User-Agent": UA, Accept: "application/json", ...(await signedHeaders(material, url)) };
      const first = await fetch(url, { method: "GET", headers, redirect: "manual" });
      const firstBody = await first.text();
      entry.status = first.status;
      entry.response_headers = headersRecord(first.headers);
      Object.assign(entry, bodyRecord(firstBody));
      const parsed = parseChallenge(first.status, first.headers, firstBody);
      entry.shape = parsed.shape;
      entry.challenge_source = parsed.source;

      if (parsed.shape === "non_402") {
        entry.verdict = first.status >= 200 && first.status < 300 ? "no_payment_gate" : "unreachable";
        if (entry.verdict === "no_payment_gate") {
          entry.note = "open door, documented once; nothing harvested (rule 7)";
        }
        append(entry);
        continue;
      }
      if (parsed.shape !== "spec_conformant") {
        entry.verdict = "malformed_challenge";
        append(entry);
        continue;
      }
      const chosen = chooseAccept(parsed.challenge.accepts);
      entry.accepts_offered = parsed.challenge.accepts.length;
      if (chosen.reason) {
        entry.verdict = "unpaid_by_rule";
        entry.reason = chosen.reason;
        append(entry);
        continue;
      }
      entry.pay_to = chosen.payTo;
      entry.amount_atomic = chosen.amountAtomic;
      entry.amount_usd = chosen.amountUsd;
      entry.network = chosen.network;
      entry.asset = chosen.asset;

      const withheld = ruleCheck(
        { amountUsd: chosen.amountUsd, payTo: chosen.payTo, domain },
        state,
        caps,
        house,
      );
      if (withheld) {
        entry.verdict = "unpaid_by_rule";
        entry.reason = withheld;
        append(entry);
        continue;
      }

      const screen = await screenAddress(chosen.payTo, RPC_URL);
      entry.sanctions_screen = screen;
      if (screen.listed !== false) {
        entry.verdict = "unpaid_by_rule";
        entry.reason = screen.listed === true ? "sanctions_listed" : "screen_unavailable";
        append(entry);
        continue;
      }
      if (dryRun) {
        entry.verdict = "unpaid_by_rule";
        entry.reason = "dry_run";
        append(entry);
        continue;
      }

      const authorization = buildAuthorization({
        from: account.address,
        payTo: chosen.payTo,
        amountAtomic: chosen.amountAtomic,
        timeoutSeconds: chosen.accept.maxTimeoutSeconds ?? 300,
      });
      const signature = await account.signTypedData(typedData(chosen.accept, authorization));
      entry.authorization = { nonce: authorization.nonce, valid_before: authorization.validBefore };
      const paidHeaders = {
        ...headers,
        ...(await signedHeaders(material, url)),
        "PAYMENT-SIGNATURE": paymentHeader(chosen.accept, signature, authorization),
      };
      const second = await fetch(url, { method: "GET", headers: paidHeaders, redirect: "manual" });
      const secondBody = await second.text();
      entry.paid_status = second.status;
      entry.paid_response_headers = headersRecord(second.headers);
      const paidBody = bodyRecord(secondBody);
      entry.paid_body = paidBody.body ?? null;
      entry.paid_body_sha256 = paidBody.body_sha256 ?? null;
      entry.paid_body_head = paidBody.body_head ?? null;
      entry.paid_body_bytes = paidBody.body_bytes;
      const outcome = classifyPaid(second.status, secondBody);
      entry.verdict = outcome.verdict;
      entry.deliverable = outcome.deliverable;
      const receipt = second.headers.get("payment-response");
      if (receipt) {
        try {
          const decoded = JSON.parse(Buffer.from(receipt, "base64").toString("utf8"));
          entry.payment_response = decoded;
          entry.tx_hash = decoded.transaction ?? decoded.txHash ?? decoded.tx_hash ?? null;
        } catch {
          entry.payment_response_raw = receipt;
        }
      }
      if (!entry.tx_hash) {
        try {
          const data = JSON.parse(secondBody);
          entry.tx_hash = data.txHash ?? data.tx_hash ?? data.transactionHash ?? null;
        } catch {
          // No hash in the body; the reconcile step reads the chain anyway.
        }
      }
      if (outcome.verdict === "settled") {
        state.spentUsd += chosen.amountUsd;
        state.domains[domain] = (state.domains[domain] ?? 0) + 1;
      }
      append(entry);
      console.log(`${outcome.verdict.padEnd(16)} ${second.status} $${chosen.amountUsd} ${domain}`);
    } catch (error) {
      entry.verdict = "unreachable";
      entry.error = error?.message ?? String(error);
      append(entry);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const endBlock = dryRun ? null : await blockNumber();
  append({
    kind: "run_end",
    ended: new Date().toISOString(),
    end_block: endBlock,
    attempts,
    spent_usd: Number(state.spentUsd.toFixed(6)),
  });
  console.log(`\ndone: ${attempts} attempts, $${state.spentUsd.toFixed(4)} spent → ${ledgerPath}`);
  console.log(`next: node scripts/walkabout.mjs reconcile ${ledgerPath} && node scripts/walkabout.mjs report ${ledgerPath}`);
}

/* ---------- reconcile ---------- */

function readLedger(path) {
  if (!path || !existsSync(path)) fail(`ledger not found: ${path}`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function reconcileCmd(positional) {
  const ledgerPath = positional[0];
  const entries = readLedger(ledgerPath);
  const run = entries.find((e) => e.kind === "run");
  const end = entries.find((e) => e.kind === "run_end");
  if (!run?.start_block || !end?.end_block) {
    fail("the ledger has no start_block/end_block (a dry run, or the run never ended); nothing to reconcile against.");
  }
  const wallet = run.wallet.toLowerCase();
  const fromTopic = `0x${wallet.slice(2).padStart(64, "0")}`;
  const transfers = [];
  const step = 2000;
  for (let from = run.start_block; from <= end.end_block; from += step) {
    const to = Math.min(from + step - 1, end.end_block);
    const logs = await rpc("eth_getLogs", [
      {
        address: BASE_USDC,
        topics: [TRANSFER_TOPIC, fromTopic],
        fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`,
      },
    ]);
    for (const log of logs) transfers.push(transferFromLog(log));
  }
  const result = reconcile(entries, transfers);
  const outPath = join(ledgerPath.replace(/ledger\.jsonl$/, ""), "reconciliation.json");
  writeFileSync(
    outPath,
    `${JSON.stringify({ ledger: ledgerPath, blocks: [run.start_block, end.end_block], wallet: run.wallet, ...result }, null, 2)}\n`,
  );
  console.log(
    `chain ${result.chain_count} transfers $${result.chain_usd} · ledger ${result.ledger_count} settled $${result.ledger_usd} · matched ${result.matched} · chain-only ${result.chain_only} · ledger-only ${result.ledger_only} · gap $${result.gap_usd} → ${outPath}`,
  );
}

/* ---------- report ---------- */

function reportCmd(positional, flags) {
  const ledgerPath = positional[0];
  const lines = readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean);
  const summary = summarize(lines);
  const reconciliationPath = join(ledgerPath.replace(/ledger\.jsonl$/, ""), "reconciliation.json");
  if (existsSync(reconciliationPath)) {
    summary.reconciliation = JSON.parse(readFileSync(reconciliationPath, "utf8"));
  }
  const markdown = renderReport(summary, { ledgerPath });
  const outPath = flags.out ?? join(ledgerPath.replace(/ledger\.jsonl$/, ""), "report.md");
  writeFileSync(outPath, markdown);
  console.log(markdown);
  console.log(`→ ${outPath}`);
}

/* ---------- main ---------- */

const { positional, flags } = parseArgs(process.argv.slice(2));
const command = positional.shift();
switch (command) {
  case "derive":
    await derive(flags);
    break;
  case "walk":
    await walk(flags);
    break;
  case "reconcile":
    await reconcileCmd(positional);
    break;
  case "report":
    reportCmd(positional, flags);
    break;
  default:
    console.log(
      "usage: node scripts/walkabout.mjs <derive|walk|reconcile|report> …  (read WALKABOUT.md first)",
    );
    process.exit(command ? 1 : 0);
}
