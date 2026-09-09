import type { Env } from "@/types";
import { outboundHeaders } from "@/lib/identity";

/**
 * A very small Algorand reader — the third sibling of base-rpc.ts and
 * solana-rpc.ts, built 2026-09-09 because the 2026-W37 census found 78
 * ready doors quoting Algorand and this store could not verify a
 * settlement on any of them.
 *
 * Two calls, no client library: the indexer for a transaction, algod
 * for the current round. Both are plain REST, which is the whole
 * reason this file is short.
 *
 * WHAT ALGORAND MAKES EASIER THAN SOLANA, and it is worth saying
 * because the claim door treats them differently: Algorand blocks are
 * final when they are confirmed. There is no fork to wait out, so
 * there is no finality window here of the kind SOLANA_FINALITY_SLOTS
 * exists to enforce. A confirmed round is a settled fact.
 *
 * WHAT IT MAKES HARDER: the ecosystem cannot agree how to spell the
 * chain. The census sees three spellings across 87 doors — the CAIP-2
 * truncation, the full base64 genesis hash with padding, and the plain
 * word "mainnet". A reader that accepted one of them would refuse
 * honest doors for a formatting opinion, so it accepts all three and
 * says so here rather than in a bug report later.
 */

/**
 * USDC on Algorand mainnet is ASA 31566704 (Circle's), and this
 * constant is the one thing in this file the build environment could
 * not check for itself: egress to the Algorand indexer is blocked from
 * the machine this was written on, so the id comes from Circle's
 * published documentation rather than from a call this store made.
 *
 * THE FAILURE MODE IS FAIL-CLOSED, which is why shipping it unverified
 * is defensible. Every claim compares the on-chain asset id against
 * this number: wrong here means honest claims are REFUSED, never that
 * a wrong asset is paid for. Nobody loses money; a walker is told no.
 *
 * Verify it in one call before the first Algorand bounty is posted:
 *
 *   curl -s https://mainnet-idx.algonode.cloud/v2/assets/31566704 \\
 *     | jq '.asset.params | {name, "unit-name", decimals, creator}'
 *
 * Six decimals, unit-name USDC, Circle's creator address. Override
 * with ALGORAND_USDC_ASSET if it ever moves.
 */
export const ALGORAND_USDC_ASSET_DEFAULT = 31_566_704;

export function algorandUsdcAsset(env: Env): number {
  const configured = Number.parseInt(
    String((env as { ALGORAND_USDC_ASSET?: string }).ALGORAND_USDC_ASSET ?? ""),
    10,
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : ALGORAND_USDC_ASSET_DEFAULT;
}

/** The spelling this store writes when it names the rail itself. */
export const ALGORAND_CHAIN = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k";

/**
 * Every spelling the census actually sees, lowercased for comparison.
 * 78 doors use the CAIP-2 truncation, 8 the padded base64 genesis
 * hash, 1 the plain word. All three mean Algorand mainnet.
 */
const ALGORAND_SPELLINGS = [
  ALGORAND_CHAIN,
  "algorand:wghe2pwdvd7s12bl5faop20egyesn73ktic1qzkkit8=",
  "algorand:mainnet",
].map((value) => value.toLowerCase());

export function isAlgorandNetwork(network: string | undefined): boolean {
  const value = (network ?? "").trim().toLowerCase();
  return ALGORAND_SPELLINGS.includes(value);
}

/**
 * An Algorand transaction id is 32 bytes in base32 with no padding —
 * 52 characters of A-Z and 2-7. It cannot collide with a 0x hash or a
 * base58 Solana signature (both alphabets include characters this one
 * forbids), so the three identifier families dispatch on shape alone.
 */
export function isAlgorandTxId(value: string): boolean {
  return /^[A-Z2-7]{52}$/.test(value);
}

/** An Algorand account: 58 base32 characters, checksum included. */
export const ALGORAND_ADDRESS = /^[A-Z2-7]{58}$/;

/**
 * Public endpoints unless the keeper points somewhere better — the
 * same shape of ladder the other two readers keep, and for the same
 * reason: one operator's bad afternoon should not be a failed pass.
 */
const INDEXERS = [
  "https://mainnet-idx.algonode.cloud",
  "https://mainnet-idx.4160.nodely.dev",
] as const;
const ALGODS = [
  "https://mainnet-api.algonode.cloud",
  "https://mainnet-api.4160.nodely.dev",
] as const;
const ALGORAND_TIMEOUT_MS = 8_000;

function ladder(configured: string | undefined, fallbacks: readonly string[]): string[] {
  const out: string[] = [];
  const first = configured?.trim();
  if (first) out.push(first.replace(/\/$/, ""));
  for (const url of fallbacks) if (!out.includes(url)) out.push(url);
  return out;
}

async function readJson<T>(urls: string[], path: string): Promise<T> {
  let last: unknown = null;
  for (const base of urls) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: outboundHeaders({ Accept: "application/json" }),
        signal: AbortSignal.timeout(ALGORAND_TIMEOUT_MS),
      });
      /*
       * A 404 from the indexer is an ANSWER — that transaction is not
       * there — and rotating to the next endpoint to ask again would
       * turn a clean "no" into an outage. Every other status is this
       * endpoint's problem and the ladder moves on.
       */
      if (response.status === 404) {
        throw Object.assign(new Error("algorand indexer: not found"), {
          notFound: true,
        });
      }
      if (!response.ok) {
        last = new Error(`algorand endpoint answered ${response.status}`);
        continue;
      }
      return (await response.json()) as T;
    } catch (error) {
      if ((error as { notFound?: boolean })?.notFound) throw error;
      last = error;
    }
  }
  throw last instanceof Error
    ? last
    : new Error("no Algorand endpoint answered");
}

