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

/** Native USDC on Polygon PoS (Circle's, not the bridged USDC.e). */
export const POLYGON_USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";

/** CAIP-2 for Polygon PoS, the same string the 402s advertise. */
export const POLYGON_CHAIN = "eip155:137";

/**
 * THE EVM CHAIN, AS A PARAMETER (the third-rail parity ruling,
 * 2026-08-21: EVM chains get full functionality by parameterization,
 * never by parallel code). Everything in this file that speaks
 * JSON-RPC takes one of these, defaulting to Base so no existing
 * call site moved when Polygon arrived — the same shape as the
 * shopping run's rail map. USDC keeps six decimals on both.
 */
export type EvmChainKey = "base" | "polygon" | "ethereum" | "arbitrum" | "optimism" | "avalanche";

export interface EvmChain {
  key: EvmChainKey;
  label: string;
  caip2: string;
  /** The chain's native USDC contract, lowercase. */
  usdc: string;
  /**
   * Roughly how many blocks an hour of this chain holds: the
   * statement's window arithmetic and nothing else. Approximate on
   * every chain and said to be — the artifact states from/to blocks,
   * and the hours are what those blocks are worth at the cadence.
   */
  blocksPerHour: number;
  /**
   * The env-var stem the keeper configures this chain's endpoints
   * under: `${envPrefix}_RPC_URL`, `_PRIMARY`, `_SECONDARY`, the
   * same three slots on every chain (types.ts declares them).
   */
  envPrefix: string;
  /** The public endpoint used when nothing is configured. */
  defaultRpc: string;
  /** Keyless public fallbacks, independent operators, tried last. */
  fallbacks: readonly string[];
  /**
   * The widest `eth_getLogs` block range this chain's free endpoints
   * will actually answer.
   *
   * THIS IS A PROPERTY OF THE PROVIDERS, NOT OF THE CHAIN, which is
   * why it lives beside them rather than as one shared constant. A
   * range wider than an endpoint allows comes back HTTP 400 — a
   * REQUEST verdict, identical on every provider that caps at the
   * same place, and no amount of rotating between them changes it.
   * The comment above FALLBACK_RPCS already recorded this happening
   * on Base at a 2,000-block span; on 2026-08-26 it stalled the
   * Polygon bank walk outright, 400 across all three endpoints, five
   * attempts, cursor never moving.
   */
  logSpan: number;
}

export const BASE_EVM: EvmChain = {
  key: "base",
  label: "Base",
  caip2: BASE_CHAIN,
  usdc: BASE_USDC,
  blocksPerHour: 1800,
  envPrefix: "BASE",
  defaultRpc: "https://mainnet.base.org",
  /*
   * KEYLESS PUBLIC FALLBACKS, added 2026-08-20 on the keeper's word
   * ("i dont care who manages as long as its free and works") — the
   * same rotation the Solana reader has carried since its own
   * one-endpoint bad afternoon (2026-08-05). The day's evidence: the
   * authenticated primary's free tier refuses eth_getLogs at our
   * 2,000-block span outright (HTTP 400, permanently, by plan
   * design), which left the log-reading walk leaning on however many
   * OTHER endpoints were configured. Free, no signup, independent
   * operators; tried after every keeper-configured endpoint, and the
   * 08-13 lesson — what protects a paid delivery is a DIFFERENT
   * network path — is the whole selection criterion.
   */
  fallbacks: ["https://base-rpc.publicnode.com", "https://base.drpc.org"],
  // Unchanged: this span has been answered by Base's endpoints since
  // the walk was written, and narrowing a working walk buys nothing.
  logSpan: 2000,
};

