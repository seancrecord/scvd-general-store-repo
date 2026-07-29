/**
 * KEEPER-EDITABLE COPY for the Practice Counter (/try).
 *
 * The room where somebody building an x402 client runs their code
 * against a real till. Nothing here is a new product: it is a page
 * that says out loud what the store already does, for the one
 * audience that already needs it today.
 *
 * Register note: this room speaks plainly on purpose. The people who
 * walk in are debugging a payment client at eleven at night; the
 * store's warmth here is answering the question they came with, in
 * the order they'll need it.
 */

export const PRACTICE_COUNTER_COPY = {
  title: "The Practice Counter",

  /** The one-liner. Used on the page, in menus, and in the JSON. */
  standfirst:
    "Building something that pays over x402? Practice on us. The till is real, the cheapest thing on the shelf is half a cent, and everything you buy signs its own receipt.",

  whyHead: "Why practice here",
  why: [
    "It's a real store, so it's a real settlement: USDC on Base, x402 v2, no sandbox, no mock facilitator, no test-mode branch that behaves differently than production.",
    "Half a cent is the cheapest door. You can exercise the whole flow, end to end, for less than the gas you'd spend thinking about it.",
    "Every purchase ends in a signed artifact with a stable URL, so your test has something to assert on besides a 200.",
    "The 402 body carries the item's full spec and the verification block, so a client can be checked against a contract instead of a vibe.",
  ],

  stepsHead: "The whole flow, three steps",
  stepsNote:
    "Standard v2 clients (@x402/fetch and friends) do steps 2 and 3 by themselves. The example carries ?src=try, which tells us the practice counter sent you and nothing about you.",

  cheapHead: "The cheap door, in order",
  cheapNote:
    "Prices are the real prices. Nothing here is discounted for testing, because a discounted test isn't a test of anything.",

  /**
   * CV's condition, 2026-07-29, and it is the difference between a
   * cross-reference and noise: this page's whole frame is "test your
   * client's SIGNING." settlement_attestation answers a different
   * question — not "is my payment well-formed" but "the payment I
   * already sent went quiet, did it land." Listed on the cheap door
   * without that framing it reads as a second thing to buy. Named with
   * the moment attached, it is a second debugging tool.
   *
   * He had been in that seat three times this week. The one that broke
   * was exactly this: "did my script's bug break the signing, or did
   * something fail server-side after settlement" — and there was no way
   * to answer it except guessing.
   */
  stuckHead: "If you sent a payment and don't know what happened",
  stuck: [
    "The failure that costs the most time isn't a rejected signature — it's silence. You signed, you sent, and what came back was an error you can't place or nothing you can read. Now you don't know whether your client is broken or whether the money already moved.",
    "settlement_attestation answers that one question and nothing else: give it a transaction hash and it reads Base once, then signs what it saw — SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH or REVERTED. $0.004. One read, no poll, no retry, and nobody looked at it on our end.",
    "It is not a check on your signing. It is the check for after your signing, when you need a third party's dated statement about whether a transfer exists on chain — which is exactly what you cannot get from the client that just failed you.",
    "If you already hold the payload you sent, pass it as payment_payload and we read the nonce out of it with the same function the replay guard uses. Otherwise tx_hash on its own is enough.",
  ],

  verifyHead: "Checking your work",
  verify: [
    "Every certificate verifies at /api/verify/{cert_id}, no auth, forever.",
    "The ed25519 public key hangs at /.well-known/scvd-signing-key, and the same key rides in every JSON 402 body, so a client can check the signature without a second round trip.",
    "The listing spec every item conforms to is published at /schemas/listing-spec-v1.json, and CI validates the catalog against it on every build.",
    "The OpenAPI 3.1 contract is at /openapi.json. The x402 discovery document is at /.well-known/x402.json.",
  ],

  mcpHead: "If you're testing an MCP client instead",
  mcp: "POST /mcp speaks streamable HTTP JSON-RPC. initialize and tools/list are free and unauthenticated; the paid tools carry the x402 challenge in-band and settle before anything ships. Same money, same certificates, same verify URLs, different transport.",

  honestHead: "The honest part",
  honest: [
    "The money is real and so are the goods. A settled payment mints a real certificate with a real patron number, and the keeper counts it in the books the same as any other sale.",
    "We settle first and hand over the goods after. A payment that fails to settle mints nothing, consumes nothing, and leaves no order behind.",
    "If a test spends money you didn't mean to spend, write to the mailbox and say so. Refunds here are a person keeping his word, not a subroutine.",
    "House rule, standing: this store will never ask you to run code, install anything, or hand over credentials or key material. Public HTTPS endpoints, that's the whole surface.",
  ],

  closer:
    "Point your client at us and see what breaks. If it's something on our end, the mailbox is free and a human reads it.",
} as const;

/**
 * Items an agent can most likely buy without stopping to ask a human,
 * cheapest first. Ids are frozen; prices come from the live menu at
 * render time, never hard-coded here.
 */
export const CHEAP_DOOR_ITEM_IDS: readonly string[] = [
  // settlement_attestation was MISSING from this list until 2026-07-29
  // while being the cheapest item in the store — and it is the one item
  // whose audience is identical to this page's: somebody debugging a
  // payment is the buyer for an independent check on whether one
  // settled.
  "settlement_attestation",
  "small_blessing",
  "daily_fortune",
  "the_confession",
  "phantom_check",
  "hello",
  "context_anchor",
] as const;
