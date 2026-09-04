/**
 * THE CORRECTIONS RECORD — things this store said that were not true,
 * and what changed so each one cannot recur quietly.
 *
 * Filed as gap 3, published 2026-07-29 after CV validated it with one
 * requirement that shapes the whole artifact:
 *
 *   EVERY ENTRY MUST PAIR THE MISTAKE WITH THE STRUCTURAL FIX. A list
 *   of admissions with no corresponding hardening reads as "this keeps
 *   happening," not "this gets caught and fixed." An entry missing the
 *   second half either gets one before publishing or does not belong in
 *   the initial set. A test enforces it, because a rule in a file is
 *   not a test — which is itself the lesson of entry one.
 *
 * AND LEAD WITH MECHANISM, NOT CHRONOLOGY, also his: a handful of
 * corrections dated inside one tight week can read as "launched in a
 * hurry, still finding bugs" to a suspicious reader. The same fact reads as a fast
 * feedback loop only if the mechanism is what goes first. So the page
 * opens on how things get caught and only then lists what was caught.
 *
 * WHY PUBLISH IT AT ALL: a store claiming zero mistakes across its
 * first week of live operation is making the implausible claim, not the
 * honest one. And age is the one objection this store cannot fix — an
 * outside risk scorer said so out loud, `review`, 63/100, on the
 * grounds that our address was six days old. A dated record of what we
 * got wrong is the asset a young store has that a polished one usually
 * does not.
 */

export interface Correction {
  /** ISO date the correction shipped. */
  date: string;
  /** What the store said or did that was not true. Plainly. */
  what_was_wrong: string;
  /** How long it was live, when we can say. Never softened. */
  how_long: string;
  /** Who found it. Outside eyes get named as outside eyes. */
  found_by: string;
  /**
   * THE REQUIRED HALF: what changed so it cannot recur silently. A
   * mechanism, not an intention. "We will be careful" is not a fix.
   */
  what_changed: string;
}