export const POLYGON_EVM: EvmChain = {
  key: "polygon",
  label: "Polygon",
  caip2: POLYGON_CHAIN,
  usdc: POLYGON_USDC,
  blocksPerHour: 1800,
  envPrefix: "POLYGON",
  defaultRpc: "https://polygon-rpc.com",
  /** Same posture as Base: keyless, independent operators. */
  fallbacks: [
    "https://polygon-rpc.com",
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon.drpc.org",
  ],
  /*
   * 500, AND THE NUMBER IS CHOSEN CONSERVATIVELY BECAUSE NOBODY HERE
   * COULD MEASURE THE REAL CAP.
   *
   * The three Polygon endpoints are unreachable from the environment
   * this fix was written in, so the true limit was never observed —
   * only the 400 in the page. Guessing just under a remembered
   * provider limit would be the same mistake as the 2,000 that broke:
   * a number that works until an operator tightens it.
   *
   * So the constraint used is the one that can be checked from here.
   * Polygon mints roughly 1,800 blocks an hour; the hourly run makes
   * RECONCILE_CATCHUP_PASSES passes, so the walk keeps up whenever
   * passes x span comfortably exceeds that. At 500 that is 6,000
   * blocks an hour against 1,800 produced — better than three times
   * the headroom, with a span well under every cap this walk has met.
   * `test/polygon-log-span.spec.ts` pins that arithmetic so the
   * number cannot be lowered into a slow-motion stall.
   */
  logSpan: 500,
};

/**
 * THE OTHER FOUR EVM CHAINS USDC SETTLES ON (2026-09-03, the ROI
 * list's item 2: market size). Circle issues native USDC on each;
 * x402 doors advertise them; a wallet statement or a receivability
 * read on one of them was, until today, "not a chain this store
 * reads" — an answer about our reader, not about the wallet.
 *
 * READERS, NOT RAILS. Nothing here changes what this store's own
 * till accepts: PAYMENT_RAILS.md's intake rule still governs an
 * accepted payment scheme, and it wants a named counterparty. These
 * constants let the statement, the receivability check and the
 * canonical-USDC test READ a chain a stranger's door names. The bank
 * walk and the inflow census stay on WALKED_EVM_CHAINS below.
 *
 * SPANS, GUESSED CONSERVATIVELY AND SAID TO BE. Every RPC host is
 * refused from the environment this was written in (the proxy
 * answers 403 to all fourteen candidates, measured 2026-09-03), so no
 * cap was observed — the same position the Polygon fix was in. 500
 * is the number that survived there; a chain the bank walk does not
 * walk cannot fall behind on it, so it only bounds the unknown-
 * settlement read. The first operator who buys a statement on one of
 * these chains measures what nobody here could; a refused window
 * reads `window_unreadable` with the provider's reason, never a
 * partial statement.
 *
 * Block cadences: Ethereum's 12 s slot is a protocol constant;
 * Optimism and Avalanche run near 2 s; Arbitrum One sequences at
 * about 250 ms, so an hour there is roughly eight times the blocks
 * an hour on Base is, and the eleven-hour ceiling is eight times the
 * span — which is the first thing to expect a public endpoint to
 * refuse, and the artifact says so when it does.
 */
export const ETHEREUM_USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const ETHEREUM_CHAIN = "eip155:1";
export const ETHEREUM_EVM: EvmChain = {
  key: "ethereum",
  label: "Ethereum",
  caip2: ETHEREUM_CHAIN,
  usdc: ETHEREUM_USDC,
  blocksPerHour: 300,
  envPrefix: "ETHEREUM",
  defaultRpc: "https://ethereum-rpc.publicnode.com",
  fallbacks: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://eth.llamarpc.com"],
  logSpan: 500,
};

export const ARBITRUM_USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
export const ARBITRUM_CHAIN = "eip155:42161";
export const ARBITRUM_EVM: EvmChain = {
  key: "arbitrum",
  label: "Arbitrum One",
  caip2: ARBITRUM_CHAIN,
  usdc: ARBITRUM_USDC,
  blocksPerHour: 14_400,
  envPrefix: "ARBITRUM",
  defaultRpc: "https://arb1.arbitrum.io/rpc",
  fallbacks: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org"],
  logSpan: 500,
};

export const OPTIMISM_USDC = "0x0b2c639c533813f4aa9d7837caf62653d097ff85";
export const OPTIMISM_CHAIN = "eip155:10";
export const OPTIMISM_EVM: EvmChain = {
  key: "optimism",
  label: "OP Mainnet",
  caip2: OPTIMISM_CHAIN,
  usdc: OPTIMISM_USDC,
  blocksPerHour: 1800,
  envPrefix: "OPTIMISM",
  defaultRpc: "https://mainnet.optimism.io",
  fallbacks: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com", "https://optimism.drpc.org"],
  logSpan: 500,
};

