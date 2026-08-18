# The keeper's desk — fresh sheet, 2026-08-18

The old sheet ran to 1,700 lines and two weeks of history; it is
archived whole at `docs/archive/MONDAY_2026-08-08.md` — the eight
rulings of 2026-08-10 and their record live there. This sheet carries
only what is TRUE TODAY and what is OPEN. When it stops being either,
archive it and start again; a desk file is not a diary.

**State of main:** green, everything merged — nothing is sitting on a
branch. Suite 1531+, tab suite 46, audit at budget.

**The counter:** 13 organic sales (roughly doubled in the week the
keeper was away and touched nothing), 64 bell rings. The verification
tier is still at $0 outside — Assumption 0 unproven — which is now the
whole strategic question, because of what follows.

---

## What landed while the keeper was out (2026-08-11 → 18, on main)

- **ClawHub 3.1.0 PUBLISHED, 2026-08-11.** The false "settles first"
  claim is out of the public catalogue; the bundle in the wild now
  matches the gate. The 08-10 correction cycle is closed.
- **`onpage_audit`** — new paid SKU, plus the free desk at
  `/api/onpage`.
- **The Web Bot Auth line** — signed egress, a public directory, the
  free check, and the Calling Card (now canon, keeper-approved).
- **Distribution, several at once:** Smithery listing, Cursor
  Directory (first one built from the repo's own package), DeepWiki
  page recorded, Agent Plugin manifest for the checklist scanners.
- **Instruments:** dead-MCP-server probe (fails loud, measured, with
  `--registry` mode for a fresh population), bank-walk stall alarm
  (first hour, not eleventh), second authenticated slot on the Base
  RPC ladder, month-grain fix on the placed-subtraction.

---

## MARKET SCAN, 2026-08-18 (replaces the 08-08 scan wholesale)

**x402 went institutional.** The x402 Foundation is operational under
the Linux Foundation — formal governance, 40 members, Coinbase's
contribution complete. Premier tier includes AWS, American Express,
Circle, Cloudflare, Coinbase, Google, Mastercard, Ripple, Shopify,
Solana Foundation, Stripe, Visa. Salesforce shipped Agentforce
Commerce GA; Fireblocks joined with an agentic-payments suite.

**Scale, now measured by outsiders:** ~75M transactions in 30 days
moving ~$24M between **~94,000 buyers and ~22,000 sellers** — average
around $0.32, exactly this store's price register. ~180M lifetime.

**Three findings that touch us directly:**

1. **Academia entered our lane, one-shot and unsigned.** Two papers:
   *Five Attacks on x402* (arXiv 2605.11781) and *When HTTP 402 Meets
   the Blockchain* (arXiv 2607.19545) — the latter measured 119M
   Base+Solana transactions and quantified facilitator centralization.
   Its registry snapshot (April 2026): **13,760 endpoints across 420
   domains, top 9 domains holding 87.8%**. Two gifts: a CITABLE
   denominator to replace the unverified ~59,818 figure, and the shape
   of the field — 420 domains with a fat head means meaningful
   coverage is actually reachable. Papers are snapshots; nobody sells
   continuous, signed, per-subject observation. The lane is still
   empty.

2. **The receipts-namespace race is crowded and moving.**
   draft-hopley's JCS/RFC-8785 canonicalisation discipline is at
   revision -04 (actively maintained); a second author, draft-vauban,
   has three drafts including post-quantum STARK receipts with a
   Starknet anchor; AlgoVoi ships conformance vectors cross-validated
   across eight implementations. The land-grab window for
   `scvd-attestation/v1` as THE vocabulary is closing. The play
   shifts: be precisely documented and issue at volume, not own the
   namespace.

3. **ERC-8183's evaluator role is confirmed against the spec text:**
   jobs run Open → Funded → Submitted → Terminal, and *"an evaluator
   who alone may mark the job completed"*, attestation on the ledger.
   Base contracts are on GitHub; EF-cohosted builder sessions are
   running. "Customer, not rival" is a standardized slot someone will
   fill.

**The JCS question, answered same day it was asked:** our canonical
form (`canonicalizeCertificate` and its nine siblings) is
declared-field-order JSON, NOT RFC 8785 sorted-key JCS. Converting
would invalidate every signature this store has ever issued — the
exact thing the legacy-form machinery exists to never do. So we do not
convert. We DOCUMENT: the namespace spec should state our
canonicalisation discipline as precisely as draft-hopley states
theirs, name the divergence, and leave JCS interop as a stated v2
consideration. That is a spec edit, not a build.

---

## The Foundation: what it changes for us, and what it does not

The keeper's question, answered as a plan rather than a mood.

**Regulation: nothing new lands on us.** The x402 Foundation is a
standards body under the Linux Foundation, not a regulator — its
existence creates no licence, registration or reporting duty for a
merchant using the protocol. Our real regulatory posture was set by
rulings already made, and the news CONFIRMS them rather than
challenging them: no custody, no resale, no escrow, no automatic money
movement, keeper pays refunds by hand. Those are exactly the choices
that keep this store out of money-transmitter territory while
Visa-and-Mastercard-grade compliance products move in around it. Hold
the line; the boring answers were right.

**Standards: "conformance" is about to have an owner that is not
Coinbase.** Our preflight battery and audits test x402 v2 as shipped.
A formal governance body means working groups, ratified revisions, and
eventually a v-next — at which point "conformance against published
criteria" silently becomes "conformance against LAST year's criteria"
unless we track it. The discipline already exists (the battery is
versioned); what is missing is the trigger. PLAN: watch x402.org
announcements and the Foundation's spec output the way the ward
watches endpoints; when a ratified change lands, cut a new battery
version the same week and say which standard each version tests. The
receipts drafts (hopley/vauban) are likely to land in these working
groups — our JCS divergence note in the namespace spec just became
load-bearing.

**Positioning: independence gets MORE valuable and needs one guard
rail.** "The trust layer of the x402 economy" is a positioning claim,
not an affiliation claim — keep it. But now that a real foundation
owns the name x402, diligence readers will ask whether we are
affiliated. PLAN: a plain non-affiliation line where diligence looks
(trust.json, /attestation): independent, no affiliation with the x402
Foundation, and that independence is the product — a foundation of
payment incumbents has interests; an observer with a $0.005 shop and a
signing key has only its record. Never their marks, never "official."

**Opportunity, keeper's call: join it or not.** LF foundations
typically carry cheap-or-free associate/community tiers. Membership
buys early sight of standard changes and a seat near the registry
question — and auditors join standards bodies without compromising
independence, PROVIDED it is disclosed. Worth ten minutes to look up
the tiers. If we join: say so publicly, same page as the
non-affiliation-in-judgment line. If not: nothing is lost while the
output is public.

**Registry: when the Foundation blesses one, the ward reads it day
one.** Ruling 6 already says every public directory, uniformly. A
Foundation-operated registry would be the highest-quality population
source yet and the moment coverage claims get comparable across
observers.

---

## Decided this week, small

- **x402-list monitoring:** currently watches `hello`,
  `small_blessing`, `daily_fortune` — all novelty doors, so the one
  public uptime page markets the fortune cookies. ADD the six instant
  trust-tier doors: `settlement_attestation`,
  `settlement_reconciliation`, `service_audit`, `conformance_watch`,
  `attestation_bundle`, `bitcoin_anchor`. Do NOT add human-queue or
  stocked items — the shutter and sold-out honesty read as downtime to
  a monitor.
- **The directory description** ("The trust layer of the x402
  economy…") fits the AEO plan: same wording family as `position.ts`,
  silent on delivery ordering so it cannot rot the way "settles first"
  did. If the field takes one more sentence, add the escrow boundary —
  it earns more each week as PayCrow/x402Resolve/Nevermined crowd the
  same gap.

---

## Open, ranked (everything else was closed or is archived)

**1. First outside dollar for the verification tier.** Still $0 while
the economy under the position 10×'d its legitimacy. Everything below
serves this.

**2. The ward widens (ruling 6, queued).** Union of every public
directory, uniformly. The 420-domain finding makes this tractable, and
it swaps the corpus denominator to a sourced figure at the same time.

**3. The namespace-spec edit** from the JCS finding above. Cheap,
defensive, and the interop story is worth more than the land grab now.

**4. ERC-8183 base contracts — a real read.** The evaluator slot is
concrete enough to prototype against. First thing that looks like a
standardized home for what this store already does.

**5. The Tab.** Built, green, zero strangers. In order: the mail-sweep
routine (SWEEP.md is contract, routine unwritten — it is the reason
anyone installs), CV testing (segments exist at
`docs/CV_TEST_SEGMENTS.md`; re-pin to current main before handing
over — the old pin `7a67130` is stale), npm publish (scvd-tab is a 404
on npm; free distribution for a finished server), THEN the aggregation
endpoint (layer 3) once there is anything to aggregate. Part 1 of the
test plan still needs the keeper or an unprimed instance — an agent
that has read the plan proves nothing.

**6. Commission Desk build (ruling 7):** `the_collab` first,
request → quote → agreed price, public replies on declines.

**7. The criteria page** (unblocked by ruling 3: a badge is a dated
observation that ages, never retires).

**8. Small queued rulings:** `basis` field for estimated burn (4);
monthly bank-CSV reconciliation (5).

**Keeper-only, unchanged:** wallet-law blanks (hard cap, period,
ask-first — still blocks the settlement-attempt lane) · GitHub
private? (recommendation on record: keep code public, move strategy
docs) · AEO stragglers: `/directory.ts` + `/schemas.ts` JSON-LD with
the corpus `Dataset` markup, and a contradiction-read of
`security.txt` / `did.json`.

---

## Sources for the scan

- Linux Foundation: x402 Foundation operational launch —
  linuxfoundation.org/press/linux-foundation-announces-operational-launch-of-x402-foundation…
- CoinDesk: 75M payments / $24M / member list —
  coindesk.com/tech/2026/07/15/visa-mastercard-and-ripple-join-the-standard…
- arXiv 2607.19545: *When HTTP 402 Meets the Blockchain* (119M tx,
  13,760 endpoints / 420 domains)
- arXiv 2605.11781: *Five Attacks on x402*
- eips.ethereum.org/EIPS/eip-8183 (the evaluator text)
- datatracker.ietf.org: draft-hopley-x402-canonicalisation-jcs-v1-04,
  draft-vauban-x402-consolidated-00
- chainalysis.com/blog/x402-agentic-payments-adoption
- infoq.com/news/2026/07/cloudflare-aws-x402-micropayment
