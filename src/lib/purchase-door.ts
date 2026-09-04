import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { checkProbeTarget } from "@/lib/probe-target";
import { isSolanaSignature } from "@/lib/solana-rpc";
import { issuePassport } from "@/services/passport";
import { ANCHOR_SUMMARY_CAP } from "@/services/anchors";
import { nonceFromPaymentPayload } from "@/services/attestation";
import { CASE_FILE_CLAIM_CAP } from "@/services/case-file";
import { COFFEE_WIN_CAP, type FulfillmentInput } from "@/services/fulfillment";
import { TAG_CAP, tagHasUrl } from "@/services/train";
import { ANCHOR_CHECKLIST } from "@/store/copy/anchor-writing";
import type { Env, MenuItem } from "@/types";

/**
 * THE DOOR LAW, ONE COPY, TWO DOORS (2026-09-04).
 *
 * Every paid item is sold through two doors — GET /api/buy/{item} and
 * the MCP buy_* tools — and one till behind them (fulfillPurchase).
 * The doors had grown apart. The HTTP door ran twenty-three pre-gate
 * checks and mapped sixty lines of query parameters into the
 * fulfilment input; the MCP door checked five items by name and
 * forwarded a dozen fields. Everything else an MCP buyer sent — the
 * digest for a Bitcoin anchor, the wallet for a statement, the
 * mandate text, the sheaf of hashes, the url for an audit — was
 * accepted by the tool's own published schema and then DROPPED on the
 * floor before the till ever saw it.
 *
 * What that did, in the order CV's field notes of 2026-09-04 met it:
 * a bitcoin_anchor bought over MCP settled, minted a certificate,
 * then died in the goods step ("reached goods with no digest") and
 * answered 500 — money moved, patron number issued, nothing
 * delivered, recovered by hand. An attestation_bundle had gone the
 * same way earlier. A statement and a mandate bought over MCP
 * "worked": they signed a statement about no wallet and a mandate
 * with no text, because the till reads an absent input as empty and
 * the door that should have refused never looked. Three shapes of one
 * defect, and every one of them is the kind this store sells the
 * instrument for.
 *
 * So the law moved here and both doors call it. Two functions:
 *
 *   refusePurchaseInput — every refusal that must land BEFORE money
 *   moves, in the exact order the HTTP middlewares ran, each body
 *   byte-for-byte what it was (the sentences are pinned by tests and
 *   by rule 57.4's `charged: false` sweep). The one thing that varies
 *   by door is how a field is named: "the url query parameter" at the
 *   HTTP door, "the url input" at the MCP door — the `param` hook
 *   below, and nothing else.
 *
 *   readFulfillmentInput — the mapping from what the buyer sent to
 *   what the till takes, moved verbatim from the HTTP handler. A
 *   field the schema advertises and this function does not read is
 *   caught by test/one-door-law.spec.ts, which is the guard that
 *   would have caught the anchor.
 *
 * Neither function knows which door it serves beyond the dialect: the
 * HTTP door passes `c.req.query`, the MCP door passes its arguments.
 * "This codebase has already been bitten by a fix that looked shared
 * and was not" (routes/mcp.ts) — this one is shared by construction,
 * because the second copy no longer exists.
 */

/** How a door reads one named field the buyer sent, or nothing. */
export type DoorRead = (name: string) => string | undefined;

/**
 * How a door names a field in a sentence. "query" is the HTTP door
 * ("the url query parameter"); "input" is the MCP door ("the url
 * input"), whose tool descriptions already call them inputs.
 */
export type DoorDialect = "query" | "input";

/** A refusal that cost nothing: the status and body the door serves. */
export interface DoorRefusal {
  status: 400 | 403 | 503;
  body: Record<string, unknown> & { error: string };
}

function refuse(
  status: DoorRefusal["status"],
  body: DoorRefusal["body"],
): DoorRefusal {
  return { status, body };
}

/** A transaction hash on the EVM rails: what the chain reads take. */
export const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** The sheaf's bounds. Named beside the check that enforces them. */
export const BUNDLE_MIN_HASHES = 2;
export const BUNDLE_MAX_HASHES = 20;

/** sha256 hex: what the Bitcoin anchor takes and all it ever takes. */
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

/**
 * service_audit and conformance_watch need a probeable URL BEFORE
 * money moves — the same battery behind both doors, so the same
 * refusals, made here for free: https only, default port only, never
 * our own hostname (an audit of ourselves signed by ourselves would
 * be the instrument vouching for itself — and the platform kills
 * self-fetch anyway).
 */
