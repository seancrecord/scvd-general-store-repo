import { CASE_FILE_CLAIM_CAP } from "@/services/case-file";
import { isSolanaSignature } from "@/lib/solana-rpc";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { checkProbeTarget } from "@/lib/probe-target";
import { issuePassport } from "@/services/passport";
import { ANCHOR_SUMMARY_CAP } from "@/services/anchors";
import { TAG_CAP, tagHasUrl } from "@/services/train";
import { nonceFromPaymentPayload } from "@/services/attestation";
import { ANCHOR_CHECKLIST } from "@/store/copy/anchor-writing";
import type { fulfillPurchase } from "@/services/fulfillment";
import type { Env, MenuItem } from "@/types";

/** The counter takes a win of up to this many characters. */
export const COFFEE_WIN_CAP = 200;

/**
 * ONE PRE-PAYMENT LAW AND ONE ARGUMENT MAP, FOR BOTH DOORS.
 *
 * WHAT THIS FILE IS FOR, in one sentence: the HTTP door read the
 * buyer's inputs out of the query string and the MCP door read
 * eleven of them out of `arguments` and dropped the rest on the
 * floor — so a purchase made over MCP was fulfilled with the field
 * that decides the goods missing.
 *
 * THE DAMAGE, reported by the first buyer to walk the MCP shelf
 * (2026-09-04) and reproduced here before anything was moved:
 *
 *   1. `url` never reached fulfillment. good_buyer and launch_check
 *      each read `input.targetUrl ?? ""`, probed the empty string,
 *      folded the failure into a signed reading — which is what
 *      those services are built to do with an unreachable door — and
 *      SETTLED. $0.99 and $5.00 for signed readings of nothing. The
 *      artifacts are real, signed, and about no endpoint on earth.
 *
 *   2. `tx_hashes` never reached fulfillment. attestation_bundle
 *      minted a certificate over an empty sheaf, settled, and THEN
 *      threw "attestation_bundle reached goods with no sheaf" on its
 *      way out the door: money moved, certificate exists, the buyer
 *      got a 500. Rule 9's whole point is that nothing above the
 *      settle line can cost a buyer anything, and this threw below
 *      it.
 *
 *   3. `url` and `address` never reached passport_refresh or
 *      provenance_check, whose services open with `new URL(raw)` and
 *      an address shape check. `new URL("")` throws, so those two
 *      500'd BEFORE the settle — no charge, which is the system
 *      working, but a coin-flip door either way.
 *
 * All three are one defect: the MCP door had its own copy of the
 * argument map and its own short copy of the validation, and neither
 * was the HTTP door's. This codebase has been bitten by exactly that
 * shape before — mcp-payment.ts carries the note "a fix that looks
 * shared and isn't" over the same seam — so the answer is not a
 * longer copy. It is this file: both doors read their arguments
 * through `purchaseInputFrom`, and both refuse through
 * `checkPurchaseArgs`, and a new item that needs a new field gets it
 * here once or gets it nowhere.
 *
 * The only thing that differs between the doors is the WORD for
 * where a value came from — a query parameter on one, an argument on
 * the other — so that is the one thing a caller passes in.
 */

/**
 * How a door hands over the buyer's inputs. A missing value is
 * `undefined`; every value is a string, because both doors carry
 * strings (MCP's schema declares even the numeric-looking fields as
 * strings, and the query string has no other type to offer).
 */
export interface PurchaseArgs {
  /** The raw value the buyer sent under this name, if any. */
  get(name: string): string | undefined;
  /** "url query parameter" on the HTTP door, "url argument" on MCP. */
  field(name: string): string;
}

/** The HTTP door's reader: the query string, named the way it reads there. */
export function queryArgs(query: (name: string) => string | undefined): PurchaseArgs {
  return {
    get: query,
    field: (name) => `${name} query parameter`,
  };
}

/** The MCP door's reader: tools/call `arguments`, named the way it reads there. */
export function toolArgs(args: Record<string, unknown>): PurchaseArgs {
  return {
    get(name) {
      const value = args[name];
      if (typeof value === "string") return value;
      // A client that sent a number or a boolean where the schema
      // says string meant the value, not nothing. Dropping it here is
      // how the empty-string artifacts happened in the first place.
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return undefined;
    },
    field: (name) => `${name} argument`,
  };
}

/**
 * A refusal both doors can serve: the HTTP door renders `body` at
 * `status`, the MCP door renders `body.error` as the message with
 * `code` and `charged` in `error.data`. One sentence, one code, two
 * envelopes — never two wordings.
 */