/** The chain's height now, for the clock a bounty postdates. */
export async function algorandRound(env: Env): Promise<number> {
  const status = await readJson<{ "last-round"?: number }>(
    ladder((env as { ALGORAND_ALGOD_URL?: string }).ALGORAND_ALGOD_URL, ALGODS),
    "/v2/status",
  );
  const round = status["last-round"];
  if (!Number.isSafeInteger(round)) {
    throw new Error("algod answered no readable round");
  }
  return round as number;
}

/** One asset transfer, as the indexer reports it. */
export interface AlgorandTransferFacts {
  round: number;
  sender: string;
  receiver: string;
  /** Atomic units of the asset — six decimals for USDC, same as EVM. */
  amount: bigint;
  asset: number;
  /** Set when the transaction also closed the sender's asset position. */
  closeTo?: string;
}

/**
 * The one question a claim asks of Algorand: what did this
 * transaction move, from whom, to whom, and when. Null when the
 * indexer says it does not exist — which is an answer, not a failure,
 * and the claim door tells the two apart.
 */
export async function algorandTransferFacts(
  env: Env,
  txId: string,
): Promise<AlgorandTransferFacts | null> {
  type Body = {
    transaction?: {
      "confirmed-round"?: number;
      sender?: string;
      "tx-type"?: string;
      "asset-transfer-transaction"?: {
        "asset-id"?: number;
        amount?: number | string;
        receiver?: string;
        "close-to"?: string;
      };
    };
  };
  let body: Body;
  try {
    body = await readJson<Body>(
      ladder(
        (env as { ALGORAND_INDEXER_URL?: string }).ALGORAND_INDEXER_URL,
        INDEXERS,
      ),
      `/v2/transactions/${txId}`,
    );
  } catch (error) {
    if ((error as { notFound?: boolean })?.notFound) return null;
    throw error;
  }
  const transaction = body.transaction;
  const transfer = transaction?.["asset-transfer-transaction"];
  const round = transaction?.["confirmed-round"];
  if (
    !transaction ||
    !transfer ||
    transaction["tx-type"] !== "axfer" ||
    !Number.isSafeInteger(round) ||
    (round as number) <= 0
  ) {
    return null;
  }
  const raw = transfer.amount ?? 0;
  return {
    round: round as number,
    sender: String(transaction.sender ?? ""),
    receiver: String(transfer.receiver ?? ""),
    amount: BigInt(typeof raw === "string" ? raw : Math.round(raw)),
    asset: Number(transfer["asset-id"] ?? 0),
    ...(transfer["close-to"] ? { closeTo: String(transfer["close-to"]) } : {}),
  };
}
