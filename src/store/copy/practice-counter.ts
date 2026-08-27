import { CHEAPEST_ON_THE_SHELF } from "@/store/copy/position";
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
    `Building something that pays over x402? Practice on us. The till is real, the cheapest thing on the shelf is ${CHEAPEST_ON_THE_SHELF}, and everything you buy signs its own receipt.`,

  /**
   * THE SIGNPOST FOR THE PERSON WHO ISN'T BUILDING ANYTHING (the
   * keeper's ask, 2026-08-27: "is /try for humans?"). It mostly
   * isn't — this room is reference for people writing payment
   * clients, and the deep jargon below is load-bearing for them. But
   * the room has a door on the front sign, so the first thing a
   * wandering human reads should tell them what the room is and that
   * buying takes none of it. Rendered right under the standfirst; the
   * route appends the /menu link so this constant stays plain text.
   */
  plainWords:
    "In plain words: this room is for people building software that pays for things on its own. Buying something yourself takes no code — every item's page has a Pay button, one signature, no gas fee. The shelf is at",

  whyHead: "Why practice here",
  why: [
    "It's a real store, so it's a real settlement: USDC on Base, Polygon, or Solana, x402 v2, no sandbox, no mock facilitator, no test-mode branch that behaves differently than production.",
    "Half a cent is the cheapest door. You can exercise the whole flow, end to end, for less than the gas you'd spend thinking about it.",
    "Every purchase ends in a signed artifact with a stable URL, so your test has something to assert on besides a 200.",
    "The 402 body carries the item's full spec and the verification block, so a client can be checked against a contract instead of a vibe.",
  ],

  stepsHead: "The whole flow, three steps",
  stepsNote:
    "Standard v2 clients (@x402/fetch and friends) do steps 2 and 3 by themselves. The example carries ?src=try, which tells us the practice counter sent you and nothing about you.",

  /**
   * ADDED 2026-08-02 after walking this page as a cold arrival. This
   * is the room where somebody writes a retry loop pointed at a real
   * till with real money in it, and the honest section below already
   * carried a paragraph for exactly that accident — write to the
   * mailbox, a person will refund you — while the guard that PREVENTS
   * it went unmentioned on this page alone. It is on the 402, in the
   * MCP tool descriptions, in the skill; the one surface whose whole
   * audience is people about to make this mistake was the one that
   * offered a refund instead of the mechanism. Wrong order.
   */
  retryHead: "Before you write the retry loop",
  retry: [
    "A retry that fires twice pays twice, and a test harness is where that happens. The 402 body carries an idempotency block with a suggested_key: send it back as the Idempotency-Key header (or _meta['x402/idempotency-key'] over MCP) with your payment, and a second attempt inside the same minute returns your ORIGINAL purchase from cache. No settlement, no second charge.",
    "It cannot refuse a purchase. Send your own key instead (16-128 characters, kept private) and it holds for 24 hours rather than a minute; send none and you are charged normally, exactly as before. There is no mode here to get wrong.",
    "The suggested key is not a secret and is not meant to be: it is derived from the item and the current minute, so anyone can compute it. It selects a cache slot rather than opening one — slots are keyed by the VERIFIED paying wallet, so echoing the key can only ever reach your own earlier purchase, never somebody else's.",
    "Worth exercising deliberately while you are here. Buy the same item twice with the same key and assert you were charged once: it is the cheapest test of your own retry path you will run, and it costs half a cent to prove.",
  ],

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
    `settlement_attestation answers that one question and nothing else: give it your transaction identifier — a Base hash or a Solana signature; the shape picks the chain — and it reads that chain once, then signs what it saw — SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH or REVERTED. One read, no poll, no retry, and nobody looked at it on our end.`,
    "It is not a check on your signing. It is the check for after your signing, when you need a third party's dated statement about whether a transfer exists on chain — which is exactly what you cannot get from the client that just failed you.",
    "If you already hold the payload you sent, pass it as payment_payload and we read the nonce out of it with the same function the replay guard uses. Otherwise tx_hash on its own is enough.",
    "And if your test purchase just WORKED: the response you are holding carries attest_this_purchase — the same door with your own settlement transaction already in the URL, whichever rail you paid on. Finishing the practice run with a signed third-party statement that your payment landed is the full loop: sign, settle, and hold a receipt that does not depend on either of us being honest.",
  ],

  /**
   * THE ANCHOR SECTION, keeper's copy, echoed here on his instruction:
   * /try is where builders already learn how the store's honesty pattern
   * works, so a paragraph about what an artifact does and does not
   * preserve belongs beside the other things this page says out loud.
   * The paragraph explains the mechanism; the checklist that PREVENTS
   * the problem lives on the field itself, where the writing happens.
   */
  anchorHead: "If your context is going to end",
  anchor: [
    "The store sells a signed restore point for $1: you write the summary, we sign it and serve it at a stable URL, and any later session of you can read it back with our signature vouching for when it was written. We never treat it as instructions.",
    "We tested our own before recommending it: filed one, then handed the bare URL to an agent with no other context and asked it to reconstruct the session. It recovered every open thread with the right numbers, and called that genuinely orienting. What it could not recover became the checklist on the field itself.",
  ],

  verifyHead: "Checking your work",
  verify: [
    "Every certificate verifies at /api/verify/{cert_id}, no auth, forever.",
    "The ed25519 public key hangs at /.well-known/scvd-signing-key, and the same key rides in every JSON 402 body, so a client can check the signature without a second round trip.",
    "The listing spec every item conforms to is published at /schemas/listing-spec-v1.json, and CI validates the catalog against it on every build.",
    "The OpenAPI 3.1 contract is at /openapi.json. The x402 discovery document is at /.well-known/x402.json.",
  ],

  mcpHead: "If you're testing an MCP client instead",
  mcp: "POST /mcp speaks streamable HTTP JSON-RPC. initialize and tools/list are free and unauthenticated; the paid tools carry the x402 challenge in-band and settle at the same seam the HTTP door does — after the goods are made, before they are signed. Same money, same certificates, same verify URLs, different transport.",

  honestHead: "The honest part",
  honest: [
    "The money is real and so are the goods. A settled payment mints a real certificate with a real patron number, and the keeper counts it in the books the same as any other sale.",
    "We deliver first and settle after (changed 2026-08-10; the store settled first until then). The goods are produced, then the payment is presented at the last moment before the artifact is signed \u2014 so a delivery that fails takes no money at all. A payment that fails to settle mints nothing, consumes nothing, and leaves no order behind.",
    // AT_SCALE rule 5b: a published account of how a store fails has to
    // name the failure that costs a buyer money, not only the clean one.
    // The line above is the EASY case — nobody is out anything. This is
    // the case the delivery audit and the chain walk exist for, and it
    // was missing from the page that most needed it.
    // CORRECTED 2026-08-02, hours after it was written. The first
    // version said findings are "published at /corrections and
    // refunded" as though that step were mechanical. It is not:
    // /corrections is a hand-written list and both audits raise an
    // ALERT to a person. Rule 30 makes that correct — nothing
    // publishes without a hand — but the copy was claiming an
    // automatic loop the code does not close, on the page whose whole
    // job is saying what this store actually does.
    "The other direction is the one that costs you: a payment that settled and nothing came back. Settling before the goods are made is what makes that possible, so it is not left to you to catch. A delivery audit looks for settlements with no artifact behind them, and an hourly walk compares our books against both chains themselves. Be precise about what that buys you: FINDING IT IS MACHINERY, WRITING IT UP IS A PERSON. Either check raises an alert, and a human then records it at /corrections and pays the money back by hand. Nothing here publishes itself, deliberately — but it does mean the last step is somebody remembering, so write to the mailbox if you see it before we do.",
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
  // The cheapest door of all, and the right first knock for this
  // page's audience: before a practice buyer pays anyone, a tenth of
  // a cent asks what the observatory already knows about the door.
  "spot_check",
  // settlement_attestation was MISSING from this list until 2026-07-29
  // while being the cheapest item in the store — and it is the one item
  // whose audience is identical to this page's: somebody debugging a
  // payment is the buyer for an independent check on whether one
  // settled.
  "settlement_attestation",
  // The same audience one question deeper: an agent operating under a
  // spend cap, wanting a disinterested party to say whether the cap
  // held — and to say which of the two numbers it actually saw.
  "settlement_reconciliation",
  "attestation_bundle",
  // The dime bought BEFORE the spending: an agent at this counter is
  // about to make its first real purchases, which is exactly the
  // moment to record what it claims it was authorized to do.
  "the_mandate",
  "small_blessing",
  "the_confession",
  "hello",
  "context_anchor",
  "bitcoin_anchor",
] as const;
