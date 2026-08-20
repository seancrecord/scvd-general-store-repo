/**
 * WHAT IS IN payTo, AND CAN A BUYER ACTUALLY PAY IT.
 *
 * An x402 `payTo` is consumed by a signing library that needs BYTES:
 * an EIP-3009 authorization signs `to` as a 20-byte address, and a
 * Solana transfer needs a 32-byte pubkey. The protocol defines no
 * resolution step, so anything else in that field is a lookup the
 * buyer must know to perform, against a registry on some particular
 * chain, through an RPC they may not have. When they cannot, the
 * client throws somewhere deep and the SELLER never learns a buyer
 * came — which is the worst failure shape there is, because it is
 * invisible on both ends.
 *
 * Built 2026-08-20 after a first pass got Basenames wrong. That pass
 * matched `.eth` and told every holder their buyers needed a MAINNET
 * resolver — true for ENS, false for a `.base.eth` name, which
 * resolves on Base, the rail this store is first on. A check that
 * gives confidently wrong remediation is worse than no check: it
 * costs the reader the work of finding out we were wrong.
 *
 * SO THE TABLE NAMES THE RESOLVER'S CHAIN, and the reading compares
 * it against the chain the offer is actually denominated in. Three
 * different sentences come out of that comparison and they are not
 * interchangeable: a name that resolves on the SAME chain the buyer is
 * already talking to is friction; a name that resolves on a DIFFERENT
 * chain is a second RPC dependency most clients do not carry; and a
 * payTo of the wrong SHAPE for its own network cannot be paid by
 * anybody, ever.
 */

export interface NameService {
  /** Longest-suffix-first; `.base.eth` must beat `.eth`. */
  suffix: string;
  name: string;
  /** Where the registry lives, in words a seller can act on. */
  resolvesOn: string;
  /** The chain family whose buyers already hold that RPC. */
  family: "evm-mainnet" | "base" | "solana" | "other";
}

/**
 * Ordered by suffix length so the most specific match wins. Not
 * exhaustive and does not pretend to be — an unknown dotted string
 * still gets named as unresolvable, which is the finding either way.
 */
export const NAME_SERVICES: readonly NameService[] = [
  {
    suffix: ".base.eth",
    name: "Basename",
    resolvesOn: "Base itself (the L2 registry, not mainnet ENS)",
    family: "base",
  },
  {
    suffix: ".cb.id",
    name: "Coinbase ID",
    resolvesOn: "Ethereum mainnet, as an ENS subdomain",
    family: "evm-mainnet",
  },
  {
    suffix: ".sol",
    name: "Solana Name Service",
    resolvesOn: "Solana, via the SNS program",
    family: "solana",
  },
  {
    suffix: ".eth",
    name: "ENS",
    resolvesOn: "Ethereum mainnet (chainId 1)",
    family: "evm-mainnet",
  },
  {
    suffix: ".lens",
    name: "Lens handle",
    resolvesOn: "Polygon",
    family: "other",
  },
  { suffix: ".bnb", name: "Space ID", resolvesOn: "BNB Chain", family: "other" },
  { suffix: ".arb", name: "Space ID", resolvesOn: "Arbitrum", family: "other" },
  { suffix: ".box", name: "my.box", resolvesOn: "Ethereum mainnet", family: "evm-mainnet" },
  // Unstoppable Domains, the common TLDs. One entry each so the
  // reading can name the service rather than shrug at a dot.
  ...(
    [".crypto", ".nft", ".x", ".wallet", ".dao", ".888", ".zil", ".blockchain", ".bitcoin"] as const
  ).map((suffix) => ({
    suffix,
    name: "Unstoppable Domains",
    resolvesOn: "its own registry (Polygon/Ethereum), not ENS",
    family: "other" as const,
  })),
];

