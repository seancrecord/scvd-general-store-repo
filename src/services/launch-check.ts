import {
  advertisedVersionDetail,
  advertisedVersionUnpayable,
} from "./advertised-version";
import {
  PROBE_POST_BODY,
  probeWithMethod,
  type ProbeMethod,
} from "@/lib/probe-method";
import { privateKeyToAccount } from "viem/accounts";
import { decodeSettlementResponse } from "../../defects/settlement-response.js";
import { KV_KEYS } from "@/lib/kv-keys";
import { readPayTo } from "@/lib/pay-to";
import { isCanonicalUsdc } from "@/lib/value-checks";
import { newEntryId } from "@/lib/ids";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { signMessage } from "@/lib/signing";
import {
  captureWatchEvidenceKeepingBody,
  type WatchEvidenceCapture,
} from "@/services/watch-evidence";
import { isRecord, type Env } from "@/types";
import { readTransferClaim } from "@/services/attestation";
import type { TransferClaimQuery, TransferClaimRead } from "@/services/attestation";
import type { AuthorizationReceiptRead } from "@/lib/authorization-receipt";
import {
  evmChainOf,
  redactRpc,
  RPC_TIMEOUT_MS,
  rpcEndpoints,
} from "@/lib/base-rpc";
import { DEFAULT_TRANSFER_METHOD } from "@/services/preflight";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { sendAlert } from "@/lib/alerts";

/**
 * THE LAUNCH CHECK — the walkabout productized for one endpoint
 * (keeper-approved backlog, 2026-08-19): a real mainnet purchase
 * attempt of the seller's own door, from this store's declared field
 * wallet, written down stage by stage and signed. The field run is
 * the sales pitch — 71% of payment attempts across the walkable
 * Bazaar failed, and almost no seller has ever seen their buy path
 * from the buyer's side.
 *
 * WHAT IT IS NOT (rule 43): a dated observation of ONE TRANSACTION
 * at one moment — never a score on the operator, never a badge,
 * never a certification. x402station sells a $1 automated badge;
 * this is a real settlement plus narrative, and the difference is
 * the whole product.
 *
 * WALKABOUT.MD IS THE LAW HERE, adapted for consent: the walkabout
 * walks doors that listed themselves publicly; the Launch Check
 * walks ONE door, named by the person who paid us to walk it — the
 * strongest consent the program has. The rest of the rules ride
 * along unchanged:
 *   - the envelope UA on every request, no exceptions
 *   - at most FIELD_SPEND_CAP_USD paid out, ever, per check
 *   - the payTo screened before payment, FAIL CLOSED: no screening,
 *     no payment — the payer is a named US LLC and strict liability
 *     is real at any amount (rule 3)
 *   - one attempt; a failure is a recorded observation, not a retry
 *   - everything recorded raw enough to re-derive, then signed
 *
 * MONEY, PLAINLY: the item's price is the store's revenue at the
 * normal till; the payment THIS file makes rides the field wallet
 * (FIELD_WALLET_KEY) and is capped below. Two wallets, two jobs —
 * the till receives, the field wallet walks.
 */

export {
  FIELD_SPEND_CAP_USD,
  LAUNCH_CHECK_BATTERY,
  LAUNCH_CHECK_UA,
  MAX_AUTHORIZATION_SECONDS,
} from "@/services/launch-check-terms";
import {
  FIELD_SPEND_CAP_USD,
  LAUNCH_CHECK_BATTERY,
  LAUNCH_CHECK_UA,
  MAX_AUTHORIZATION_SECONDS,
} from "@/services/launch-check-terms";

/**
 * WHAT A PAID KNOCK REFUSES TO DO (ledger I3).
 *
 * All three knocks used bare `fetch`: no timeout, no size cap, and
 * redirects followed by default. Each is a real exposure on a walk
 * that carries money.
 *
 * REDIRECTS ARE THE SHARP ONE. `redirect: "follow"` sends the
 * PAYMENT-SIGNATURE header wherever the seller points, so a door can
 * bounce this store's signed authorization to a host it does not
 * control and that we never agreed to pay. A redirect on the paid
 * knock is not a detour to be followed; it is a FINDING to be
 * recorded, which is why this is "manual" and the status is read.
 *
 * The timeout keeps one slow door from holding a walk open, and the
 * body cap keeps a hostile response from being read into memory
 * unbounded. Truncation is recorded rather than hidden — a report
 * that quietly read the first megabyte and called it the body would
 * be describing something the buyer never received.
 */
const KNOCK_TIMEOUT_MS = 20_000;
const MAX_KNOCK_BYTES = 1_048_576;

/** Read at most MAX_KNOCK_BYTES, saying so when the body was longer. */
async function readCapped(
  response: Response,
): Promise<{ text: string; truncated: boolean; bytes: Uint8Array }> {
  const body = response.body;
  if (!body) return { text: "", truncated: false, bytes: new Uint8Array() };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_KNOCK_BYTES) {
      chunks.push(value.slice(0, value.byteLength - (total - MAX_KNOCK_BYTES)));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(joined), truncated, bytes: joined };
}

export type LaunchCheckVerdict =
  /** Legacy name: the signed request answered 2xx; settlement is read separately. */
  | "settled"
  /** Payment was presented and the seller refused it. */
  | "payment_refused"
  /** The door answered without asking for payment at all. */
  | "no_payment_gate"
  /** A 402 arrived but no payable terms could be read from it. */
  | "malformed_challenge"
  /** Terms were read and this store chose not to pay, by its own
   * published rules — a statement about US, never about the seller. */
  | "unpaid_by_rule"
  /** The door did not answer this store at this moment. */
  | "unreachable";

/** Battery v4 compares complete response bytes. A transaction reference is
 * recorded separately: it proves neither redelivery nor fresh fulfillment.
 * served_again is retained only for interpreting historical v3 records. */
export type ReplayOutcome = "served_again" | "redelivered" | "changed_response" | "rechallenged" | "refused" | "unknown";

export interface ResponseReading {
  sha256: string;
  bytes_read: number;
  truncated: boolean;
  content_type: string | null;
}

export interface ReplayReading {
  outcome: ReplayOutcome;
  status: number | null;
  /** Did the answer name the transaction the first response named? Not proof. */
  names_settlement: boolean | null;
  /** Absent on historical records and attempts that never answered. */
  body_comparison?: "identical" | "different" | "incomplete" | "empty";
  original_response?: ResponseReading;
  replay_response?: ResponseReading;
}

export interface LaunchCheckStage {
  stage: string;
  ok: boolean;
  detail: string;
  /** Optional on the screen stage; absent on older records and non-oracle screens. */
  evidence?: OracleScreenEvidence;
}

/** The response used by the gate, not a proof of independently checked chain state. */
export interface OracleScreenEvidence {
  version: 1;
  /** Configured oracle chain; this capture adds no chain-identity RPC. */
  chain: typeof BASE_NETWORK;
  contract: string;
  address: string;
  method: "eth_call";
  calldata: string;
  block_tag: "latest";
  /** The existing gate does not pin or retrieve the answering block. */
  block_number: null;
  block_hash: null;
  provider_host: string;
  /** Local response observation time, not a block or settlement timestamp. */
  observed_at: string;
  /** Only an exactly decoded ABI boolean is retained; never the whole RPC body. */
  result: string;
  listed: boolean;
}

export type TxHashStatus =
  | "claimed"
  | "confirmed_on_chain"
  | "contradicted"
  | "unverifiable_shape";

export interface TxVerification {
  /** What actually happened at the seam: receipt | not_attempted | failed | skipped_shape. */
  read: "receipt" | "not_attempted" | "failed" | "skipped_shape";
  /** CAIP-2 of the rail the walk paid on — the only chain asked. */
  chain: string;
  /** The attestation desk's own vocabulary, when a read happened. */
  chain_status: string | null;
  block_height: number | null;
  confirmations: number | null;
  observed_payer: string | null;
  observed_recipient: string | null;
  observed_amount_usdc: number | null;
  read_at: string;
  detail: string;
}