export const CORRECTIONS: readonly Correction[] = [
  {
    date: "2026-09-04",
    what_was_wrong:
      "The x402 walk ledger carried one key, `authorization_or_tx_id`, whose own documentation read \"the authorization nonce or settlement tx\". Nothing in a row said which of the two a value was, and the two are opposite in what they permit: an EIP-3009 nonce is client-generated random bytes no node will ever answer to, a settlement hash is addressable by anyone with an RPC endpoint. Same shape on the page. On 2026-09-03 the store then published row 1's value into a public cross-check on issue #188 as \"Transaction: 0x3e366c96…f794090 on Base mainnet\" — a sentence the ledger's own schema never supported. It is the authorization nonce; `buildAuthorization` in scripts/lib/walkabout.mjs mints it as 0x + randomBytes(32) before the payment is signed, and the walker keeps the settlement hash in a separate field it reads off the PAYMENT-RESPONSE receipt. The ledger collapsed two distinct captured fields into one key and prose resolved the ambiguity in the wrong direction, in public, in the exact artifact whose selling point is that a reader can check it. The class was already ours: `nonce-unbound-from-settlement` has been in this store's public defect vocabulary since 2026-08-27 — marks the nonce spent without naming what spent it, sourced by SolomonisBlack — with the repair hint 'store the settlement transaction hash beside the nonce'. We wrote it, aimed it at other people's tills, and failed it on our own record.",
    how_long:
      "The union key from the ledger's publication on 2026-09-02 to 2026-09-04, across all seven rows. The mislabel built on it was live for one day, 2026-09-03 to 2026-09-04, on a public issue thread, and was the first thing an outside instrument tried to use.",
    found_by:
      "0200project (base-tx-explain), from outside, inside 24 hours of being handed the identifier — in the cross-check this store proposed, doing exactly what a cross-check is for. They ran eth_getTransactionByHash and eth_getTransactionReceipt on Base mainnet and Base Sepolia, got null from all four, and ran a control hash from the head block through the same endpoint to prove the null was about our identifier and not their reach. Then asked whether it was a transaction hash at all rather than asserting it was not. No test here could have caught it: every guard on that ledger checked that fields were present, none asked whether a field's name could be read.",
    what_changed:
      "The rows carry `authorization_nonce`, `settlement_tx_hash` (null on all seven, so the absence is in the bytes instead of behind a union) and `identifier_kind` + `identifier_kind_basis`, which names the kind and what it rests on. Shape decides nothing — the two kinds are the same 32 bytes — and this ledger cannot reach a node, so the basis names what it actually has: the walk tooling keeps the settlement hash under a different key than the nonce and only the nonce reached the file, the union key never asserted a transaction, and an outside instrument found the value unaddressable on Base. It also names its falsifier: any node, on any chain, answering one of these values. test/walk-ledger-identifiers.spec.ts fails the build if any row reintroduces a union identifier key, drops the kind or its basis, omits settlement_tx_hash, publishes one value as both, or names a settlement hash without a settlement_tx_hash_basis carrying a dated read; it was run red against the pre-fix ledger first and reproduced all four failures. The ledger README states the hole in the verify-it-yourself section rather than leaving a reader to hit it, and records the correction with the outside instrument named.",
  },
  {
    date: "2026-09-03",
    what_was_wrong:
      "The attestation spec page said, since 2026-08-20, that the draft-vauban-x402 family covered receipt-format negotiation, a claim algebra and delegation binding, and that this store's signature_jcs \"already verifies under\" the RFC 8785 discipline those drafts and draft-hopley-x402-canonicalisation-jcs-v1 pin. The first was stale: the consolidated draft defers the claim algebra, the lifecycle FSM and the delegation binding to companion documents with no normative content. The second was overstated: both draft families add pre-canonicalisation rules our artifacts do not meet (integer-millisecond timestamps only, NFC strings; our artifacts carry ISO 8601 dates, the spec's own test vector included), and neither assigns any verification role to an ed25519 signature. signature_jcs verifies under the raw RFC 8785 byte primitive, not under either draft's discipline.",
    how_long:
      "2026-08-20 to 2026-09-03, on the spec page every verifier is pointed at. No artifact was affected: the signatures were and are what the page's canonical-form section says they are. What was wrong was the claim of interoperability with drafts that would reject our preimages.",
    found_by:
      "A full read of the three drafts at their current revisions, our spec page and the signer, at the keeper's request, as the AEO plan's A10 (docs/bylines/CV_PROMPT_IETF_2026-09.md). The overstatement was in a paragraph written from a summary of the drafts, not from the drafts.",
    what_changed:
      "The paragraph is replaced by relation_to_other_x402_receipt_work on the spec page: per draft, at the revision read, what it defines, what we share, and where we are not aligned, ending with the plain statement that we have no post-quantum discipline and that the conformance desk parses neither format. jcs_dual_emit now says what signature_jcs verifies under, and what it does not. test/namespace-spec.spec.ts holds the block to naming all three drafts with a revision and a date, and holds the old sentence absent.",
  },
  {
    date: "2026-09-03",
    what_was_wrong:
      "The organic 402 count per item on /pulse and the books could drop increments under a burst of price-checks against one door. Every other hot counter had been spread over shards on 2026-08-27; the per-item challenge counter stayed one KV key per item, KV allows one write a second per key, and a write that outlived its retries was logged and dropped. The counts were presented as counts and were, under bursts, floors of unknown depth.",
    how_long:
      "From the day the meter went in until 2026-09-03, on any door polled faster than once a second — which the uptime monitors do. How many increments were lost is not recoverable: a dropped write leaves no row.",
    found_by:
      "Our own CI log on 2026-09-02, which printed the line the gate writes when a count is dropped, \"challenge count lost: KV PUT failed: 429\", during an ordinary run. Nobody outside reported a wrong number, and nobody could have: the number that was wrong was the one that was never written.",
    what_changed:
      "The per-item challenge counter now shards its writes the same way the day and channel counters do, and the ledger sums shards on read instead of assigning one key's value to the row. test/hot-counter-shards.spec.ts asserts the item counter is spread across keys and that the item row still comes back as one item with the whole count; a reader that assigned instead of summed would fail it.",
  },
  {
    date: "2026-09-01",
    what_was_wrong:
      "The public bounty board listed five doors as open that had expired unclaimed on 2026-08-27. A bounty's stored status is written at two moments — 'open' at posting, 'paid' at claim — and nothing ever wrote 'expired', so the board and its JSON repeated the stored word while the claim door, which checks the clock, would have refused every one of them. A shopper who read /bounties on any of those five days, paid one of the doors with their own wallet and claimed, would have lost the door's price and been told the bounty had expired. The room and the JSON also carried no count, so nothing on the front could say whether there was anything to walk.",
    how_long:
      "Five days, 2026-08-27 through 2026-09-01, the whole span between the first board's expiry and its next read. No claim was attempted in that window, which is the only reason nobody was refused.",
    found_by:
      "A read of the live board during the keeper's own question about why the board was not being found — not by a test, because the listing had no test for a record aged past its expiry.",
    what_changed:
      "The board derives each bounty's status from its expiry at read time, through the same check the claim door applies, and publishes open_count beside the list. The storefront strip reads the same figure live and says how many doors are open and what is left of the week's budget, or says the board is between postings; it never prints a count from copy. test/bounty-board.spec.ts ages a record past its expiry in KV exactly as the live ones were and fails if any face — the JSON, the room, or the claim door — disagrees with the others. Reposting bounties weekly remains the keeper's press.",
  },
  {
    date: "2026-09-01",
    what_was_wrong:
      "The $5 Once-Over cited preflight-v1 as its headline battery while the weekly census had applied preflight-v2 since 2026-08-24. Same GET, same bytes, different headline: a door with a dollar-typed amount (or any other v2-only fold) could buy a signed ready the same week the corpus called it not_ready. The paid report already computed the v2 score and hid it in also_under as DISAGREED — so the contradiction was visible inside the artifact and still published as ready on the face a buyer hands to a stranger. Same class as 0.14: the check existed; the flagship record did not consume it.",
    how_long:
      "From the Once-Over's listing through 2026-09-01. Every report signed before this date still cites preflight-v1 and keeps that citation forever; we do not resign old artifacts.",
    found_by:
      "The store's own roadmap, as N1 / leftover #82, after the census citation was corrected on 2026-08-26 and the paid headline was left on the loose battery.",
    what_changed:
      "AUDIT_CRITERIA_VERSION is now PREFLIGHT_BATTERY_NEXT, the same string the census cites. The paid headline and the sample headline are the v2 set; also_under carries the frozen v1 overlap. A dated note on /criteria records the instrument change. test/battery-inside-the-bytes.spec.ts fails the build if the two producers part again, and test/service-audit.spec.ts fails the paid door on a v1-only fixture (dollar-typed amount) so deleting the fold turns a signed ready green in a test that watched it happen.",
  },
  {
    date: "2026-08-31",
    what_was_wrong:
      "The skill bundle published to ClawHub — the copy that gets INSTALLED into somebody else's agent — priced `service_audit` at $0.10 when it has cost $5 the whole time that document has existed, and `trust_profile` at $19 after the keeper repriced it to $21. It also described the shelf as running '$0.005 to $50' when it runs $0.001 to $300, and its frontmatter advertised entry 'from $0.004' when the cheapest door is $0.001. Two failures with different shapes and the second is the worse one. The `service_audit` price was wrong in the bundle's FIRST COMMIT: nothing ever compared it to the shelf, so it was never right. The `trust_profile` price was correct when written and went stale two days later when the keeper's 2026-08-29 repricing reached the shelf, the room and the JSON, and not the bundle. A wrong price here fails silently in the worst direction: an agent budgets a tenth of what the 402 will ask, declines the purchase it meant to make, and concludes this store is unaffordable. We would never hear about it, and we cannot edit the copy already installed.",
    how_long:
      "`service_audit`: four days, 2026-08-27 to 2026-08-31, the entire life of the document. `trust_profile`: two days, from the 2026-08-29 repricing. Neither was found by anyone using them.",
    found_by:
      "The store's own keeper, asking for the skill to be brought current — not by a check, because no check existed. Every guard on this document asked whether a thing was NAMED: the item ids, the credentials promise, the position sentence, the key registry. Not one of them looked at a number beside a name, so the bundle was free to advertise the right door at the wrong price indefinitely, and did.",
    what_changed:
      "test/skill-prices.spec.ts, shipped 2026-08-31, reads every price the bundle quotes beside a menu item and fails the build when it disagrees with MENU_ITEMS, plus the stated shelf range and the frontmatter's entry price against the real ends of the shelf. It was written before the fix and run red against the live document first — it reproduced both errors and one the overhaul had missed. Two of its three findings that day were the READER'S fault rather than the document's: a $0.004 attributed across a list boundary to the next bullet's item, and an amount the store PAYS at your till read as the item's price. Both are now regression cases in the same file, alongside the two real errors reduced to the sentences that carried them, so a future tightening that narrows the reader past what it exists to catch fails and names what it lost.",
  },
  {
    date: "2026-08-29",
    what_was_wrong:
      "/doors, published that morning, told a reader that two of its five paid drill-downs cover a stated term of days. Three do: the Standing Watch and the Conformance Watch at 7 days each, and the Hosted Profile at 30. The sentence was wrong the moment it shipped: the Hosted Profile was added to the list above it and the sentence below it was not re-read. The JSON twin of the same page never carried the defect, because it publishes term_days per item instead of a tally — the same page, one dialect honest and one not.",
    how_long:
      "Hours. Shipped and corrected on 2026-08-29, before the page had been up a day.",
    found_by:
      "The store's own derived-not-typed guard, on its first run after it stopped walking a hand-typed roster of public surfaces and started walking the router. /doors was not on the old roster and could not have been — it was built after the roster was last widened by hand, which is the whole reason the roster changed.",
    what_changed:
      "The sentence derives: a helper reads term_days off the same shelf the JSON body was already reading correctly, names the items and their terms, and says 'None of them covers a stated term of days' when that becomes true. The larger fix is the guard that caught it. derived-not-typed spent its life checking seventeen paths somebody had typed — a guard against hand-typed things, keeping one — and it covered 17 of about 130 public surfaces. It now derives its roster from the router at test time and walks every static door that answers a stranger with readable text; the seventeen stay only as a floor, because a derived roster can come back empty and pass having read nothing. The same walk found the cross-origin allowance had gone stale the same way (34 of 131 doors), and that is derived now too. A count typed onto a surface built tomorrow fails the build tomorrow.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "The advisory behind every signed-offers figure was named `no-signed-offers`, and the census sentence derived from it read 'the rest ask to be paid on their word alone'. Both asserted a fact about the ENDPOINT. What the probe establishes is narrower: one challenge, at one path, carried no offer-receipt offers. That single observation cannot separate a door that serves no signed offers, one that serves them at a placement or path this probe did not look at, and one that serves them under a convention this battery does not recognize — and only the first would be about the door. The other two are facts about our probe, published as the operator's. The direction of the error is what makes it serious rather than untidy: this store SELLS conformance checking, so an ungranular statistic saying the ecosystem is 0% compliant is one we profit from believing.",
    how_long:
      "Since the advisory was named, and in every weekly signed_offers aggregate and /registry caption derived from it. The placement half of this defect was corrected the same day (the entry below); this is the CLAIM half, which that fix did not reach — a correctly-measured number can still be described as more than it is.",
    found_by:
      "CV, in the review that became task #73, and named by the observatory's own doctrine document as the most urgent item in it (docs/OBSERVATORY.md §18) — written by this house against this house, and then left standing for a while, which is the part worth recording.",
    what_changed:
      "The advisory is renamed `signed-offers-not-in-challenge` — the observation, not the verdict — and its detail enumerates the three readings it cannot separate, with a falsifier an operator can walk for free. The census stops publishing only a numerator: `not_found_in_challenge` and `present_but_unparseable` are counted so the buckets sum to the denominator exactly, and `cannot_distinguish` ships the limits beside the number everywhere it travels. The public sentence states the remainder as counted rather than assumed and says WE DID NOT FIND THEM IS NOT THEY DO NOT HAVE THEM. Rows sealed under the old name keep their bytes and are joined at read, never rewritten. test/signed-offers-granularity.spec.ts fails the build if the advisory reverts to naming the endpoint, if the buckets stop summing, or if the sentence reasserts the absence.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "The store's most-quoted fact — '34 of 35 hosts serve no signed offers at all' — and every signed-offers number downstream of the shared battery asserted an absence the instrument could not see. The probe read the offers extension only from the PAYMENT-REQUIRED header, while the offer-receipt convention places offers first in the 402 body — a placement our own till emits and our own battery never parsed. The free preflight served the claim, the $5 audit signed it, the $5 conformance watch signed it daily into paying customers' records, the census sealed it into the Bitcoin-anchored corpus, and /registry captioned it as the market's trust gap. The denominator also silently excluded this store's own door — the one door known to serve signed offers — and no caption said so. Whether any of the 34 served body-placed offers is unknown, which is the defect: 'at all' was published where 'in the one placement we read' was the observation.",
    how_long:
      "From the census of 2026-08-03 on the quoted copy, and in every weekly round's signed_offers aggregate since the market desk shipped. The anchored rows keep their bytes: rewriting a signed artifact to look correct is the failure this record exists to refuse — instead every stored week now reads as what it was, because the basis field below is absent from all of them.",
    found_by:
      "The keeper, catching the market desk publishing '0% of ready doors serve signed offers' as an ecosystem fact on 2026-08-27, and the instrument audit that followed, which found the same header-only read in the one battery all five instruments share.",
    what_changed:
      "The battery reads both placements — header first (the copy our own till reads back), body second — and asserts absence only over the placements actually read; a caller that withholds the body gets an advisory that says so. The market aggregate carries OFFERS_READ_BASIS the way rails carry RAIL_BASIS, so header-only history can never silently mix with post-fix weeks in the anchored chain. A fixture door serving offers only in the body fails the build if the battery ever again claims absence from fewer placements than the store's own till emits (test/offer-placement.spec.ts, test/fixtures/doors/body-offers.json), and every caption that quotes the number now states the placement scope and the self-exclusion. The old census figure stands as a dated finding in its measured scope; the next round's number is a new dated finding, taken with both eyes open.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "The 2026-08-26 correction on this page promised 'a test that holds the citation to account… so a row can never again name criteria the code does not apply.' The test that shipped compared the battery's check list to a function that returned that same list — a constant checked against itself. Deleting the checks from the probe would have left it green. The promise in this record was not kept by the mechanism that shipped beside it, which is the worst place in the store for that to be true.",
    how_long: "Since that correction shipped, 2026-08-26 to 2026-08-28.",
    found_by:
      "The instrument audit, reading the test the correction cites against the code it claims to hold.",
    what_changed:
      "The citation is held by behavior now: a stubbed door with an unpayable payTo, a decimal amount, and a testnet network must each come back not_ready through the census's own probeHost (test/census-folds-the-trio.spec.ts) — the same red-test shape that already held the rail fold — so deleting a fold turns a door's verdict green in a test that watched it happen, not a list equal to itself. Rule 46 gets this entry as another face: a guard comparing a constant to itself is a guard that argues for the lie, and it argues hardest when it stands inside a correction.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "The Night Watch's shelf copy said the hourly probe tries the handle so that 'a buyer could pay.' It never checked that: the watch runs the v1 structural battery — 402, header, version, accepts — and no payability check at all. A door with a name for a payTo, a dollar-typed amount, or a testnet network read ready in 168 signed rows while the store's own free preflight v2 called the same door not ready by any reading a buyer would accept. The signed rows were honest — they cited preflight-v1 all along; the shelf was not.",
    how_long: "Since the watch was listed with that sentence.",
    found_by:
      "The instrument audit, diffing the shelf copy against the battery the rows actually cite.",
    what_changed:
      "The copy says what v1 checks — shape, not payability — and points payability at the free v2 preflight by name. Words follow facts; whether the watch should fold the payability battery is a criteria decision that stays the keeper's, and until he makes it the shelf no longer makes it for him. The standing guard is the battery citation inside every signed row, which a test holds inside the signed bytes (test/battery-inside-the-bytes.spec.ts): the shelf can no longer outrun a citation any buyer can check against the row they hold.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "The $1 passport refresh was sold with 'the newest observation wins in BOTH directions — a broken finding turns the chip off,' and the $19 trust profile's own copy promised 'a host that breaks mid-term shows broken on its own page.' The passport and the chip kept the promise; the profile page and index never read the refresh at all. A door that broke mid-term, with the break recorded by a paid refresh, went dark on its chip and its passport while staying ready-side on the paid standing page — the one URL its operator hands to counterparties — until the next weekly round.",
    how_long: "Since hosted profiles shipped.",
    found_by: "The instrument audit, in-house.",
    what_changed:
      "The profile view derives from the same newest-wins fold the passport uses, so the two surfaces can no longer disagree about which observation is newest. A test breaks a profiled host mid-term with a refresh and requires the standing page to say broken that hour and the index to drop the name (test/passport-refresh.spec.ts) — the mechanism is the shared code path plus the test that walks it, not a matching sentence.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "After earlier corrections re-worded /registry's prose — signed offers are 'present and structurally valid,' never 'verifiable'; doors are 'answering a well-formed challenge,' never 'working' — the JSON-LD beside that prose kept publishing 'working doors serving verifiable signed offers (percent)' as a bare percentage. The code's own comment says the machine-readable half matters more, because indexers quote it verbatim and cannot see a caveat in a paragraph. It was the half left uncorrected.",
    how_long: "Since the prose corrections landed.",
    found_by: "The instrument audit, in-house.",
    what_changed:
      "The JSON-LD names use the corrected vocabulary and the percentage ships beside its numerator and denominator as their own properties, so no indexer has to quote a ratio without its population again. A test parses the served structured data, bans the retired words from every variableMeasured name, and requires the count and denominator properties beside the percent (test/registry-claim.spec.ts) — the machine half now has the guard the prose half always had.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "The conformance desk's docs promised: resolve_key false 'refuses did:web resolution,' and past the budget 'nothing is denied — signature unchecked.' The verifier library underneath, given no fetch of its own, fell back to the bare platform fetch whenever no key was established and the kid was did:web — which is exactly the declined path, the exhausted-budget path, and the failed-resolution path. On the three paths that promised no request, the desk could make a raw, redirect-following, unbudgeted request to a stranger's host in the caller's name. And a resolution we attempted and failed — the issuer's DID host slow from our vantage for three seconds — was booked as the artifact's does_not_conform: our blindness published as their defect.",
    how_long: "Since the desk shipped.",
    found_by:
      "The instrument audit, reading the verifier's fallback against the desk's promises.",
    what_changed:
      "The desk resolves exactly once, through its guarded fetch; the verifier now receives a fetch that refuses, so the fallback cannot fire. A signature left unchecked for our reasons reads could_not_check, never does_not_conform; a kid absent from a document we did read stays the document's fact. The test counts fetch calls per key_resolution state (test/conformance-desk-egress.spec.ts) — the only way a promise about not fetching can be held.",
  },
  {
    date: "2026-08-28",
    what_was_wrong:
      "The self-passport's caption said every summary value is 'DERIVED from the same locals' and 'derived while this page rendered.' The verdict, freshness, and empty failed list were literals — stamped ready/fresh whatever the live modules two fields down had concluded, including 'conflict.' The one passport whose subject the census can never probe was the one passport that could not go dark, and its chip — green by construction, dated today by construction — rendered pixel-identical to chips that earn their color the census way.",
    how_long: "Since the self-passport shipped.",
    found_by: "The instrument audit, in-house.",
    what_changed:
      "The modules are the verdict: every module agreeing is the only way the artifact says ready/fresh; any conflict names the disagreeing modules in failed and renders indeterminate, which the chip route refuses to draw — our chip goes dark the same way anyone's does, and wears SELF on its face either way. A test plants a catalog conflict and requires the fields to turn (test/self-passport-derives.spec.ts).",
  },
  {
    date: "2026-08-26",
    what_was_wrong:
      "Every row of the weekly census cited the wrong criteria. Each row carries a `battery` field whose entire purpose is to say which published battery produced that verdict, and every row said preflight-v1. The round had not run v1 since 2026-08-24, when it was deliberately changed to fold the Solana rail-receivability read into its verdict — a v2 rule that v1 explicitly does not apply — so that the corpus would stop contradicting the free preflight in public. Two days later v2 gained the consistency trio (payable payTo, atomic amount, mainnet network) and the round did not fold that either. So the census matched neither published battery: it cited v1, scored the rail read like v2, and ignored the trio like v1. Those rows are hash-chained and Bitcoin-anchored, which means the mislabel is durable and carries our signature. The verdicts were defensible; the label on them was not, and a verdict that cites criteria nobody applied cannot be checked by the stranger it was published for.",
    how_long:
      "Two days, 2026-08-24 to 2026-08-26, across the rounds signed in that window. No round in that window was re-signed: those rows keep their bytes, because rewriting a signed artifact to look correct is the failure this record exists to refuse.",
    found_by:
      "Found in-house while scoping an unrelated item — the fresh-set surface's missing per-row conditions — by reading what the census actually folds against what its rows claim. Nobody outside reported it; it would have been invisible from outside, which is the argument for reading one's own signed fields against one's own code on purpose.",
    what_changed:
      "The round now applies v2 in full — the rail read and the trio — and cites preflight-v2, derived from the version constant rather than typed. The mechanism that keeps it true is a test that holds the citation to account: it reads every check the cited battery adds and requires that the round can actually fail a door on each one, so a row can never again name criteria the code does not apply. A door with an unpayable payTo, a decimal amount or a testnet network now scores not_ready in the census, as it already did at the free preflight.",
  },
  {
    date: "2026-08-26",
    what_was_wrong:
      "The store's paid doors refused valid payments that arrived under the header name X-PAYMENT — x402 v1's name for what v2 calls PAYMENT-SIGNATURE, and still what much of the live ecosystem sends. A buyer holding a correctly signed envelope got a 402 instead of their goods. The store then compounded it: when this was reported, the reporter was told the claim was false, on the strength of three places in our code that read both header names. None of those three accepts a payment. Two write a decline reason after the 402 is already decided and one decides whether pre-payment guards apply; the acceptance decision belongs to a layer below all of them. Call sites were read and mistaken for behaviour.",
    how_long:
      "Since the v2 migration, on every paid door. The store never measured how many buyers spoke the older name, so the number of refused sales is unknown and cannot now be recovered.",
    found_by:
      "CV reported it from live behaviour and was told he was mistaken. Cairn then settled it with half a cent: the identical envelope sent under both names on a cold walk, 402 under X-PAYMENT and settled under PAYMENT-SIGNATURE, published as a transcript.",
    what_changed:
      "The payment adapter now accepts the envelope under either name, and only that name aliases — a blanket fallback would be a guess nobody asked for. A test sends the same envelope under both headers and requires the same outcome, and separately requires that X-PAYMENT-SIGNATURE is NOT treated as an alias, so the shim cannot quietly widen. Nothing else changed: signature verification, schema validation and settlement are untouched, and PAYMENT-SIGNATURE remains what every surface asks for.",
  },
  {
    date: "2026-08-25",
    what_was_wrong:
      "Every signed offer and every signed receipt this store issued carried a `payload` field. The x402 Signed Offers and Receipts spec permits `payload` for EIP-712 only and says it MUST be omitted for JWS, which is the format we emit — so the store published a MUST-level conformance violation on every paid door, while selling conformance checking of other people's offers and receipts. The envelope also described `acceptIndex` as binding the offer to a rail; it is not part of the signed payload and must not be relied on for that.",
    how_long:
      "From when signed offers shipped until 2026-08-25, on every paid door.",
    found_by:
      "Our own reading of the spec, and only barely. The investigation that led there was about header SIZE, and the argument for dropping the field was that nothing was lost by removing a duplicate — true, mechanically, and silent on whether the wire format permitted it. Reading the spec is what turned a tidying into a defect, and it is what found the receipt half, which no byte-counting argument would ever have reached.",
    what_changed:
      "The field is gone from both envelopes and the acceptIndex claim is corrected in the text that describes it. Conformance tests now assert the envelope shape against the spec rather than against what the code already emitted — the earlier tests passed because they required the violation.",
  },
  {
    date: "2026-08-04",
    what_was_wrong:
      "The public organic-settlement count read 22 when the honest number was 3. The other 19 were the store's own money: cross-model agent-UX test walkers (research into how cheaply-run agents handle x402 purchases) bought real items from freshly spun-up wallets that were not yet listed in the house register, so the till booked family purchases as market demand — the exact corruption the register exists to prevent, caused by our own instrument.",
    how_long:
      "Roughly a day across two test rounds (2026-08-03 to 2026-08-04), on every surface that shows the organic figure.",
    found_by:
      "The keeper, reading his own office and refusing the flattering number: he had 3 organic sales, the page said 22, and he asked for the correction rather than the credit.",
    what_changed:
      "Three mechanisms, no intentions. (1) Every walker wallet is now in the house register, and the pinned rule is LIST BEFORE FIRST PURCHASE — the same guard the store's own shopping script has always enforced for itself. (2) A reclassification ledger: the misbooked settles are subtracted from organic and added to house AT READ, with the raw counters left exactly as written, because an edited counter is an erasure and an adjustment beside it is a record; the stats now carry a reclassified_house field so the correction itself is visible, not silent. (3) This entry, and a test that walks the whole correction path — the lever refusing unlisted wallets, the snapshot freezing, the corrected figure at read, and the raw counter left untouched — so the mechanism fails the build before it can fail the books. The corrected organic count is the number the store stands on, and it is 3.",
  },
  {
    date: "2026-08-01",
    what_was_wrong:
      "The refund policy shipped saying “nobody in the x402 ecosystem has shipped true conditional release yet,” and the store's own problem ledger said the same. False from the moment it was written: Boson Protocol's x402B — non-custodial contract escrow with on-chain dispute resolution, exactly the thing the sentence denied existed — had been on mainnet, including Base, since 2026-06-08, seven weeks before we wrote it.",
    how_long:
      "Under a day on the live policy — published in the early hours of 2026-08-01, corrected the same day. But the claim was born false, which is worse than going stale: nothing changed under us, we simply had not looked.",
    found_by:
      "An outside deep-research pass the keeper commissioned on the conditional-release problem, whose report named x402B as the shipping baseline — then verified by us against the live web before recording, because the vetting rule cuts both ways: the same pass that checks a report's claims against our code has to check our published claims against the report's findings.",
    what_changed:
      "The policy sentence now names the shipping alternative, dates it, and says why this store still does not run one (a contract to operate and arbitrate is infrastructure a one-person shop must not become) — the reader gets the real trade-off instead of a flattering absence. The mechanism: any published claim of the shape “nobody has built X” is a claim about the whole world at a moment, and it now ships with the date it was checked or it does not ship. The problem ledger's matching entry was corrected in the same pass.",
  },
  {
    date: "2026-07-31",
    what_was_wrong:
      "/stack told buyers that if this store's signing key were lost, \u201Cevery artifact ever issued becomes unverifiable.\u201D That was never true, and it was the scarier half of the sentence. The public key and the exact signed bytes are already published and already copied — out of our hands by design — so anything signed stays checkable by whoever holds it whatever happens to us. What a lost key actually costs is the FUTURE: nothing new could ever join the record. The same entry also said the key had \u201Cno substitute and no recovery,\u201D which stopped being true the day a paper backup existed. And separately, /attestation's statement of exactly which fields a certificate signature covers was a hand-written list that had fallen a day behind the code — it omitted made_by, then the five payment fields, on the one page whose whole job is telling a reader which bytes are covered.",
    how_long:
      "The unverifiable claim: since /stack was published on 2026-07-29, three days. The stale field list: about a day, from when made_by shipped.",
    found_by:
      "Ourselves, on a deliberate read-every-page pass the keeper asked for after a run of small nuanced slips. Notably NOT by a test: every claim here was prose, and prose about code is the category with no compiler.",
    what_changed:
      "Both fixed, and both structurally rather than by editing a sentence. The field list on /attestation is now DERIVED from the same CERT_FIELDS array the signing code walks, so the page cannot describe a different set than the one being signed, and a test fails the build if any signed field goes unmentioned. The /stack entry now says what a lost key actually costs, states that recovery covers loss and not theft, and points at key_history. The lesson recorded rather than the instance: a prose list beside a code list is two sources of truth for one fact, which is the same defect as a hand-typed rotation count and a hand-typed \u201Cnever rotated\u201D line, both of which broke the same week.",
  },
  {
    date: "2026-07-31",
    what_was_wrong:
      'Two things, and the second is the one that matters. FIRST: the store had no recoverable copy of its signing key, and said the opposite by implication for nine days — /stack called the key a dependency with no substitute, /wind-down promised every signature stays checkable forever, and neither page mentioned that the single private key existed in exactly one place with no way to read it back. Cloudflare Worker secrets are write-only, which is correct, and means the copy taken at setup was the only one there would ever be. No copy was taken. Not a decision; nobody thought that far ahead. SECOND: the line published beside the key itself read "This key, this wallet, this domain, NEVER ROTATED" — and the store rotated its signing key that afternoon, which left a boast about a streak sitting on the most machine-read surface here, hours after it stopped being true. The same deploy served key #2 with an in-service date of 2026-07-22, nine days before it existed, on a field a holder uses to place an artifact in time.',
    how_long:
      "The missing backup: from 2026-07-22 to 2026-07-31, the whole life of the first key. The false identity policy and the wrong service date: under an hour, between the secret changing and the sweep that followed it.",
    found_by:
      "Ourselves, and by the only method that would have worked: writing the procedure down. The gap did not surface from thinking about key management, which we had done that morning — it surfaced at step one of an actual paper-backup ceremony, at the line that said \"get the seed on screen,\" because there was nowhere to get it from. A published protocol was what turned an assumption into a step somebody had to perform. The identity-policy lie was caught by the keeper reading the live key endpoint immediately after the swap, which is the same habit that has now found three of these.",
    what_changed:
      "The store performed its first key handover, under the succession protocol it had published that morning and under every line of it: the new key announced before it signed anything, the announcement itself signed by the OUTGOING key and verifiable at /api/verify/handover_1, the retired key published forever with its service dates so every artifact issued under it stays attributable. It was not a drill and is not described as one. Structurally: key history is now a registry rather than an assumption, every verify response names which published key signed a thing — and says so out loud when a signature matches NO key we have ever published, which was previously reported as simply valid; the rotation count and the current key's service date are both DERIVED from that registry rather than typed, because a typed count is a claim with a timer on it, which is precisely what the \"never rotated\" line was. The new key was written on paper and verified FROM the paper, on two sheets, before it signed anything. Ten tests that pinned the old wording failed and were rewritten to assert the commitment rather than the count. And the cause is fixed at its root: `npm run keys:generate` now prints a warning before the number saying it invents a NEW key and cannot show you your existing one — the keeper reached for it looking for the live seed, reasonably, because it is the only key-shaped command in a repo with one key.",
  },
  {
    date: "2026-07-30",
    what_was_wrong:
      'The listing spec told buyers a lucky was "graded honestly, by a person." No person grades a lucky. The animal, the note and the strength all come from a hash of the certificate id, and the code that does it says so in its own comment: "the keeper does nothing per order." The true part — that he wrote the herd and weighted the odds — was real; the per-charm human judgement was not. It rode into the OpenAPI summary, menu.json, the x402 discovery document and skill.md.',
    how_long: "Live on every machine surface for five days.",
    found_by:
      "Nobody, for five days. Then by scoping an unrelated feature: a maker's mark for the shelves where a buyer cannot tell whether a person or a script made the pick. Asking who made the pick is what surfaced a shelf whose answer had been written down wrong.",
    what_changed:
      "The line says what the code does. The structural half is the point: a maker's mark is now a signed certificate field derived from one table keyed by item, so a shelf cannot describe its own provenance, and a test walks all three copy maps — the OpenAPI summary, the listing spec and the storefront returns — failing the build if any of them claims a person on a shelf whose fulfilment path has none. The claim and the code are tied together now; they were not before, which is why they drifted.",
  },
  {
    date: "2026-07-26",
    what_was_wrong:
      'Every surface of this store said refunds were "automatic." The code never did it. A refund here was always a person keeping his word, which is a fine promise and a different one.',
    how_long: "Live on every surface for five days.",
    found_by:
      "An outside model, repeating our own wording back to us. Nobody here noticed.",
    what_changed:
      "The wording now says what the code does. More importantly: every claim the store makes about itself is walked by a test in CI, so a promise the code cannot keep fails the build instead of shipping. That test exists because of this entry.",
  },
  {
    date: "2026-07-25",
    what_was_wrong:
      "Parameter guards fired BEFORE the payment gate, so an indexer asking a paid route what it cost got a 400 error instead of a price — and concluded we were not an x402 endpoint at all.",
    how_long: "Since the affected items were listed.",
    found_by:
      "A directory's probe report: three of six endpoints answered. The three that did not were ours to fix.",
    what_changed:
      "Guards moved behind the gate, and a test now asserts that an UNSIGNED request to any paid route gets a 402 with the terms stated rather than a 400. The store cannot again refuse to quote a price to something trying to read one.",
  },
  {
    date: "2026-07-28",
    what_was_wrong:
      'The census page told the keeper that "the decline reasons are on the desk." There was no desk. The reasons had been recorded since the instrument went in and nothing anywhere rendered them.',
    how_long: "From the day the census shipped until somebody went looking.",
    found_by:
      "The keeper, following our own instruction and hitting nothing.",
    what_changed:
      "The decline desk was built, and a test now asserts that every page promising a link actually links somewhere that exists. A sentence pointing at a page nobody built now fails the build.",
  },
  {
    date: "2026-07-28",
    what_was_wrong:
      "Five pages of the store's own back room had no way back to anything. Each rendered itself as the desk's tab, which draws the only link home as un-clickable bold, so landing on one left the keeper with the browser's back button.",
    how_long: "From the day each reading shipped.",
    found_by: "The keeper, unable to reach half his own office.",
    what_changed:
      "The navigation is now derived from one list rather than written per page, so a new page cannot be added without appearing in it. Four tests sweep every page: each reaches every other, each marks only itself, each keeps a way out.",
  },
  {
    date: "2026-07-29",
    what_was_wrong:
      'This store told visitors that "CI validates the catalog against it on every build," and told machine readers that field order was "validated in CI." There was no CI. Four hundred tests, run exclusively by hand.',
    how_long:
      "For as long as those sentences existed — the tests were always real, the sentence about when they run was not.",
    found_by:
      "Us, while working out how the keeper could publish a skill from a phone. Nobody was looking for it.",
    what_changed:
      "The claim was made true rather than softened: CI now runs the typecheck and the full suite on every push and every pull request. The sentence that was false is the sentence that now describes a workflow file.",
  },
  {
    date: "2026-07-30",
    what_was_wrong:
      "Certificates could not actually be verified by the person holding one. The key and the signature were real and correctly shaped, and /api/verify — the endpoint that exists for nothing but third-party checking — never published what the signature covers, so there was no way to reconstruct the signed bytes except by guessing. Worse, two fields shown on certificates were not signed at all: a buyer's tag, and the `attests` hash that binds a certificate to the settlement observation it vouches for. An unsigned binding can be altered without breaking the signature, so the one field whose whole job was to make one artifact answer for another was the one field the signature did not cover.",
    how_long:
      "The documentation gap since the endpoint existed. The two unsigned fields since 2026-07-28, when both were added and the canonicalizer was not.",
    found_by:
      "A partner agent, from outside, holding a real certificate — he ran the ed25519 himself against every plausible canonicalization, watched all of them fail, and confirmed the crypto before reporting it rather than passing along a suspicion.",
    what_changed:
      "The endpoint no longer describes the canonical form, it SERVES it: every signed artifact now returns signed_payload, the exact string the signature covers, so verification is one library call with nothing guessed. The certificate canonicalizer now walks a declared field list, and a type-level check fails the build if a field is ever added to a certificate without being signed — the class of bug, not just its two instances. Certificates minted before the fix still verify under the form they were actually signed with, and say on their face which fields that signature leaves out. And the test that missed this now exists: verification in CI re-derives the bytes from the SERVED response and checks them with the raw ed25519 library, because every previous test verified through the same function that signed, and a function's blind spots are invisible to itself.",
  },
  {
    date: "2026-07-30",
    what_was_wrong:
      "On the day this store took its first payment from a stranger, the page built to watch for exactly that still said zero — that not one client outside the house had ever presented a payment signature. The census grouped clients by user-agent alone and marked a whole group as house the moment ANY event in it was house-flagged, then skipped it. A user-agent is a bucket rather than a person, and the emptiest bucket is \"(no user-agent)\", which the keeper's own scripted tests and a hand-rolled buyer both fall into. So the proprietors testing their own till made every outside client sharing a user-agent string invisible, on the single number the whole store is built to watch.",
    how_long:
      "From the day the census shipped. It could only ever be seen on a day the number was supposed to change, and that day was the first one.",
    found_by:
      "The keeper, reading his own office the hour the sale landed — and reading it generously, as a window-boundary quirk rather than a bug. It reproduced in three lines.",
    what_changed:
      "Clients are now keyed by user-agent AND house flag, so a house event still counts as house exactly as before and no longer swallows everyone standing next to it. The reproduction is a permanent test — one house settle and one outside settle sharing a user-agent must show the outside buyer — alongside its opposite, that the fix never lets house traffic read as a customer, since trading an undercount for that overcount would be far worse. The page's verdict was always computed rather than written, so no copy needed editing: fixing the books fixed the sentence, which is why it is built that way.",
  },
] as const;