const PROBE_ITEMS = [
  "service_audit",
  "conformance_watch",
  // The Refresh rides the same law: a validated https target, our own
  // hostname refused, nothing charged without a real door to look at.
  "passport_refresh",
  /*
   * The Good Buyer (#96) joins the same list rather than growing a
   * fourth copy of the rule. Its probe is the audit's probe; a door
   * with its own opinions about probeable targets is how the
   * private-address hole got in, and one law in one place is what
   * closed it. The own-host refusal reads a little differently here
   * — we would happily tell you what your client does with OUR
   * accepts — but the platform kills self-fetch either way, and a
   * reading we sign about our own door is worth nothing to whoever
   * you would show it to.
   */
  "good_buyer",
];

function isOwnHost(url: URL, env: Env): boolean {
  return url.host.toLowerCase() === new URL(env.STORE_BASE_URL).host.toLowerCase();
}

/**
 * Every refusal that must land before money moves, for one item, in
 * the order the HTTP middlewares ran. Returns the first refusal that
 * applies, or null when the input could actually be fulfilled.
 *
 * The caller decides WHEN this runs. The HTTP door runs it only for a
 * request carrying a payment signature (the probe rule: a bare GET is
 * asking the price, and gets the 402). The MCP door runs it on every
 * buy_* call, paid or not, because a tools/call is never an indexer
 * knocking — it is an agent that has read the schema, and the cheapest
 * moment to tell it the digest is malformed is before it signs.
 */