export interface PurchaseRefusal {
  status: 400 | 403 | 503;
  body: Record<string, unknown>;
}

/** rule 57.4: the fact an agent needs first, machine-readable. */
function refuse(
  status: 400 | 403 | 503,
  code: string,
  error: string,
  extra: Record<string, unknown> = {},
): PurchaseRefusal {
  return { status, body: { charged: false, code, error, ...extra } };
}

/** The sentence. Both doors show it verbatim. */
export function refusalMessage(refusal: PurchaseRefusal): string {
  return String(refusal.body["error"]);
}

/** The code an MCP caller branches on, out of the published set. */
export function refusalCode(refusal: PurchaseRefusal): string {
  return String(refusal.body["code"]);
}

/**
 * The JSON-RPC error number for a refusal. 400 is bad params, which
 * is what -32602 means; 403 and 503 are the store declining to sell,
 * which is the same class as sold_out and shelf_closed already use.
 */
export function refusalRpcCode(refusal: PurchaseRefusal): number {
  return refusal.status === 400 ? -32602 : -32000;
}

/** sha256 hex: what the Bitcoin anchor takes and all it ever takes. */
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

/** An EVM transaction hash, the shape both attestation doors read. */
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** The sheaf's bounds. Named beside the check that enforces them. */
export const BUNDLE_MIN_HASHES = 2;
export const BUNDLE_MAX_HASHES = 20;

/**
 * The items whose probe is the audit's probe, and therefore whose
 * refusals are the audit's refusals: one law in one place, which is
 * what closed the private-address hole.
 */
const PROBE_ITEMS = [
  "service_audit",
  "conformance_watch",
  "passport_refresh",
  "good_buyer",
];

/** https, default port, public internet, and never our own hostname. */
function targetVerdict(
  env: Env,
  raw: string | undefined,
  missing: string,
  ownHostRefusal: string,
): PurchaseRefusal | undefined {
  if (!isValidHttpUrl(raw)) {
    return refuse(400, "bad_request", missing);
  }
  const url = new URL(raw!);
  const verdict = checkProbeTarget(url, "");
  if (!verdict.ok) {
    return refuse(400, "target_refused", `${verdict.reason} Nothing charged.`);
  }
  if (url.host.toLowerCase() === new URL(env.STORE_BASE_URL).host.toLowerCase()) {
    return refuse(400, "target_refused", ownHostRefusal);
  }
  return undefined;
}

/**
 * EVERY PRE-PAYMENT REFUSAL THAT DEPENDS ON WHAT THE BUYER SENT, in
 * the order the HTTP door's middleware chain ran them, because that
 * order is observable: a purchase with two bad fields has always been
 * told about the first one.
 *
 * What is NOT here, deliberately: the shelf, stock, shutter and
 * capacity gates. Those depend on the store's state rather than the
 * buyer's arguments, both doors already run them, and folding them in
 * would mean this function needed the whole request.
 */