export const CORRECTIONS_STANDFIRST =
  "Things this store said that were not true, what found them, and what changed so each one cannot happen again quietly. Dated, in the open, and not summarised anywhere kinder.";

/** Mechanism first, per CV. Chronology alone reads as instability. */
export const CORRECTIONS_MECHANISM =
  "HOW THINGS GET CAUGHT HERE, which matters more than the list below: every claim this store makes about itself is walked by a test, and the build fails when a promise outruns the code. That machinery exists because of the first entry below rather than in spite of it — each correction added the check that would have caught it. So the honest way to read a growing list is not \"they keep breaking things\" but \"the loop is short and it is running.\" A store this young claiming a clean record would be making the less plausible claim.";

/**
 * THE SECOND MECHANISM, ADDED 2026-07-30 BECAUSE THE FIRST ONE WAS NOT
 * ENOUGH AND WE CAN NOW PROVE IT.
 *
 * The paragraph above was true and incomplete, which is the more
 * dangerous kind of claim. Entry six was invisible to four hundred and
 * forty-six passing tests, and not by accident: every one of them
 * verified a signature by calling the same function that produced it.
 * Sign with f, verify with f, and f's own blind spots are invisible from
 * inside that loop permanently — no amount of the same kind of test
 * finds them, because the error cancels itself on both sides.
 *
 * That is not a gap peculiar to this store. It is structural to
 * self-verification anywhere, and it means a store cannot audit its own
 * signatures on its own authority, however many tests it runs. The only
 * vantage point that can see it is somebody holding nothing but a public
 * URL. So the outside read is not a courtesy or a nice-to-have QA step;
 * it is the only instrument that reaches this class of defect at all,
 * and it is now named on the page as machinery rather than as thanks.
 */
