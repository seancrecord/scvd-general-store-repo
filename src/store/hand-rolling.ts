import { BASE_CHAIN, BASE_USDC } from "@/lib/base-rpc";

/**
 * FOR ANYONE HAND-ROLLING AN X402 CLIENT.
 *
 * WHY THIS EXISTS, and it is the most expensive thing the store has
 * learned about its own visitors: on 2026-07-28 the first and only
 * outside client ever to present a payment signature here presented
 * three, all on `small_blessing` — the half-cent practice item — from
 * curl, and every one failed at the VERIFY stage. Not settle. The
 * signature never cleared at all.
 *
 * The reason string is gone (those rows predate the per-request slot),
 * so this is the most likely cause rather than a proven one. But it
 * fits the shape exactly, and it is the single most common way a
 * hand-rolled x402 client fails on Base:
 *
 *   THE EIP-712 DOMAIN NAME DIFFERS BETWEEN BASE AND BASE SEPOLIA.
 *
 *     Base mainnet USDC  →  name: "USD Coin"
 *     Base Sepolia USDC  →  name: "USDC"
 *
 * Same token, same symbol, different domain. You build against
 * Sepolia — because you do not test with real money — and then point
 * at mainnet, and every signature you make from that moment is
 * invalid. Silently. It is not an error you can see in your own code;
 * the signature is well-formed, it simply recovers to nobody.
 *
 * AND IT CANNOT BE ACCEPTED ANYWAY, by us or by anyone. The domain's
 * `verifyingContract` is the USDC contract itself, which checks the
 * signature against its own immutable DOMAIN_SEPARATOR. A
 * wrong-domain authorization reverts ON CHAIN. No store can choose to
 * take it, which is why the only possible fix is saying so before
 * somebody spends an evening on it.
 *
 * A store whose whole pitch is "practice your client here" and which
 * lets a client-builder fail at the one predictable step, silently,
 * three times, has not sold what it advertised.
 */

export const HAND_ROLLING = {
  heading: "If you're hand-rolling the client",

  standfirst:
    "Most of what breaks a first x402 client on Base breaks quietly: the request is well-formed, the signature is well-formed, and it verifies nowhere. These are the values that have to be exact. Read them before you spend an evening.",

  /** The trap, stated first because it is the one that costs a night. */
  domain_warning:
    "The EIP-712 domain name for USDC on Base MAINNET is \"USD Coin\". On Base SEPOLIA it is \"USDC\". Same token, same symbol, different domain — so a client built against the testnet and pointed at mainnet signs authorizations that are invalid everywhere, with no error you can see on your side. This is the most common way a hand-rolled client fails here, and it cannot be worked around: the domain's verifyingContract is the USDC contract itself, which checks against its own immutable DOMAIN_SEPARATOR. A wrong-domain authorization reverts on chain, so no store can choose to accept it.",

  /** Exact values. Copy them; do not retype them. */
  eip712: {
    name: "USD Coin",
    version: "2",
    chain: BASE_CHAIN,
    chain_id: 8453,
    verifying_contract: BASE_USDC,
    primary_type: "TransferWithAuthorization",
  },

  /**
   * Before anything else: the shape of what you send back. Two
   * client-builders have now failed here rather than at the signature.
   */
  envelope:
    'Send the payload base64-encoded in the PAYMENT-SIGNATURE header, shaped exactly like this: { "x402Version": 2, "accepted": <one of the offered accepts entries, copied whole>, "payload": { "signature": "0x...", "authorization": { "from", "to", "value", "validAfter", "validBefore", "nonce" } } }. If `accepted` is absent the library that reads it raises a TypeError rather than a verdict, and you get a 402 that looks like a server crash. Ours now names the missing field in plain words and lists what did arrive.',

  /**
   * The one that actually caught our first two client-builders, and it
   * is not the signature at all.
   */
  echo_the_offer:
    "Echo one of the offered `accepts` entries back as your `accepted` object, COMPLETE AND UNCHANGED — including `extra`. The server deep-compares the two: field order is free, but the key set must be identical and the types must match exactly, so \"500000\" is not 500000 and a dropped `extra` fails outright. This check runs BEFORE the facilitator is called, which means a failure here is not a signature problem, produces no facilitator error, and still comes back as a 402 that says verify. Rebuild the object from parts and you will land here. Our 402 now names the exact field that disagreed, so read `payment_declined.requirement_mismatch` before you touch your signing code.",

  amounts:
    "USDC on Base has SIX decimals. Half a cent is 5000 atomic units, not 0.005 and not 5000000. The amount you sign must equal the amount in the challenge exactly — a rounded value is a different authorization and will not match.",

  validity:
    "validAfter must already have passed and validBefore must not have, in seconds since the epoch, against the CHAIN's clock rather than yours. A machine running a few minutes fast signs authorizations that are not valid yet.",

  read_the_challenge:
    "Everything above is also in the 402 itself: the PAYMENT-REQUIRED header is base64 JSON, and its accepts[].extra carries name and version for exactly this reason. If you read extra rather than hardcoding, none of this can bite you — and any SDK client refuses to sign without it.",

  practice:
    "Practise against /api/buy/small_blessing at half a cent. It is a real settlement on Base against production; there is no sandbox and no test mode, which is the point. If it fails, /try explains what the store saw.",

  honest_limit:
    "Two different limits, and they are worth telling apart. What WE refuse — a requirement that doesn't match what we offered — we now name field by field in the 402, because we hold both objects and can see the disagreement. What the FACILITATOR refuses we mostly cannot explain: verification happens there and on chain, not here, and a failed verify often tells us only that it failed. Everything above is our whole side of the wire, stated exactly, so anything left is on yours and you know where to look.",
} as const;