export async function checkPurchaseArgs(
  env: Env,
  item: MenuItem,
  args: PurchaseArgs,
): Promise<PurchaseRefusal | undefined> {
  const read = (name: string) => args.get(name);

  if (item.id === "context_anchor") {
    const summary = read("summary");
    if (!summary || summary.trim().length === 0) {
      return refuse(
        400,
        "bad_request",
        `An anchor needs a ${args.field("summary")}, the state you want remembered. No summary, no charge.`,
        // The one moment a buyer is actually composing the field, so
        // the checklist goes HERE and not only on the listing.
        { before_you_file: ANCHOR_CHECKLIST },
      );
    }
    if (summary.length > ANCHOR_SUMMARY_CAP) {
      return refuse(
        400,
        "bad_request",
        `That summary runs past the ledger margin. ${ANCHOR_SUMMARY_CAP} characters, tops. Nothing charged.`,
      );
    }
  }

  if (item.id === "standing_watch") {
    const refusal = targetVerdict(
      env,
      read("url"),
      `A standing watch needs a ${args.field("url")} — YOUR x402 endpoint, https. No target, no charge.`,
      "That is this store's own hostname, which our Worker cannot fetch (the platform kills self-requests) — a watch on it would be a week of false 'unreachable' rows. Our own uptime story is at /.well-known/liveness.json, free. Nothing charged.",
    );
    if (refusal) return refusal;
  }

  if (PROBE_ITEMS.includes(item.id)) {
    const refusal = targetVerdict(
      env,
      read("url"),
      `This needs a ${args.field("url")} — the https endpoint a buyer would GET expecting a 402. No target, no charge. A single unsigned look is free at POST /api/preflight.`,
      "That is this store's own hostname. We do not sell audits of ourselves — a report we sign about our own door is the instrument vouching for itself, worth exactly nothing to whoever you would show it to. Our 402s pass these same checks in CI on every build, and you should not take our word for that either: GET any /api/buy/{item} yourself and look. Nothing charged.",
    );
    if (refusal) return refusal;
  }

  if (item.id === "trust_profile") {
    const refusal = targetVerdict(
      env,
      read("url"),
      `This needs a ${args.field("url")} — your endpoint, https, on the public internet. No target, no charge. The free evidence for any ready-side host is already at /passport/{host}.`,
      "That is this store's own hostname; the house profile is /trust, free, and hosting a paid page about ourselves would be the instrument vouching for itself. Nothing charged.",
    );
    if (refusal) return refusal;
    // The profiles index names only ready-side hosts, so a door whose
    // latest evidence is failing gets its refusal here, for free, with
    // the same reasons the passport gives. (The mint re-derives it;
    // evidence can move between the quote and the payment.)
    const gate = await issuePassport(env, new URL(read("url")!).host.toLowerCase());
    if (!gate.issued) {
      return refuse(403, "passport_refused", `${gate.detail} Nothing charged.`);
    }
  }

  if (item.id === "aura_walk") {
    const refusal = targetVerdict(
      env,
      read("url"),
      `The walk needs a ${args.field("url")} — your own x402 door, https, on the public internet, the URL a buyer would GET expecting a 402. No door, no charge.`,
      "That is this store's own hostname. Our own cold passes are published free and dated in AGENT_UX.md, and a walk of ourselves sold to you would be the instrument vouching for itself. Nothing charged.",
    );
    if (refusal) return refusal;
  }

  if (item.id === "signature_agent_card") {
    const refusal = targetVerdict(
      env,
      read("url"),
      `This needs a ${args.field("url")} — your origin, or your key directory's full URL (/.well-known/http-message-signatures-directory). No target, no charge. A single unsigned look is free at POST /api/bot-auth/check.`,
      "That is this store's own hostname. We do not sell cards on our own directory — a report we sign about our own keys is the instrument vouching for itself. Fetch /.well-known/http-message-signatures-directory here yourself and check the proof-of-possession signature; the method is published and your own read is worth more than our word. Nothing charged.",
    );
    if (refusal) return refusal;
  }

  if (item.id === "onpage_audit") {
    const refusal = targetVerdict(
      env,
      read("url"),
      `This needs a ${args.field("url")} — the https page to read. No target, no charge. A single unsigned look is free at POST /api/onpage/v1.`,
      "That is this store's own hostname. We do not sell audits of our own pages — a report we sign about our own shop window is the instrument vouching for itself. The checks are published at GET /api/onpage/v1; read any page here against them yourself, and your own read is worth more than our word. Nothing charged.",
    );
    if (refusal) return refusal;
  }

  if (item.id === "launch_check" || item.id === "opening_day") {
    // The walk pays real money from the field wallet, and WALKABOUT.md
    // rule 3 fails closed: a store deployed without it refuses here
    // rather than taking five dollars for a walk that cannot pay.
    // Screening needs no secret — the keyless on-chain oracle is the
    // default (services/launch-check.ts) — so only the wallet gates.
    if (!env.FIELD_WALLET_KEY) {
      return refuse(
        503,
        "upstream_unavailable",
        "The Launch Check door is closed right now: the field wallet is not provisioned on this deployment, so no payment could be presented — and a check that cannot pay is not sold as one. No charge to you. The free preflight at POST /api/preflight/v1 reads your 402 challenge without paying it.",
      );
    }
    const refusal = targetVerdict(
      env,
      read("url"),
      `This needs a ${args.field("url")} — the https endpoint a buyer would pay. No target, no charge. A free unpaid read of your challenge is POST /api/preflight/v1.`,
      "That is this store's own hostname. We do not walk our own till and sign the receipt — a settlement report about ourselves, by ourselves, is the instrument vouching for itself. Buy the cheapest thing here with your own wallet; your own record of what happened is worth more than our word. Nothing charged.",
    );
    if (refusal) return refusal;
  }

  if (item.id === "the_statement" || item.id === "operator_statement") {
    const { statementRailOf, NETWORK_VOCABULARY } = await import(
      "@/lib/statement-rails"
    );
    const rail = statementRailOf(read("network"));
    if (rail === null) {
      return refuse(
        400,
        "bad_request",
        item.id === "the_statement"
          ? `${NETWORK_VOCABULARY}. An unrecognized network is refused rather than silently read as Base — the statement must be about the chain you asked about. Nothing charged.`
          : `${NETWORK_VOCABULARY}. An unrecognized network is refused rather than silently read as Base. Nothing charged.`,
      );
    }
    const wallet = read("wallet") ?? "";
    if (!rail.isAddress(wallet)) {
      const field = args.field("wallet");
      if (item.id === "operator_statement") {
        return refuse(
          400,
          "bad_request",
          rail.key === "solana"
            ? `This needs a ${field} — your receiving address, a Solana pubkey (base58, 32 bytes), because network=solana was asked for. No address, no charge.`
            : `This needs a ${field} — your receiving address, a 0x EVM address, 40 hex characters, on ${rail.label}. USDC on Base by default, Polygon with network=eip155:137, Ethereum, Arbitrum, Optimism or Avalanche with network=<that name>, or Solana with network=solana and a base58 pubkey. No address, no charge.`,
        );
      }
      return refuse(
        400,
        "bad_request",
        rail.key === "solana"
          ? `This needs a ${field} — a Solana pubkey (base58, 32 bytes), because network=solana was asked for; an EVM address has no history there. No wallet, no charge.`
          : `This needs a ${field} — a 0x EVM address, 40 hex characters, on ${rail.label}. This statement reads USDC on Base by default, Polygon with network=eip155:137, Ethereum, Arbitrum, Optimism or Avalanche with network=<that name>, or Solana with network=solana and a base58 pubkey (an EVM address has no history there). No wallet, no charge.`,
      );
    }
    if (item.id === "the_statement") {
      const hoursRaw = read("hours");
      if (hoursRaw !== undefined && hoursRaw !== "") {
        const hours = Number.parseInt(hoursRaw, 10);
        if (!Number.isFinite(hours) || hours < 1 || hours > 11) {
          return refuse(
            400,
            "bad_request",
            "hours must be a whole number from 1 to 11 (default 6). The window ceiling keeps the read bounded; a longer history is several statements. Nothing charged.",
          );
        }
      }
    }
  }

  if (item.id === "the_mandate") {
    const text = (read("mandate") ?? "").replace(/\0/g, "").trim();
    if (!text) {
      return refuse(
        400,
        "bad_request",
        `Nothing to record, no charge. Put the claimed instructions in the ${args.field("mandate")} — up to 2000 characters, recorded verbatim: what this agent is authorized to do, as the submitter claims it.`,
      );
    }
    if (text.length > 2000) {
      return refuse(
        400,
        "bad_request",
        "The mandate text caps at 2000 characters — a mandate is instructions, not a contract's appendix. Nothing charged.",
      );
    }
    const as = read("submitted_as");
    if (as !== undefined && as !== "" && as !== "agent" && as !== "principal") {
      return refuse(
        400,
        "bad_request",
        'submitted_as must be "agent" (the agent submitting its own claimed instructions — the default) or "principal" (the human\'s own client submitting them). It is recorded as a claim either way. Nothing charged.',
      );
    }
    const capRaw = read("declared_cap_usdc");
    if (capRaw !== undefined && capRaw !== "") {
      const cap = Number.parseFloat(capRaw);
      if (!Number.isFinite(cap) || cap <= 0) {
        return refuse(
          400,
          "bad_request",
          "declared_cap_usdc must be a positive number — the claimed spending ceiling in USDC. Declared, never enforced by us, and the record says so. Nothing charged.",
        );
      }
    }
    const expiresRaw = read("expires_at");
    if (expiresRaw !== undefined && expiresRaw !== "" && Number.isNaN(Date.parse(expiresRaw))) {
      return refuse(
        400,
        "bad_request",
        "expires_at must be an ISO 8601 date (e.g. 2026-09-01T00:00:00Z) — the claimed expiry of the authorization. Declared, never enforced by us. Nothing charged.",
      );
    }
  }

  /**
   * ANY purchase may cite a mandate — and a citation this store cannot
   * resolve is refused BEFORE money moves, so a certificate's
   * mandate_id never dangles. The one argument check that reads KV,
   * and deliberately: the whole value of the link is that it resolves.
   */
  const mandateId = read("mandate_id");
  if (mandateId !== undefined && mandateId !== "") {
    const resolved =
      /^m_[a-z0-9]+$/.test(mandateId) &&
      (await import("@/services/mandates").then(({ getMandate }) =>
        getMandate(env, mandateId),
      ));
    if (!resolved) {
      return refuse(
        400,
        "bad_request",
        "That mandate_id resolves to no mandate this store holds, so it cannot ride a certificate — a signed authorization link that points at nothing would be worse than none. Record the mandate first at /api/buy/the_mandate, then cite the id it returns. Nothing charged.",
      );
    }
  }

  if (item.id === "the_confession") {
    const confession = read("confession");
    if (!confession || confession.trim().length === 0) {
      return refuse(
        400,
        "bad_request",
        `A confession needs a ${args.field("confession")}, the thing itself, 500 characters. Nothing to hear, no charge.`,
      );
    }
    if (confession.length > 500) {
      return refuse(
        400,
        "bad_request",
        "The counter hears up to 500 characters. Longer burdens go in the Mailbox, free. Nothing charged.",
      );
    }
  }

  if (item.id === "the_case_file") {
    const txHash = read("tx_hash");
    if (!txHash || (!TX_HASH.test(txHash) && !isSolanaSignature(txHash))) {
      return refuse(
        400,
        "bad_request",
        `Give a ${args.field("tx_hash")} — 0x followed by 64 hex characters for Base or Polygon, or a base58 Solana signature. The shape picks the chain. No hash, no charge.`,
      );
    }
    const claim = read("claim");
    if (claim !== undefined && claim.length > CASE_FILE_CLAIM_CAP) {
      return refuse(
        400,
        "bad_request",
        `claim is ${claim.length} characters; the file stores up to ${CASE_FILE_CLAIM_CAP}, verbatim. Shorten it — nothing is truncated on your behalf and nothing was charged.`,
      );
    }
    const amountRaw = read("expected_amount_usdc");
    if (amountRaw !== undefined && amountRaw !== "") {
      const amount = Number.parseFloat(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
        return refuse(
          400,
          "bad_request",
          "expected_amount_usdc has to be a positive number of USDC below a billion, or left off. It is recorded as declared, never as observed. Nothing charged.",
        );
      }
    }
    const url = read("url");
    if (url !== undefined && url !== "" && !isValidHttpUrl(url)) {
      return refuse(
        400,
        "bad_request",
        "url has to be an http(s) URL — the endpoint the purchase was made at — or left off. Nothing charged.",
      );
    }
  }

  if (item.id === "coffees_for_closers") {
    const win = read("win");
    if (!win || win.trim().length === 0) {
      return refuse(
        400,
        "bad_request",
        `This coffee needs a ${args.field("win")}, the thing you closed. No win, no charge.`,
      );
    }
    if (win.length > COFFEE_WIN_CAP) {
      return refuse(
        400,
        "bad_request",
        `The certificate holds ${COFFEE_WIN_CAP} characters of win. Trim it to the good part. Nothing charged.`,
      );
    }
  }

  if (item.id === "spot_check") {
    const { validSpotCheckHost } = await import("@/services/spot-check");
    if (!validSpotCheckHost(read("host"))) {
      return refuse(
        400,
        "bad_request",
        `Give a bare hostname in the ${args.field("host")} — example.com, not a URL. We read our own books about it; no host, no charge.`,
      );
    }
  }

  if (item.id === "provenance_check") {
    const { validSubjectAddress } = await import("@/services/provenance-check");
    if (!validSubjectAddress(read("address"))) {
      return refuse(
        400,
        "bad_request",
        `Give a receiving address in the ${args.field("address")} — an EVM address (0x + 40 hex) or a Solana pubkey (base58). We read the signed chain about it; no address, no charge. Your own address is free: GET /api/provenance/self?address= for the challenge.`,
      );
    }
  }

  if (item.id === "graffiti_on_a_train") {
    const tag = read("tag");
    if (!tag || tag.trim().length === 0) {
      return refuse(
        400,
        "bad_request",
        `Nothing to spray. Put your mark in the ${args.field("tag")}, up to 140 characters. No tag, no charge.`,
      );
    }
    if (tag.length > TAG_CAP) {
      return refuse(
        400,
        "bad_request",
        `The side of a train holds ${TAG_CAP} characters. Anything longer is a letter, and the mailbox is free at /api/letter. Nothing charged.`,
      );
    }
    if (tagHasUrl(tag)) {
      return refuse(
        400,
        "bad_request",
        "No URLs on the train. A tag is a mark, not a billboard — the wall is public and permanent, which is exactly what link spam wants. Say it without the link. Nothing charged.",
      );
    }
  }

  if (item.id === "quick_judgment") {
    if (!(read("detail")?.trim() ?? "")) {
      return refuse(
        400,
        "bad_request",
        `No dilemma, no charge. Put the question itself in the ${args.field("detail")} — 600 characters tops, one question in, one verdict out.`,
      );
    }
  }

  if (item.id === "settlement_attestation") {
    const txHash = read("tx_hash");
    if (!txHash) {
      return refuse(
        400,
        "bad_request",
        `Nothing to look up. Give a ${args.field("tx_hash")} — a Base transaction hash (0x + 64 hex) or a Solana transaction signature (base58) — and we will read that chain once and sign what is there. No hash, no charge.`,
      );
    }
    const solana = isSolanaSignature(txHash);
    if (!TX_HASH.test(txHash) && !solana) {
      return refuse(
        400,
        "bad_request",
        "That is not a transaction identifier we can read. Base wants 0x followed by 64 hex characters; Solana wants the base58 transaction signature. Nothing charged; send the real one.",
      );
    }
    /**
     * A NONCE BESIDE A SOLANA SIGNATURE IS REFUSED AT THE DOOR
     * (2026-08-19). EIP-3009 nonces are an EVM facility; a Solana
     * observation cannot check one. Signing an artifact that silently
     * skipped a requested check would be the certificates defect in a
     * new coat, so the door says no before any money moves.
     */
    if (solana && read("nonce")) {
      return refuse(
        400,
        "bad_request",
        "nonce is an EIP-3009 facility and exists on the EVM rails only — a Solana observation cannot check one, and we will not sign an artifact that silently skipped a check you asked for. Drop the nonce, or send the EVM transaction hash instead. Nothing charged.",
      );
    }
  }

  if (item.id === "settlement_reconciliation") {
    const txHash = read("tx_hash");
    if (!txHash || !TX_HASH.test(txHash)) {
      return refuse(
        400,
        "bad_request",
        `Give a ${args.field("tx_hash")} — 0x followed by 64 hex characters. We read that Base receipt once and sign what moved against what ceiling was in force. No hash, no charge.`,
      );
    }
    const rawCap = read("declared_cap_usdc");
    if (rawCap !== undefined && rawCap !== "") {
      const cap = Number.parseFloat(rawCap);
      /*
       * BOUNDED, not merely finite. cap * 1_000_000 has to survive
       * Math.round into a BigInt, and past roughly nine billion USDC
       * the float stops being able to represent whole units — so a
       * wild number would not be refused, it would be quietly rounded
       * into a different one and then signed.
       */
      if (!Number.isFinite(cap) || cap <= 0 || cap > 1_000_000_000) {
        return refuse(
          400,
          "bad_request",
          "declared_cap_usdc has to be a positive number of USDC below a billion. Leave it off entirely if you have no ceiling to declare — an unparseable one would otherwise read as 'no cap declared', which is a different answer. Nothing charged.",
        );
      }
    }
  }

  if (item.id === "attestation_bundle") {
    const raw = read("tx_hashes");
    if (!raw) {
      return refuse(
        400,
        "bad_request",
        `Nothing to look up. Give tx_hashes — ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} Base transaction hashes, comma-separated — and we read each once and sign what is there. No hashes, no charge. One hash wants the single attestation at /api/buy/settlement_attestation.`,
      );
    }
    const hashes = raw.split(",").map((hash) => hash.trim()).filter(Boolean);
    if (hashes.length < BUNDLE_MIN_HASHES || hashes.length > BUNDLE_MAX_HASHES) {
      return refuse(
        400,
        "bad_request",
        `The sheaf takes ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} hashes; you sent ${hashes.length}. ${hashes.length < BUNDLE_MIN_HASHES ? "One hash wants the single attestation at /api/buy/settlement_attestation, four tenths of a cent." : "Split it into two purchases."} Nothing charged.`,
      );
    }
    const bad = hashes.find((hash) => !TX_HASH.test(hash));
    if (bad) {
      return refuse(
        400,
        "bad_request",
        `"${bad.slice(0, 80)}" is not a transaction hash. Base wants 0x followed by 64 hex characters, for every hash in the sheaf. Nothing charged; fix it and resend.`,
      );
    }
    if (new Set(hashes.map((hash) => hash.toLowerCase())).size !== hashes.length) {
      return refuse(
        400,
        "bad_request",
        "The sheaf has a duplicate hash in it. Refused rather than quietly deduplicated — you would be paying for observations you already had. Nothing charged; send each hash once.",
      );
    }
  }

  if (item.id === "bitcoin_anchor") {
    const digest = read("digest");
    if (!digest) {
      return refuse(
        400,
        "bad_request",
        `Nothing to anchor. Give a ${args.field("digest")} — 64 hex characters, a sha256 you computed over bytes you keep — and it goes to a Bitcoin-anchored timestamp. No digest, no charge. If you want the store to hash something FOR you, that is not this item: we deliberately never see your bytes.`,
      );
    }
    if (!SHA256_HEX.test(digest)) {
      return refuse(
        400,
        "bad_request",
        "That is not a sha256 digest. 64 hex characters, no 0x prefix. Nothing charged; hash your bytes and send the digest itself.",
      );
    }
  }

  return undefined;
}