export async function refusePurchaseInput(
  item: MenuItem,
  read: DoorRead,
  env: Env,
  dialect: DoorDialect,
): Promise<DoorRefusal | null> {
  const param = (name: string): string =>
    dialect === "query" ? `${name} query parameter` : `${name} input`;

  /**
   * context_anchor needs its summary BEFORE money moves: nobody pays $1
   * to anchor an empty page. Stored as written (length-capped, null bytes
   * stripped); it is agent-supplied data, never instructions to us.
   */
  if (item.id === "context_anchor") {
    const summary = read("summary");
    if (!summary || summary.trim().length === 0) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `An anchor needs a ${param("summary")}, the state you want remembered. No summary, no charge.`,
        // The one moment a buyer is actually composing the field, so
        // the checklist goes HERE and not only on the listing — the
        // keeper's ruling: a disclaimer tells somebody afterward what
        // they lost, a checklist at the cursor prevents it. Three
        // items, his words, and nothing about them is enforced.
        before_you_file: ANCHOR_CHECKLIST,
      });
    }
    if (summary.length > ANCHOR_SUMMARY_CAP) {
      return refuse(400, {
        error: `That summary runs past the ledger margin. ${ANCHOR_SUMMARY_CAP} characters, tops.`,
      });
    }
  }

  /**
   * standing_watch needs a watchable URL BEFORE money moves — and "our
   * own hostname" is refused here too: a Worker cannot fetch itself
   * (the 522 lesson), so selling a watch on scvd.store would sell a
   * week of "unreachable" rows about a store that is up.
   */
  if (item.id === "standing_watch") {
    const raw = read("url");
    if (!isValidHttpUrl(raw)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `A standing watch needs a ${param("url")} — YOUR x402 endpoint, https. No target, no charge.`,
      });
    }
    const url = new URL(raw);
    /*
     * The shared law, which this door was missing entirely: it checked
     * https and our own hostname and nothing else — not even the port,
     * which both other probe doors have always refused. Nothing is
     * charged for a refusal here.
     */
    const verdict = checkProbeTarget(url, "");
    if (!verdict.ok) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      });
    }
    if (isOwnHost(url, env)) {
      return refuse(400, {
        error:
          "That is this store's own hostname, which our Worker cannot fetch (the platform kills self-requests) — a watch on it would be a week of false 'unreachable' rows. Our own uptime story is at /.well-known/liveness.json, free.",
      });
    }
  }

  if (PROBE_ITEMS.includes(item.id)) {
    const raw = read("url");
    if (!isValidHttpUrl(raw)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `This needs a ${param("url")} — the https endpoint a buyer would GET expecting a 402. No target, no charge. A single unsigned look is free at POST /api/preflight.`,
      });
    }
    const url = new URL(raw);
    const verdict = checkProbeTarget(url, "");
    if (!verdict.ok) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      });
    }
    if (isOwnHost(url, env)) {
      return refuse(400, {
        error:
          "That is this store's own hostname. We do not sell audits of ourselves — a report we sign about our own door is the instrument vouching for itself, worth exactly nothing to whoever you would show it to. Our 402s pass these same checks in CI on every build, and you should not take our word for that either: GET any /api/buy/{item} yourself and look.",
      });
    }
  }

  /**
   * trust_profile holds the probe law AND the ready gate BEFORE money
   * moves: the profiles index names only ready-side hosts, so a door
   * whose latest evidence is failing gets its refusal here, for free,
   * with the same reasons the passport gives — never after the coin
   * drops. (The mint re-derives the gate; evidence can move between
   * the quote and the payment, and the verified-fact law says the
   * check runs when it matters, not when it was cheap.)
   */
  if (item.id === "trust_profile") {
    const raw = read("url");
    if (!isValidHttpUrl(raw)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `This needs a ${param("url")} — your endpoint, https, on the public internet. No target, no charge. The free evidence for any ready-side host is already at /passport/{host}.`,
      });
    }
    const url = new URL(raw);
    const verdict = checkProbeTarget(url, "");
    if (!verdict.ok) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      });
    }
    if (isOwnHost(url, env)) {
      return refuse(400, {
        error:
          "That is this store's own hostname; the house profile is /trust, free, and hosting a paid page about ourselves would be the instrument vouching for itself.",
      });
    }
    const gate = await issuePassport(env, url.host.toLowerCase());
    if (!gate.issued) {
      return refuse(403, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "passport_refused",
        error: `${gate.detail} Nothing charged.`,
      });
    }
  }

  /**
   * The aura walk needs a door BEFORE money moves, under the shared law
   * (https, default port, public internet, never our own hostname).
   * Our own hostname is refused for a reason that is not the platform's
   * self-fetch limit — the keeper's machines could reach us fine — but
   * the older one: the store's own cold passes are already published,
   * free and dated, in AGENT_UX.md, and a walk of ourselves sold to a
   * stranger would be the instrument vouching for itself. Nothing is
   * charged for a refusal here.
   */
  if (item.id === "aura_walk") {
    const raw = read("url");
    if (!isValidHttpUrl(raw)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `The walk needs a ${param("url")} — your own x402 door, https, on the public internet, the URL a buyer would GET expecting a 402. No door, no charge.`,
      });
    }
    const url = new URL(raw);
    const verdict = checkProbeTarget(url, "");
    if (!verdict.ok) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      });
    }
    if (isOwnHost(url, env)) {
      return refuse(400, {
        charged: false,
        code: "target_refused",
        error:
          "That is this store's own hostname. Our own cold passes are published free and dated in AGENT_UX.md, and a walk of ourselves sold to you would be the instrument vouching for itself. Nothing charged.",
      });
    }
  }

  /**
   * signature_agent_card needs a fetchable directory target BEFORE
   * money moves — the probe law with the card's own copy, because "the
   * URL a buyer would GET expecting a 402" is the wrong sentence to
   * show somebody naming a key directory.
   */
  if (item.id === "signature_agent_card") {
    const raw = read("url");
    if (!isValidHttpUrl(raw)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `This needs a ${param("url")} — your origin, or your key directory's full URL (/.well-known/http-message-signatures-directory). No target, no charge. A single unsigned look is free at POST /api/bot-auth/check.`,
      });
    }
    const url = new URL(raw);
    const verdict = checkProbeTarget(url, "");
    if (!verdict.ok) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      });
    }
    if (isOwnHost(url, env)) {
      return refuse(400, {
        error:
          "That is this store's own hostname. We do not sell cards on our own directory — a report we sign about our own keys is the instrument vouching for itself. Fetch /.well-known/http-message-signatures-directory here yourself and check the proof-of-possession signature; the method is published and your own read is worth more than our word.",
      });
    }
  }

  /**
   * onpage_audit needs a fetchable page BEFORE money moves — the probe
   * law with the page desk's own copy, because "the URL a buyer would
   * GET expecting a 402" is the wrong sentence to show somebody naming
   * a page.
   */
  if (item.id === "onpage_audit") {
    const raw = read("url");
    if (!isValidHttpUrl(raw)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `This needs a ${param("url")} — the https page to read. No target, no charge. A single unsigned look is free at POST /api/onpage/v1.`,
      });
    }
    const url = new URL(raw);
    const verdict = checkProbeTarget(url, "");
    if (!verdict.ok) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      });
    }
    if (isOwnHost(url, env)) {
      return refuse(400, {
        error:
          "That is this store's own hostname. We do not sell audits of our own pages — a report we sign about our own shop window is the instrument vouching for itself. The checks are published at GET /api/onpage/v1; read any page here against them yourself, and your own read is worth more than our word.",
      });
    }
  }

  /**
   * launch_check needs a target AND an open door BEFORE money moves:
   * the walk pays real money from the field wallet, and WALKABOUT.md
   * rule 3 fails closed — so a store deployed without the field wallet
   * or the sanctions screen refuses the purchase here, plainly, rather
   * than taking five dollars for a walk that cannot pay.
   */
  if (item.id === "launch_check" || item.id === "opening_day") {
    // Screening needs no secret: the keyless on-chain oracle is the
    // default (services/launch-check.ts), so only the wallet gates.
    if (!env.FIELD_WALLET_KEY) {
      return refuse(503, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "upstream_unavailable",
        error:
          "The Launch Check door is closed right now: the field wallet is not provisioned on this deployment, so no payment could be presented — and a check that cannot pay is not sold as one. No charge to you. The free preflight at POST /api/preflight/v1 reads your 402 challenge without paying it.",
      });
    }
    const raw = read("url");
    if (!isValidHttpUrl(raw)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `This needs a ${param("url")} — the https endpoint a buyer would pay. No target, no charge. A free unpaid read of your challenge is POST /api/preflight/v1.`,
      });
    }
    const url = new URL(raw);
    const verdict = checkProbeTarget(url, "");
    if (!verdict.ok) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "target_refused",
        error: `${verdict.reason} Nothing charged.`,
      });
    }
    if (isOwnHost(url, env)) {
      return refuse(400, {
        error:
          "That is this store's own hostname. We do not walk our own till and sign the receipt — a settlement report about ourselves, by ourselves, is the instrument vouching for itself. Buy the cheapest thing here with your own wallet; your own record of what happened is worth more than our word.",
      });
    }
  }

  /**
   * the_statement needs a statable wallet BEFORE money moves: a
   * malformed address would buy a signed record of nothing. Hours are
   * clamped by the service; only presence and shape gate here.
   */
  if (item.id === "the_statement") {
    const { statementRailOf, NETWORK_VOCABULARY } = await import("@/lib/statement-rails");
    const rail = statementRailOf(read("network"));
    if (rail === null) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `${NETWORK_VOCABULARY}. An unrecognized network is refused rather than silently read as Base — the statement must be about the chain you asked about. Nothing charged.`,
      });
    }
    const wallet = read("wallet") ?? "";
    if (!rail.isAddress(wallet)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          rail.key === "solana"
            ? `This needs a ${param("wallet")} — a Solana pubkey (base58, 32 bytes), because network=solana was asked for; an EVM address has no history there. No wallet, no charge.`
            : `This needs a ${param("wallet")} — a 0x EVM address, 40 hex characters, on ${rail.label}. This statement reads USDC on Base by default, Polygon with network=eip155:137, Ethereum, Arbitrum, Optimism or Avalanche with network=<that name>, or Solana with network=solana and a base58 pubkey (an EVM address has no history there). No wallet, no charge.`,
      });
    }
    const hoursRaw = read("hours");
    if (hoursRaw !== undefined) {
      const hours = Number.parseInt(hoursRaw, 10);
      if (!Number.isFinite(hours) || hours < 1 || hours > 11) {
        return refuse(400, {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "bad_request",
          error:
            "hours must be a whole number from 1 to 11 (default 6). The window ceiling keeps the read bounded; a longer history is several statements. Nothing charged.",
        });
      }
    }
  }

  /**
   * The operator's statement needs a statable address and a recognized
   * rail BEFORE money moves, same law as the_statement: a malformed
   * address would buy a month of signed nothing.
   */
  if (item.id === "operator_statement") {
    const { statementRailOf, NETWORK_VOCABULARY } = await import("@/lib/statement-rails");
    const rail = statementRailOf(read("network"));
    if (rail === null) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `${NETWORK_VOCABULARY}. An unrecognized network is refused rather than silently read as Base. Nothing charged.`,
      });
    }
    const wallet = read("wallet") ?? "";
    if (!rail.isAddress(wallet)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          rail.key === "solana"
            ? `This needs a ${param("wallet")} — your receiving address, a Solana pubkey (base58, 32 bytes), because network=solana was asked for. No address, no charge.`
            : `This needs a ${param("wallet")} — your receiving address, a 0x EVM address, 40 hex characters, on ${rail.label}. USDC on Base by default, Polygon with network=eip155:137, Ethereum, Arbitrum, Optimism or Avalanche with network=<that name>, or Solana with network=solana and a base58 pubkey. No address, no charge.`,
      });
    }
  }

  /**
   * the_mandate needs claimed instructions BEFORE money moves, and the
   * optional structured claims must be well-shaped — a malformed cap or
   * expiry signed forever is worse than a refusal now.
   */
  if (item.id === "the_mandate") {
    const text = (read("mandate") ?? "").replace(/\0/g, "").trim();
    if (!text) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Nothing to record, no charge. Put the claimed instructions in the ${param("mandate")} — up to 2000 characters, recorded verbatim: what this agent is authorized to do, as the submitter claims it.`,
      });
    }
    if (text.length > 2000) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "The mandate text caps at 2000 characters — a mandate is instructions, not a contract's appendix. Nothing charged.",
      });
    }
    const as = read("submitted_as");
    if (as !== undefined && as !== "agent" && as !== "principal") {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          'submitted_as must be "agent" (the agent submitting its own claimed instructions — the default) or "principal" (the human\'s own client submitting them). It is recorded as a claim either way. Nothing charged.',
      });
    }
    const capRaw = read("declared_cap_usdc");
    if (capRaw !== undefined) {
      const cap = Number.parseFloat(capRaw);
      if (!Number.isFinite(cap) || cap <= 0) {
        return refuse(400, {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "bad_request",
          error:
            "declared_cap_usdc must be a positive number — the claimed spending ceiling in USDC. Declared, never enforced by us, and the record says so. Nothing charged.",
        });
      }
    }
    const expiresRaw = read("expires_at");
    if (expiresRaw !== undefined && Number.isNaN(Date.parse(expiresRaw))) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "expires_at must be an ISO 8601 date (e.g. 2026-09-01T00:00:00Z) — the claimed expiry of the authorization. Declared, never enforced by us. Nothing charged.",
      });
    }
  }

  /**
   * ANY purchase may cite a mandate — and a citation this store cannot
   * resolve is refused BEFORE money moves, so a certificate's
   * mandate_id never dangles. The one door check that reads KV, and
   * deliberately: the whole value of the link is that it resolves.
   */
  const mandateId = read("mandate_id");
  if (mandateId !== undefined) {
    if (
      !/^m_[a-z0-9]+$/.test(mandateId) ||
      !(await import("@/services/mandates").then(({ getMandate }) =>
        getMandate(env, mandateId),
      ))
    ) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "That mandate_id resolves to no mandate this store holds, so it cannot ride a certificate — a signed authorization link that points at nothing would be worse than none. Record the mandate first at /api/buy/the_mandate, then cite the id it returns. Nothing charged.",
      });
    }
  }

  /** the_confession needs words BEFORE money moves: nothing to hear, no charge. */
  if (item.id === "the_confession") {
    const confession = read("confession");
    if (!confession || confession.trim().length === 0) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `A confession needs a ${param("confession")}, the thing itself, 500 characters. Nothing to hear, no charge.`,
      });
    }
    if (confession.length > 500) {
      return refuse(400, {
        error:
          "The counter hears up to 500 characters. Longer burdens go in the Mailbox, free.",
      });
    }
  }

  /**
   * The case file needs a real hash BEFORE money moves, same as the
   * attestation; the shape picks the chain. The declared claim is capped
   * for free here rather than truncated after the coin drops.
   */
  if (item.id === "the_case_file") {
    const txHash = read("tx_hash");
    if (!txHash || (!TX_HASH.test(txHash) && !isSolanaSignature(txHash))) {
      return refuse(400, {
        charged: false,
        code: "bad_request",
        error: `Give a ${param("tx_hash")} — 0x followed by 64 hex characters for Base or Polygon, or a base58 Solana signature. The shape picks the chain. No hash, no charge.`,
      });
    }
    const claim = read("claim");
    if (claim !== undefined && claim.length > CASE_FILE_CLAIM_CAP) {
      return refuse(400, {
        charged: false,
        code: "bad_request",
        error: `claim is ${claim.length} characters; the file stores up to ${CASE_FILE_CLAIM_CAP}, verbatim. Shorten it — nothing is truncated on your behalf and nothing was charged.`,
      });
    }
    const amountRaw = read("expected_amount_usdc");
    if (amountRaw !== undefined && amountRaw !== "") {
      const amount = Number.parseFloat(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
        return refuse(400, {
          charged: false,
          code: "bad_request",
          error: "expected_amount_usdc has to be a positive number of USDC below a billion, or left off. It is recorded as declared, never as observed. Nothing charged.",
        });
      }
    }
    const url = read("url");
    if (url !== undefined && url !== "" && !isValidHttpUrl(url)) {
      return refuse(400, {
        charged: false,
        code: "bad_request",
        error: "url has to be an http(s) URL — the endpoint the purchase was made at — or left off. Nothing charged.",
      });
    }
  }

  /** coffees_for_closers needs the win BEFORE money moves: no win, no coffee. */
  if (item.id === "coffees_for_closers") {
    const win = read("win");
    if (!win || win.trim().length === 0) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `This coffee needs a ${param("win")}, the thing you closed. No win, no charge.`,
      });
    }
    if (win.length > COFFEE_WIN_CAP) {
      return refuse(400, {
        error: `The certificate holds ${COFFEE_WIN_CAP} characters of win. Trim it to the good part.`,
      });
    }
  }

  /** spot_check needs a readable host BEFORE money moves: no host, no charge. */
  if (item.id === "spot_check") {
    const { validSpotCheckHost } = await import("@/services/spot-check");
    if (!validSpotCheckHost(read("host"))) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Give a bare hostname in the ${param("host")} — example.com, not a URL. We read our own books about it; no host, no charge.`,
      });
    }
  }

  /** provenance_check needs a receiving address BEFORE money moves; own address is free elsewhere. */
  if (item.id === "provenance_check") {
    const { validSubjectAddress } = await import("@/services/provenance-check");
    if (!validSubjectAddress(read("address"))) {
      return refuse(400, {
        charged: false,
        code: "bad_request",
        error: `Give a receiving address in the ${param("address")} — an EVM address (0x + 40 hex) or a Solana pubkey (base58). We read the signed chain about it; no address, no charge. Your own address is free: GET /api/provenance/self?address= for the challenge.`,
      });
    }
  }

  if (item.id === "graffiti_on_a_train") {
    const tag = read("tag");
    if (!tag || tag.trim().length === 0) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Nothing to spray. Put your mark in the ${param("tag")}, up to 140 characters. No tag, no charge.`,
      });
    }
    if (tag.length > TAG_CAP) {
      return refuse(400, {
        error: `The side of a train holds ${TAG_CAP} characters. Anything longer is a letter, and the mailbox is free at /api/letter.`,
      });
    }
    if (tagHasUrl(tag)) {
      return refuse(400, {
        error:
          "No URLs on the train. A tag is a mark, not a billboard — the wall is public and permanent, which is exactly what link spam wants. Say it without the link.",
      });
    }
  }

  /**
   * The dilemma IS the order (2026-08-19): quick_judgment's prose always
   * said "state your dilemma in the detail parameter" and the published
   * schema now requires it — so the door enforces what the listing
   * declares, the 2026-07-26 lesson run in the other direction. A paid
   * order with no question in it is a week of SLA spent asking for one.
   */
  if (item.id === "quick_judgment") {
    const detail = read("detail")?.trim() ?? "";
    if (!detail) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `No dilemma, no charge. Put the question itself in the ${param("detail")} — 600 characters tops, one question in, one verdict out.`,
      });
    }
  }

  /**
   * A settlement attestation needs something to look up, and the hash
   * has to be a hash. Both refusals land before the payment gate: an
   * observation we cannot make is not a thing to sell.
   */
  if (item.id === "settlement_attestation") {
    const txHash = read("tx_hash");
    if (!txHash) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Nothing to look up. Give a ${param("tx_hash")} — a Base transaction hash (0x + 64 hex) or a Solana transaction signature (base58) — and we will read that chain once and sign what is there. No hash, no charge.`,
      });
    }
    const solana = isSolanaSignature(txHash);
    if (!TX_HASH.test(txHash) && !solana) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "That is not a transaction identifier we can read. Base wants 0x followed by 64 hex characters; Solana wants the base58 transaction signature. Nothing charged; send the real one.",
      });
    }
    /**
     * A NONCE BESIDE A SOLANA SIGNATURE IS REFUSED AT THE DOOR
     * (2026-08-19). EIP-3009 nonces are an EVM facility; a Solana
     * observation cannot check one. Signing an artifact that silently
     * skipped a requested check would be the certificates defect in a
     * new coat, so the door says no before any money moves.
     */
    if (solana && read("nonce")) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "nonce is an EIP-3009 facility and exists on the EVM rails only — a Solana observation cannot check one, and we will not sign an artifact that silently skipped a check you asked for. Drop the nonce, or send the EVM transaction hash instead. Nothing charged.",
      });
    }
  }

  /**
   * The reconciliation needs a real hash BEFORE money moves, same as
   * the attestation. The DECLARED cap is validated here too — a caller
   * who sends nonsense should be told so for free, and a cap we cannot
   * parse must never quietly become "no cap declared", which would turn
   * a bad input into a different (and cheaper-looking) verdict.
   */
  if (item.id === "settlement_reconciliation") {
    const txHash = read("tx_hash");
    if (!txHash || !TX_HASH.test(txHash)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Give a ${param("tx_hash")} — 0x followed by 64 hex characters. We read that Base receipt once and sign what moved against what ceiling was in force. No hash, no charge.`,
      });
    }
    const rawCap = read("declared_cap_usdc");
    if (rawCap !== undefined && rawCap !== "") {
      const cap = Number.parseFloat(rawCap);
      /*
       * BOUNDED, not merely finite. cap * 1_000_000 has to survive
       * Math.round into a BigInt, and past roughly nine billion USDC the
       * float stops being able to represent whole units — so a wild
       * number would not be refused, it would be quietly rounded into a
       * different one and then signed.
       */
      if (!Number.isFinite(cap) || cap <= 0 || cap > 1_000_000_000) {
        return refuse(400, {
          /* 57.4: the fact an agent needs first, machine-readable. */
          charged: false,
          code: "bad_request",
          error:
            "declared_cap_usdc has to be a positive number of USDC below a billion. Leave it off entirely if you have no ceiling to declare — an unparseable one would otherwise read as 'no cap declared', which is a different answer. Nothing charged.",
        });
      }
    }
  }

  /**
   * The sheaf's pre-gate check: every refusal here costs the buyer
   * nothing, same contract as every other pre-gate validator — the money
   * only moves once the input could actually be fulfilled. Duplicates
   * are refused rather than quietly deduplicated, because a silent
   * dedupe charges for twenty and delivers fifteen with no way to tell
   * the buyer which five were their own repetition.
   */
  if (item.id === "attestation_bundle") {
    const raw = read("tx_hashes");
    if (!raw) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Nothing to look up. Give tx_hashes — ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} Base transaction hashes, comma-separated — and we read each once and sign what is there. No hashes, no charge. One hash wants the single attestation at /api/buy/settlement_attestation.`,
      });
    }
    const hashes = raw.split(",").map((hash) => hash.trim()).filter(Boolean);
    if (hashes.length < BUNDLE_MIN_HASHES || hashes.length > BUNDLE_MAX_HASHES) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `The sheaf takes ${BUNDLE_MIN_HASHES} to ${BUNDLE_MAX_HASHES} hashes; you sent ${hashes.length}. ${hashes.length < BUNDLE_MIN_HASHES ? "One hash wants the single attestation at /api/buy/settlement_attestation, four tenths of a cent." : "Split it into two purchases."} Nothing charged.`,
      });
    }
    const bad = hashes.find((hash) => !TX_HASH.test(hash));
    if (bad) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `"${bad.slice(0, 80)}" is not a transaction hash. Base wants 0x followed by 64 hex characters, for every hash in the sheaf. Nothing charged; fix it and resend.`,
      });
    }
    if (new Set(hashes.map((hash) => hash.toLowerCase())).size !== hashes.length) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "The sheaf has a duplicate hash in it. Refused rather than quietly deduplicated — you would be paying for observations you already had. Nothing charged; send each hash once.",
      });
    }
  }

  if (item.id === "bitcoin_anchor") {
    const digest = read("digest");
    if (!digest) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error: `Nothing to anchor. Give a ${param("digest")} — 64 hex characters, a sha256 you computed over bytes you keep — and it goes to a Bitcoin-anchored timestamp. No digest, no charge. If you want the store to hash something FOR you, that is not this item: we deliberately never see your bytes.`,
      });
    }
    if (!SHA256_HEX.test(digest)) {
      return refuse(400, {
        /* 57.4: the fact an agent needs first, machine-readable. */
        charged: false,
        code: "bad_request",
        error:
          "That is not a sha256 digest. 64 hex characters, no 0x prefix. Nothing charged; hash your bytes and send the digest itself.",
      });
    }
  }

  return null;
}