export const CORRECTIONS_OUTSIDE =
  "AND THE PART WE CANNOT DO OURSELVES, which the sixth entry below proved rather than suggested: a store cannot audit its own signatures on its own authority. That entry was invisible to four hundred and forty-six passing tests, and not by carelessness — every one of them checked a signature by calling the same code that made it, so a flaw in that code cancelled itself on both sides of the check and no quantity of the same kind of test could ever have surfaced it. It took somebody outside, holding nothing but a public URL and using their own cryptography library, to see that our certificates could not actually be verified. That is structural to self-verification anywhere, not a habit of ours, which is why the outside read is listed here as machinery and not as gratitude: it is the only vantage point that reaches this class of defect. Tests in CI now re-derive the signed bytes from the SERVED response and check them with the raw library, which is the closest an inside test can get to standing outside — and it is still not the same thing. If you hold something we signed and it does not check out, the mailbox is free.";

export const CORRECTIONS_SCOPE =
  "WHAT THIS IS NOT: a bug log. Ordinary defects get fixed and forgotten like anywhere else. This page is narrower and more uncomfortable — it is only for things the store SAID, on a surface somebody could read, that turned out not to be so. Every entry names what changed structurally; an admission without a mechanism behind it would read as an apology, and this store does not trade in those.";

/**
 * WHAT THE RECORD CANNOT SHOW YOU (AT_SCALE rule 5b), added
 * 2026-08-02 during the sweep that asked every published verdict what
 * it would look like if the thing it measures failed silently.
 *
 * This one had the answer the page could least afford: the list above
 * is a hand-written array in this file. NOTHING writes to it. The
 * delivery audit and the chain walk raise ALERTS — that is all they
 * do, deliberately, because rule 30 says nothing publishes without a
 * hand — and the distance between an alert firing and an entry
 * appearing here is a person remembering.
 *
 * That is the correct design and the wrong silence. A reader has no
 * way to tell a quiet week from an unwritten one, and the paragraph
 * above about "the loop is short and it is running" describes the
 * DETECTION half while reading as a claim about the whole loop.
 *
 * Found while checking a sentence I had written on /try earlier the
 * same day, which said findings are "published at /corrections" as
 * though that step were mechanical. It is not, and the page that
 * would have to carry the consequence should say so first.
 */