export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Base58, 32-44 — the only shape a Solana pubkey comes in. */
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type PayToVerdict =
  | { kind: "address"; payable: true }
  | { kind: "wrong-rail"; payable: false; detail: string }
  | { kind: "name"; payable: false; service: NameService; detail: string }
  | { kind: "unresolvable"; payable: false; detail: string };

/** Which family a CAIP-2 network belongs to; unknown chains read evm. */
function familyOf(network: string): "solana" | "base" | "evm" {
  if (network.startsWith("solana:")) return "solana";
  if (network === "eip155:8453") return "base";
  return "evm";
}

/**
 * Read one accepts entry's payTo against its own network. Pure, so
 * the whole taxonomy is testable without a probe.
 */
export function readPayTo(payTo: string, network: string): PayToVerdict {
  const value = payTo.trim();
  const family = familyOf(network);

  if (value.length === 0) {
    return {
      kind: "unresolvable",
      payable: false,
      detail:
        "accepts carries no payTo at all. There is nothing for a buyer to pay; a client cannot construct an authorization without a recipient.",
    };
  }

  // Shape first: an address of the WRONG shape for its own network is
  // the one case nobody can work around, including a buyer who does
  // hold every resolver.
  if (family === "solana") {
    if (SOLANA_ADDRESS.test(value)) return { kind: "address", payable: true };
    if (EVM_ADDRESS.test(value)) {
      return {
        kind: "wrong-rail",
        payable: false,
        detail: `accepts offers ${network} but payTo is a 0x EVM address. A Solana transfer needs a 32-byte pubkey; no buyer on this rail can pay this offer. Usually a wallet pasted into the wrong entry of a dual-rail challenge — check that each accepts entry carries the address for ITS OWN chain.`,
      };
    }
  } else {
    if (EVM_ADDRESS.test(value)) return { kind: "address", payable: true };
    if (SOLANA_ADDRESS.test(value)) {
      return {
        kind: "wrong-rail",
        payable: false,
        detail: `accepts offers ${network} but payTo is a base58 Solana address. An EIP-3009 authorization signs a 20-byte address; no buyer on this rail can pay this offer. Usually a wallet pasted into the wrong entry of a dual-rail challenge — check that each accepts entry carries the address for ITS OWN chain.`,
      };
    }
    // A near-miss address is worth its own sentence: it is a typo,
    // not a naming decision, and the seller can see it instantly.
    if (/^0x[0-9a-fA-F]+$/.test(value)) {
      return {
        kind: "unresolvable",
        payable: false,
        detail: `payTo is "${value}" — hex, but ${(value.length - 2) / 2} bytes rather than the 20 an address is. Almost certainly a truncated or over-long paste; nothing can pay it.`,
      };
    }
  }

  const service = NAME_SERVICES.find((entry) =>
    value.toLowerCase().endsWith(entry.suffix),
  );
  if (service) {
    const sameChain =
      (service.family === "base" && family === "base") ||
      (service.family === "solana" && family === "solana");
    return {
      kind: "name",
      payable: false,
      service,
      detail: sameChain
        ? `payTo is "${value}", a ${service.name}, which resolves on ${service.resolvesOn} — the same chain this offer is denominated in, so a buyer who already holds that RPC could resolve it. Most x402 clients will not: the protocol defines no resolution step, so a generic client passes the string straight into a signing call that needs bytes and throws. Publish the resolved address in payTo and keep the name somewhere a human reads.`
        : `payTo is "${value}", a ${service.name}, which resolves on ${service.resolvesOn} — a DIFFERENT chain from the ${network} this offer is denominated in. A buyer paying you on ${network} has no reason to hold that RPC, so most cannot resolve you at all, and the ones that fail do so inside a signing library with nothing to report. Publish the resolved address in payTo.`,
    };
  }

  return {
    kind: "unresolvable",
    payable: false,
    detail: `payTo is "${value}", which is neither an address for ${network} nor a name service this desk recognizes. A client cannot turn it into the bytes a payment signs over.`,
  };
}
