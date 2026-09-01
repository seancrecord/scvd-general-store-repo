import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_USDC,
  BODY_VERBATIM_LIMIT,
  DEFAULT_CAPS,
  SANCTIONS_ORACLE_BASE,
  SHAPES,
  STORE_HOST,
  VERDICTS,
  bodyRecord,
  buildAuthorization,
  capsNeedPress,
  chooseAccept,
  classifyPaid,
  deriveTargets,
  isoWeek,
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

/**
 * THE WALKABOUT'S EIGHT RULES, TESTED AGAINST BYTES THAT NEVER LEAVE
 * THE PROCESS. Nothing here reaches a door, a chain, or the store, so
 * the suite is offline and deterministic — the same discipline as
 * doors-check.test.mjs. The CLI is wiring; every decision it makes is
 * a function in scripts/lib/walkabout.mjs and every function is here.
 */

const PAY_TO = "0x1111111111111111111111111111111111111111";
const HOUSE = "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7";

function accept(overrides = {}) {
  return {
    scheme: "exact",
    network: "eip155:8453",
    amount: "50000",
    asset: BASE_USDC,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    ...overrides,
  };
}

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

test("the vocabulary is the Launch Check's, verbatim", () => {
  assert.deepEqual(VERDICTS, [
    "settled",
    "payment_refused",
    "no_payment_gate",
    "malformed_challenge",
    "unpaid_by_rule",
    "unreachable",
  ]);
  assert.deepEqual(SHAPES, ["spec_conformant", "other_structured", "empty", "non_402"]);
});

test("rule 1 defaults are the standing approval, and above them needs a press", () => {
  assert.deepEqual(DEFAULT_CAPS, { perItemUsd: 0.05, runUsd: 10, perDomain: 1 });
  assert.equal(capsNeedPress({ ...DEFAULT_CAPS }), false);
  assert.equal(capsNeedPress({ ...DEFAULT_CAPS, perItemUsd: 0.1 }), true);
  assert.equal(capsNeedPress({ ...DEFAULT_CAPS, runUsd: 11 }), true);
  assert.equal(capsNeedPress({ ...DEFAULT_CAPS, perDomain: 2 }), true);
  // Lower than the defaults is still inside the approval.
  assert.equal(capsNeedPress({ perItemUsd: 0.01, runUsd: 1, perDomain: 1 }), false);
});

test("parseChallenge: header first, body second, both placements", () => {
  const spec = { x402Version: 2, accepts: [accept()] };
  const viaHeader = parseChallenge(402, { "payment-required": b64(spec) }, "");
  assert.equal(viaHeader.shape, "spec_conformant");
  assert.equal(viaHeader.source, "header");

  const viaBody = parseChallenge(402, {}, JSON.stringify(spec));
  assert.equal(viaBody.shape, "spec_conformant");
  assert.equal(viaBody.source, "body");

  const v1 = parseChallenge(402, {}, JSON.stringify({ accepts: [accept()] }));
  assert.equal(v1.shape, "other_structured");

  const withReqs = parseChallenge(402, {}, JSON.stringify({ paymentRequirements: {} }));
  assert.equal(withReqs.shape, "other_structured");

  assert.equal(parseChallenge(402, {}, "").shape, "empty");
  assert.equal(parseChallenge(402, {}, "   ").shape, "empty");
  assert.equal(parseChallenge(402, {}, "not json").shape, "other_structured");
  assert.equal(parseChallenge(200, {}, "{}").shape, "non_402");
  assert.equal(parseChallenge(404, {}, "").shape, "non_402");

  // A Headers instance works the same as a plain object.
  const headers = new Headers({ "PAYMENT-REQUIRED": b64(spec) });
  assert.equal(parseChallenge(402, headers, "").source, "header");

  // A header that is not base64 JSON falls through to the body.
  const junkHeader = parseChallenge(402, { "payment-required": "%%%" }, JSON.stringify(spec));
  assert.equal(junkHeader.source, "body");
});