export type TransferClaimReader = (
  txHash: string,
  query: TransferClaimQuery,
  network: string,
) => Promise<TransferClaimRead>;

export interface LaunchCheckObservation {
  check_id: string;
  /** The endpoint walked, exactly as the buyer named it. */
  url: string;
  observed_at: string;
  ua_sent: string;
  verdict: LaunchCheckVerdict;
  stages: LaunchCheckStage[];
  /** Legacy amount: quoted USD after a 2xx. Exact settlement is separate. */
  paid_usd: number;
  pay_to: string | null;
  /** From the seller's PAYMENT-RESPONSE header, when one came back. */
  tx_hash: string | null;
  /**
   * WHAT THE HASH IS, said inside the signed bytes (roadmap 3.2,
   * ledger C2/I4). The walk verifies everything the seller says —
   * schema, signature, replay — and then used to take the one thing
   * the seller says about MONEY on faith: tx_hash rode into this
   * signed row bare, sixty-four seller-chosen hex characters recorded
   * as if this store had seen them on chain. Strict about our money,
   * credulous about theirs — that asymmetry ends here.
   *
   *   claimed            — the seller said it; no chain read has
   *                        confirmed it. The DEFAULT, including when
   *                        the read misses (rule 52: a receipt not
   *                        yet visible is not a receipt that does
   *                        not exist) and when no reader stood at
   *                        this seam.
   *   confirmed_on_chain — a receipt on the rail we paid shows a
   *                        USDC transfer from our field wallet to the
   *                        payTo the door itself declared.
   *   contradicted       — the receipt exists and shows no such
   *                        transfer, or the transaction reverted.
   *                        The hash does not evidence our payment.
   *   unverifiable_shape — the identifier cannot name a transaction
   *                        on the rail we paid; nothing to read.
   *
   * Null exactly when tx_hash is null.
   */
  tx_hash_status: TxHashStatus | null;
  /** The read behind the status, absent when there was no hash. */
  tx_verification?: TxVerification;
  /** The paying wallet, so the on-chain record is findable. */
  field_wallet: string | null;
  /** v4: false for identical complete nonempty response bytes or a refusal;
   * null when fresh fulfillment cannot be determined. Historical true values
   * were v2/v3 heuristics, not proof of a second sale. */
  replay_served: boolean | null;
  /** Present when replay was attempted; read in the context of battery. */
  replay?: ReplayReading;
  /**
   * UNIX SECONDS THE SIGNED AUTHORIZATION STAYS SUBMITTABLE, or null
   * if none was ever presented (ledger I2).
   *
   * `paid_usd: 0` on a refused presentation is a claim about the
   * PAST. It says no goods arrived and no settlement was seen. It
   * does NOT say no money can move, because the authorization we
   * signed and handed over is live until this moment passes — an
   * EIP-3009 nonce is spent by settlement, not by our disappointment.
   *
   * So the zero travels with its own expiry INSIDE THE SIGNED BYTES.
   * A reader can tell the difference between "nothing moved" and
   * "nothing had moved yet when we looked", which is the whole
   * distinction a money claim has to keep.
   */
  authorization_outstanding_until: number | null;
  /**
   * RAW EVIDENCE OF THE CHALLENGE (roadmap 1.2, ledger I5): verbatim
   * PAYMENT-REQUIRED bytes, curated headers, bounded body digest from
   * the unpaid knock — the walk is the artifact class where a dispute
   * is likeliest, since money moves on the strength of what this
   * response said. Absent on walks before 2026-08-26 and on doors
   * that never answered. The DELIVERY response is deliberately not
   * here: its body feeds fulfillment on the money path and gets its
   * own change.
   */
  challenge_evidence?: WatchEvidenceCapture;
  /** Which revision of the walk produced this record (1.3 / D6). */
  battery: string;
  /** Public reconciliation facts only; no spendable signature is retained. */
  payment_attempt?: {
    network: string; asset: string; nonce: string; amount_atomic: string;
    valid_after: string; valid_before: string;
    /** A candidate receipt must bind the exact authorization before this advances. */
    settlement: "unknown" | "pending_finality" | "confirmed";
    verification?: AuthorizationReceiptRead;
  };
  evidence_hash: string;
  scope: string;
}

export interface SignedLaunchCheck extends LaunchCheckObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

export interface LaunchCheckRecord {
  check: SignedLaunchCheck;
  cert_id: string;
  created_at: string;
}

const CHECK_SCOPE =
  "One purchase attempt at one moment, from this store's declared field wallet, recorded stage by stage. Any payment presentation uses the x402 v2 shape (PAYMENT-SIGNATURE header, EIP-3009 authorization on Base): a seller serving only the v1 X-PAYMENT shape will refuse it, and this report says exactly that rather than guessing. A seller asking for a different transfer method — extra.assetTransferMethod of permit2 or erc7710 — is read at the terms stage and the walk stops there unpaid, naming this instrument's reach as the reason, because presenting an envelope we knew would bounce and then reporting the bounce would say something false about your door. Not a badge, not a certification, not a statement about any other moment or any other buyer — an unpaid verdict that begins 'unpaid_by_rule' is a statement about this store's own published rules, never about the seller. After a 2xx response, the byte-identical authorization is presented once more. Either presentation may be the first successful settlement; the single-use authorization cannot settle twice. Complete response bytes are compared, with capped reads counted as gaps. Identical bytes do not establish artifact truth or usefulness; changed bytes and repeated transaction references do not establish fresh fulfillment. Exact authorization evidence is read separately after both presentations. Produced automatically; no human looked, and that is the point: a check commissioned by anyone reads the same.";

/**
 * The buyer-side signer, as a seam: production builds one from
 * FIELD_WALLET_KEY via viem; tests hand in the same interface with a
 * throwaway key, so the signing path proven in tests is the one that
 * runs live.
 */