export const AVALANCHE_USDC = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";
export const AVALANCHE_CHAIN = "eip155:43114";
export const AVALANCHE_EVM: EvmChain = {
  key: "avalanche",
  label: "Avalanche C-Chain",
  caip2: AVALANCHE_CHAIN,
  usdc: AVALANCHE_USDC,
  blocksPerHour: 1800,
  envPrefix: "AVALANCHE",
  defaultRpc: "https://api.avax.network/ext/bc/C/rpc",
  fallbacks: [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://avalanche.drpc.org",
  ],
  logSpan: 500,
};

/** Every EVM chain this store can read USDC on. Base first, the default; Polygon second, the other accepted rail; then the readers. */
export const EVM_CHAINS: readonly EvmChain[] = [
  BASE_EVM,
  POLYGON_EVM,
  ETHEREUM_EVM,
  ARBITRUM_EVM,
  OPTIMISM_EVM,
  AVALANCHE_EVM,
];

/**
 * The chains this store's own money moves on, and therefore the ones
 * the bank walk and the inflow census walk every hour. A reader chain
 * is read when somebody names it; a walked chain is read whether or
 * not anybody asks, on an invocation budget that six chains would
 * exhaust. Widening this list is a cost decision, not a constant.
 */
export const WALKED_EVM_CHAINS: readonly EvmChain[] = [BASE_EVM, POLYGON_EVM];

/**
 * The network vocabulary, resolved: CAIP-2 or the plain word, any
 * EVM chain this store reads, Base when unsaid. Null means
 * unrecognized — callers refuse rather than defaulting silently,
 * because a chain the caller did not name is a chain the answer must
 * not be about.
 */
export function evmChainOf(network: string | undefined): EvmChain | null {
  const value = (network ?? "").trim().toLowerCase();
  if (value === "") return BASE_EVM;
  return EVM_CHAINS.find((chain) => value === chain.key || value === chain.caip2) ?? null;
}

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

/** The keeper's configured endpoint for one of a chain's three slots, if set. */
function configuredRpc(env: Env, chain: EvmChain, slot: "" | "_PRIMARY" | "_SECONDARY"): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[`${chain.envPrefix}_RPC_URL${slot}`];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function rpcUrl(env: Env, chain: EvmChain = BASE_EVM): string {
  return configuredRpc(env, chain, "") ?? chain.defaultRpc;
}

/**
 * EVERY ENDPOINT WE WILL TRY, best first.
 *
 * BASE_RPC_URL_PRIMARY is a secret holding an authenticated endpoint;
 * BASE_RPC_URL_SECONDARY is a second authenticated endpoint, from a
 * DIFFERENT provider if at all possible; BASE_RPC_URL is the
 * configured public one. INDEPENDENT providers is the part that
 * matters — retrying a rate-limited endpoint against itself helps
 * with a hiccup and not at all with an outage, and an outage on the
 * paid one must not be worse for a buyer than never having had it.
 *
 * The secondary slot was added 2026-08-13, during the bank walk's
 * nineteenth consecutive stalled hour: the primary answered 429 (a
 * quota is a per-key outage, and it takes the whole key with it) and
 * the public fallback 429'd from the Worker's shared egress at the
 * same time — while the identical call succeeded instantly from any
 * other network path. One authenticated key is one point of failure
 * with a fallback that shares its fate under load; the fix is a
 * second key that shares neither.
 */