test("chooseAccept: exact, Base, USDC, a payTo, and nothing outside our reach", () => {
  const ok = chooseAccept([accept()]);
  assert.equal(ok.reason, null);
  assert.equal(ok.amountUsd, 0.05);
  assert.equal(ok.amountAtomic, "50000");
  assert.equal(ok.payTo, PAY_TO);

  assert.equal(chooseAccept([]).reason, "no_accepts");
  assert.equal(chooseAccept(undefined).reason, "no_accepts");
  assert.equal(chooseAccept([accept({ network: "eip155:137" })]).reason, "no_base_usdc_exact_accept");
  assert.equal(chooseAccept([accept({ asset: "0x0000000000000000000000000000000000000001" })]).reason, "no_base_usdc_exact_accept");
  assert.equal(chooseAccept([accept({ payTo: undefined })]).reason, "no_base_usdc_exact_accept");
  assert.equal(chooseAccept([accept({ scheme: "upto" })]).reason, "no_base_usdc_exact_accept");
  assert.equal(
    chooseAccept([accept({ extra: { assetTransferMethod: "permit2" } })]).reason,
    "transfer_method_out_of_reach:permit2",
  );
  assert.equal(chooseAccept([accept({ amount: "0.05" })]).reason, "unreadable_amount");
  assert.equal(chooseAccept([accept({ amount: undefined, maxAmountRequired: "10000" })]).amountUsd, 0.01);

  // The Base entry is chosen even when it is not first, and asset case does not matter.
  const mixed = chooseAccept([accept({ network: "eip155:137" }), accept({ asset: BASE_USDC.toUpperCase().replace("0X", "0x") })]);
  assert.equal(mixed.reason, null);
});

test("ruleCheck: our door, our wallets, one per domain, per-item, per-run", () => {
  const fresh = { spentUsd: 0, domains: {} };
  const terms = { amountUsd: 0.05, payTo: PAY_TO, domain: "shop.example" };
  assert.equal(ruleCheck(terms, fresh, DEFAULT_CAPS, [HOUSE]), null);
  assert.equal(ruleCheck({ ...terms, domain: STORE_HOST }, fresh, DEFAULT_CAPS, []), "own_door");
  assert.equal(ruleCheck({ ...terms, domain: `try.${STORE_HOST}` }, fresh, DEFAULT_CAPS, []), "own_door");
  assert.equal(ruleCheck({ ...terms, payTo: HOUSE.toLowerCase() }, fresh, DEFAULT_CAPS, [HOUSE]), "own_wallet");
  assert.equal(ruleCheck(terms, { spentUsd: 0, domains: { "shop.example": 1 } }, DEFAULT_CAPS, []), "per_domain_cap");
  assert.equal(ruleCheck({ ...terms, amountUsd: 0.051 }, fresh, DEFAULT_CAPS, []), "per_item_cap");
  assert.equal(ruleCheck(terms, { spentUsd: 9.96, domains: {} }, DEFAULT_CAPS, []), "run_cap");
  assert.equal(ruleCheck({ ...terms, amountUsd: Number.NaN }, fresh, DEFAULT_CAPS, []), "unreadable_amount");
  // Exactly at the cap is inside it.
  assert.equal(ruleCheck({ ...terms, amountUsd: 0.05 }, { spentUsd: 9.95, domains: {} }, DEFAULT_CAPS, []), null);
});