export interface FieldSigner {
  address: string;
  signTypedData(args: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}`;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<string>;
}

export async function fieldSignerFromKey(keyHex: string): Promise<FieldSigner> {
  /*
   * A STATIC IMPORT, ON PURPOSE (2026-09-03, the x402-list p95 read).
   * This used to be `await import("viem/accounts")`, with a note that
   * only the account module rode into the bundle and only when a check
   * ran. Wrangler emits one file, so nothing loads later; and a
   * dynamic import of a barrel keeps EVERY export of that barrel alive,
   * because the bundler cannot see which names the namespace will be
   * asked for. That kept all nine BIP-39 wordlists in the script, 241
   * KiB minified, parsed on every cold isolate for a function that
   * signs with a raw key and never touches a mnemonic. A named static
   * import lets the bundler keep privateKeyToAccount and drop the rest.
   */
  const normalized = keyHex.startsWith("0x") ? keyHex : `0x${keyHex}`;
  const account = privateKeyToAccount(normalized as `0x${string}`);
  return {
    address: account.address,
    signTypedData: (args) =>
      account.signTypedData(args as Parameters<typeof account.signTypedData>[0]),
  };
}

/**
 * The sanctions screen, as a seam. Production defaults to the on-chain
 * oracle; an API key selects the existing API override. In both,
 * `listed: null` means THE SCREEN DID NOT ANSWER, which fails closed
 * upstream — unavailable screening withholds payment, never waves it
 * through.
 */
export type SanctionsScreen = (
  address: string,
) => Promise<{ listed: boolean | null; source: string; evidence?: OracleScreenEvidence }>;

/**
 * THE KEYLESS DEFAULT: Chainalysis publishes the same designations as
 * a free ON-CHAIN oracle — a public contract, readable by any RPC, no
 * account and no API key (their open API-key signup has since closed,
 * which is exactly the dependency an on-chain read does not have).
 * On Base the oracle is a DIFFERENT address than the 0x40C5… deployed
 * on most chains — verified against the oracle docs 2026-08-19.
 * The selector is the first four bytes of keccak256 of
 * "isSanctioned(address)", derived rather than copied.
 *
 * FAIL CLOSED ON EVERYTHING UNEXPECTED: a non-ok response, a result
 * that is not exactly the 32-byte true or false, an unscreenable
 * address shape — all return `listed: null`, which upstream withholds
 * payment. The one answer that permits money to move is the oracle
 * saying false, byte for byte.
 */
export const SANCTIONS_ORACLE_BASE =
  "0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B";
const IS_SANCTIONED_SELECTOR = "0xdf592f7d";
const BOOL_TRUE = `0x${"0".repeat(63)}1`;
const BOOL_FALSE = `0x${"0".repeat(64)}`;

/**
 * EVERY ENDPOINT, NOT ONE (2026-09-04, from a bounty walker's letter:
 * POST /api/bounty-claim refused for an hour and a half with "the
 * sanctions screen did not answer (… HTTP 429)", while their own
 * eth_call to the same oracle answered false at once).
 *
 * The screen read the chain through ONE url — the public BASE_RPC_URL
 * — with one attempt and no ceiling, while every other chain read in
 * this store rotates through rpcEndpoints(): the authenticated primary,
 * a second key on another provider, then the public one. base-rpc.ts
 * records why: the public endpoint 429s from the Worker's shared
 * egress under load, and a quota is a per-key outage. So the one read
 * that gates every outbound dollar was the one read still standing on
 * the endpoint most likely to refuse it, and a 429 there paid nobody
 * for as long as it lasted. Nothing paged; a stranger's letter did.
 *
 * WHAT DOES NOT CHANGE: the screen still fails closed. The one answer
 * that moves money is the oracle saying false, byte for byte, from
 * some endpoint. The FIRST valid boolean is final, including false:
 * later endpoints are not consulted. An endpoint that does not answer is
 * skipped, and when none answers the result is still null. The only
 * new behaviour is asking the next provider before giving up.
 */
export function oracleScreen(
  rpcUrls: string | readonly string[],
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): SanctionsScreen {
  const endpoints = typeof rpcUrls === "string" ? [rpcUrls] : [...rpcUrls];
  return async (address: string) => {
    const source = `Chainalysis on-chain sanctions oracle (${SANCTIONS_ORACLE_BASE} on ${BASE_NETWORK})`;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      // Not a 20-byte EVM address; the oracle cannot answer for it.
      return { listed: null, source: `${source} — address shape unscreenable` };
    }
    const data =
      IS_SANCTIONED_SELECTOR +
      address.slice(2).toLowerCase().padStart(64, "0");
    const failures: string[] = [];
    for (const rpcUrl of endpoints) {
      const host = redactRpc(rpcUrl);
      try {
        const response = await fetchImpl(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_call",
            params: [{ to: SANCTIONS_ORACLE_BASE, data }, "latest"],
          }),
          signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
        if (!response.ok) {
          failures.push(`${host} (HTTP ${response.status})`);
          continue;
        }
        const body = (await response.json()) as { result?: string };
        if (body.result === BOOL_TRUE || body.result === BOOL_FALSE) {
          const listed = body.result === BOOL_TRUE;
          // Preserve the actual answer before returning. No second read, no
          // block lookup, no consensus claim: latest did not identify a block.
          return { listed, source, evidence: {
            version: 1, chain: BASE_NETWORK, contract: SANCTIONS_ORACLE_BASE,
            address: address.toLowerCase(), method: "eth_call", calldata: data,
            block_tag: "latest", block_number: null, block_hash: null,
            provider_host: host, observed_at: now().toISOString(),
            result: body.result, listed,
          } };
        }
        failures.push(`${host} (unexpected result)`);
      } catch {
        failures.push(`${host} (unreachable)`);
      }
    }
    return {
      listed: null,
      source: `${source} — no answer from ${failures.length} endpoint${failures.length === 1 ? "" : "s"}: ${failures.join(", ")}`,
    };
  };
}

/**
 * THE SCREEN DID NOT ANSWER, SAID OUT LOUD (2026-09-04).
 *
 * Failing closed is the rule and it stands. Failing closed QUIETLY
 * was the defect: on 2026-09-03 every bounty claim was refused for
 * ninety minutes and the keeper learned it from a stranger's letter.
 * A listing is the screen WORKING and never comes here; only silence
 * does. Every door that pays calls this beside its refusal — the
 * bounty claim, the credit cash-out, the launch check — keyed by door
 * so a run at one door pages once and then backs off, while the
 * refusals themselves keep landing on /admin/bounties.
 */
export async function raiseScreenUnavailable(
  env: Env,
  door: string,
  source: string,
): Promise<void> {
  await sendAlert(env, {
    condition: "payout_screen_unavailable",
    detail: `OURS to check, no money moved — the sanctions screen did not answer at ${door}, so the rule failed closed and the payout was refused. The screen said: ${source}. Every payout this store makes (bounty rewards, credit cash-outs, the launch check) waits behind this screen, so while it stays silent the board turns every walker away. It reads the on-chain oracle over the RPC ladder, so silence means every provider on it refused or timed out: check the RPC keys and their quotas first. The claims turned away are on /admin/bounties; nothing is owed and nothing needs refunding.`,
    key: door,
  }).catch(() => undefined);
}

export function chainalysisScreen(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): SanctionsScreen {
  return async (address: string) => {
    const source = "Chainalysis public screening API";
    try {
      const response = await fetchImpl(
        `https://public.chainalysis.com/api/v1/address/${address}`,
        { headers: { "X-API-Key": apiKey, Accept: "application/json" } },
      );
      if (!response.ok) return { listed: null, source: `${source} (HTTP ${response.status})` };
      const body = (await response.json()) as {
        identifications?: unknown[];
      };
      return {
        listed: (body.identifications?.length ?? 0) > 0,
        source,
      };
    } catch {
      return { listed: null, source: `${source} (unreachable)` };
    }
  };
}

export type LaunchCheckCore = Omit<LaunchCheckObservation, "evidence_hash" | "scope">;
export interface LaunchCheckOptions {
  /** Durable caller retains the risk before sending, and the result before signing. */
  retain?: (stage: "attempt" | "observation", core: LaunchCheckCore) => Promise<void>;
  fetch?: typeof fetch;
  signer?: FieldSigner;
  screen?: SanctionsScreen;
  /**
   * The chain reader for the seller's claimed tx, as a seam like the
   * screen above. ABSENT means no read happens and the row honestly
   * says `claimed` — the roadmap's "until read" label — so a caller
   * that cannot reach a chain never fakes a verification. The paid
   * production seam (fulfillment) passes the attestation desk's
   * reader; specs pass fakes or nothing.
   */
  readClaim?: TransferClaimReader;
  now?: Date;
  /** Injectable for tests; defaults to crypto.getRandomValues. */
  randomNonce?: () => string;
}

interface AcceptEntry {
  scheme?: string;
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
  payTo?: string;
  asset?: string;
  maxTimeoutSeconds?: number;
  extra?: {
    name?: string;
    version?: string;
    /**
     * WHAT THE SELLER WANTS SIGNED, and the field this walk read
     * past until 2026-08-29. `eip3009` | `permit2` | `erc7710` in
     * the shapes seen so far. See ASSET_TRANSFER_METHOD_SIGNED.
     */
    assetTransferMethod?: string;
  };
}

/**
 * THE ONE TRANSFER METHOD THIS WALK CAN SIGN.
 *
 * The signer below builds a `TransferWithAuthorization` typed-data
 * payload — EIP-3009, unconditionally, because that is what the Base
 * USDC contract takes and what every door this walk has met has
 * asked for. A seller may instead advertise `permit2` or `erc7710`
 * in `accepts[].extra.assetTransferMethod`, and a seller who does is
 * asking for a DIFFERENT SIGNATURE over different types.
 *
 * Presenting our EIP-3009 envelope to such a door gets it refused,
 * correctly, by a healthy server. Before today the walk did exactly
 * that and recorded the refusal without naming the cause, so a paid
 * report could read as a finding about the seller when it was a fact
 * about this instrument's reach. That is the defect class this store
 * charges to find in other people's code.
 *
 * `undefined` is NOT a mismatch: the field is optional, most doors
 * omit it, and EIP-3009 is the settled default for USDC on Base.
 * Absence means "the ordinary thing", and the walk proceeds.
 *
 * ONE LAW, BOTH DIRECTIONS (2026-08-29). The constant is the free
 * preflight's DEFAULT_TRANSFER_METHOD, imported rather than retyped:
 * the battery that tells a stranger their door asks for something
 * unusual and the walk that refuses to knock at it must not be able
 * to drift apart on what "usual" means.
 */
