/**
 * THE RAILS THIS STORE'S RESEARCH INSTRUMENTS READ.
 *
 * A MIRROR, NOT A SECOND OPINION. src/lib/base-rpc.ts is the store's
 * chain registry and has been for months, carrying seven EVM chains
 * with their CAIP-2 ids, USDC contracts and RPC fallbacks. The research
 * scripts are .mjs and cannot import it, so this file restates it —
 * and `npm run chains:test` parses the TypeScript and fails when the
 * two disagree, because a hand-kept copy of a registry is the same
 * defect as a hand-typed count of a derived list.
 *
 * WHY THIS EXISTS AT ALL, and it is not a flattering reason. The
 * chain reader built on 2026-09-15 hardcoded Base's USDC address and
 * read one rail, beside a working multi-chain registry it never
 * reached for. A counterparty then found that 43 doors in a public
 * directory advertise Arbitrum One and nobody measures it, and said
 * "you read Arbitrum" — which was true of this store and false of its
 * newest instrument. Two chain readers in one repository, the older
 * one better, is how a shop ends up unable to answer a question it
 * already had the parts for.
 */

/** CAIP-2 → the USDC contract and a public RPC, mirroring base-rpc.ts. */
export const EVM_RAILS = Object.freeze({
  "eip155:8453": Object.freeze({
    key: "base", label: "Base",
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    rpc: "https://mainnet.base.org",
    /** The public endpoint's own eth_getLogs ceiling, reported as -32614 / HTTP 413. */
    logSpan: 2000,
  }),
  "eip155:42161": Object.freeze({
    key: "arbitrum", label: "Arbitrum One",
    usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    rpc: "https://arb1.arbitrum.io/rpc",
    logSpan: 10000,
  }),
  "eip155:137": Object.freeze({
    key: "polygon", label: "Polygon",
    usdc: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    rpc: "https://polygon-rpc.com",
    logSpan: 2000,
  }),
  "eip155:480": Object.freeze({
    key: "world", label: "World",
    usdc: "0x79a02482a880bce3f13e09da970dc34db4cd24d1",
    rpc: "https://worldchain-mainnet.g.alchemy.com/public",
    logSpan: 2000,
  }),
  "eip155:1": Object.freeze({
    key: "ethereum", label: "Ethereum",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    rpc: "https://ethereum-rpc.publicnode.com",
    logSpan: 2000,
  }),
  "eip155:10": Object.freeze({
    key: "optimism", label: "Optimism",
    usdc: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    rpc: "https://mainnet.optimism.io",
    logSpan: 2000,
  }),
  "eip155:43114": Object.freeze({
    key: "avalanche", label: "Avalanche",
    usdc: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    rpc: "https://api.avax.network/ext/bc/C/rpc",
    logSpan: 2000,
  }),
});

/**
 * CAIP-2, NORMALISED. A chain reference can be truncated by one
 * producer and not another — a counterparty's first pass at this
 * comparison returned 266 gaps of which 248 were exactly that, a
 * Solana chain ref cut short in one field and whole in the other. So
 * anything non-EVM is compared on its NAMESPACE and its reference
 * prefix rather than on the whole string, and EVM ids, which are short
 * and exact, are compared whole.
 */
export function normaliseCaip2(value) {
  if (typeof value !== "string" || !value.includes(":")) return null;
  const [namespace, ...rest] = value.trim().split(":");
  const reference = rest.join(":");
  const ns = namespace.toLowerCase();
  if (ns === "eip155") return `${ns}:${reference}`;
  // Solana and friends: references are base58 and get truncated in the
  // wild. 32 characters is past any real collision and short enough to
  // survive the truncation actually seen.
  return `${ns}:${reference.toLowerCase().slice(0, 32)}`;
}

/** True when two CAIP-2 ids name the same chain once truncation is allowed for. */
export function sameChain(a, b) {
  const left = normaliseCaip2(a);
  const right = normaliseCaip2(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [ln, lr] = left.split(":");
  const [rn, rr] = right.split(":");
  if (ln !== rn || ln === "eip155") return false;
  return lr.startsWith(rr) || rr.startsWith(lr);
}

export const railFor = (caip2) => EVM_RAILS[normaliseCaip2(caip2) ?? ""] ?? null;
export const isEvmRail = (caip2) => Boolean(railFor(caip2));