test("rule 3: the screen fails closed on everything but a byte-exact false", async () => {
  const oracle = (result) => async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.method, "eth_call");
    assert.equal(body.params[0].to, SANCTIONS_ORACLE_BASE);
    assert.equal(body.params[0].data, `0xdf592f7d${PAY_TO.slice(2).padStart(64, "0")}`);
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  const clear = await screenAddress(PAY_TO, "http://rpc", oracle(`0x${"0".repeat(64)}`));
  assert.equal(clear.listed, false);
  const listed = await screenAddress(PAY_TO, "http://rpc", oracle(`0x${"0".repeat(63)}1`));
  assert.equal(listed.listed, true);
  const odd = await screenAddress(PAY_TO, "http://rpc", oracle("0x01"));
  assert.equal(odd.listed, null);
  const down = await screenAddress(PAY_TO, "http://rpc", async () => new Response("", { status: 503 }));
  assert.equal(down.listed, null);
  const thrown = await screenAddress(PAY_TO, "http://rpc", async () => {
    throw new Error("ECONNRESET");
  });
  assert.equal(thrown.listed, null);
  const shape = await screenAddress("not-an-address", "http://rpc", async () => {
    throw new Error("must not be called");
  });
  assert.equal(shape.listed, null);
});

test("the authorization and the envelope are the x402 v2 shape", () => {
  const auth = buildAuthorization({
    from: HOUSE,
    payTo: PAY_TO,
    amountAtomic: "50000",
    timeoutSeconds: 300,
    now: 1_000,
    nonce: `0x${"ab".repeat(32)}`,
  });
  assert.deepEqual(auth, {
    from: HOUSE,
    to: PAY_TO,
    value: "50000",
    validAfter: "0",
    validBefore: "1300",
    nonce: `0x${"ab".repeat(32)}`,
  });
  // A fresh nonce every time when none is given.
  const a = buildAuthorization({ from: HOUSE, payTo: PAY_TO, amountAtomic: "1" });
  const b = buildAuthorization({ from: HOUSE, payTo: PAY_TO, amountAtomic: "1" });
  assert.notEqual(a.nonce, b.nonce);
  assert.match(a.nonce, /^0x[0-9a-f]{64}$/);

  const td = typedData(accept({ extra: { name: "USDC", version: "2" } }), auth);
  assert.equal(td.primaryType, "TransferWithAuthorization");
  assert.equal(td.domain.chainId, 8453);
  assert.equal(td.domain.name, "USDC");
  assert.equal(td.domain.verifyingContract, BASE_USDC);
  assert.equal(td.types.TransferWithAuthorization.length, 6);
  assert.equal(typedData(accept(), auth).domain.name, "USD Coin");

  const header = paymentHeader(accept(), "0xsig", auth);
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  assert.equal(decoded.x402Version, 2);
  assert.equal(decoded.accepted.payTo, PAY_TO);
  assert.equal(decoded.payload.signature, "0xsig");
  assert.equal(decoded.payload.authorization.nonce, auth.nonce);
});

test("classifyPaid: a 2xx settled, with or without goods; anything else refused", () => {
  assert.deepEqual(classifyPaid(200, '{"ok":true}'), { verdict: "settled", deliverable: "body" });
  assert.deepEqual(classifyPaid(201, ""), { verdict: "settled", deliverable: "empty" });
  assert.deepEqual(classifyPaid(402, "{}"), { verdict: "payment_refused", deliverable: null });
  assert.deepEqual(classifyPaid(400, ""), { verdict: "payment_refused", deliverable: null });
  assert.deepEqual(classifyPaid(500, ""), { verdict: "payment_refused", deliverable: null });
});

