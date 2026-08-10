import type { Env } from "@/types";
import { outboundHeaders } from "@/lib/identity";

/**
 * A very small Base JSON-RPC reader. No client library, no cache.
 *
 * NOT RETRY-FREE, AND THE DISTINCTION IS THE WHOLE POINT. A settlement
 * attestation observes a MOMENT: re-asking the chain until the answer
 * improves would turn an observation into a poll, and a poll into an
 * implied promise that we waited for the right answer. So a real
 * answer — including `result: null`, the chain saying it has never
 * heard of the hash — is returned the first time, always, and is never
 * re-asked. That rule is intact.
 *
 * A PROVIDER THAT DOES NOT ANSWER AT ALL is a different thing, and
 * conflating the two cost real money. See the retry block below.
 */

/** USDC on Base. The only asset this store prices in. */
export const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

/** CAIP-2 for Base mainnet, the same string the 402s advertise. */
export const BASE_CHAIN = "eip155:8453";

/**
 * keccak256("Transfer(address,address,uint256)") and
 * keccak256("AuthorizationUsed(address,bytes32)").
 *
 * Hardcoded rather than derived so the Worker carries no hashing
 * dependency — and re-derived from the signatures in the test suite,
 * so a typo here fails CI rather than silently classifying every
 * settled payment as NOT_FOUND.
 */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const AUTHORIZATION_USED_TOPIC =
  "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
/**
 * keccak256("Approval(address,address,uint256)").
 *
 * The reconciliation reads this to find a spending CAP that is on the
 * chain rather than in a caller's message. An Approval in the SAME
 * receipt as the transfer is the ERC-2612 permit shape: the payer
 * signed a ceiling and the spender took some of it in one
 * transaction, so both numbers are observable and the discretion
 * between them is a fact rather than a claim.
 */
export const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

/** Public Base RPC unless the keeper points us somewhere better. */
const DEFAULT_RPC = "https://mainnet.base.org";

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
}

export interface RpcReceipt {
  status: string;
  blockNumber: string;
  logs: RpcLog[];
}

function rpcUrl(env: Env): string {
  return env.BASE_RPC_URL && env.BASE_RPC_URL.length > 0
    ? env.BASE_RPC_URL
    : DEFAULT_RPC;
}

/**
 * EVERY ENDPOINT WE WILL TRY, best first.
 *
 * BASE_RPC_URL_PRIMARY is a secret holding an authenticated endpoint;
 * BASE_RPC_URL is the configured public one. Two INDEPENDENT providers
 * is the part that matters — retrying a rate-limited endpoint against
 * itself helps with a hiccup and not at all with an outage, and an
 * outage on the paid one must not be worse for a buyer than never
 * having had it.
 */
function rpcEndpoints(env: Env): string[] {
  const primary = env.BASE_RPC_URL_PRIMARY?.trim();
  const fallback = rpcUrl(env);
  return primary && primary.length > 0 && primary !== fallback
    ? [primary, fallback]
    : [fallback];
}

/**
 * WHAT MAY BE SAID ABOUT AN ENDPOINT OUT LOUD, and this is a real
 * hole I opened yesterday: the retry error interpolated the full URL
 * into its message. With an authenticated endpoint the token lives IN
 * that URL, and alert emails, console logs and the service audit's
 * `unreachable` detail all carry error text. A credential in an
 * artifact is not a typo, it is a disclosure.
 */
export function redactRpc(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return "the configured endpoint";
  }
}