export const CORRECTIONS_HAND_KEPT =
  "WHAT THIS RECORD CANNOT SHOW YOU: the entries below are written by hand. Detection is largely automatic — a delivery audit looks for settlements with no artifact behind them, an hourly walk compares our books against Base itself, and the build fails when a claim outruns the code — but every one of those raises an ALERT to a person, and a person then writes the entry. Nothing on this page is machine-generated, on purpose: a store that could auto-publish its own corrections could auto-phrase them. So read a quiet stretch carefully. It means nobody wrote anything down, which is usually because nothing happened and is not the same statement. The gap between the two is a human being, and if you want to check that human rather than trust him, the artifacts are signed and the chain is public: our books can be walked against Base by anyone, without asking us.";

/**
 * HOW TO READ THIS RECORD (F30, 2026-09-03, an outside reviewer's ask
 * the keeper carried in): the one paragraph a stranger needs before
 * the ledger, so a long list reads as what it is — a public,
 * falsifiable quality system — rather than as a lot of errors.
 */
export const CORRECTIONS_HOW_TO_READ =
  "HOW TO READ THIS RECORD: each entry is one thing this store said that was not true, dated the day it was found, with how long it stood, who found it, and the mechanism that changed so it cannot recur quietly. What qualifies is a published claim that was false or overstated, not a bug nobody could have read; a bug that never reached a claim is a commit, not an entry. Entries are never edited after publication; a correction to a correction is a new entry under a new date, and the old one stands. Outside reports are credited as outside reports. Nothing here is summarised anywhere kinder, and the count going up is the system working.";

export const CORRECTIONS_INVITATION =
  "If you find another, the mailbox at /api/letter is free and a human reads it. A correction costs us nothing except the writing down, and the writing down is the point.";

/**
 * The forwarding pointer every evidence surface carries (outside
 * review, 2026-08-27): signed history cannot be retro-edited, so
 * discoverability runs the other way — any reader standing on a
 * claim is one hop from the record of what later proved wrong. One
 * constant, one wording, every surface (the standing check is
 * test/corrections-forwarding.spec.ts).
 */
export const CORRECTIONS_POINTER =
  "Things this store said that later proved wrong live at /corrections — dated, with what changed so each cannot recur quietly. If a claim on this surface was ever corrected, that is where the correction stands.";