test("rule 5: bodies are verbatim, or sha256 + a head, never dropped", () => {
  const small = bodyRecord("hello");
  assert.deepEqual(small, { body: "hello", body_bytes: 5 });
  const big = bodyRecord("x".repeat(BODY_VERBATIM_LIMIT + 1));
  assert.equal(big.body, undefined);
  assert.equal(big.body_bytes, BODY_VERBATIM_LIMIT + 1);
  assert.equal(big.body_head.length, 2048);
  assert.match(big.body_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(bodyRecord(undefined), { body: "", body_bytes: 0 });
});

test("rule 2: targets are doors that listed themselves, never ours, one per domain", () => {
  const ledgerLines = [
    JSON.stringify({ url: "https://a.example/api/x", status: 200, paid: true }),
    JSON.stringify({ url: "https://a.example/api/y", status: 402, paid: false }),
    JSON.stringify({ url: "https://b.example/api", status: 402, paid: false, error: "Payment failed: 400" }),
    JSON.stringify({ url: "https://c.example/api", status: 402, paid: false, error: "No PAYMENT-REQUIRED header" }),
    JSON.stringify({ url: "https://d.example/api", status: 404, paid: false }),
    JSON.stringify({ url: "https://scvd.store/api/buy/hello", status: 402, paid: false }),
    "not json",
  ];
  const corpusHosts = [
    { host: "e.example", url: "https://e.example/door", verdict: "ready", source: "discovery" },
    { host: "f.example", url: "https://f.example/door", verdict: "not_ready" },
    { host: "g.example", verdict: "ready" },
    { host: "b.example", url: "https://b.example/other", verdict: "ready" },
  ];
  const targets = deriveTargets({ ledgerLines, corpusHosts });
  assert.deepEqual(
    targets.map((t) => t.domain),
    ["a.example", "b.example", "e.example"],
  );
  assert.equal(targets[0].url, "https://a.example/api/x");
  assert.equal(targets[1].url, "https://b.example/api");
  assert.equal(targets[2].source, "corpus:discovery");
});

const LEDGER = [
  { kind: "run", started: "2026-09-08T10:00:00.000Z", wallet: HOUSE, caps: DEFAULT_CAPS, approval: "standing", start_block: 100 },
  { kind: "attempt", domain: "a.example", url: "https://a.example/x", shape: "spec_conformant", verdict: "settled", deliverable: "body", amount_usd: 0.05, amount_atomic: "50000", pay_to: PAY_TO },
  { kind: "attempt", domain: "b.example", url: "https://b.example/x", shape: "spec_conformant", verdict: "settled", deliverable: "empty", amount_usd: 0.01, amount_atomic: "10000", pay_to: "0x2222222222222222222222222222222222222222" },
  { kind: "attempt", domain: "c.example", url: "https://c.example/x", shape: "spec_conformant", verdict: "payment_refused", paid_status: 400 },
  { kind: "attempt", domain: "d.example", url: "https://d.example/x", shape: "spec_conformant", verdict: "unpaid_by_rule", reason: "per_item_cap" },
  { kind: "attempt", domain: "e.example", url: "https://e.example/x", shape: "other_structured", verdict: "malformed_challenge" },
  { kind: "attempt", domain: "f.example", url: "https://f.example/x", shape: "non_402", verdict: "no_payment_gate" },
  { kind: "attempt", domain: "g.example", url: "https://g.example/x", shape: "empty", verdict: "malformed_challenge" },
  { kind: "attempt", domain: "h.example", url: "https://h.example/x", verdict: "unreachable", error: "ECONNRESET" },
  { kind: "run_end", ended: "2026-09-08T10:20:00.000Z", end_block: 700, spent_usd: 0.06 },
];

test("rule 5: every number in the report re-derives from the ledger", () => {
  const summary = summarize(LEDGER.map((e) => JSON.stringify(e)));
  assert.equal(summary.attempts, 8);
  assert.equal(summary.domains, 8);
  assert.deepEqual(summary.by_shape, { spec_conformant: 4, other_structured: 1, empty: 1, non_402: 1 });
  assert.deepEqual(summary.by_verdict, {
    settled: 2,
    payment_refused: 1,
    no_payment_gate: 1,
    malformed_challenge: 2,
    unpaid_by_rule: 1,
    unreachable: 1,
  });
  assert.deepEqual(summary.unpaid_reasons, { per_item_cap: 1 });
  assert.deepEqual(summary.refused_status, { 400: 1 });
  assert.equal(summary.payments_presented, 3);
  assert.equal(summary.settled_with_body, 1);
  assert.equal(summary.spent_usd, 0.06);

  const report = renderReport(summary, { ledgerPath: "research/field-run-2026-09-08/ledger.jsonl" });
  // Taxonomy before any percentage (WALKABOUT.md, "What a run delivers").
  assert.ok(report.indexOf("## Taxonomy, stated first") < report.indexOf("%"));
  assert.match(report, /\| settled \| 2 \(66\.7% of presented\) \|/);
  assert.match(report, /\| spec_conformant \| 4 \| 50\.0% \|/);
  assert.match(report, /`per_item_cap` × 1/);
  assert.match(report, /Not yet run\./);
  assert.match(report, /Not a score on any operator/);
  // A summary with no attempts renders without dividing by zero.
  const empty = renderReport(summarize([]));
  assert.match(empty, /\| attempts \| 0 \|/);
  assert.match(empty, /0\.0%/);
});

test("reconcile: the chain is the record; the gap is stated even when zero", () => {
  const transfers = [
    { to: PAY_TO, value: "50000", txHash: "0xa" },
    { to: "0x2222222222222222222222222222222222222222", value: "10000", txHash: "0xb" },
  ];
  const exact = reconcile(LEDGER, transfers);
  assert.equal(exact.matched, 2);
  assert.equal(exact.chain_only, 0);
  assert.equal(exact.ledger_only, 0);
  assert.equal(exact.gap_usd, 0);
  assert.equal(exact.ledger_usd, 0.06);
  assert.equal(exact.chain_usd, 0.06);

  // A transfer the ledger never recorded (the August failure mode).
  const extra = reconcile(LEDGER, [...transfers, { to: PAY_TO, value: "30000", txHash: "0xc" }]);
  assert.equal(extra.chain_only, 1);
  assert.equal(extra.gap_usd, 0.03);
  assert.deepEqual(extra.chain_only_rows, [{ to: PAY_TO.toLowerCase(), value: "30000", txHash: "0xc" }]);

  // A settle the chain does not show (a 2xx that never settled).
  const missing = reconcile(LEDGER, transfers.slice(0, 1));
  assert.equal(missing.ledger_only, 1);
  assert.equal(missing.ledger_only_rows[0].url, "https://b.example/x");

  // Matching is one-to-one: two ledger rows cannot claim one transfer.
  const doubled = reconcile([...LEDGER, LEDGER[1]], transfers);
  assert.equal(doubled.matched, 2);
  assert.equal(doubled.ledger_only, 1);
});

test("transferFromLog decodes the USDC Transfer topic layout", () => {
  const log = {
    topics: ["0xddf2", `0x${HOUSE.slice(2).toLowerCase().padStart(64, "0")}`, `0x${PAY_TO.slice(2).padStart(64, "0")}`],
    data: "0xc350",
    transactionHash: "0xabc",
  };
  assert.deepEqual(transferFromLog(log), { to: PAY_TO, value: "50000", txHash: "0xabc" });
});

test("isoWeek matches the board's week keys", () => {
  assert.equal(isoWeek(new Date("2026-09-01T12:00:00Z")), "2026-W36");
  assert.equal(isoWeek(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  assert.equal(isoWeek(new Date("2027-01-03T00:00:00Z")), "2026-W53");
});

/* ---------- the CLI against a door that is not a door ---------- */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = new URL("./walkabout.mjs", import.meta.url).pathname;

/**
 * A fixture store on localhost: one spec-shaped door, one open door,
 * one 402 with nothing readable, and a fake Base RPC that answers the
 * sanctions oracle "false" and the block number "0x64". The CLI is run
 * as a child process exactly as CV runs it, in --dry-run, so the whole
 * path up to the signature is exercised and no money can move.
 */
function fixture() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === "/rpc") {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          const body = JSON.parse(raw);
          const result =
            body.method === "eth_blockNumber" ? "0x64" : `0x${"0".repeat(64)}`;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
        });
        return;
      }
      if (req.url === "/door") {
        assert.equal(req.headers["user-agent"], "scvd-walkabout/1.0 (+https://scvd.store/what) x402-field-research");
        res.writeHead(402, {
          "content-type": "application/json",
          "payment-required": b64({ x402Version: 2, accepts: [accept()] }),
        });
        res.end("{}");
        return;
      }
      if (req.url === "/open") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"free":true}');
        return;
      }
      if (req.url === "/blank") {
        res.writeHead(402);
        res.end("");
        return;
      }
      res.writeHead(404);
      res.end("");
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("the CLI, dry, walks a fixture door through every rule up to the signature", async () => {
  const { server, port } = await fixture();
  try {
    const base = `http://127.0.0.1:${port}`;
    const dir = mkdtempSync(join(tmpdir(), "walkabout-"));
    const targets = join(dir, "targets.json");
    writeFileSync(
      targets,
      JSON.stringify([`${base}/door`, `${base}/open`, `${base}/blank`, `${base}/missing`]),
    );
    const out = join(dir, "run");
    const env = { ...process.env, BASE_RPC_URL: `${base}/rpc`, FIELD_WALLET_KEY: "" };
    const { stdout } = await execFileAsync(
      process.execPath,
      [CLI, "walk", "--targets", targets, "--dry-run", "--out", out, "--delay", "0"],
      { env },
    );
    assert.match(stdout, /DRY RUN/);
    const lines = readFileSync(join(out, "ledger.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(lines[0].kind, "run");
    assert.equal(lines[0].dry_run, true);
    assert.match(lines[0].approval, /standing weekly approval/);
    assert.equal(lines.at(-1).kind, "run_end");
    const by = Object.fromEntries(lines.filter((l) => l.kind === "attempt").map((l) => [new URL(l.url).pathname, l]));

    assert.equal(by["/door"].shape, "spec_conformant");
    assert.equal(by["/door"].challenge_source, "header");
    assert.equal(by["/door"].pay_to, PAY_TO);
    assert.equal(by["/door"].amount_usd, 0.05);
    assert.equal(by["/door"].sanctions_screen.listed, false);
    assert.equal(by["/door"].verdict, "unpaid_by_rule");
    assert.equal(by["/door"].reason, "dry_run");
    assert.equal(by["/door"].ua_sent, "scvd-walkabout/1.0 (+https://scvd.store/what) x402-field-research");
    assert.equal(by["/door"].body, "{}");
    assert.ok(by["/door"].response_headers["payment-required"]);

    assert.equal(by["/open"].verdict, "no_payment_gate");
    assert.match(by["/open"].note, /nothing harvested/);
    assert.equal(by["/blank"].shape, "empty");
    assert.equal(by["/blank"].verdict, "malformed_challenge");
    assert.equal(by["/missing"].shape, "non_402");
    assert.equal(by["/missing"].verdict, "unreachable");

    // The report derives from that file and lands beside it.
    await execFileAsync(process.execPath, [CLI, "report", join(out, "ledger.jsonl")], { env });
    const report = readFileSync(join(out, "report.md"), "utf8");
    assert.match(report, /\| attempts \| 4 \|/);
    assert.match(report, /`dry_run` × 1/);
    assert.ok(existsSync(join(out, "report.md")));

    // Caps above the defaults refuse without the keeper's words.
    await assert.rejects(
      execFileAsync(
        process.execPath,
        [CLI, "walk", "--targets", targets, "--dry-run", "--out", join(dir, "run2"), "--per-item", "0.10"],
        { env },
      ),
      (error) => /leave the standing approval/.test(error.stderr),
    );
    // And proceed, recorded, with them.
    const pressed = await execFileAsync(
      process.execPath,
      [CLI, "walk", "--targets", targets, "--dry-run", "--out", join(dir, "run3"), "--per-item", "0.10", "--override", "keeper said so, 2026-09-01", "--limit", "1", "--delay", "0"],
      { env },
    );
    assert.match(pressed.stdout, /per-run press: keeper said so/);
    const head = JSON.parse(readFileSync(join(dir, "run3", "ledger.jsonl"), "utf8").split("\n")[0]);
    assert.equal(head.caps.perItemUsd, 0.1);
    assert.match(head.approval, /keeper said so/);
  } finally {
    server.close();
  }
});