/**
 * TRANSPORT RETRIES, AND WHY THEY DO NOT BREAK THE "NO RETRY" RULE.
 *
 * attestation.ts states the store's rule plainly: "no polling, no
 * retry — retrying until the answer improves would turn an observation
 * into a poll, and a poll into an implied promise that we waited for
 * the right answer." That rule is about SEMANTICS and it stands.
 *
 * This is a different thing. A `result: null` is the chain answering
 * "no such transaction" — a real answer, returned immediately, NEVER
 * retried, because retrying it is exactly what the rule forbids. What
 * is retried here is the provider failing to answer at all: a 429, a
 * 5xx, a dropped socket. That is not asking the chain a second time.
 * It is getting the answer a first time.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. Four items read the chain AFTER
 * the money has settled and BEFORE the certificate is minted —
 * settlement_attestation, attestation_bundle, service_audit and
 * settlement_reconciliation. A throw there is money taken with no
 * goods out, and production runs against the PUBLIC Base RPC, which
 * rate-limits. That combination fired repeatedly in August 2026: the
 * same buyer, minutes apart, same rail — small_blessing delivered
 * (no chain read) and settlement_attestation dropped (two chain
 * reads). Per-item, not per-buyer and not per-chain, which is exactly
 * the shape of this dependency.
 */
const RPC_ATTEMPTS = 3;
const RPC_BACKOFF_MS = [150, 450];