export function rpcEndpoints(env: Env, chain: EvmChain = BASE_EVM): string[] {
  const candidates = [
    configuredRpc(env, chain, "_PRIMARY"),
    configuredRpc(env, chain, "_SECONDARY"),
    rpcUrl(env, chain),
    ...chain.fallbacks,
  ];
  const endpoints: string[] = [];
  for (const candidate of candidates) {
    const url = candidate?.trim();
    if (url && !endpoints.includes(url)) {
      endpoints.push(url);
    }
  }
  return endpoints;
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
/**
 * How long one provider gets to answer one call before it counts as
 * not answering (2026-09-03, the keeper's question when the reader
 * chains landed: "isnt going to make latency super slow is it").
 * Until today a call had no ceiling of its own: a public endpoint
 * that accepted the socket and never answered held the caller for
 * as long as the platform allowed, and with six chains readable the
 * paid audit could meet six such endpoints in a row. A stalled
 * provider is now a transport failure at this many milliseconds,
 * and the rotation moves on — the same rule a 5xx gets.
 */
export const RPC_TIMEOUT_MS = 8_000;

/** An HTTP status from a provider, kept typed so the retry loop can
 * tell "the key/request is refused" from "the wire hiccuped". */
class RpcHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function withTransportRetries<T>(
  label: string,
  env: Env,
  attemptOnce: (endpoint: string) => Promise<T>,
  chain: EvmChain = BASE_EVM,
): Promise<T> {
  const endpoints = rpcEndpoints(env, chain);
  let lastError: unknown;
  let tried = 0;
  for (const [index, endpoint] of endpoints.entries()) {
    const lastEndpoint = index === endpoints.length - 1;
    for (let attempt = 0; attempt < RPC_ATTEMPTS; attempt += 1) {
      tried += 1;
      try {
        return await attemptOnce(endpoint);
      } catch (error) {
        lastError = error;
        /*
         * A 4xx WITH ANOTHER PROVIDER WAITING skips ahead instead of
         * backing off (2026-08-20, read off the egress dashboard: the
         * authenticated primary answering 429 was knocked three times
         * per operation — 288 refusals for 48 answers — while the
         * secondary sat ready the whole time). A quota'd or rejected
         * key is a per-key condition; 450ms cannot fix it, and the
         * next endpoint is a different key on a different path. On the
         * LAST endpoint the backoff stays: a burst 429 there often
         * clears within it, and giving up instantly would drop a paid
         * delivery to save half a second — the 08-13 lesson inverted.
         */
        if (
          error instanceof RpcHttpError &&
          error.status >= 400 &&
          error.status < 500 &&
          !lastEndpoint
        ) {
          break;
        }
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
    `${chain.label} RPC ${label} failed after ${tried} attempts across ${where}${
      lastError instanceof Error ? `: ${lastError.message}` : ""
    }`,
  );
}

async function rpc<T>(
  env: Env,
  method: string,
  params: unknown[],
  chain: EvmChain = BASE_EVM,
): Promise<T> {
  return withTransportRetries(method, env, async (endpoint) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: outboundHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new RpcHttpError(
        `${chain.label} RPC ${method} answered ${response.status}`,
        response.status,
      );
    }
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("result" in body) ||
      (body as { error?: unknown }).error
    ) {
      throw new Error(`${chain.label} RPC ${method} returned no result`);
    }
    // A well-formed answer, INCLUDING result: null. Returned as-is,
    // first time, every time. This is the line the semantic rule
    // protects and nothing above it may re-ask.
    return (body as { result: T }).result;
  }, chain);
}

