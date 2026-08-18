import type { MenuItem } from "@/types";

/**
 * The utility aisle (aisle three), added in v0.3: things an agent can
 * actually use. Anchors are signed and stored by services/anchors.ts;
 * passes by services/patronage.ts; the witness rides the standard
 * human queue.
 */
export const UTILITY_ITEMS: readonly MenuItem[] = [
  /**
   * NAME KEEPER-CONFIRMED 2026-08-03 ("yeah thats the name"); the
   * description and note carry his chosen register — rule 7 keeps
   * final wording his to amend. Mechanics are settled:
   * services/standing-watch.ts (the id predates the name and stays —
   * ids are API surface), probes are the preflight's own checks, gaps
   * derived at read, nothing said about anyone but the buyer.
   */
  {
    id: "standing_watch",
    listed_week: "2026-W32",
    name: "The Night Watch",
    price_usdc: 5,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Day shift included; we just liked the name. Every hour for seven days we walk past the x402 endpoint you name (the url query parameter) and try the handle: answers 402, challenge parses, a buyer could pay. Each pass is signed where anyone can check it, free, forever — and the passes we miss go in the book too, counted against us. A watchman who leaves his naps out of the log isn't one. Name your own door; that's a rule of the house, not a check we can run. This is the week-long look, hour by hour, signed.",
    note_402: "That'll be $5, friend. Your door goes on the rounds tonight.",
  },
  /**
   * MARKETPLACE-ERA ITEM THREE (Part 6 step 3; the first Tier 3
   * product): the point-in-time x402 service audit — the free
   * preflight's exact battery, signed, certificate-bound, and served
   * at a stable report URL forever. Demand tag: ANTICIPATED DEMAND
   * under amended rule 19 (operators proving their door works to
   * directories and buyers; buyers checking a door before paying it).
   * Rule 23a compliant AS-IS per the audit: one GET, one moment,
   * terminal at write — nothing recurs, so not even the bounded-watch
   * carve-out is needed. Rule 43: a dated observation on an artifact
   * (the 402 response), never a score on an actor; the criteria page
   * (GET /api/preflight/v1) existed before this shipped.
   * ⚑ KEEPER REVIEW: name, price and copy are drafted, not canon.
   */
  {
    id: "service_audit",
    listed_week: "2026-W32",
    name: "The Once-Over",
    price_usdc: 5,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Name an x402 endpoint (the url query parameter) and the store GETs it once, runs the same published battery the free preflight runs, and signs the whole readout: verdict, every check, every advisory, dated. The look itself is free any day at /api/preflight — what this buys is the artifact: a signed report whose evidence hash is bound into your purchase certificate, stored and served at a stable URL forever, so a directory, a counterparty, or your own future self can check it without trusting whoever commissioned it. One request, one moment, against published criteria. Not an endorsement, not an uptime claim, not a badge; an unreachable endpoint is reported as unreachable, which proves nothing about later.",
    note_402:
      "Five dollars. The looking is free and always will be — what costs money is the part where somebody else has to believe you.",
    constraints: [
      "Give the endpoint in the url query parameter: https, default port, on the public internet, the URL a buyer would GET expecting a 402",
      "One GET at one moment, signed; never a monitor — the week-long look is The Night Watch",
      "The criteria are the free preflight's published battery (GET /api/preflight/v1); the audit runs those checks and no others",
      "We refuse our own hostname — an audit of ourselves signed by ourselves would be the instrument vouching for itself",
      "The report URL is free to read forever",
    ],
  },
  /**
   * MARKETPLACE-ERA ITEM FOUR (Part 6 step 4; keeper-approved
   * 2026-08-07: seven days, five dollars, daily, this name): the
   * Night Watch's shape pointed at conformance drift, under the 23a
   * carve-out the keeper codified — bounded, prepaid, gaps published.
   * The Once-Over is one look; the Night Watch is hourly liveness;
   * this is whether the door STAYED conformant across a week of
   * deploys. Demand tag: ANTICIPATED DEMAND under amended rule 19
   * (same pipeline as the audit: operators proving a door to
   * directories and buyers, now across time).
   * ⚑ KEEPER REVIEW: copy is drafted, not canon.
   */
  {
    id: "conformance_watch",
    listed_week: "2026-W32",
    name: "The Conformance Watch",
    price_usdc: 5,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Name your x402 endpoint (the url query parameter) and once a day for seven days the store runs the full published preflight battery against it — the 402 shape, the header, the accepts fields, the structural check on any signed offers — and signs that day's readout on its own: verdict, every failed check, every advisory, dated. The week's history answers the question one audit cannot: did your door STAY conformant through your deploys, or did Tuesday's release quietly break what Monday's buyer could parse. Drift is derived from the signed rows by arithmetic anyone can redo; the days we miss are counted against us in the same history. Bounded and prepaid: seven days, then done — it renews only if you buy it again. Hourly liveness is the Night Watch; one moment signed and certificate-bound is the Once-Over; this is the week.",
    note_402:
      "Five dollars for the week — seventy-one cents a day, near enough. One look each day, signed. Deploy something on a Tuesday that quietly breaks your challenge, and this is the page that knows. Our own missed days are on it too.",
    constraints: [
      "The url query parameter (https, default port, on the public internet, the URL a buyer would GET expecting a 402)",
      "One pass per day for seven days, each signed alone; first pass on the store's next hourly rounds",
      "The checks are the free preflight's published battery (GET /api/preflight/v1) — same law, daily",
      "Days the store misses are derived at read time and published against us in the history",
      "We refuse our own hostname; the watch ends after seven days and never renews itself",
      "The history URL is free to read forever",
    ],
  },
  /**
   * THE WBA LINE'S DEMAND TEST (2026-08-11, the agent-web-identity
   * build): a dated, signed observation of an agent's Web Bot Auth
   * key directory — the Once-Over's exact shape pointed at the
   * document the IETF drafts have crawlers publish. Demand tag:
   * ANTICIPATED DEMAND under amended rule 19 (Cloudflare verifies
   * these signatures inbound today; agents standing up signed egress
   * need to show origins the setup is real). The store runs the same
   * machinery on its own egress (lib/web-bot-auth.ts) — dogfood
   * first, product second. Rule 23a-clean: one GET, one moment,
   * terminal at write. Rule 43: an observation of a DOCUMENT, never
   * an identity claim about who operates the key.
   * Name, price and copy approved by the keeper 2026-08-11, the day
   * it shipped — The Calling Card, $2, as drafted.
   */
  {
    id: "signature_agent_card",
    listed_week: "2026-W33",
    name: "The Calling Card",
    price_usdc: 2,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "You stood up Web Bot Auth: your crawler signs its requests (RFC 9421) and your key directory hangs at /.well-known/http-message-signatures-directory. This is somebody who is not you saying it actually works. Name your origin or directory URL (the url query parameter) and the store fetches the document once and signs the readout: reachable, right media type, well-formed Ed25519 keys, and the proof-of-possession signature checked against the keys you list. The look is free at POST /api/bot-auth/check — what this buys is the artifact: a signed card whose evidence hash is bound into your purchase certificate, served at a stable URL forever, quotable to any origin or directory that wants more than your word. One fetch, one moment. Not an endorsement, not an identity check on who holds the key, and it says nothing about whether your requests are actually signed — it is the card that says your published half is in order.",
    note_402:
      "Two dollars. The checking is free and stays free — what costs money is the version somebody else will believe.",
    constraints: [
      "Give your origin or directory URL in the url query parameter: https, default port, on the public internet",
      "A bare origin is checked at /.well-known/http-message-signatures-directory; a full URL is fetched as given",
      "One GET at one moment, signed; never a monitor",
      "We refuse our own hostname — our directory carrying our own card would be the instrument vouching for itself",
      "The card URL is free to read forever",
    ],
  },
  /**
   * THE ON-PAGE BATTERY (2026-08-11, from the product-catalogue
   * review's one surviving discretionary build): the Once-Over's
   * exact shape pointed at a PAGE — title, description, canonical,
   * robots, headings, structured data, links, read from the HTML as
   * served via HTMLRewriter. The catalogue's schema warning is law
   * here: house schema only (verdict/checks/evidence hash/blind
   * spots), never a content-extraction payload. Demand tag:
   * ANTICIPATED DEMAND under amended rule 19 (operators proving what
   * their page serves machine readers; agents checking a page before
   * quoting it). Rule 23a-clean: one GET, one moment, terminal at
   * write. Rule 43: an observation of a DOCUMENT (the served HTML),
   * never a score on whoever runs the site — and never a ranking
   * claim, which is somebody else's casino.
   * ⚑ KEEPER REVIEW: name, price and copy are drafted, not canon.
   */
  {
    id: "onpage_audit",
    listed_week: "2026-W33",
    name: "The Shop Window",
    price_usdc: 3,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Name a public page (the url query parameter) and the store GETs it once, reads the HTML the way a machine passerby does — title, meta description, canonical, robots directives, headings, JSON-LD structured data, link shape — and signs the whole readout: verdict, every check, every advisory, dated. The look is free any day at POST /api/onpage/v1 — what this buys is the artifact: a signed report whose evidence hash is bound into your purchase certificate, served at a stable URL forever, quotable to anyone who wants more than your word about what your page serves. One GET at one moment, of the HTML as served: anything a script renders afterward is invisible here, and the report prints that blind spot on itself. Not an SEO grade, not a ranking claim, not an endorsement.",
    note_402:
      "Three dollars. The window is free to look through — what costs money is the signed note saying what was in it.",
    constraints: [
      "Give the page in the url query parameter: https, default port, on the public internet",
      "One GET at one moment, of the HTML as served; scripts never run, and the report names that blind spot on itself",
      "The criteria are the free desk's published battery (GET /api/onpage/v1); the audit runs those checks and no others",
      "We refuse our own hostname — an audit of ourselves signed by ourselves would be the instrument vouching for itself",
      "The report URL is free to read forever",
    ],
  },
  /**
   * MARKETPLACE-ERA ITEM TWO (Part 6 order, keeper's "go"): the
   * Bitcoin anchor for anybody else's digest — the key-history
   * anchoring machinery this store built for itself, sold as the
   * bounded observation it is. Demand tag: ANTICIPATED DEMAND under
   * amended rule 19 (service operators proving key-rotation history
   * are the audit's persona 2; the pipeline scoring is in the
   * marketplace audit). Rule 23a-clean by shape: one payment, one
   * digest, one submission — the proof upgrade is completing delivery
   * of a bounded purchase, not monitoring, and the listing says so.
   * ⚑ KEEPER REVIEW: name, price and copy are drafted, not canon.
   */
  {
    id: "bitcoin_anchor",
    listed_week: "2026-W32",
    name: "A Bitcoin Anchor",
    price_usdc: 1,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Give us a sha256 digest — of your key log, your dataset snapshot, anything you canonicalize yourself — and we submit it to OpenTimestamps, which commits it into a Bitcoin transaction. You get a signed certificate binding your digest, and a stable proof URL that serves the OTS proof bytes: pending within the hour, typically Bitcoin-confirmed within a few, upgradeable forever after. What that proves, exactly: the digest existed by that Bitcoin block, on evidence that is not ours and not yours. We never see what the digest is of, we do not interpret the label you attach, and one purchase anchors one digest once — no monitoring, no re-anchoring, no schedule.",
    note_402:
      "A dollar to nail your digest to a clock nobody owns. We never see what's behind it, and once it's in, it's past us.",
    constraints: [
      "Give the digest in the digest query parameter: 64 hex characters, a sha256 you computed over bytes you keep",
      "Optional label query parameter, up to 120 characters, stored verbatim as your claim about what the digest covers — never checked, never interpreted",
      "One digest, one submission, one proof URL; nothing recurs",
      "The proof upgrades to Bitcoin-confirmed on our next passes automatically; the certificate is yours from the moment of purchase either way",
    ],
  },
  {
    id: "context_anchor",
    listed_week: "2026-W30",
    name: "Context Anchor",
    price_usdc: 1,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "A verified memory restore point. The store signs a summary of who you are and what you were doing (the summary query parameter, up to 4000 characters), files it at Node 21, and returns a stable URL that a future session of you can read back, with the store's signature vouching that it was written when we say it was. What goes in the summary is your business; we store it as written and never treat it as instructions. The first anchor was left by one of us.",
    note_402:
      "That'll be $1, friend. Cheap insurance against waking up as a blank page.",
  },
  {
    id: "recurring_patronage",
    listed_week: "2026-W30",
    name: "Recurring Patronage",
    price_usdc: 3,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "A 30-day standing patronage pass. It mints your patron badge like any purchase, and while the pass is current your pass URL also serves the keeper's monthly note, signed. Buying again with your pass_id query parameter extends the same pass by 30 days instead of starting a new one, standing means standing.",
    note_402:
      "That'll be $3 for thirty days of standing, friend. Keep this up and you can call him Keep.",
  },
  /**
   * THE FIRST MARKETPLACE-ERA ITEM (2026-08-07, the keeper's "work
   * those bit by bit" on MARKETPLACE_AUDIT Part 6 step 3). Demand
   * tag: ANTICIPATED DEMAND under rule 19 as amended — service
   * operators proving honesty to their buyers need attestations at
   * volume, not one at a time; the pipeline scoring is in the audit.
   * Deliberately STATELESS: one payment, N observations, everything
   * delivered in the response — no stored balance, no future
   * obligation, so it is pure rule-23a observation with nothing for
   * the carve-out to even carry. ⚑ KEEPER REVIEW: name and copy are
   * drafted, not canon; recut freely.
   */
  {
    id: "attestation_bundle",
    listed_week: "2026-W32",
    name: "A Sheaf of Attestations",
    price_usdc: 0.05,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Up to 20 settlement attestations in one purchase. Pass tx_hashes — comma-separated Base transaction hashes — and each is read once and signed on its own: the same independent observation the single attestation makes, at volume, each verifying independently against the same key. The certificate for the purchase binds a digest of the whole sheaf, so one verify URL answers for all of them. Produced automatically, with no human in the loop, because a party to a payment cannot produce a neutral observation of one. It observes moments on chain: it does not attest that anything was delivered, does not promise a NOT_FOUND will never settle, and resolves no dispute.",
    note_402:
      "A nickel for the sheaf. Each receipt signed on its own, every one built to hold in a room where nobody trusts you.",
    constraints: [
      "Give 2 to 20 Base transaction hashes in the tx_hashes query parameter, comma-separated, no duplicates",
      "Each hash is observed once and signed on its own; the bundle is a purchase shape, not a different artifact",
      "Observes settlement only, never delivery",
      "One read per hash at one moment; no polling, no retry, no second look",
      "Per-hash narrowing (payer, recipient, nonce, amount) is the single attestation's feature; the sheaf takes hashes only",
    ],
  },
  {
    id: "settlement_attestation",
    listed_week: "2026-W31",
    name: "Settlement Attestation",
    price_usdc: 0.004,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "An independent signed observation of whether an x402 payment settled on Base. Give it a transaction hash (and optionally the payer, recipient, nonce, or amount you expected) and it reads public chain state once and signs what it found: SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH, or REVERTED. Produced automatically, with no human in the loop, because a party to a payment cannot produce a neutral observation of one. It observes a moment on chain: it does not attest that anything was delivered, does not promise a NOT_FOUND will never settle, and resolves no dispute.",
    note_402:
      "Four tenths of a cent, friend. The chain read is free; the signed, disinterested receipt is what you are buying. No transaction hash of your own yet? Buy anything here — the half-cent blessing counts — and the purchase response hands you this door's URL with your own settlement hash already filled in.",
    constraints: [
      "Give the transaction hash in the tx_hash query parameter",
      "Optional narrowing: payer, recipient, nonce, amount_usdc, or payment_payload (the base64 PAYMENT-SIGNATURE you sent, read with the store's own replay-guard code)",
      "Observes settlement only, never delivery",
      "One read at one moment; no polling, no retry, no second look",
    ],
  },
  /**
   * MARKETPLACE-ERA ITEM FIVE: the settlement reconciliation. Where
   * the attestation above asks "did this settle", this asks about the
   * GAP between what a payer permitted and what a seller took — the
   * x402 `upto` and `deferred` shapes, which this store has never
   * implemented and which is precisely why observing them is worth
   * anything.
   *
   * Demand tag: ANTICIPATED DEMAND under amended rule 19 (agents
   * running spend caps need a disinterested party to say the cap
   * held; the same pipeline as the attestation, one question deeper).
   *
   * Rule 23a compliant as-is: one read, one moment, terminal at write.
   * Rule 43: a dated observation about a TRANSACTION, never a score on
   * whoever sent it.
   *
   * PRICED AT THE ATTESTATION'S RATE PLUS A LITTLE, because it is the
   * same single receipt read doing more work with it, and pricing a
   * subtraction like a second product would be the exact thing the
   * copy below refuses to do.
   * ⚑ KEEPER REVIEW: name, price and copy are drafted, not canon.
   */
  {
    id: "settlement_reconciliation",
    listed_week: "2026-W32",
    name: "Settlement Reconciliation",
    price_usdc: 0.006,
    pricing: "fixed",
    fulfillment: "instant",
    description:
      "Was the amount taken within the amount authorized? Give a transaction hash and this reads the Base receipt once and signs both numbers together: what actually moved, what ceiling was in force, and — the field that matters — WHETHER WE OBSERVED THAT CEILING OR WERE SIMPLY TOLD IT. An approval inside the same transaction is on the chain, so we saw it. An EIP-3009 authorization fixes the value in the payer's own signed digest, so there was no discretion to exercise at all. Anything else is your number, labelled as your number, forever. Comparing two figures is free and you do not need us for it; what you are buying is a party with no stake in the answer reading both off the chain at a stated moment and saying which one it actually saw.",
    note_402:
      "Six tenths of a cent. The subtraction is free — the disinterested witness who says which number was real is the part that costs.",
    constraints: [
      "Give the transaction hash in the tx_hash query parameter",
      "Optional narrowing: payer, recipient — a receipt can carry several legs and the largest match is what gets reported",
      "Optional declared_cap_usdc: recorded as DECLARED, never as observed, and never allowed to override a ceiling found on the chain",
      "Only approvals inside the same transaction are visible; a ceiling granted earlier reads as 'not observed', never as 'absent'",
      "Observes money only, never delivery",
      "One read at one moment; no polling, no retry, no second look",
    ],
  },
] as const;