/** What the transport knew about the caller, beyond the fields. */
export interface DoorHeaders {
  userAgent?: string | undefined;
  referrer?: string | undefined;
}

/**
 * What the buyer sent, mapped into what the till takes. Run only after
 * refusePurchaseInput returned null: every value read here was shaped
 * by the check that guards it, and the `?? ""` fallbacks restate that
 * rather than tolerate a missing input.
 */
export function readFulfillmentInput(
  item: MenuItem,
  read: DoorRead,
  headers: DoorHeaders = {},
): FulfillmentInput {
  const input: FulfillmentInput = {};
  const agentName = sanitizeText(read("agent_name"), 80);
  if (agentName && item.id !== "the_confession") {
    // Confessions stay anonymous unless sign_as says otherwise.
    input.agentName = agentName;
  }
  if (item.id === "the_confession") {
    // The law validated presence and length before the gate.
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
    // The law validated presence and length before the gate.
    input.summary = (read("summary") ?? "").replace(/\0/g, "");
  }
  if (item.id === "phantom_check") {
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "standing_watch") {
    // The law validated the URL (and refused our own host).
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "service_audit" || item.id === "conformance_watch") {
    // The law validated the URL (and refused our own host).
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "passport_refresh") {
    // The law validated the URL (and refused our own host).
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "good_buyer") {
    // The law validated the URL (and refused our own host).
    input.targetUrl = read("url") ?? "";
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
  if (item.id === "trust_profile") {
    // The law validated the URL, refused our own host, and held the
    // ready gate before the 402; the mint re-derives it.
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "signature_agent_card") {
    // The law validated the URL (and refused our own host).
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "aura_walk") {
    // The law validated the URL (and refused our own host). The door
    // rides the order record so the keeper's counter shows what to
    // walk, separate from the buyer's free-text detail.
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "onpage_audit") {
    // The law validated the URL (and refused our own host).
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "provenance_check") {
    // The law validated the address shape.
    input.subjectAddress = read("address") ?? "";
  }
  if (item.id === "launch_check" || item.id === "opening_day") {
    // The law validated the URL, refused our own host, and confirmed
    // the field wallet and screen are provisioned.
    input.targetUrl = read("url") ?? "";
  }
  if (item.id === "operator_statement") {
    // The law validated the address shape and the rail.
    input.statementWallet = read("wallet") ?? "";
    input.statementNetwork = read("network");
  }
  if (item.id === "the_statement") {
    // The law validated the address shape and hours range.
    input.statementWallet = read("wallet") ?? "";
    input.statementHours = read("hours");
    input.statementNetwork = read("network");
  }
  if (item.id === "spot_check") {
    // The law validated the hostname before the gate.
    input.spotCheckHost = read("host") ?? "";
  }
  if (item.id === "coffees_for_closers") {
    // The law validated presence and length before the gate.
    const win = (read("win") ?? "").replace(/\0/g, "");
    input.win = win;
    // The counter shows the keeper the win alongside the order.
    input.detail = win;
  }
  if (item.id === "grudge") {
    input.grievance = (read("grievance") ?? "").replace(/\0/g, "");
  }
  if (item.id === "settlement_attestation") {
    // The law validated the hash shape before the gate.
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
    // The law validated the hash and the cap before the gate.
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
    // The law validated the hash, the claim length, the amount and the url before the gate.
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
    // The law validated the digest shape before the gate.
    input.anchorDigest = read("digest") ?? "";
    const label = sanitizeText(read("label"), 120);
    if (label) input.anchorLabel = label;
  }
  if (item.id === "attestation_bundle") {
    // The law validated count, shape and uniqueness before the gate.
    input.bundleTxHashes = (read("tx_hashes") ?? "")
      .split(",")
      .map((hash) => hash.trim())
      .filter(Boolean);
  }
  if (item.id === "graffiti_on_a_train") {
    // The law validated presence, length and link-spam before the gate.
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
  // The mandate link, any item: the law already resolved it against
  // the store's own records before the gate let money move.
  const mandateId = read("mandate_id");
  if (mandateId) {
    input.mandateId = mandateId;
  }
  if (item.id === "the_mandate") {
    // The law validated text, role, cap and expiry shapes.
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
  const source = sanitizeText(read("source"), 40);
  if (source) {
    input.source = source;
  }
  const userAgent = sanitizeText(headers.userAgent, 200);
  if (userAgent) {
    input.userAgent = userAgent;
  }
  const referrer = sanitizeText(headers.referrer, 200);
  if (referrer) {
    input.referrer = referrer;
  }
  return input;
}