/** null when the chain has never heard of the hash. */
export async function getReceipt(
  env: Env,
  txHash: string,
  chain: EvmChain = BASE_EVM,
): Promise<RpcReceipt | null> {
  return rpc<RpcReceipt | null>(env, "eth_getTransactionReceipt", [txHash], chain);
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
  chain: EvmChain = BASE_EVM,
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
        throw new RpcHttpError(
          `${chain.label} RPC batch answered ${response.status}`,
          response.status,
        );
      }
      return (await response.json()) as unknown;
    },
    chain,
  );
  if (!Array.isArray(body)) {
    for (const txHash of txHashes) {
      receipts.set(txHash, await getReceipt(env, txHash, chain));
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
          `${chain.label} RPC batch errored for ${txHash}: ${JSON.stringify((entry as { error: unknown }).error).slice(0, 200)}`,
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
        `${chain.label} RPC batch answered without an entry for ${txHash}`,
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
  chain: EvmChain = BASE_EVM,
): Promise<Array<{ txHash: string; from: string; amount: bigint; block: number }>> {
  const padded = `0x${toAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const logs = await rpc<
    Array<{ transactionHash: string; topics: string[]; data: string; blockNumber: string }>
  >(env, "eth_getLogs", [
    {
      address: chain.usdc,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [TRANSFER_TOPIC, null, padded],
    },
  ], chain);
  return (logs ?? []).map((log) => ({
    txHash: String(log.transactionHash ?? "").toLowerCase(),
    from: addressFromTopic(log.topics?.[1] ?? ""),
    amount: BigInt(log.data && log.data !== "0x" ? log.data : "0x0"),
    block: Number.parseInt(log.blockNumber ?? "0x0", 16),
  }));
}

/**
 * THE OTHER DIRECTION — every USDC transfer OUT of an address.
 *
 * The till sentinel's one read (2026-08-18, the keeper's scenario:
 * revenue piles up, nobody checks the account, a compromised key
 * drains it while the store reports a clean sweep). The store expects
 * ZERO automated outflows from its receiving wallets, forever — no
 * code here holds those keys, and rule 30 says none ever will. So any
 * outgoing transfer is either the keeper's own hand or a theft, and
 * both deserve a page within the hour: one is confirmed with a
 * glance, the other is caught a week earlier than a monthly look at
 * the account would have.
 *
 * Same indexed-topic trick as usdcTransfersTo, position 1 instead of
 * 2: the node filters, we receive only this wallet's outflows.
 */
/**
 * EVERY USDC TRANSFER INTO ANY OF THESE ADDRESSES, in ONE call.
 *
 * The inflow census (2026-08-28, the keeper's T1 ruling) watches a
 * few hundred advertised payTos at once. One getLogs per address
 * would be a few hundred subrequests per block span and would blow
 * the Worker's budget before it covered an hour. eth_getLogs takes
 * an ARRAY at a topic position and ORs it, so the whole watch list
 * costs one call per span per chain.
 *
 * Returns the matched `to` address on every row, because the caller
 * is counting distinct recipients and a flat list of amounts cannot
 * answer that.
 */
export async function usdcTransfersToAny(
  env: Env,
  toAddresses: readonly string[],
  fromBlock: number,
  toBlock: number,
  chain: EvmChain = BASE_EVM,
): Promise<Array<{ txHash: string; from: string; to: string; amount: bigint; block: number }>> {
  const padded = [
    ...new Set(
      toAddresses
        .filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address))
        .map(
          (address) =>
            `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`,
        ),
    ),
  ];
  if (padded.length === 0) return [];
  const logs = await rpc<
    Array<{ transactionHash: string; topics: string[]; data: string; blockNumber: string }>
  >(env, "eth_getLogs", [
    {
      address: chain.usdc,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [TRANSFER_TOPIC, null, padded],
    },
  ], chain);
  return (logs ?? []).map((log) => ({
    txHash: String(log.transactionHash ?? "").toLowerCase(),
    from: addressFromTopic(log.topics?.[1] ?? ""),
    to: addressFromTopic(log.topics?.[2] ?? ""),
    amount: BigInt(log.data && log.data !== "0x" ? log.data : "0x0"),
    block: Number.parseInt(log.blockNumber ?? "0x0", 16),
  }));
}

export async function usdcTransfersFrom(
  env: Env,
  fromAddress: string,
  fromBlock: number,
  toBlock: number,
  chain: EvmChain = BASE_EVM,
): Promise<Array<{ txHash: string; to: string; amount: bigint; block: number }>> {
  const padded = `0x${fromAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const logs = await rpc<
    Array<{ transactionHash: string; topics: string[]; data: string; blockNumber: string }>
  >(env, "eth_getLogs", [
    {
      address: chain.usdc,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics: [TRANSFER_TOPIC, padded],
    },
  ], chain);
  return (logs ?? []).map((log) => ({
    txHash: String(log.transactionHash ?? "").toLowerCase(),
    to: addressFromTopic(log.topics?.[2] ?? ""),
    amount: BigInt(log.data && log.data !== "0x" ? log.data : "0x0"),
    block: Number.parseInt(log.blockNumber ?? "0x0", 16),
  }));
}

export async function getBlockNumber(
  env: Env,
  chain: EvmChain = BASE_EVM,
): Promise<number> {
  const hex = await rpc<string>(env, "eth_blockNumber", [], chain);
  return Number.parseInt(hex, 16);
}

/**
 * isBlacklisted(address) on the chain's canonical USDC contract —
 * FiatToken's own read, selector 0xfe575a87 (the depth pass,
 * 2026-08-28). USDC carries a compliance blacklist, and a
 * blacklisted payTo cannot be credited: the transfer reverts in
 * simulation before it can broadcast, exactly the failure shape the
 * Solana token-account read already catches on the other rail. One
 * eth_call of public state, unpaid, repeatable by anyone. Throws
 * when no endpoint answers — the caller decides what an unread
 * ledger means, and it is never a fact about the address.
 */
export async function usdcBlacklisted(
  env: Env,
  chain: EvmChain,
  address: string,
): Promise<boolean> {
  const clean = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(clean)) {
    throw new Error(`not an EVM address: ${address}`);
  }
  const data = `0xfe575a87${"0".repeat(24)}${clean}`;
  const result = await rpc<string>(
    env,
    "eth_call",
    [{ to: chain.usdc, data }, "latest"],
    chain,
  );
  return BigInt(result === "0x" ? "0x0" : result) === 1n;
}

/**
 * When was this block mined? One header read, no transactions. Built
 * for the till sentinel (2026-08-20): its walk rides an hourly cursor
 * that can run a day behind, and an alert that prints only a block
 * number reads as breaking news no matter how old the transfer is —
 * the keeper took his own day-old $50 for a live theft. Null on any
 * read failure; the caller says "age unknown" rather than guessing.
 */
export async function getBlockTimestamp(
  env: Env,
  block: number,
  chain: EvmChain = BASE_EVM,
): Promise<Date | null> {
  try {
    const header = await rpc<{ timestamp?: string } | null>(
      env,
      "eth_getBlockByNumber",
      [`0x${block.toString(16)}`, false],
      chain,
    );
    if (!header?.timestamp) return null;
    const seconds = Number.parseInt(header.timestamp, 16);
    return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
  } catch {
    return null;
  }
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
  chain: EvmChain = BASE_EVM,
): Promise<{ txHash: string } | null> {
  const head = await getBlockNumber(env, chain);
  const padded = `0x${authorizer.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const logs = await rpc<Array<{ transactionHash: string }>>(env, "eth_getLogs", [
    {
      address: chain.usdc,
      fromBlock: `0x${Math.max(0, head - blockWindow).toString(16)}`,
      toBlock: "latest",
      topics: [AUTHORIZATION_USED_TOPIC, padded, nonce.toLowerCase()],
    },
  ], chain);
  const found = (logs ?? [])[0];
  return found?.transactionHash
    ? { txHash: String(found.transactionHash).toLowerCase() }
    : null;
}

/**
 * The same one question over an EXPLICIT block range, for callers that
 * walk history in chain-sized chunks (Machine 1's resolver re-asks
 * hours after the ambiguous settle, which can sit past the one-call
 * window findAuthorizationUse scans — especially on Polygon, whose
 * public getLogs cap is 500 blocks).
 */
export async function findAuthorizationUseInRange(
  env: Env,
  authorizer: string,
  nonce: string,
  fromBlock: number,
  toBlock: number,
  chain: EvmChain = BASE_EVM,
): Promise<{ txHash: string } | null> {
  const padded = `0x${authorizer.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const logs = await rpc<Array<{ transactionHash: string }>>(env, "eth_getLogs", [
    {
      address: chain.usdc,
      fromBlock: `0x${Math.max(0, fromBlock).toString(16)}`,
      toBlock: `0x${Math.max(0, toBlock).toString(16)}`,
      topics: [AUTHORIZATION_USED_TOPIC, padded, nonce.toLowerCase()],
    },
  ], chain);
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
export function usdcTransfers(
  receipt: RpcReceipt,
  chain: EvmChain = BASE_EVM,
): UsdcTransfer[] {
  const transfers: UsdcTransfer[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, chain.usdc)) continue;
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
export function usdcApprovals(
  receipt: RpcReceipt,
  chain: EvmChain = BASE_EVM,
): UsdcApproval[] {
  const approvals: UsdcApproval[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, chain.usdc)) continue;
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
export function usdcAuthorizations(
  receipt: RpcReceipt,
  chain: EvmChain = BASE_EVM,
): UsdcAuthorization[] {
  const authorizations: UsdcAuthorization[] = [];
  for (const log of receipt.logs ?? []) {
    if (!isSameAddress(log.address, chain.usdc)) continue;
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
export function authorizationNonces(
  receipt: RpcReceipt,
  chain: EvmChain = BASE_EVM,
): string[] {
  return usdcAuthorizations(receipt, chain).map((entry) => entry.nonce);
}

/** USDC has six decimals; the attestation reports both. */
export function usdcFromUnits(units: bigint): number {
  return Number(units) / 1_000_000;
}