async function withTransportRetries<T>(
  label: string,
  env: Env,
  attemptOnce: (endpoint: string) => Promise<T>,
): Promise<T> {
  const endpoints = rpcEndpoints(env);
  let lastError: unknown;
  let tried = 0;
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < RPC_ATTEMPTS; attempt += 1) {
      tried += 1;
      try {
        return await attemptOnce(endpoint);
      } catch (error) {
        lastError = error;
        const wait = RPC_BACKOFF_MS[attempt];
        if (wait === undefined) break;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    // Exhausted this provider; the next one is a different network
    // path, which is the only thing that helps against an outage.
  }
  const where = endpoints.map(redactRpc).join(" then ");
  throw new Error(
    `Base RPC ${label} failed after ${tried} attempts across ${where}${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  return withTransportRetries(method, env, async (endpoint) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: outboundHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) {
      throw new Error(`Base RPC ${method} answered ${response.status}`);
    }
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("result" in body) ||
      (body as { error?: unknown }).error
    ) {
      throw new Error(`Base RPC ${method} returned no result`);
    }
    // A well-formed answer, INCLUDING result: null. Returned as-is,
    // first time, every time. This is the line the semantic rule
    // protects and nothing above it may re-ask.
    return (body as { result: T }).result;
  });
}

/** null when the chain has never heard of the hash. */
export async function getReceipt(
  env: Env,
  txHash: string,
): Promise<RpcReceipt | null> {
  return rpc<RpcReceipt | null>(env, "eth_getTransactionReceipt", [txHash]);
}

/**
 * MANY RECEIPTS, ONE SUBREQUEST — the red team's finding on the
 * attestation sheaf (2026-08-07). Twenty per-hash reads inside
 * fulfillment meant ~40 chain subrequests AFTER money had settled,
 * brushing the Workers per-request budget on the worst path; a request
 * that dies there is an undelivered sale the keeper resolves by hand.
 * JSON-RPC has had batching since 1.0 — an array of requests in one
 * POST — so the whole sheaf reads in a single subrequest.
 *
 * FALLS BACK to per-hash reads when the provider answers a batch with
 * anything but an array, because a configured BASE_RPC_URL is the
 * operator's choice and some gateways refuse batches: the fallback is
 * exactly yesterday's behavior, so the worst case is the one we
 * already lived with, never a new one.
 */
export async function getReceiptsBatch(
  env: Env,
  txHashes: readonly string[],
): Promise<Map<string, RpcReceipt | null>> {
  const receipts = new Map<string, RpcReceipt | null>();
  if (txHashes.length === 0) {
    return receipts;
  }
  /*
   * The sheaf reads the chain after money has settled too, so the
   * batch gets the same transport retries the single reader does. A
   * 429 on the first attempt used to end an attestation_bundle
   * purchase with the money taken and nothing delivered.
   */
  const body = await withTransportRetries(
    `batch of ${txHashes.length}`,
    env,
    async (endpoint) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: outboundHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(
          txHashes.map((txHash, index) => ({
            jsonrpc: "2.0",
            id: index,
            method: "eth_getTransactionReceipt",
            params: [txHash],
          })),
        ),
      });
      if (!response.ok) {
        throw new Error(`Base RPC batch answered ${response.status}`);
      }
      return (await response.json()) as unknown;
    },
  );
  if (!Array.isArray(body)) {
    for (const txHash of txHashes) {
      receipts.set(txHash, await getReceipt(env, txHash));
    }
    return receipts;
  }
  for (const entry of body) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "id" in entry &&
      typeof (entry as { id: unknown }).id === "number"
    ) {
      const index = (entry as { id: number }).id;
      const txHash = txHashes[index];
      if (txHash === undefined) {
        continue;
      }
      /**
       * AN ERROR ENTRY THROWS, IT NEVER BECOMES A VERDICT. result:null
       * is the chain saying "no such transaction" — an honest
       * NOT_FOUND somebody paid for. An error member is the PROVIDER
       * failing, and mapping that to NOT_FOUND would sign a false
       * negative about a payment that may have settled — the exact
       * bug class test/attestation-not-found.spec.ts names as the
       * most expensive one this item can have. The single-hash path
       * throws on provider failure; the batch holds the same line.
       */
      if ("error" in entry) {
        throw new Error(
          `Base RPC batch errored for ${txHash}: ${JSON.stringify((entry as { error: unknown }).error).slice(0, 200)}`,
        );
      }
      receipts.set(
        txHash,
        "result" in entry
          ? (entry as { result: RpcReceipt | null }).result
          : null,
      );
    }
  }
  // Same line for a hash the provider's answer simply omitted: absent
  // from the response is a provider fault, not a chain verdict.
  for (const txHash of txHashes) {
    if (!receipts.has(txHash)) {
      throw new Error(
        `Base RPC batch answered without an entry for ${txHash}`,
      );
    }
  }
  return receipts;
}

/**
 * Every USDC Transfer INTO one address over a block range.
 *
 * The only call in this file that looks at the chain rather than at a
 * transaction we already knew about, and that is the point: the
 * settle-without-mint check has to walk the side of the books WE DID
 * NOT WRITE (problem ledger #4). Everything else the store knows about
 * a payment came from our own pipeline, so it cannot see a payment our
 * own pipeline failed to record.
 *
 * The `to` filter is an indexed topic, so the node does the work and
 * we receive only our own receipts rather than every USDC transfer on
 * Base.
 */
export async function usdcTransfersTo(
  env: Env,
  toAddress: string,
  fromBlock: number,
  toBlock: number,
): Promise<Array<{ txHash: string; from: string; amount: bigint; block: number }>> {
  const padded = `0x${toAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const logs = await rpc<
    Array<{ transactionHash: string; topics: string[]; data: string; blockNumber: string }>
  >(env, "eth_getLogs", [
    {
      address: BASE_USDC,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [TRANSFER_TOPIC, null, padded],
    },
  ]);
  return (logs ?? []).map((log) => ({
    txHash: String(log.transactionHash ?? "").toLowerCase(),
    from: addressFromTopic(log.topics?.[1] ?? ""),
    amount: BigInt(log.data && log.data !== "0x" ? log.data : "0x0"),
    block: Number.parseInt(log.blockNumber ?? "0x0", 16),
  }));
}

export async function getBlockNumber(env: Env): Promise<number> {
  const hex = await rpc<string>(env, "eth_blockNumber", []);
  return Number.parseInt(hex, 16);
}

/**
 * DID THIS AUTHORIZATION BURN? — the ambiguous-settle rescue's one
 * question (incident 2026-08-07: three settles 502'd on BOTH attempts
 * and were booked as declines while every one of them had landed
 * on-chain; refunded by hand, tx 0xa6819600a1f141783d7a463046a0a62e
 * 45a8f18e5a21c9b577721001a3669c19). An EIP-3009 nonce moves money at
 * most once and emits AuthorizationUsed(authorizer, nonce) when it
 * does — both indexed, so the node answers the exact question and
 * nothing else. One bounded look over a recent window, never a poll:
 * either the transfer already landed or the decline stands.
 */
export async function findAuthorizationUse(
  env: Env,
  authorizer: string,
  nonce: string,
  blockWindow = 300,
): Promise<{ txHash: string } | null> {
  const head = await getBlockNumber(env);
  const padded = `0x${authorizer.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const logs = await rpc<Array<{ transactionHash: string }>>(env, "eth_getLogs", [
    {
      address: BASE_USDC,
      fromBlock: `0x${Math.max(0, head - blockWindow).toString(16)}`,
      toBlock: "latest",
      topics: [AUTHORIZATION_USED_TOPIC, padded, nonce.toLowerCase()],
    },
  ]);
  const found = (logs ?? [])[0];
  return found?.transactionHash
    ? { txHash: String(found.transactionHash).toLowerCase() }
    : null;
}

/** 32-byte topic word -> lowercase 20-byte address. */
export function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export function isSameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface UsdcTransfer {
  from: string;
  to: string;
  /** Raw USDC units. Six decimals on Base. */
  amount: bigint;
}

/** Every USDC Transfer in a receipt, decoded. Ignores other tokens. */
export function usdcTransfers(receipt: RpcReceipt): UsdcTransfer[] {
  const transfers: UsdcTransfer[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, BASE_USDC)) continue;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const from = log.topics[1];
    const to = log.topics[2];
    if (!from || !to) continue;
    transfers.push({
      from: addressFromTopic(from),
      to: addressFromTopic(to),
      amount: BigInt(log.data === "0x" ? "0x0" : log.data),
    });
  }
  return transfers;
}

export interface UsdcApproval {
  owner: string;
  spender: string;
  /** Raw USDC units — the ceiling the owner signed for. */
  amount: bigint;
}

/**
 * Every USDC Approval in a receipt, decoded.
 *
 * SAME TRANSACTION ONLY, and that limit is the honest part: an
 * approval granted in an EARLIER transaction is invisible here, so
 * the absence of an approval means "not in this receipt", never "no
 * ceiling existed". The reconciliation says exactly that rather than
 * reporting an unobserved cap as an absent one.
 */
export function usdcApprovals(receipt: RpcReceipt): UsdcApproval[] {
  const approvals: UsdcApproval[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, BASE_USDC)) continue;
    if (log.topics[0]?.toLowerCase() !== APPROVAL_TOPIC) continue;
    const owner = log.topics[1];
    const spender = log.topics[2];
    if (!owner || !spender) continue;
    approvals.push({
      owner: addressFromTopic(owner),
      spender: addressFromTopic(spender),
      amount: BigInt(log.data === "0x" ? "0x0" : log.data),
    });
  }
  return approvals;
}

export interface UsdcAuthorization {
  /** The token holder whose signature permitted the transfer. */
  authorizer: string;
  nonce: string;
}

/**
 * EIP-3009 authorizations burned in this transaction, WITH THE
 * AUTHORIZER.
 *
 * The authorizer used to be dropped on the floor here, and a red team
 * found what that cost: a reconciliation could see an authorization
 * belonging to Alice, a larger unrelated transfer from Bob in the same
 * receipt, and report that BOB's amount was fixed inside his signed
 * digest. Bob signed nothing. An event says who authorized it, and
 * throwing that away is what let the claim be attached to the wrong
 * party.
 */
export function usdcAuthorizations(receipt: RpcReceipt): UsdcAuthorization[] {
  const authorizations: UsdcAuthorization[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, BASE_USDC)) continue;
    if (log.topics[0]?.toLowerCase() !== AUTHORIZATION_USED_TOPIC) continue;
    const authorizer = log.topics[1];
    const nonce = log.topics[2];
    if (!authorizer || !nonce) continue;
    authorizations.push({
      authorizer: addressFromTopic(authorizer),
      nonce: nonce.toLowerCase(),
    });
  }
  return authorizations;
}

/** EIP-3009 nonces burned in this transaction, lowercased. */
export function authorizationNonces(receipt: RpcReceipt): string[] {
  return usdcAuthorizations(receipt).map((entry) => entry.nonce);
}

/** USDC has six decimals; the attestation reports both. */
export function usdcFromUnits(units: bigint): number {
  return Number(units) / 1_000_000;
}
