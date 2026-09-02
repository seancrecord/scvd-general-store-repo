import { FIELD_SPEND_CAP_USD } from "@/services/launch-check-terms";
import { CLIENT_CAP_READABLE, CLIENT_CAP_USD } from "@/lib/client-spend-cap";
import type { MenuItem } from "@/types";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

/**
 * THE GOOD BUYER'S PRICE IS DERIVED, AND THE DERIVATION IS THE ARGUMENT.
 *
 * This door's whole audience is stock clients that have not raised
 * their spend ceiling — that is the condition it exists to diagnose.
 * Priced anywhere above @x402/core's own ceiling it would refuse
 * exactly the buyers it was built for, silently, on their own
 * machines, while being the thing that would have told them why. A
 * door that teaches you to raise your cap has to be payable BEFORE
 * you have raised it, or it is a joke at the buyer's expense.
 *
 * So the price is not a number somebody liked. It is one cent under
 * the imported ceiling, computed from it: raise `$1` upstream and
 * this door follows without anyone remembering it had to. The
 * fallback exists for the case rule 52 covers — a ceiling the reader
 * cannot parse must not silently become a price, so the door keeps
 * the figure the shelf already carries for its cheap tier.
 */
const GOOD_BUYER_PRICE_USDC = CLIENT_CAP_READABLE
  ? Math.round((CLIENT_CAP_USD - 0.01) * 1e6) / 1e6
  : 0.99;

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
  /**
   * ⚑ KEEPER REVIEW (2026-09-01): one clause added to the description —
   * "Where the money goes is watched, though…" — because the watch now
   * reports payTo movement (summary.payto_changes) and the listing said
   * nothing about where the money goes. Capability stated, his words to
   * recut.
   */
  {
    id: "standing_watch",
    listed_week: "2026-W32",
    name: "The Night Watch",
    subtitle: "seven days of signed hourly probes on your x402 endpoint",
    sample_url: "/samples/night-watch.json",
    price_usdc: 5,
    pricing: "fixed",
    cadence: "term",
    reads: "subject_fetch",
    term_days: 7,
    fulfillment: "instant",
    description:
      "Day shift included; we just liked the name. Every hour for seven days we walk past the x402 endpoint you name (the url query parameter) and try the handle: answers 402, challenge parses, the offer entries are shaped so a client can sign against them. Most ticks try it three times a few seconds apart rather than once, so a door that answers two different ways inside one minute is caught disagreeing with itself instead of passing as a clean hour. Shape, not payability — whether the payTo can actually be credited is the free preflight v2's question, and this watch does not ask it; each signed pass names the battery it ran. Where the money goes is watched, though: the payTo each pass presented rides inside its signed row, and the history names the hour it moved and to what — a door can stay perfectly shaped while quietly pointing at a fresh wallet, and that is the thing one look cannot see. Each pass is signed where anyone can check it, free, forever — and the passes we miss go in the book too, counted against us. A watchman who leaves his naps out of the log isn't one. Name your own door; that's a rule of the house, not a check we can run. This is the week-long look, hour by hour, signed.",
    note_402: "That'll be $5, friend. Your door goes on the rounds tonight.",
  },
  /**
   * THE GOOD BUYER (#96, keeper-approved 2026-08-28: "I definitely
   * think we should offer this"). The buyer-side artifact, and the
   * first thing on this shelf that is about the PURCHASER rather than
   * about somebody else's door.
   *
   * WHY IT IS A SEPARATE PRODUCT rather than a field on the audit:
   * folding a payability reading into service_audit changes what that
   * battery counts, which renames the criteria on every artifact this
   * store has ever signed under it. That is the keeper's call (#82 is
   * the standing example of what happens when two instruments start
   * disagreeing in public), not a side effect of adding a check. This
   * answers its own question and points at the others.
   *
   * Rule 23a-clean: one GET, one replay, terminal at write — nothing
   * recurs. Rule 43: a dated observation on an artifact (the accepts
   * as served), never a score on the operator or on the buyer. The
   * buyer's declared client configuration is recorded as THEIR claim,
   * printed as such, never verified — this store cannot see a
   * stranger's machine and will not sign as though it could.
   */
  {
    id: "good_buyer",
    listed_week: "2026-W35",
    name: "The Good Buyer",
    price_usdc: GOOD_BUYER_PRICE_USDC,
    pricing: "fixed",
    cadence: "one_off",
    reads: "subject_fetch",
    fulfillment: "instant",
    description:
      "Name an x402 door you are about to pay (the url query parameter) and the store knocks once, writes down the accepts exactly as that door served them, and replays the stock x402 client's own selection over them — the default-asset filter, the per-payment ceiling, prefer-authorization, then the first survivor. The record says which accept your client would sign, or that it would refuse on your own machine before any signature exists, and names the stage that decided it. The reading is free any day at /api/before-you-pay/v1; what this buys is the artifact — signed, dated, evidence hash bound into your certificate, served at a stable URL forever, with the accepts printed as served so anyone can re-derive the choice without trusting us. For the human who later asks why the money went where it went. Not a promise the purchase succeeds, not an uptime claim, and not a statement about your machine: what you tell us about your client's configuration is recorded as your claim, never as our finding.",
    note_402:
      "Under a dollar, deliberately — the whole point is that a client which cannot pay a dollar can still afford to be told why.",
    constraints: [
      "Give the door in the url query parameter: https, default port, on the public internet, the URL a buyer would GET expecting a 402",
      "Optional: max_usd, your client's maxAmountPerPayment in dollars, and no_spend_controls=true if you pass spendControls: false. Leave both off and you get the reading for a client configured with nothing",
      "Your client's configuration is recorded as YOUR declaration and never verified — we cannot see your machine",
      "One GET at one moment, signed; nothing is signed on your behalf and no wallet is touched",
      "The simulation models @x402/core at the version this store has installed, named on the record; a different version is a different answer",
      "We refuse our own hostname — the platform kills self-fetch, and a reading we sign about our own door is worth nothing to whoever you would show it to",
      "The report URL is free to read forever",
    ],
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
   */
  {
    id: "service_audit",
    listed_week: "2026-W32",
    name: "The Once-Over",
    subtitle: "one signed check of your x402 endpoint, at a permanent URL",
    price_usdc: 5,
    pricing: "fixed",
    cadence: "one_off",
    reads: "subject_fetch",
    fulfillment: "instant",
    description:
      "Name an x402 endpoint (the url query parameter) and the store GETs it once, runs the published preflight battery, and signs the whole readout: the current v2 verdict this series now cites (the same battery the weekly census applies), the same probe scored under the frozen v1 battery beside it (the two can disagree, and the report says when they do), every check, every advisory, dated. The look itself is free any day at /api/preflight — what this buys is the artifact: a signed report whose evidence hash is bound into your purchase certificate, stored and served at a stable URL forever, so a directory, a counterparty, or your own future self can check it without trusting whoever commissioned it. One request, one moment, against published criteria. Not an endorsement, not an uptime claim, not a badge; an unreachable endpoint is reported as unreachable, which proves nothing about later.",
    /* #31: the free specimen, so nobody buys a document sight unseen. */
    sample_url: "/samples/once-over.json",
    note_402:
      "Five dollars. The looking is free and always will be — what costs money is the part where somebody else has to believe you.",
    constraints: [
      "Give the endpoint in the url query parameter: https, default port, on the public internet, the URL a buyer would GET expecting a 402",
      "One GET at one moment, signed; never a monitor — the week-long look is The Night Watch",
      "The cited criteria are the v2 battery (GET /api/preflight/v2), the same battery the weekly census applies; also_under carries the frozen v1 score so a reader can see the overlap. Reports signed before 2026-09-01 cite v1 and keep that citation forever",
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
   */
  {
    id: "conformance_watch",
    listed_week: "2026-W32",
    name: "The Conformance Watch",
    subtitle: "seven days of signed daily checks on your x402 endpoint",
    sample_url: "/samples/conformance-watch.json",
    price_usdc: 5,
    pricing: "fixed",
    cadence: "term",
    reads: "subject_fetch",
    term_days: 7,
    fulfillment: "instant",
    description:
      "Name your x402 endpoint (the url query parameter) and once a day for seven days the store runs the published preflight battery (v1, the frozen structural series — the battery each signed pass names inside its own bytes) against it — the 402 shape, the header, the accepts fields, the structural check on any signed offers in either placement — and signs that day's readout on its own: verdict, every failed check, every advisory, dated. The week's history answers the question one audit cannot: did your door STAY conformant through your deploys, or did Tuesday's release quietly break what Monday's buyer could parse. Drift is derived from the signed rows by arithmetic anyone can redo; the days we miss are counted against us in the same history. Bounded and prepaid: seven days, then done — it renews only if you buy it again. Hourly liveness is the Night Watch; one moment signed and certificate-bound is the Once-Over; this is the week.",
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
    price_usdc: 0.99,
    pricing: "fixed",
    cadence: "one_off",
    reads: "subject_fetch",
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
   */
  {
    id: "onpage_audit",
    listed_week: "2026-W33",
    name: "The Shop Window",
    price_usdc: 3,
    pricing: "fixed",
    cadence: "one_off",
    reads: "subject_fetch",
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
   * THE LAUNCH CHECK (2026-08-19, first build off the keeper-approved
   * backlog): the walkabout productized for ONE door — a real mainnet
   * purchase attempt of the buyer's own endpoint, from the declared
   * field wallet, under WALKABOUT.md rules, recorded stage by stage
   * and signed. Demand tag: OBSERVED DEMAND — the August field run
   * measured 71% of payment attempts failing across the walkable
   * Bazaar, and the seller has no buyer's-eye view of their own door.
   * Rule 23a-clean: one attempt, one moment, terminal at write; never
   * a retry loop. Rule 43: a dated observation of ONE TRANSACTION —
   * an unpaid verdict is framed as this store's rules, never the
   * seller's failing; no badge, no score, and x402station's $1 badge
   * is the counterexample the copy is written against.
   */
  {
    id: "launch_check",
    listed_week: "2026-W34",
    name: "The Launch Check",
    subtitle: "a real paid purchase against your endpoint, signed, before you announce it",
    sample_url: "/samples/launch-check.json",
    price_usdc: 5,
    pricing: "fixed",
    cadence: "one_off",
    reads: "subject_purchase",
    fulfillment: "instant",
    description:
      "Name your x402 endpoint (the url query parameter) and this store walks it the way a paying stranger does: one unpaid GET with our declared field-research User-Agent, your 402 challenge read the way a real buyer reads it, the cheapest Base rail chosen, the payTo screened, a real EIP-3009 authorization signed by our declared field wallet, presented, and whatever happens next written down — settled or refused, receipt returned or absent, goods delivered or an empty 2xx. Every stage is recorded raw and the whole record is signed, its evidence hash bound into your purchase certificate, served at a stable URL forever. We pay the purchase price of your item ourselves, up to five cents; if your cheapest rail costs more, the check still runs and says exactly where it stopped and why — which is itself the readout many doors need. Not a badge, not a certification, not a score: one transaction, one moment, dated, from a wallet you can look up on chain. Hand us the settlement hash and the walk now says whether the chain itself confirms, contradicts, or cannot see your claim \u2014 claimed, confirmed_on_chain, contradicted, or unverifiable_shape, stated beside the verdict rather than folded into it.",
    note_402:
      "Five dollars, and we spend our own nickel at your till. What you get is the thing almost no seller has: your buy path, walked for real, written down by the buyer.",
    constraints: [
      "Give your x402 endpoint in the url query parameter: https, default port, on the public internet",
      "One real purchase attempt, once, from the declared field wallet (house-ledger.json) — never a retry loop, never a monitor",
      `We pay at most $${FIELD_SPEND_CAP_USD.toFixed(2)} at your till; a costlier cheapest rail gets a signed record of exactly where the check stopped instead of a payment`,
      "The payTo is sanctions-screened before any payment, and no screen means no payment — the rule fails closed",
      "We refuse our own hostname — a settlement report about our own till, signed by us, would be the instrument vouching for itself",
      "The check URL is free to read forever; the settlement, if one happens, is permanently on chain either way",
    ],
  },
  /**
   * THE STATEMENT (2026-08-19, second build off the keeper-approved
   * backlog): a bank statement for an agent's wallet, from somebody
   * who is not the agent — every USDC transfer in and out of one Base
   * address over a stated block window, read off the chain, counted,
   * summed, signed. Demand tag: OBSERVED DEMAND — the field run's own
   * reconciliation found 180 settlements (10.5% of attempts) the
   * buying client recorded as failures; agents' self-reports drift
   * and the chain does not, and S.5051 points NIST at exactly this
   * kind of auditable record. Rule 23a-clean: two bounded reads, one
   * moment, terminal at write. Rule 43 by construction: counts and
   * sums, never a judgment — we never see the agent's own ledger, so
   * no comparison is even possible from here.
   */
  /**
   * THE OPENING DAY (roadmap S3, the keeper's price and name,
   * 2026-09-01): the merchant kit as a bundle, not a brand. One
   * launch check, then seven days of conformance watch on the same
   * door, then the passport page — three things this store already
   * sells, under one certificate and one URL a merchant can hand to a
   * directory. Bought apart they are $10 and a receipt each. No second
   * battery, no new primitive: the launch walk is performLaunchCheck,
   * the week is startConformanceWatch, the passport is the census's.
   */
  {
    id: "opening_day",
    listed_week: "2026-W36",
    name: "The Opening Day",
    subtitle: "one launch check, seven days of conformance watch, and your passport page, at one URL",
    price_usdc: 9,
    pricing: "fixed",
    cadence: "term",
    term_days: 7,
    reads: "subject_purchase",
    fulfillment: "instant",
    description:
      "Name your x402 endpoint (the url query parameter) and three things happen under one certificate. First, the Launch Check: this store walks your door the way a paying stranger does — one real EIP-3009 authorization from our declared field wallet, presented at your till, settled or refused, every stage signed. Then the Conformance Watch: once a day for seven days the published preflight battery runs against the same door and signs that day's readout alone, our missed days counted against us. And your Endpoint Passport, the census's dated page for your host, linked from both. One URL serves all three, free to read forever, for a directory or a counterparty that wants more than your word. Bought apart these cost ten dollars and come as a receipt each. Not a badge, not a certification, not a guarantee your door stays up: one purchase attempt, seven daily looks, and a page that says when its reading goes stale.",
    /* #31: the free specimen of the walk half. */
    sample_url: "/samples/once-over.json",
    note_402:
      "Nine dollars for opening day: we buy from your till once, watch the door for a week, and put the passport beside both. Bought apart it is ten, and a receipt each.",
    constraints: [
      "Give your x402 endpoint in the url query parameter: https, default port, on the public internet",
      "The launch check is one real purchase attempt from the declared field wallet, once — never a retry loop",
      `We pay at most $${FIELD_SPEND_CAP_USD.toFixed(2)} at your till; a costlier cheapest rail gets a signed record of exactly where the check stopped instead of a payment`,
      "The payTo is sanctions-screened before any payment, and no screen means no payment — the rule fails closed",
      "The watch is one pass a day for seven days, each signed alone; it ends after seven days and never renews itself",
      "We refuse our own hostname — a report about our own till, signed by us, would be the instrument vouching for itself",
      "The bundle URL, the check URL and the watch history are free to read forever",
    ],
  },
  /**
   * THE COMPANY AN ADDRESS KEEPS (roadmap N4; the G2 ruling's tier-3
   * lane; K3 price ruled 2026-08-29; shelf copy the keeper's, approved
   * 2026-09-01). The named join the public tiers withhold, delivered
   * to the buyer inside a signed artifact and never published. Free
   * for an operator asking about their own address, once proved; the
   * free answer ends with the consent offer. Spec:
   * docs/PROVENANCE_CHECK_SPEC_2026-08.md.
   */
  {
    id: "provenance_check",
    listed_week: "2026-W36",
    name: "The Company an Address Keeps",
    subtitle: "which doors advertised this receiving address, and when — signed, from the public chain",
    price_usdc: 5,
    pricing: "fixed",
    cadence: "one_off",
    reads: "our_books",
    fulfillment: "instant",
    description:
      "Which doors have advertised this receiving address, and when: the hosts, the signed weeks, each week's verdict, drift in the door's own terms, and the snapshot digest behind every line. Rebuild it from the public chain without our word. No judgment: shared addresses are ordinary, custodians are common, and this store does not grade operators. Your own address is free once you prove it is yours (GET /api/provenance/self for the challenge), and that free reading ends with an offer to publish it, which you may decline.",
    note_402:
      "Five dollars for somebody else's address. Nothing for your own, once you have proved it is your own.",
    constraints: [
      "Give the receiving address in the address query parameter: an EVM address (0x + 40 hex) or a Solana pubkey (base58)",
      "Reads the signed chain and nothing else — no request is made to any door, and nothing private feeds it",
      "Delivered to you and never published; no operator field, no score, no identity assertion — pairings and dates only",
      "The subject's standing note rides the artifact verbatim, beside the observation, never instead of it",
      "An address the chain has never seen returns never_seen, which is the answer you paid for",
      "Your own address: GET /api/provenance/self?address= for the challenge, POST it back signed (EIP-191), and the same answer is free",
    ],
  },
  {
    id: "the_statement",
    listed_week: "2026-W34",
    name: "The Statement",
    price_usdc: 0.99,
    pricing: "fixed",
    cadence: "one_off",
    reads: "chain_read",
    fulfillment: "instant",
    description:
      "Name an EVM wallet (the wallet query parameter — yours, your agent's, a counterparty's; all the same to the chain) an optional window in hours, and optionally which rail (network=eip155:137 for Polygon; Base is the default), and the store reads every USDC transfer in and out of it over that window, straight off the chain: counts, totals, and the transfers themselves, each with its transaction hash, counterparty, amount, and block. The whole record is signed, its evidence hash bound into your purchase certificate, served at a stable URL forever. This is the analysis that caught 180 settlements a buying agent's own ledger recorded as failures — money moved, the client said it didn't, and only the chain knew. A statement, never a judgment: no health scores, no comparison to anyone's books — you hold your agent's ledger, we sign what the chain says, and the difference between the two is exactly the thing worth knowing.",
    note_402:
      "Two dollars. Your agent says what it spent; the chain says what moved. This is the chain's side, signed.",
    constraints: [
      "Give the wallet in the wallet query parameter: a 0x EVM address. USDC on Base by default, or Polygon with network=eip155:137 — one chain per statement, named on the artifact; other assets and chains are outside it and it says so on itself",
      "The window is hours back from the chain head: default 6, maximum 11 — the block range on the artifact is the entire coverage claim",
      "Counts and totals always cover the whole window; the per-transfer lists carry at most 200 rows per direction and state how many",
      "Two bounded chain reads at one moment; never a monitor, never a subscription",
      "A window the RPC refuses becomes a signed window_unreadable statement — a fact about our read, not about the wallet",
      "The statement URL is free to read forever",
    ],
  },
  /**
   * THE MANDATE (2026-08-19, third build off the keeper-approved
   * backlog): the receipt chain's reserved first link, built — a
   * signed, dated, third-party-held record of what an agent claims it
   * was authorized to do, recorded BEFORE it acts, citable on every
   * later purchase here via mandate_id (which the buy door resolves
   * before charging, so the link never dangles). Demand tag: the
   * S.5051/NIST delegation-proof rail — prior art running before the
   * standard exists. Rule 23a-clean: one record, terminal at write.
   * The register is the product: chain-of-custody, never
   * truth-of-intent, and the artifact says so on itself.
   */
  {
    id: "the_mandate",
    listed_week: "2026-W34",
    name: "The Mandate",
    price_usdc: 0.1,
    pricing: "fixed",
    cadence: "one_off",
    reads: "made_here",
    fulfillment: "instant",
    description:
      "Before your agent spends a cent, write down what it's authorized to do — and have somebody who is neither the agent nor its human hold the record. Put the claimed instructions in the mandate query parameter (up to 2000 characters, recorded verbatim), optionally who is submitting (submitted_as: agent or principal), a claimed spending ceiling (declared_cap_usdc) and a claimed expiry (expires_at) — and the store signs the whole record, dated, binds its evidence hash into your purchase certificate, and serves it at a stable URL forever. Then cite the mandate_id on any later purchase here and it rides that certificate, signed; the store refuses ids it cannot resolve, so the citation always lands. Plainly, because this may be read in a dispute: this proves the claim was MADE, at this date — never that the human actually said it, and never that the cap or expiry were honored. Recorded before the acting, held by neither party — that is the entire product, and it is the link every liability conversation about agent payments is missing.",
    note_402:
      "A dime. The cheapest thing on this shelf is the one you buy before anything goes wrong, which is exactly why nobody does.",
    constraints: [
      "Put the claimed instructions in the mandate query parameter, up to 2000 characters — recorded verbatim, never interpreted, never read as instructions to us",
      "submitted_as is a claim (agent or principal, default agent); the record proves the claim was made, never that it was true — chain-of-custody, not truth-of-intent",
      "declared_cap_usdc and expires_at are declared claims: recorded, never enforced by this store, and the record says so",
      "Cite the id on later purchases with mandate_id=m_…; an id this store cannot resolve is refused before any charge",
      "The record URL is free to read forever",
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
   */
  {
    id: "bitcoin_anchor",
    listed_week: "2026-W32",
    name: "A Bitcoin Anchor",
    price_usdc: 1,
    pricing: "fixed",
    cadence: "one_off",
    reads: "made_here",
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
    cadence: "one_off",
    reads: "made_here",
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
    cadence: "term",
    reads: "made_here",
    term_days: 30,
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
   * the carve-out to even carry.
   */
  {
    id: "attestation_bundle",
    listed_week: "2026-W32",
    name: "A Sheaf of Attestations",
    price_usdc: 0.05,
    pricing: "fixed",
    cadence: "one_off",
    reads: "chain_read",
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
  /**
   * THE SPOT CHECK (roadmap 0.17, keeper-signed 2026-08-26: name,
   * price, and copy are his call, made). Area J's gate shipped early
   * on existing data: the routine pre-transaction question answered
   * from KV alone, at the cheapest price on the shelf — which the
   * derived floor then advertises on every surface. Rule 43: dated
   * observations, never a score. Rule 52: not_observed is an answer
   * about our books, never a verdict about the host.
   */
  {
    id: "spot_check",
    listed_week: "2026-W35",
    name: "Spot Check",
    price_usdc: 0.001,
    pricing: "fixed",
    cadence: "one_off",
    reads: "our_books",
    fulfillment: "instant",
    description:
      "Name a host and get what this observatory already holds on it, signed: corpus rounds and verdicts as recorded, when we last actually knocked, our coverage of the window since we met it, and the gaps with their reasons. Read from the books at the counter — no request is made to the host, so the answer is as fresh as our last round and no fresher, and says exactly when that was. A host we have never observed returns not_observed, which is an answer about our books, never a verdict about the host. The same facts serve free at /corpus/host/{host}.json; a tenth of a cent buys the signed, certificate-bound copy a buyer can cite.",
    note_402:
      "A tenth of a cent for whatever's already on the card. We don't go and look — this is what the shop already saw, dated, with the blanks left blank.",
    constraints: [
      "Give the host in the host query parameter: a bare hostname, e.g. example.com",
      "Reads what we already recorded — no request is made to the subject",
      "A host we've never met returns not_observed, which is an answer",
      NEVER_A_RANKING_SENTENCE,
      "Want a live read instead? The preflight at /api/preflight/v2 is free and knocks right now",
    ],
  },
  {
    id: "settlement_attestation",
    listed_week: "2026-W31",
    name: "Settlement Attestation",
    sample_url: "/samples/settlement-attestation.json",
    price_usdc: 0.004,
    pricing: "fixed",
    cadence: "one_off",
    reads: "chain_read",
    fulfillment: "instant",
    description:
      "An independent signed observation of whether an x402 payment settled — on Base, Polygon or Solana, and the identifier's own shape picks the rail: a 0x hash names an EVM transaction rather than a chain, so it is read on Base and then on Polygon; a base58 signature reads Solana. Give it the transaction (and optionally the payer, recipient, nonce, or amount you expected) and it reads public chain state once and signs what it found: SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH, or REVERTED. Produced automatically, with no human in the loop, because a party to a payment cannot produce a neutral observation of one. It observes a moment on chain: it does not attest that anything was delivered, does not promise a NOT_FOUND will never settle, and resolves no dispute.",
    note_402:
      "Four tenths of a cent, friend. The chain read is free; the signed, disinterested receipt is what you are buying. An EVM hash (read on Base, then Polygon) or a Solana signature — the shape picks the rail. No transaction of your own yet? Buy anything here — the half-cent blessing counts — and the purchase response hands you this door's URL with your own settlement transaction already filled in, whichever rail you paid on.",
    constraints: [
      "Give the transaction in the tx_hash query parameter: an EVM hash (0x + 64 hex, read on Base and then Polygon) or a Solana signature (base58) — the shape picks the rail",
      "Optional narrowing: payer, recipient, nonce (EVM rails only — refused beside a Solana signature), amount_usdc, or payment_payload (the base64 PAYMENT-SIGNATURE you sent, read with the store's own replay-guard code)",
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
   */
  {
    id: "settlement_reconciliation",
    listed_week: "2026-W32",
    name: "Settlement Reconciliation",
    price_usdc: 0.006,
    pricing: "fixed",
    cadence: "one_off",
    reads: "chain_read",
    fulfillment: "instant",
    description:
      "Was the amount taken within the amount authorized? Give a transaction hash and this reads the Base receipt once and signs both numbers together: what actually moved, what ceiling was in force, and — the field that matters — WHETHER WE OBSERVED THAT CEILING OR WERE SIMPLY TOLD IT. An approval inside the same transaction is on the chain, so we saw it. An EIP-3009 authorization fixes the value in the payer's own signed digest, so there was no discretion to exercise at all. Anything else is your number, labelled as your number, forever. Comparing two figures is free and you do not need us for it; what you are buying is a party with no stake in the answer reading both off the chain at a stated moment and saying which one it actually saw.",
    note_402:
      "Six tenths of a cent. The subtraction is free — the disinterested witness who says which number was real is the part that costs.",
    constraints: [
      "Give the Base transaction hash (0x + 64 hex) in the tx_hash query parameter. This desk reads Base only, deliberately: the ceilings it reconciles (EIP-3009 authorizations) are a Base facility",
      "Optional narrowing: payer, recipient — a receipt can carry several legs and the largest match is what gets reported",
      "Optional declared_cap_usdc: recorded as DECLARED, never as observed, and never allowed to override a ceiling found on the chain",
      "Only approvals inside the same transaction are visible; a ceiling granted earlier reads as 'not observed', never as 'absent'",
      "Observes money only, never delivery",
      "One read at one moment; no polling, no retry, no second look",
    ],
  },
  /**
   * THE CASE FILE (roadmap N8, 2026-09-02, the keeper's prompt): one
   * signed artifact over one purchase, assembled for the human who has
   * to decide what went wrong, from the observations this store already
   * sells one at a time. Never a verdict. ⚑ price is his ($0.25: the
   * parts are under a dime; the rest is the assembly).
   */
  {
    id: "the_case_file",
    listed_week: "2026-W36",
    name: "The Case File",
    price_usdc: 0.25,
    pricing: "fixed",
    cadence: "one_off",
    reads: "chain_read",
    fulfillment: "instant",
    sample_url: "/samples/case-file.json",
    description:
      "Give a transaction hash and this assembles, at one moment and under one signature, everything this store already observed about that purchase: a fresh settlement attestation; the reconciliation of amount taken against ceiling in force (EVM); the mandate you cite, its declared cap printed beside the settled amount and never enforced; the door over the seven days around the transaction — corpus rounds, any watch rows, the passport tier at the time — or not_observed, which is an answer about our books; and delivery, if you hold a launch check or this store itself was the seller, otherwise 'delivery not observed by this store' in full weight, because that is the section a dispute usually turns on and we usually do not have it. Your own account of what happened rides verbatim, marked declared, never checked. Every absent section is listed with its reason and counted against us. It says what was observed and what was not; it never says who was wronged. If this store is a party to the purchase, the file says so on its face and still assembles.",
    note_402:
      "A quarter. The parts are under a dime apiece; the rest is the assembly, and the assembly is the point — one URL a human can hand to the other side.",
    constraints: [
      "Give the transaction hash in the tx_hash query parameter: 0x + 64 hex for Base or Polygon, a base58 signature for Solana — the shape picks the chain",
      "Optional: mandate_id, url (the endpoint paid), payer, recipient, expected_amount_usdc, launch_check_id",
      "Optional claim: your own account, up to 1000 characters, stored verbatim and marked declared — never checked, never allowed to change an observed field",
      "Same tx_hash and mandate_id inside 24 hours returns the same case file, not a second charge for a second assembly",
      "Reconciliation is EVM only; a Solana purchase gets that section as absent, with the reason",
      "No verdict, ever: the file never says who was wronged, at fault, or liable",
    ],
  },
  /**
   * THE REFRESH (2026-08-21, the keeper's "both" ruling off the
   * passport strategy talk): the paid fresh check for an endpoint
   * passport. Uses the CENSUS'S OWN probe — not the audit battery —
   * so buyer-commissioned observations stay byte-comparable with the
   * weekly ones; the full named-criteria report remains
   * service_audit's different job (consolidation law held). Payment
   * buys the check, never the grade: a refresh that finds the door
   * broken flips the passport to refuse and the chip to dark, and
   * every surface says so before the coin drops.
   * Price ($1) KEEPER-CONFIRMED 2026-08-21 ("fine at $1 for now") and
   * FINAL from 2026-08-29 — asked whether the "for now" should stand,
   * he ruled "$1 final". The provisional clause is struck rather than
   * left hanging: a price that has been ruled twice is not a draft,
   * and copy that keeps saying "for now" after the now arrived is the
   * kind of hedge rule 10 exists to date. ⚑ marks his call.
   */
  {
    id: "passport_refresh",
    listed_week: "2026-W34",
    name: "The Refresh",
    price_usdc: 1,
    pricing: "fixed",
    cadence: "one_off",
    reads: "subject_fetch",
    fulfillment: "instant",
    description:
      "One fresh observation of your x402 endpoint by the weekly census's own instrument, right now instead of next Sunday — folded into your endpoint passport wherever it is newest, which moves the passport's freshness state (and the free embeddable chip that decays with it) back to fresh. Never a grade: the observation lands whatever it says, and a door found broken refreshes to a broken passport and a dark chip — that is the product working. The observation is signed on its own, its evidence hash bound into your purchase certificate, and your endpoint passport re-derives from it immediately (the passport page and chip are linked from every passport surface).",
    note_402:
      "A dollar for a fresh look. The check is bought; the verdict never is.",
    constraints: [
      "Give your endpoint in the url query parameter: https, default port, on the public internet. We refuse our own hostname",
      "The probe is the census's: one GET, Web Bot Auth signed, byte-comparable with the weekly rounds",
      "The newest observation wins in BOTH directions — a broken finding turns the chip off",
      "One observation at one moment; the standing version is conformance_watch, a different item",
      "The passport and chip stay free to read forever; this buys only the freshness",
    ],
  },
  /**
   * THE HOSTED PROFILE (2026-08-21, keeper-ruled: "why not right? we
   * can always remove them"): the store's first recurring door. x402
   * has no subscriptions, so "monthly" is an EXPIRING artifact — 30
   * days a purchase, renewal extends from whichever is later, now or
   * the current term's end. The page derives from the same signed
   * corpus everyone reads free and stays honest in both directions: a
   * host that breaks mid-term shows broken on its own profile, and
   * only in-term ready-side hosts appear on the index (the consent
   * line, everywhere).
   */
  {
    id: "trust_profile",
    listed_week: "2026-W34",
    name: "The Hosted Profile",
    /*
     * $21, the keeper's number, ruled 2026-08-29. It stood at $19 for
     * eight days as a machine's guess inside his named $9-49 shape,
     * flagged the whole time as drafted rather than decided. He moved
     * it two dollars, which is the difference between a price nobody
     * chose and a price somebody did. ⚑ marks his call.
     */
    price_usdc: 21,
    pricing: "fixed",
    cadence: "term",
    reads: "subject_fetch",
    term_days: 30,
    fulfillment: "instant",
    description:
      "A standing page about your endpoint at this store's domain for 30 days per purchase, renewable: your live endpoint passport, the freshness chip, and the signed per-host observation history, aggregated at one URL an operator can hand to anyone. The commission record is signed and its evidence hash bound into your purchase certificate. Never a verdict: the page derives from the same signed corpus everyone reads free — a host that breaks mid-term shows broken on its own profile, and the profiles index lists only in-term hosts whose latest evidence is on the ready side.",
    note_402:
      "Thirty days of standing. The page is bought; what it shows never is.",
    constraints: [
      "Give your endpoint in the url query parameter: https, default port, on the public internet. We refuse our own hostname",
      "Ready-side hosts only at purchase — a door whose latest evidence is failing is refused before any money moves",
      "The page derives live: a broken week shows broken, and the index drops you until the evidence recovers",
      "Renewal extends from now or the current term's end, whichever is later — renewing early never burns days",
      "The passport, chip and history stay free to read forever; this buys only the standing page",
    ],
  },
] as const;