const ASSET_TRANSFER_METHOD_SIGNED = DEFAULT_TRANSFER_METHOD;

function defaultNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function sha256Hex(text: string | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    typeof text === "string" ? new TextEncoder().encode(text) : new Uint8Array(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function responseReading(response: Response, body: { bytes: Uint8Array; truncated: boolean }): Promise<ResponseReading> {
  return { sha256: await sha256Hex(body.bytes), bytes_read: body.bytes.byteLength,
    truncated: body.truncated, content_type: response.headers.get("content-type") };
}

/** Compare observations, never infer product identity from a receipt reference. */
function readReplay(response: Response, body: string, txHash: string | null,
  original: ResponseReading, replay: ResponseReading): ReplayReading {
  const header = response.headers.get("payment-response");
  const decoded = header ? decodeSettlementResponse(header) : null;
  const claimed = typeof decoded?.transaction === "string" ? decoded.transaction : null;
  const names = txHash === null ? null
    : (claimed !== null && claimed.toLowerCase() === txHash.toLowerCase()) || body.toLowerCase().includes(txHash.toLowerCase());
  const comparison = original.truncated || replay.truncated ? "incomplete"
    : !original.bytes_read || !replay.bytes_read ? "empty"
    : original.sha256 === replay.sha256 ? "identical" : "different";
  const served = response.status >= 200 && response.status < 300;
  const temporary = response.status >= 500 || response.status === 408 || response.status === 429
    || (response.status >= 300 && response.status < 400);
  const outcome: ReplayOutcome = temporary ? "unknown"
    : response.headers.has("payment-required") || bodyCarriesChallenge(body) ? "rechallenged"
    : served ? comparison === "identical" ? "redelivered" : comparison === "different" ? "changed_response" : "unknown"
    : response.status >= 400 && response.status < 500 ? "refused" : "unknown";
  return { outcome, status: response.status, names_settlement: names, body_comparison: comparison,
    original_response: original, replay_response: replay };
}

/** A body that is a payment challenge: accepts[] or x402Version, the wire shape buyers act on. */
function bodyCarriesChallenge(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) && (Array.isArray(parsed.accepts) || typeof parsed.x402Version === "number");
  } catch {
    return false;
  }
}

function replayDetail(reading: ReplayReading, body: string): string {
  const prefix = `HTTP ${reading.status}. ${reading.replay_response?.bytes_read ?? 0} bytes read${reading.replay_response?.truncated ? " (response truncated)" : ""}. `;
  const named = reading.names_settlement === true ? "The answer repeats the seller's original transaction reference; this alone proves no payment or delivery. " : "";
  const first = ` First 300 characters: ${JSON.stringify(body.slice(0, 300))}`;
  switch (reading.outcome) {
    case "redelivered":
      return prefix + "re-delivered: complete, nonempty response bytes are identical. This establishes byte recovery, not the truth or usefulness of the artifact or a linked resource. " + named + first;
    case "changed_response":
    case "served_again":
      return prefix + "The response bytes changed. Wrapper metadata may differ around the same good; fresh fulfillment is not established. " + named + first;
    case "rechallenged":
      return prefix + "RE-CHALLENGED: the same authorization received a fresh payment challenge. No new authorization was signed. This does not establish a second charge or that the first presentation settled; read payment_attempt.verification separately. " + named + first;
    case "refused":
      return prefix + "refused without a fresh payment challenge. This establishes neither safe recovery nor settlement. " + named + first;
    case "unknown":
      return prefix + "Replay handling is unresolved: a temporary failure, redirect, empty response or incomplete read cannot establish recovery or fresh fulfillment. " + named + first;
  }
}

function decodeBase64Json(value: string): unknown {
  try {
    return JSON.parse(atob(value));
  } catch {
    return null;
  }
}

/** Atomic USDC units → USD. Returns NaN for the unparseable. */
function amountUsd(entry: AcceptEntry): number {
  const raw = entry.amount ?? entry.maxAmountRequired;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return Number.NaN;
  return Number(raw) / 1e6;
}

/**
 * The walk itself: one door, every stage written down as it happens.
 * Every early return is a verdict, not an error — a check that could
 * not pay is still a finished, signed observation of exactly how far
 * the buy path got and what stopped it.
 */