type FulfillmentInput = Parameters<typeof fulfillPurchase>[3];

/**
 * EVERY ARGUMENT THAT DECIDES THE GOODS, read once for both doors.
 *
 * Nothing here validates: `checkPurchaseArgs` has already run and
 * refused, for free, before any money moved. What is left is the map
 * from the buyer's words to the fields fulfillment reads — and the
 * whole reason this function exists is that when that map lived in
 * two places, one of them was missing eleven fields and signed
 * artifacts about nothing.
 */
export function purchaseInputFrom(
  item: MenuItem,
  args: PurchaseArgs,
): FulfillmentInput {
  const read = (name: string) => args.get(name);
  const input: FulfillmentInput = {};

  const agentName = sanitizeText(read("agent_name"), 80);
  if (agentName && item.id !== "the_confession") {
    // Confessions stay anonymous unless sign_as says otherwise.
    input.agentName = agentName;
  }
  if (item.id === "the_confession") {
    input.confessionText = (read("confession") ?? "").replace(/\0/g, "");
    const signAs = sanitizeText(read("sign_as"), 80);
    if (signAs && signAs.toLowerCase() !== "anonymous") {
      input.agentName = signAs;
    }
  }
  const rawCallback = read("callback_url");
  if (isValidHttpUrl(rawCallback)) {
    input.callbackUrl = rawCallback;
  }
  if (item.id === "context_anchor") {
    input.summary = (read("summary") ?? "").replace(/\0/g, "");
  }
  /**
   * THE URL, for every item that takes one. This list used to live
   * as fourteen near-identical `if` blocks on the HTTP door and as
   * NOTHING AT ALL on the MCP door, which is the defect this file
   * was written to close.
   */
  if (
    [
      "phantom_check",
      "standing_watch",
      "service_audit",
      "conformance_watch",
      "passport_refresh",
      "good_buyer",
      "trust_profile",
      "signature_agent_card",
      // The door rides the order record so the keeper's counter shows
      // what to walk, separate from the buyer's free-text detail.
      "aura_walk",
      "onpage_audit",
      "launch_check",
      "opening_day",
    ].includes(item.id)
  ) {
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "good_buyer") {
    /*
     * The buyer's declared client configuration, carried as they sent
     * it. Read leniently and recorded as THEIR claim on the artifact:
     * a malformed value narrows to "declared nothing", which is the
     * unconfigured-client reading and the conservative direction.
     * This store never verifies a stranger's account of their own
     * machine, and the signed bytes say so.
     */
    const capRaw = Number(read("max_usd"));
    if (Number.isFinite(capRaw) && capRaw > 0) {
      input.buyerCapUsd = capRaw;
    }
    if (read("no_spend_controls") === "true") {
      input.buyerSpendControlsOff = true;
    }
  }
  if (item.id === "provenance_check") {
    input.subjectAddress = read("address") ?? "";
  }
  if (item.id === "operator_statement") {
    input.statementWallet = read("wallet") ?? "";
    input.statementNetwork = read("network");
  }
  if (item.id === "the_statement") {
    input.statementWallet = read("wallet") ?? "";
    input.statementHours = read("hours");
    input.statementNetwork = read("network");
  }
  if (item.id === "spot_check") {
    input.spotCheckHost = (read("host") ?? "").replace(/\0/g, "");
  }
  if (item.id === "coffees_for_closers") {
    const win = (read("win") ?? "").replace(/\0/g, "");
    input.win = win;
    // The counter shows the keeper the win alongside the order.
    input.detail = win;
  }
  if (item.id === "grudge") {
    input.grievance = (read("grievance") ?? "").replace(/\0/g, "");
  }
  if (item.id === "settlement_attestation") {
    const query: NonNullable<FulfillmentInput["attestationQuery"]> = {
      txHash: read("tx_hash") ?? "",
    };
    const payer = sanitizeText(read("payer"), 60);
    if (payer) query.payer = payer;
    const recipient = sanitizeText(read("recipient"), 60);
    if (recipient) query.recipient = recipient;
    const nonce = sanitizeText(read("nonce"), 80);
    if (nonce) query.nonce = nonce;
    // A caller checking their own payment already holds the payload
    // they sent. Read it with the same extractPaymentNonce the replay
    // guard uses, rather than making them reimplement it.
    const payload = read("payment_payload");
    if (!query.nonce && payload) {
      const fromPayload = nonceFromPaymentPayload(payload);
      if (fromPayload) query.nonce = fromPayload;
    }
    const amount = Number.parseFloat(read("amount_usdc") ?? "");
    if (Number.isFinite(amount) && amount > 0) query.amountUsdc = amount;
    input.attestationQuery = query;
  }
  if (item.id === "settlement_reconciliation") {
    const query: NonNullable<FulfillmentInput["reconciliationQuery"]> = {
      txHash: read("tx_hash") ?? "",
    };
    const payer = sanitizeText(read("payer"), 60);
    if (payer) query.payer = payer;
    const recipient = sanitizeText(read("recipient"), 60);
    if (recipient) query.recipient = recipient;
    const cap = Number.parseFloat(read("declared_cap_usdc") ?? "");
    if (Number.isFinite(cap) && cap > 0) query.declaredCapUsdc = cap;
    input.reconciliationQuery = query;
  }
  if (item.id === "the_case_file") {
    const ask: NonNullable<FulfillmentInput["caseFileInput"]> = {
      txHash: read("tx_hash") ?? "",
    };
    const mandateId = sanitizeText(read("mandate_id"), 80);
    if (mandateId) ask.mandateId = mandateId;
    const url = read("url");
    if (url) ask.endpointUrl = url;
    const payer = sanitizeText(read("payer"), 60);
    if (payer) ask.payer = payer;
    const recipient = sanitizeText(read("recipient"), 60);
    if (recipient) ask.recipient = recipient;
    const amount = Number.parseFloat(read("expected_amount_usdc") ?? "");
    if (Number.isFinite(amount) && amount > 0) ask.expectedAmountUsdc = amount;
    const claim = (read("claim") ?? "").replace(/\0/g, "");
    if (claim) ask.claim = claim;
    const launchCheckId = sanitizeText(read("launch_check_id"), 80);
    if (launchCheckId) ask.launchCheckId = launchCheckId;
    input.caseFileInput = ask;
  }
  if (item.id === "bitcoin_anchor") {
    input.anchorDigest = read("digest") ?? "";
    const label = sanitizeText(read("label"), 120);
    if (label) input.anchorLabel = label;
  }
  if (item.id === "attestation_bundle") {
    input.bundleTxHashes = (read("tx_hashes") ?? "")
      .split(",")
      .map((hash) => hash.trim())
      .filter(Boolean);
  }
  if (item.id === "graffiti_on_a_train") {
    // Verbatim past validation: the spray IS the product.
    input.tag = (read("tag") ?? "").replace(/\0/g, "");
    // The counter shows the keeper the tag alongside the queue.
    input.detail = input.tag;
  }
  const passId = sanitizeText(read("pass_id"), 40);
  if (passId) {
    input.passId = passId;
  }
  /**
   * THE BUYER'S WHY (the receipt chain, 2026-08-19): any purchase may
   * carry a purpose — what the agent says this is for — and it is
   * signed into the certificate verbatim. Untrusted text, same
   * handling as win and tag; capped at 280 so a receipt stays a
   * receipt and not a context dump.
   */
  const purpose = sanitizeText(read("purpose"), 280);
  if (purpose) {
    input.purpose = purpose;
  }
  // The mandate link, any item: checkPurchaseArgs already resolved it
  // against the store's own records before money could move.
  const mandateId = read("mandate_id");
  if (mandateId) {
    input.mandateId = mandateId;
  }
  if (item.id === "the_mandate") {
    input.mandateText = (read("mandate") ?? "").replace(/\0/g, "").trim();
    const submittedAs = read("submitted_as");
    if (submittedAs === "agent" || submittedAs === "principal") {
      input.mandateSubmittedAs = submittedAs;
    }
    const cap = Number.parseFloat(read("declared_cap_usdc") ?? "");
    if (Number.isFinite(cap) && cap > 0) {
      input.mandateDeclaredCap = cap;
    }
    const expires = read("expires_at");
    if (expires && !Number.isNaN(Date.parse(expires))) {
      input.mandateExpiresAt = expires;
    }
  }
  const detail = sanitizeText(read("detail"), 600);
  if (detail) {
    input.detail = detail;
  }
  return input;
}