export async function performLaunchCheck(
  env: Env,
  targetUrl: string,
  options: LaunchCheckOptions = {},
): Promise<SignedLaunchCheck> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? new Date();
  const checkId = `lcheck_${newEntryId()}`;
  let paymentAttempt: LaunchCheckObservation["payment_attempt"];
  const stages: LaunchCheckStage[] = [];
  let verdict: LaunchCheckVerdict;
  let paidUsd = 0;
  let replayServed: boolean | null = null;
  let replayReading: ReplayReading | undefined;
  /*
   * Set the moment an authorization is PRESENTED, not when it is
   * accepted (ledger I2). Presentation is what puts the wallet at
   * risk; acceptance is what ends the question.
   */
  let authorizationOutstandingUntil: number | null = null;
  let payTo: string | null = null;
  let txHash: string | null = null;
  /** CAIP-2 of the rail the walk paid on, for the tx read. */
  let paidNetwork: string | null = null;

  const signer =
    options.signer ??
    (env.FIELD_WALLET_KEY
      ? await fieldSignerFromKey(env.FIELD_WALLET_KEY)
      : undefined);
  // The API key, when present, is an operator override; the keyless
  // on-chain oracle is the default, over the same Base RPC the
  // settlement attestation already reads.
  const screen =
    options.screen ??
    (env.SANCTIONS_API_KEY
      ? chainalysisScreen(env.SANCTIONS_API_KEY, fetchImpl)
      : oracleScreen(rpcEndpoints(env), fetchImpl));

  let challengeEvidence: WatchEvidenceCapture | undefined;
  let unpaidAccepts: AcceptEntry[] = [];
  walk: {
    // STAGE 1 — approach, unpaid, calling card out.
    let first: Response;
    /*
     * THE VERB, RESOLVED ON THE UNPAID APPROACH AND THEN FIXED FOR
     * THE WHOLE WALK (2026-09-16). This walk is a purchase, so the
     * method matters twice over: a door that takes POST was not only
     * reported as serving no challenge, it was reported as unpayable
     * by an instrument that never asked it to sell anything. Every
     * later stage below reuses `walkMethod` and none of them
     * re-resolves — presenting payment by a different verb than the
     * one the challenge was served to would make the paid stage a
     * different request than the unpaid one, and the whole artifact
     * is the claim that they are the same door.
     */
    let walkMethod: ProbeMethod = "GET";
    try {
      const approach = await probeWithMethod(
        async (probeMethod) =>
          fetchImpl(targetUrl, {
            method: probeMethod,
            redirect: "manual",
            signal: AbortSignal.timeout(KNOCK_TIMEOUT_MS),
            headers: {
              "User-Agent": LAUNCH_CHECK_UA,
              Accept: "application/json",
              ...(probeMethod === "POST" ? { "Content-Type": "application/json" } : {}),
            },
            ...(probeMethod === "POST" ? { body: PROBE_POST_BODY } : {}),
          }),
      );
      first = approach.response;
      walkMethod = approach.reading.used;
      if (approach.reading.unresolved) {
        await first.body?.cancel().catch(() => undefined);
        stages.push({
          stage: "approach",
          ok: false,
          detail: `the door refused every HTTP method this walk sends (${approach.reading.attempted.join(", ")}) as a method${
            approach.reading.allow ? `, naming Allow: ${approach.reading.allow}` : " and carried no Allow header"
          }. No payment was attempted and nothing is asserted about the challenge at that URL — this names this instrument's reach, not your door.`,
        });
        verdict = "unreachable";
        break walk;
      }
    } catch (error) {
      stages.push({
        stage: "approach",
        ok: false,
        detail: `the request could not complete: ${String(error)}. A fact about the network path between this store and that host at this moment — a buyer elsewhere may reach it fine.`,
      });
      verdict = "unreachable";
      break walk;
    }
    /*
     * ONE READ, KEPT (roadmap 1.2 / I5). The body used to be read
     * twice ad hoc and unbounded; now the bounded capture reads it
     * once, the walk consumes the text from the capture, and the
     * capture itself rides into the signed observation. An oversized
     * body yields empty text and a null digest — honestly absent
     * rather than misleadingly partial.
     */
    const captured = await captureWatchEvidenceKeepingBody(first);
    challengeEvidence = captured.evidence;
    const firstBodyText = captured.bodyText;
    stages.push({
      stage: "approach",
      ok: true,
      detail: `GET answered HTTP ${first.status}.`,
    });

    if (first.status !== 402) {
      const preview = firstBodyText.slice(0, 300);
      stages.push({
        stage: "challenge",
        ok: false,
        detail: `expected a 402 payment gate; got ${first.status}. ${
          first.status >= 200 && first.status < 300
            ? "The door opened without asking for payment — WALKABOUT.md rule 7: an open door gets a note, not a harvest. This report is that note. First 300 bytes of what came back: " +
              JSON.stringify(preview)
            : "First 300 bytes: " + JSON.stringify(preview)
        }`,
      });
      verdict = "no_payment_gate";
      break walk;
    }

    // STAGE 2 — read the challenge: header first, body second, and
    // say which one answered, because the split is itself a finding.
    const headerRaw = first.headers.get("payment-required");
    const headerChallenge = headerRaw ? decodeBase64Json(headerRaw) : null;
    let bodyChallenge: unknown = null;
    try {
      bodyChallenge = JSON.parse(firstBodyText);
    } catch {
      bodyChallenge = null;
    }
    const challenge = (headerChallenge ?? bodyChallenge) as {
      accepts?: AcceptEntry[];
    } | null;
    const accepts = Array.isArray(challenge?.accepts) ? challenge.accepts : [];
    // Held for the settle stage: advertised-version-unpayable is a
    // comparison between what the door offered UNPAID and what it
    // offers again after refusing a correctly signed payment.
    unpaidAccepts = accepts;
    if (accepts.length === 0) {
      stages.push({
        stage: "challenge",
        ok: false,
        detail: `402 received, but no payable terms could be read: PAYMENT-REQUIRED header ${
          headerRaw ? "present but not base64 JSON with accepts[]" : "absent"
        }, body ${
          bodyChallenge ? "JSON without an accepts[] array" : "not JSON"
        }. The v2 wire shape is x402Version + accepts[] (header and body); a buyer meeting this response has nothing it can sign.`,
      });
      verdict = "malformed_challenge";
      break walk;
    }
    stages.push({
      stage: "challenge",
      ok: true,
      detail: `terms read from the ${
        headerChallenge ? "PAYMENT-REQUIRED header" : "402 body (header absent — many buyers read only the header, and that split costs sellers sales)"
      }: ${accepts.length} rail${accepts.length === 1 ? "" : "s"} offered.`,
    });

    // STAGE 3 — choose terms: cheapest Base exact-scheme entry.
    const baseShaped = accepts.filter(
      (entry) =>
        (entry.network === "eip155:8453" || entry.network === "base") &&
        (entry.scheme ?? "exact") === "exact" &&
        Number.isFinite(amountUsd(entry)),
    );
    /*
     * 2.2: the asset's VALUE is checked before its amount is ever
     * called a price. amountUsd() divides by 1e6 — six decimals is a
     * fact about USDC, not about whatever contract a stranger's 402
     * names — and this artifact is signed. A Base-shaped entry whose
     * asset is not the canonical USDC contract is refused by name,
     * not walked and not labeled.
     */
    const base = baseShaped
      .filter((entry) =>
        isCanonicalUsdc("eip155:8453", String(entry.asset ?? "")),
      )
      .sort((a, b) => amountUsd(a) - amountUsd(b));
    const imposters = baseShaped.filter(
      (entry) => !isCanonicalUsdc("eip155:8453", String(entry.asset ?? "")),
    );
    const chosen = base[0];
    if (!chosen && imposters.length > 0) {
      stages.push({
        stage: "terms",
        ok: false,
        detail: `the Base rail's asset is not canonical USDC: ${imposters
          .map((entry) => String(entry.asset ?? "(absent)"))
          .join(", ")}. This store's field wallet pays canonical Base USDC only, and it will not price a stranger's token in dollars — the atomic amount offered means whatever that contract says it means, which is exactly why no dollar figure appears here. No payment was attempted and nothing was charged.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    if (!chosen || !chosen.payTo || !chosen.asset) {
      stages.push({
        stage: "terms",
        ok: false,
        detail: `no payable Base rail: of ${accepts.length} offered, none was an exact-scheme eip155:8453 entry with a parseable atomic amount, payTo and asset. This store's field wallet pays USDC on Base only; other rails may work for other buyers. Networks offered: ${accepts.map((a) => a.network ?? "unstated").join(", ")}.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    /**
     * IS THAT payTo PAYABLE AT ALL — read here, at terms, and not
     * left to the screen. Found 2026-08-20 by sweeping this walk
     * against the payTo taxonomy: a target publishing a name
     * (`shop.base.eth`, `shop.eth`, `shop.sol`) passed the presence
     * test above, then died two stages later inside the sanctions
     * screen, which refuses a non-address as "address shape
     * unscreenable" and fails closed.
     *
     * The verdict was right and the REPORT was useless: a customer
     * who paid for this walk got a sentence about our screening
     * plumbing, ending "nothing here says anything about the address
     * itself" — at the one moment their address is the entire
     * finding. A paid diagnosis has to name the defect it found, so
     * the shape is read before the screen is asked, and the reading
     * comes from the same table the free preflight uses.
     */
    const payToRead = readPayTo(chosen.payTo, chosen.network ?? "eip155:8453");
    if (!payToRead.payable) {
      stages.push({
        stage: "terms",
        ok: false,
        detail: `${payToRead.detail} No payment was attempted and nothing was charged for the attempt: this is a defect in the offer itself, not a fact about the network or about your server.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    /**
     * WHAT THIS WALK CAN SIGN, read before it signs anything. See
     * ASSET_TRANSFER_METHOD_SIGNED: a door asking for permit2 or
     * erc7710 wants a different signature over different types, and
     * our EIP-3009 envelope is refused by a healthy server. Refusing
     * the walk here — unpaid_by_rule, this store's own rule, never a
     * statement about the seller — is the honest answer; presenting
     * an envelope we know will bounce and recording the bounce is
     * how a paid report becomes a false finding.
     */
    const declaredMethod = chosen.extra?.assetTransferMethod;
    if (
      typeof declaredMethod === "string" &&
      declaredMethod.trim().toLowerCase() !== ASSET_TRANSFER_METHOD_SIGNED
    ) {
      stages.push({
        stage: "terms",
        ok: false,
        detail: `the Base rail asks for extra.assetTransferMethod "${declaredMethod}" and this walk signs ${ASSET_TRANSFER_METHOD_SIGNED} (EIP-3009 TransferWithAuthorization) only. That is a limit of THIS INSTRUMENT, not a defect in your door: a buyer whose client signs "${declaredMethod}" may transact here perfectly well. No payment was attempted and nothing was charged. Presenting an envelope we already knew your server would refuse, and then reporting the refusal, would tell you something false about your own endpoint.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    const price = amountUsd(chosen);
    payTo = chosen.payTo;
    paidNetwork = chosen.network === "base" ? "eip155:8453" : (chosen.network ?? "eip155:8453");
    stages.push({
      stage: "terms",
      ok: true,
      detail: `cheapest Base rail: $${price.toFixed(6)} USDC to ${chosen.payTo}, asset ${chosen.asset}.`,
    });

    /*
     * 2.4 (ledger I6) — WHO SIGNED THE OFFERS, RECORDED EITHER WAY.
     *
     * A door that carries signed offers and a door that carries none
     * are different observations, and until now both produced the
     * same silence in this report. Absence is stated, per B12.
     *
     * When offers ARE carried, the same rule the desk follows: a
     * signer host matching the door's host is self-issuance and is
     * worth something; a different host is recorded WITHOUT the
     * consequence drawn, because delegation is legitimate and the
     * spec defines no delegation record to read. No second request is
     * made — the signatures are not verified here, and the stage says
     * so rather than implying they were.
     */
    /*
     * BOTH PLACEMENTS (the instrument audit, 2026-08-28). Stage 2's
     * `challenge` is header-wins for the TERMS a buyer signs, which
     * is right — but reading offers off that one object meant a door
     * serving a normal header challenge with its signed offers only
     * in the body (the offer-receipt convention's first placement)
     * bought a $5 record stating, in signed bytes, that it carried
     * none. Offers are looked for in the header's extensions first,
     * then the body's, and absence is asserted only over both.
     */
    const extensionsOf = (source: unknown): Record<string, unknown> =>
      ((source as Record<string, unknown> | undefined)?.["extensions"] ??
        {}) as Record<string, unknown>;
    const headerOfferBlock = extensionsOf(headerChallenge)["offer-receipt"];
    const bodyOfferBlock = extensionsOf(bodyChallenge)["offer-receipt"];
    const offerBlock = (headerOfferBlock ?? bodyOfferBlock) as
      | { info?: { offers?: { signature?: unknown }[] } }
      | undefined;
    const carried = offerBlock?.info?.offers;
    if (!Array.isArray(carried) || carried.length === 0) {
      stages.push({
        stage: "offers",
        ok: true,
        detail:
          "no signed offers carried in the challenge — neither the PAYMENT-REQUIRED header's extensions nor the 402 body's, both read. Optional in the spec and not a defect — recorded because a door with offers and a door without are different facts, and a report that shows the same silence for both has told you nothing about either.",
      });
    } else {
      const doorHost = new URL(targetUrl).hostname.toLowerCase();
      const signerHosts = carried.map((offer) => {
        if (typeof offer?.signature !== "string") return null;
        const header = offer.signature.split(".")[0];
        if (!header) return null;
        try {
          const kid = (JSON.parse(atob(header.replace(/-/g, "+").replace(/_/g, "/"))) as {
            kid?: unknown;
          }).kid;
          if (typeof kid !== "string" || !kid.startsWith("did:web:")) return null;
          const host = kid.slice("did:web:".length).split("#")[0]?.split(":")[0];
          return host ? decodeURIComponent(host).replace(/%3A/gi, ":").toLowerCase() : null;
        } catch {
          return null;
        }
      });
      const named = signerHosts.filter((host): host is string => host !== null);
      const foreign = [...new Set(named.filter((host) => host !== doorHost))];
      stages.push({
        stage: "offers",
        ok: foreign.length === 0 && named.length > 0,
        detail:
          named.length === 0
            ? `${carried.length} signed offer${carried.length === 1 ? "" : "s"} carried, none naming a did:web signer this walk could read. Signatures are not verified here — that needs the issuer's key, a second request this walk does not make.`
            : foreign.length === 0
              ? `${carried.length} signed offer${carried.length === 1 ? "" : "s"} carried, self-issued: every signer's did:web host is ${doorHost}, the host serving this door, so the signatures bind the party whose shop it is. Signatures NOT verified here — that needs the issuer's key, a second request this walk does not make; the free conformance desk does it.`
              : `${carried.length} signed offer${carried.length === 1 ? "" : "s"} carried, third-party issued: signer host${foreign.length === 1 ? "" : "s"} ${foreign.join(", ")} rather than ${doorHost}. This does NOT say the signer was unauthorized — delegation is a legitimate arrangement and the spec defines no delegation record to read, so nobody outside can establish it either way. What is observed: the party that signed is not the party that serves. Signatures NOT verified here.`,
      });
    }

    // STAGE 4 — this store's own rules, before any money.
    if (price > FIELD_SPEND_CAP_USD) {
      stages.push({
        stage: "rules",
        ok: false,
        detail: `$${price.toFixed(6)} exceeds this check's published payout cap of $${FIELD_SPEND_CAP_USD.toFixed(2)} (WALKABOUT.md rule 1). A statement about this store's rules, not about the price.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    if (!signer) {
      stages.push({
        stage: "rules",
        ok: false,
        detail:
          "the field wallet was not available to this run, so no payment could be presented. The buy door refuses new purchases in this state; this line exists so a record produced anyway tells the truth.",
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    if (chosen.payTo.toLowerCase() === signer.address.toLowerCase()) {
      stages.push({
        stage: "rules",
        ok: false,
        detail:
          "the payTo is this store's own field wallet. We do not pay ourselves and call it a settlement.",
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    if (!screen) {
      stages.push({
        stage: "screen",
        ok: false,
        detail:
          "no sanctions screening was available to this run, and WALKABOUT.md rule 3 fails closed: no screen, no payment. The payer is a named US LLC; strict liability is real at any amount.",
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    const screened = await screen(chosen.payTo);
    if (screened.listed !== false) {
      if (screened.listed === null) {
        await raiseScreenUnavailable(env, "the launch check", screened.source);
      }
      stages.push({
        stage: "screen",
        ok: false,
        ...(screened.evidence ? { evidence: screened.evidence } : {}),
        detail:
          screened.listed === true
            ? `the payTo address is identified on the sanctions screen (${screened.source}). Payment withheld and the skip recorded, per WALKABOUT.md rule 3.`
            : `the sanctions screen did not answer (${screened.source}), and the rule fails closed: no screen, no payment. Nothing here says anything about the address itself.`,
      });
      verdict = "unpaid_by_rule";
      break walk;
    }
    stages.push({
      stage: "screen",
      ok: true,
      ...(screened.evidence ? { evidence: screened.evidence } : {}),
      detail: `The named screen reported payTo not listed (${screened.source}); this store's payment rule permitted proceeding.`,
    });

    // STAGE 5 — sign the authorization, the field runner's exact shape.
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const authorization = {
      from: signer.address,
      to: chosen.payTo,
      value: chosen.amount ?? chosen.maxAmountRequired ?? "0",
      validAfter: "0",
      /*
       * CLAMPED (ledger I2). min(what the seller asked, the house
       * ceiling) — never the seller's number alone.
       */
      validBefore: String(
        nowSeconds +
          Math.min(
            chosen.maxTimeoutSeconds ?? 300,
            MAX_AUTHORIZATION_SECONDS,
          ),
      ),
      nonce: (options.randomNonce ?? defaultNonce)(),
    };
    authorizationOutstandingUntil = Number(authorization.validBefore);
    const signature = await signer.signTypedData({
      domain: {
        name: chosen.extra?.name ?? "USD Coin",
        version: chosen.extra?.version ?? "2",
        chainId: 8453,
        verifyingContract: chosen.asset as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });
    const paymentHeader = btoa(
      JSON.stringify({
        x402Version: 2,
        accepted: chosen,
        payload: { signature, authorization },
      }),
    );
    stages.push({
      stage: "payment",
      ok: true,
      detail: `EIP-3009 authorization signed by ${signer.address} and presented in the PAYMENT-SIGNATURE header, v2 shape.`,
    });

    paymentAttempt = { network: paidNetwork, asset: chosen.asset, nonce: authorization.nonce,
      amount_atomic: authorization.value, valid_after: authorization.validAfter, valid_before: authorization.validBefore, settlement: "unknown" };
    // A crash after this write cannot tell us whether the next fetch reached the
    // seller. Retain that uncertainty before exposing the authorization; recovery
    // signs this gap instead of authorizing another payment.
    await options.retain?.("attempt", {
      check_id: checkId, url: targetUrl, observed_at: now.toISOString(), ua_sent: LAUNCH_CHECK_UA,
      verdict: "unreachable", stages: [...stages.slice(0, -1),
        { stage: "payment", ok: false, detail: "An authorization was prepared for this door. The walk was interrupted around its presentation; whether the seller received or settled it is unknown. No replacement payment was sent." }],
      paid_usd: 0, pay_to: payTo, tx_hash: null, tx_hash_status: null, field_wallet: signer.address,
      replay_served: null, authorization_outstanding_until: authorizationOutstandingUntil,
      ...(challengeEvidence ? { challenge_evidence: challengeEvidence } : {}),
      battery: LAUNCH_CHECK_BATTERY, payment_attempt: paymentAttempt,
    });

    // STAGE 6 — the second knock, money in hand.
    let second: Response;
    try {
      second = await fetchImpl(targetUrl, {
        // The verb the unpaid approach settled on. Never re-resolved:
        // a paid presentation by a different method than the one the
        // challenge answered would not be the same request.
        method: walkMethod,
        redirect: "manual",
        signal: AbortSignal.timeout(KNOCK_TIMEOUT_MS),
        headers: {
          "User-Agent": LAUNCH_CHECK_UA,
          Accept: "application/json",
          "PAYMENT-SIGNATURE": paymentHeader,
          ...(walkMethod === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(walkMethod === "POST" ? { body: PROBE_POST_BODY } : {}),
      });
    } catch (error) {
      stages.push({
        stage: "settle",
        ok: false,
        detail: `the paid request could not complete: ${String(error)}. Whether the seller received or settled the authorization is unknown. Expiry (${authorization.validBefore}, unix seconds) prevents later use; it does not prove that no funds moved before then. No replacement payment was sent.`,
      });
      verdict = "unreachable";
      break walk;
    }
    /*
     * A REDIRECT ON THE PAID KNOCK IS THE FINDING (ledger I3). We no
     * longer follow it, so the header carrying a signed authorization
     * never travels to a host the seller merely pointed at.
     */
    if (second.status >= 300 && second.status < 400) {
      stages.push({
        stage: "settle",
        ok: false,
        detail: `the paid request was answered with ${second.status} redirect to ${second.headers.get("location") ?? "an undisclosed location"}. This walk does not follow it: the PAYMENT-SIGNATURE header carries a signed authorization, and forwarding it to a host named at redirect time hands somebody else a payable instrument. A buyer's client that DOES follow would be paying whoever the redirect names.`,
      });
      verdict = "payment_refused";
      break walk;
    }
    const originalBody = await readCapped(second);
    const { text: bodyText, truncated: bodyTruncated } = originalBody;
    if (bodyTruncated) {
      stages.push({
        stage: "delivery",
        ok: true,
        detail: `the response body exceeded ${MAX_KNOCK_BYTES} bytes and this walk stopped reading. What is recorded below is the capped prefix, not the whole delivery — said plainly because a report that read the first megabyte and called it the body would be describing something the buyer never received.`,
      });
    }
    if (second.status >= 200 && second.status < 300) {
      paidUsd = price;
      const responseHeader = second.headers.get("payment-response");
      const settlement = responseHeader
        ? (decodeBase64Json(responseHeader) as {
            transaction?: string;
            txHash?: string;
          } | null)
        : null;
      txHash = settlement?.transaction ?? settlement?.txHash ?? null;
      stages.push({
        stage: "settle",
        ok: true,
        detail: `HTTP ${second.status} with payment presented. PAYMENT-RESPONSE header ${
          responseHeader
            ? txHash
              ? `carried settlement, tx ${txHash}.`
              : "present but carried no readable transaction hash."
            : "ABSENT — the buyer holds no settlement receipt from this response; only the chain knows. The field run measured that gap at 180 settlements the buyer's own records missed."
        }`,
      });
      stages.push({
        stage: "delivery",
        ok: bodyText.length > 0,
        detail:
          bodyText.length > 0
            ? `${originalBody.bytes.byteLength} bytes returned (${second.headers.get("content-type") ?? "no content-type"}), sha256 ${await sha256Hex(originalBody.bytes)}, first 300: ${JSON.stringify(bodyText.slice(0, 300))}`
            : "An empty body came back with the 2xx. No goods arrived in this body; settlement is a separate chain observation.",
      });
      verdict = "settled";

      const originalReading = await responseReading(second, originalBody);
      // Present the identical single-use authorization once more. Either request
      // may be the first settlement; byte comparison cannot prove a second sale.
      let replayResponse: Response | null = null;
      let replayError: string | null = null;
      try {
        replayResponse = await fetchImpl(targetUrl, {
          // Byte-identical to stage 6, verb included — a replay that
          // changed the method would not be a replay.
          method: walkMethod,
          redirect: "manual",
          signal: AbortSignal.timeout(KNOCK_TIMEOUT_MS),
          headers: {
            "User-Agent": LAUNCH_CHECK_UA,
            Accept: "application/json",
            "PAYMENT-SIGNATURE": paymentHeader,
            ...(walkMethod === "POST" ? { "Content-Type": "application/json" } : {}),
          },
          ...(walkMethod === "POST" ? { body: PROBE_POST_BODY } : {}),
        });
      } catch (error) {
        replayError = String(error);
      }
      if (!replayResponse) {
        replayReading = { outcome: "unknown", status: null, names_settlement: null, original_response: originalReading };
        stages.push({
          stage: "replay",
          ok: false,
          detail: `the replayed request could not complete: ${replayError}. Nothing is claimed about this door's replay handling. No new authorization was signed; either presentation may have been the first successful settlement.`,
        });
      } else {
        try {
          const replayBody = await readCapped(replayResponse);
          replayReading = readReplay(replayResponse, replayBody.text, txHash,
            originalReading, await responseReading(replayResponse, replayBody));
          replayServed = replayReading.outcome === "refused" || replayReading.outcome === "redelivered" ? false : null;
          stages.push({ stage: "replay", ok: replayReading.outcome === "redelivered",
            detail: replayDetail(replayReading, replayBody.text) });
        } catch {
          replayReading = { outcome: "unknown", status: replayResponse.status, names_settlement: null, original_response: originalReading };
          stages.push({ stage: "replay", ok: false, detail: "The replay response body could not be read. Recovery and fresh fulfillment remain unknown; the original response observation is retained." });
        }
      }
    } else {
      stages.push({
        stage: "settle",
        ok: false,
        detail: `payment refused: HTTP ${second.status}. First 300 bytes: ${JSON.stringify(bodyText.slice(0, 300))}. In the August field run this was the largest failure class (616 of 1,707 attempts answered 'Payment failed: 400').`,
      });
      /*
       * THE REFUSAL IS READ, NOT JUST RECORDED. A door that answers a
       * correctly signed payment by re-serving the same offer has a
       * named defect, and until now only our own field walk could see
       * it — which put the finding in our research notes rather than
       * in the hands of the buyer who paid for a check. The reading
       * runs on every refusal and reports `checked: false` rather than
       * a clean whenever it could not be taken.
       */
      // Header first, body second — the same order a buyer's client
      // reads a challenge in, and the same order stage 2 used.
      const refusedHeaderRaw = second.headers.get("payment-required");
      let refusedChallenge = (refusedHeaderRaw ? decodeBase64Json(refusedHeaderRaw) : null) as
        { accepts?: AcceptEntry[] } | null;
      if (!Array.isArray(refusedChallenge?.accepts)) {
        try {
          refusedChallenge = JSON.parse(bodyText) as { accepts?: AcceptEntry[] };
        } catch {
          refusedChallenge = null;
        }
      }
      const advertisedVersion = advertisedVersionUnpayable({
        paymentSubmitted: true,
        paidStatus: second.status,
        unpaidAccepts,
        paidAccepts: Array.isArray(refusedChallenge?.accepts) ? refusedChallenge.accepts : null,
      });
      stages.push({
        stage: "settle",
        ok: advertisedVersion.present !== true,
        detail: advertisedVersionDetail(advertisedVersion),
      });
      verdict = "payment_refused";
    }
  }

  /*
   * ROADMAP 3.2 — THE MONEY PATH, MADE SYMMETRIC. Everything above
   * verified what the seller SAID; this verifies what the seller said
   * about MONEY. One receipt read on the rail we paid, narrowed to
   * the transfer this walk just made: our field wallet to the payTo
   * the door itself declared. The status lands INSIDE the signed
   * bytes, so a fabricated hash can never again be quoted out of this
   * store's corpus as an unqualified settlement record.
   */
  let txHashStatus: TxHashStatus | null = null;
  let txVerification: TxVerification | undefined;
  if (txHash !== null) {
    const network = paidNetwork ?? "eip155:8453";
    const readAt = new Date().toISOString();
    const base: Omit<TxVerification, "read" | "detail"> = {
      chain: network,
      chain_status: null,
      block_height: null,
      confirmations: null,
      observed_payer: null,
      observed_recipient: null,
      observed_amount_usdc: null,
      read_at: readAt,
    };
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      /*
       * Not a shape that can name a transaction on the rail we paid.
       * Nothing to read — and worth saying out loud, because a door
       * that answers an EVM settlement with a non-EVM identifier is
       * handing its buyers a receipt they can never check.
       */
      txHashStatus = "unverifiable_shape";
      txVerification = {
        ...base,
        read: "skipped_shape",
        detail: `the PAYMENT-RESPONSE identifier is not a 32-byte hex transaction hash, so it cannot name a transaction on ${network}, the rail this walk paid. No read was attempted; there is nothing it could have read.`,
      };
    } else if (!options.readClaim || !signer) {
      txHashStatus = "claimed";
      txVerification = {
        ...base,
        read: "not_attempted",
        detail: "no chain reader stood at this seam, so the hash is recorded as the seller's claim and nothing more. Anyone can finish the read: POST the hash to /api/attestation and compare.",
      };
    } else {
      try {
        const read = await options.readClaim(
          txHash,
          { txHash, payer: signer.address, recipient: payTo ?? undefined,
            ...(paymentAttempt && payTo ? { authorization: {
              network: paymentAttempt.network, asset: paymentAttempt.asset, payer: signer.address,
              recipient: payTo, nonce: paymentAttempt.nonce, amount_atomic: paymentAttempt.amount_atomic,
            } } : {}) },
          network,
        );
        if (paymentAttempt && read.authorization) {
          paymentAttempt.verification = read.authorization;
          if (read.authorization.status === "matched") {
            paymentAttempt.settlement = read.status === "SETTLED" ? "confirmed"
              : read.status === "PENDING_FINALITY" ? "pending_finality" : "unknown";
          }
        }
        // A bad receipt identity or chain read cannot remain a confirmed
        // transfer in the older field beside an unavailable exact reading.
        if (read.authorization?.status === "unavailable" && read.authorization.reason !== "receipt_not_found") {
          throw new Error(`candidate receipt identity or chain state not established: ${read.authorization.reason}`);
        }
        const detailByStatus: Record<string, string> = {
          SETTLED: `a receipt on ${network} shows a USDC transfer from this walk's field wallet to the payTo the door declared, ${read.confirmations ?? "?"} blocks deep. The claim is the fact.`,
          PENDING_FINALITY: `a receipt on ${network} shows the transfer at ${read.confirmations ?? 0} confirmations — real, young. Depth is a property of when we looked, not of the transfer.`,
          NOT_FOUND: `no receipt visible on ${network} at read time. A receipt not yet visible is not a receipt that does not exist (rule 52) — the read happened moments after settlement and RPC lag is real. The hash stays a claim; finish the read later at /api/attestation.`,
          REVERTED: `the transaction is mined on ${network} and FAILED. No value moved. The seller answered a settlement with a hash where nothing settled.`,
          INSUFFICIENT_MATCH: `the transaction is mined on ${network} but its logs show no USDC transfer from this walk's field wallet to the payTo the door declared. Whatever this hash records, it is not our payment reaching them.`,
        };
        const upgraded: TxHashStatus =
          read.status === "SETTLED" || read.status === "PENDING_FINALITY"
            ? "confirmed_on_chain"
            : read.status === "NOT_FOUND"
              ? "claimed"
              : "contradicted";
        txHashStatus = upgraded;
        txVerification = {
          ...base,
          read: "receipt",
          chain_status: read.status,
          block_height: read.blockHeight,
          confirmations: read.confirmations,
          observed_payer: read.payer,
          observed_recipient: read.recipient,
          observed_amount_usdc: read.amountUsdc,
          detail: detailByStatus[read.status] ?? `chain status ${read.status}.`,
        };
      } catch (error) {
        /*
         * An unreachable RPC is OUR gap, never their defect. The claim
         * stays a claim; contradiction requires a receipt actually
         * read.
         */
        txHashStatus = "claimed";
        txVerification = {
          ...base,
          read: "failed",
          detail: `the chain read did not complete (${String(error).slice(0, 200)}). This is a fact about our RPC path at this moment, not about the seller's hash, which stays recorded as their claim.`,
        };
      }
    }
    stages.push({
      stage: "tx-verify",
      ok: txHashStatus === "confirmed_on_chain",
      detail: txVerification.detail,
    });
  }

  const core = {
    check_id: checkId,
    url: targetUrl,
    observed_at: now.toISOString(),
    ua_sent: LAUNCH_CHECK_UA,
    verdict,
    stages,
    paid_usd: paidUsd,
    pay_to: payTo,
    replay_served: replayServed,
    ...(replayReading ? { replay: replayReading } : {}),
    authorization_outstanding_until: authorizationOutstandingUntil,
    tx_hash: txHash,
    tx_hash_status: txHashStatus,
    ...(txVerification ? { tx_verification: txVerification } : {}),
    field_wallet: signer?.address ?? null,
    ...(challengeEvidence ? { challenge_evidence: challengeEvidence } : {}),
    battery: LAUNCH_CHECK_BATTERY,
    ...(paymentAttempt ? { payment_attempt: paymentAttempt } : {}),
  };
  await options.retain?.("observation", core);
  return signLaunchCheck(env, core);
}

export async function signLaunchCheck(env: Env, core: LaunchCheckCore): Promise<SignedLaunchCheck> {
  const observation: LaunchCheckObservation = {
    ...core,
    evidence_hash: await sha256Hex(JSON.stringify(core)),
    scope: core.battery === LAUNCH_CHECK_BATTERY ? CHECK_SCOPE
      : `A retained observation from ${core.battery}, completed without repeating the purchase or upgrading its evidence to the current battery. Its stage outcomes keep their original meaning. Historical replay labels and transaction references do not establish fresh fulfillment or exact authorization settlement. Read /corrections and the current report guide for the limits; the signature authenticates these bytes, not the truth of the underlying claim.`,
  };
  const signed = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature: signed.signature,
    public_key: signed.publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served — including authorization_outstanding_until, so a paid_usd of 0 cannot be quoted apart from the window it was true in. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}

/** Stored after the mint so the envelope carries the cert id; the
 * signature was fixed before the mint — the Once-Over's discipline. */
export async function storeLaunchCheck(
  env: Env,
  check: SignedLaunchCheck,
  certId: string,
  purchasedAt?: string,
): Promise<LaunchCheckRecord> {
  const record: LaunchCheckRecord = {
    check,
    cert_id: certId,
    created_at: purchasedAt ?? new Date().toISOString(),
  };
  await kvPut(env.PATRONS, 
    KV_KEYS.launchCheck(check.check_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getLaunchCheck(
  env: Env,
  checkId: string,
): Promise<LaunchCheckRecord | null> {
  return kvGetJson<LaunchCheckRecord>(env.PATRONS, 
    KV_KEYS.launchCheck(checkId),
    "json",
  );
}
