# THE INSTRUMENT AUDIT — 2026-08-28

**The placement-read class, hunted store-wide before a paying customer
finds it.**

Commissioned 2026-08-27, after the keeper caught the market desk
publishing "0% of ready doors serve signed offers" as an ecosystem
fact when the instrument (a) read only the challenge header while the
offer-receipt convention places offers in the 402 body, (b) measured
one registry's listings while the caption spoke for the market, and
(c) never said its denominator excluded our own door.

**Status: findings recorded 2026-08-28 at HEAD `2114535`; the
keeper's word to fix arrived the same day, and the fixes shipped in
five commits on this branch** ("The words step back…", "The verifier
never fetches…", "The battery reads both placements…", "Our
blindness stops booking…", "The paid shelf says what it runs…").
§9 records what shipped against each table row and what remains
open. The findings below are left as found — they are the dated
record of what the instruments were, and the diffs are the record
of what changed. The corrections drafts in §4 are still DRAFTS —
the corrections record is hand-written by a person, on purpose, and
this branch does not touch src/store/corrections.ts; each draft's
proposed mechanism now exists in code, so an entry the keeper files
can cite a shipped mechanism rather than an intention. Method: for every quantitative or
verdict-shaped claim the store publishes, read the caption, read the
code that computes it, and diff the two. Every finding below was
verified against the computing code path; the top-ranked rows were
independently re-verified a second time before this document was
written.

The rules this audit is judged under: 43 (dated observation, never a
score), 45 (words follow facts), 46 (a guard that cannot fail argues
for the lie), 52 (a capped reading cannot publish a floor as a
total), 54 (refusal easier than acceptance), 30 (nothing publishes
without a hand), and B10 (named states with denominators, never a
bare percentage).

---

## 1. The reference defect at HEAD, precisely

| Half | State at HEAD | Evidence |
|---|---|---|
| (a) header-only offers read | **Live.** `runChecks(response, bodyOverLimit)` never receives the body (src/services/preflight.ts:544); the challenge parses solely from the PAYMENT-REQUIRED header (:598-611) and `extensions["offer-receipt"]` is read off it (:827). `probeOnce` fetches the body (:531) and uses it only for a size flag. Same read in `offerFacts` (src/services/market.ts:144-149) and `signerKidsFromChallenge` (src/services/watch-evidence.ts:76-91). The house convention places offers in the 402 **body** (src/lib/offer-receipt.ts:19-26); the header splice is our till's *additional* placement (src/lib/payment-gate.ts:184-207) — our own door emits both. The merge pattern already exists in-house: the launch check reads header-then-body (src/services/launch-check.ts:598-608). | preflight.ts:531, 544, 598-611, 827; market.ts:144; launch-check.ts:608 |
| (b) narrow measure, broad caption | **Partially retreated.** The headline now carries its counts ("N% … (S of R)", src/pages/admin/market-page.ts:166) and /registry's prose says "structurally valid JWS … Signatures are NOT verified by this census" (src/routes/registry.ts:99). But the ecosystem-thesis paragraph stands (market-page.ts:169), the census landing copy still says "34 of 35 hosts serve no signed offers **at all**" (src/store/copy/census.ts:19), and the machine-readable half of /registry still says "**verifiable**" (§2 row 15). | market-page.ts:166-169; census.ts:19; registry.ts:176-180 |
| (c) self-exclusion unstated | **Live.** The walk skips our own host (src/services/ward-round.ts:482, :717-719; src/lib/probe-target.ts:211-219 — a Worker cannot self-fetch), which is mechanically correct — but no public caption on /registry, /corpus, or the landing pages says the denominator excludes the one door known to serve signed offers. | ward-round.ts:482; probe-target.ts:211-219 |

The store currently reads the offers extension three different ways:
market desk and preflight battery (header only), launch check (header
or body, header wins), conformance desk (artifact pasted in, so
placement-neutral). Three instruments, one extension, three answers.

---

## 2. The table

Columns as commissioned: claim/instrument → what's actually measured
→ defect class → sold or about-to-be-sold → fix size (hours). Ranked
by (sold-soon × wrongness). Classes: **SP** single-placement/format
read · **SI** scope inflation · **UD** unstated denominator · **SM**
staleness/basis mixing · **SB** self-blindness · **GCF** guard that
cannot fail (rule 46).

| # | Claim / instrument | What's actually measured | Class | Sold? | Fix (h) |
|---|---|---|---|---|---|
| 1 | `signed-offers` / `no-signed-offers` across the battery — the paid $5 service audit signs the advisory, the paid $5 conformance watch signs it **daily**, the free preflight serves it (preflight.ts:827-857) | Presence of `extensions["offer-receipt"]` in the PAYMENT-REQUIRED header only; the 402 body — the convention's primary placement — is fetched and discarded | SP | **Sold now** ($5 ×2, free flagship) | 4-8 |
| 2 | "A census … found 34 of 35 hosts serve no signed offers **at all**" — census.ts:19, printed on /corpus and /conformance landings (corpus-landing.ts:27,76; conformance-landing.ts:44,79) | One registry's hosts, header-only read, own door excluded; "at all" asserts an absence the instrument could not see | SP+SI+SB | Sales copy for the conformance shelf | 2 + re-census |
| 3 | Night Watch: "try the handle: answers 402, challenge parses, **a buyer could pay**" (menu-utility.ts:27) | v1 battery: four structural checks (standing-watch.ts:276,310); no payTo payability, no amount grammar, no rail read — a door with an ENS payTo or no token account reads `ready` for 168 signed hours | SI | **Sold now** ($5) | 0.5 copy; battery = keeper's call |
| 4 | Conformance desk: "Set false to refuse did:web resolution", "Past the budget nothing is denied … signature unchecked" (conformance.ts:804,814-815) | `verifyArtifact` is called with no `fetch` option (conformance.ts:565-569); with no resolved key and a did:web kid the verifier falls back to bare `globalThis.fetch` (verifier/x402-verify.js:206,336-338) — redirect-following, un-timed, un-sized, outside the budget and outside `guardedFetch`'s bypass-closing | rule 45 | Free flagship; named backstop in two paid artifacts' captions | 3-4 |
| 5 | Conformance desk: "A failure here is a fact about the document" (conformance.ts:431-433) | Attempted-and-failed key resolution (issuer's DID host down 3s from our vantage; budget exhausted mid-path) yields `does_not_conform` (conformance.ts:760-766) — our blindness booked as the subject's nonconformance; `could_not_check` exists and is reserved for `not_attempted` only | SB | Free flagship | 2-3 |
| 6 | Trust profile: "The newest observation wins in BOTH directions", "the index drops you until the evidence recovers" (menu-utility.ts:466,498); "a host that breaks mid-term shows broken on its own page" (profiles.ts:68) | `viewOf` derives from census `subjectHistory` only and never reads the paid refresh (routes/profiles.ts:34-55) — a $1 refresh that finds the door broken turns the chip dark while the $19 page stays ready-side up to a week | SM + rule 45 | **Sold now** ($19, interacts with $1) | 2 |
| 7 | Service audit: "runs the same published battery the free preflight runs" (menu-utility.ts:52) | v1 core only: `performServiceAudit` discards `l3b` and `accepts`, never runs the rail read (service-audit.ts:135-139) — the $5 signed artifact can call `ready` a door the free /api/preflight/v2 publicly calls `not_ready`; the lag is pinned as expected by test (battery-inside-the-bytes.spec.ts:107-108) | SM+SI | **Sold now** ($5) | decision + 3-6 |
| 8 | Conformance watch signed passes: sold as "the full published preflight battery" (menu-utility.ts:83) | Signed bytes carry **no battery citation** (canonicalizeConformancePass, conformance-watch.ts:83-100) in the month the battery moved twice; no `observer_status` on unreachable (:150-163); `passes_recorded` counts refused rows (:282) — the B11 inflation standing-watch fixed | UD+SM+SB | **Sold now** ($5) | 3-5 |
| 9 | Launch check offers stage: "no signed offers carried in the challenge" (launch-check.ts:737-738) | `challenge = headerChallenge ?? bodyChallenge` — header wins — and offers are read from that one object (:608,:728-732); a header+body door's body offers are invisible and the absence is signed into a served-forever $5 record | SP | **Sold now** ($5) | 4 |
| 10 | Self-passport summary: captioned "every value is DERIVED from the same locals" (passport.ts:70-79), "derived while this page rendered" (routes/passport.ts:95-96) | `issueSelfPassport` hardcodes `verdict:"ready", freshness:"fresh", failed:[]` (passport.ts:381-399) regardless of its own modules, which can derive `"conflict"` — rule 46's shape on the flagship trust artifact | GCF+SB | Adjacent (sells the $1/$5/$19 shelf) | 3 |
| 11 | Own passport chip: "observed inside one census cadence" (badge-svg.ts:154); route doc: "a broken host's chip does not render" (badges.ts:33-36) | For our own host the chip derives from the hardcoded self-passport (badges.ts:46-56), so the refusal gate can never fire — our chip is green-by-construction and dated today forever, pixel-identical to a census-observed chip | SB+SI | Adjacent (the chip's decay sells the refresh) | 2 |
| 12 | Paid per-host history (`/corpus/host/{host}.json` → spot_check $0.001, passport, $19 profiles) | Verdict changes and coverage counted with **no** `observer_status` check (subject-history.ts:227-239) — our blind week publishes, in sold artifacts, as the subject's `ready → unreachable` transition; deriveTrajectory and deriveDiff both filter degraded, this path doesn't | SB | **Sold now** | 2-3 |
| 13 | Corpus market block: "Listed doors that answer no 402 at all (wrong status or dead)" (market.ts:279) | `dead` counts every `unreachable` row ignoring `observer_status` (market.ts:320-325), violating the row contract at ward-round.ts:188-196 ("must not count this row against the host or as coverage") — one bad egress week signs fabricated mass-rot into the Bitcoin-anchored chain | SB | Anchored; cited by paid artifacts | 2-3 |
| 14 | The 2026-08-26 corrections entry: "a test that holds the citation to account … so a row can never again name criteria the code does not apply" | census-battery.spec.ts:44-55 compares `BATTERY_ADDS[v2]` to `censusFoldedCheckNames()`, which literally returns `[...BATTERY_ADDS[PREFLIGHT_VERSION_NEXT]]` (ward-round.ts:46-48) — a constant checked against itself; delete the L3b fold from `probeHost` and it stays green. The trio is held behaviorally nowhere on the probe path | GCF | Governance of the anchored record | 1-2 |
| 15 | /registry machine half: `"working doors serving verifiable signed offers (percent)"`, bare `PERCENT` (registry.ts:176-180; Dataset description :193; table note :246-248) | The A2/H1 corrections fixed the prose; the JSON-LD — which the code's own comment (:159-165) says "matters more" because indexers quote it verbatim — still says "verifiable" and "working" and ships the bare % | SI+UD (B10) | Public, machine-quoted | 1 |
| 16 | /registry: "knocks once on every door listed in public x402 discovery" (registry.ts:224-229) | WARD_CAP=750; `buildRegistryWeek` (registry-pulse.ts:74-94) **drops** coverage_suspect/capped/coverage_pct at publish — a capped reading published with no way to say it was a floor (rule 52); probes come from one registry while fuchss (~10k hosts) is population-only | SI+UD | Public | 3-4 |
| 17 | /corpus/diff.json: "the cheapest real agent loop is 'poll the diff, act on transitions'" (corpus.ts:198-199) | `appeared`/`disappeared` include the door bank's rotating `revisit` cursor; `transitions` exclude degraded but not `not_probed` (trajectory.ts:195-203) — the private `wardDelta` filters both, with comments naming this exact failure (ward-round.ts:1079-1111); the public surface didn't inherit the protections | SB+SI | Free, "act on it" copy | 2-4 |
| 18 | /corpus/trajectory.json and diff across weeks | Verdict criteria changed 2026-08-24 and 2026-08-26; `WeekPoint` has no battery/basis field, so a door failed by a check that didn't exist last week publishes as the door's transition — rails got RAIL_BASIS (market.ts:48), verdicts didn't | SM | Free; "state-of-the-market reporting asset" | 2-4 |
| 19 | Market price sample: "doors quoting recognizable USDC" (registry.ts:115-117) | `USDC_ASSETS` = Base + Solana mints only (market.ts:30-33); `POLYGON_USDC` exists one import away (base-rpc.ts:26) — every Polygon-USDC-priced door silently drops from the sample and median; the comment "can never disagree with the till" is currently false | UD | Public + anchored | 1-2 |
| 20 | /stats: "base + solana + rail_not_recorded always equals organic_settlements" (routes/stats.ts:49); storefront ledger line | `organic_by_rail.polygon` exists and is counted (services/stats.ts:255-257,274) — the published self-check identity goes false on the first Polygon sale; `storefrontLedgerLine` omits polygon from guard and parts (:350,:361-367), so parts can sum below the stated total | UD (latent) | Public | 1 |
| 21 | Fresh-set / OKF: "this is one observation, at the time in observed_at" (fresh-set.ts:85); "On ${set.observed_at} this store walked ${row.url}" (okf.ts:116) | `observed_at: round.at` unconditionally (fresh-set.ts:154) — on long-walk weeks the probe ran up to ~6 days before assembly; staleness arithmetic flatters freshness | SM (rule 43: wrong date on a dated observation) | Free routing surface | 3-5 |
| 22 | OKF: `generated.by`/`verified[].by` = "scvd-census/preflight-v1" (okf.ts:37,100-105) | Rows are produced under v2 (ward-round.ts:38) — the 2.5 corrected defect's exact label shape, recurring on a consumer-trust surface two days after the correction shipped | SM | Free | 1 |
| 23 | Launch check purchase note: "the settlement is on chain from our declared wallet" (copy/deliverables.ts:174); verify step 3 (routes/launch-check.ts:33) | `verdict="settled"` on any 2xx after presentation — including PAYMENT-RESPONSE absent (tx_hash null) or chain read NOT_FOUND with `tx_hash_status:"claimed"` (launch-check.ts:928-957,1080-1089); the note can't see `tx_hash_status` | SI (rule 45) | **Sold now** ($5) | 2 |
| 24 | Preflight refusal copy: "Our own 402s pass these exact checks in CI on every build" (preflight.ts:1039-1046) | The dogfood test destructures only `{checks}` (test/preflight.spec.ts:26) — v1 core only; l3b and the rail read are never proven on our own door, while the sentence is served to v2 callers too | SI (about ourselves) | Free | 2-4 |
| 25 | /pulse: "N agents were offered a price" (routes/pulse.ts:81-83) | `organic_challenges` counts 402 responses, not agents (metrics.ts:196-226) — the porch's own comment refuses head-counting; this caption doesn't | SI | Public | 1 |
| 26 | trajectory `hosts_listed`: "every host the round's feeds named" (trajectory.ts:35-36) | `listed_resources ?? hosts.length` — discovery-feed resource rows, pre-dedupe, one feed only, with a silent semantic fallback on old weeks (trajectory.ts:110) | UD+SM | Free | 1-2 |
| 27 | Fresh-set: "{probed} listed doors probed" (fresh-set.ts:99, JSON-LD :55-57) | Includes `source:"revisit"` rows — "no feed named it THIS round" — the exact listed/probed substitution the H2 correction fixed on the per-host page (subject-history.ts:242-257) | UD | Free | 1-2 |
| 28 | Attestation INSUFFICIENT_MATCH reading: "wrong recipient, wrong amount, or no USDC movement at all" (attestation.ts:197-199) | `classify` also lands there on nonce mismatch alone (:332,:351-354) — a right-recipient right-amount wrong-nonce buyer is told the seller paid the wrong party; echoed transfer is `transfers[0]`, an arbitrary pick | UD (unnamed state) | **Sold now** ($0.004) | 1 |
| 29 | REACHED_LEVEL_MEANING: "This battery does not measure L3b internal consistency" (preflight.ts:901-902) | Served unconditionally while v2 folds the L3b trio the code itself names (:127-137) | SM | Free | 0.5-1 |
| 30 | Corpus index `hosts_observed` (corpus.ts:139) | `round.hosts.length` includes `not_probed` population rows the round explicitly excludes from ready arithmetic (ward-round.ts:136-143) | UD | Free | 1 |
| 31 | Market desk aggregates "plain arithmetic anyone can recompute" (ward-round.ts:267-272) | True, but nothing in CI recomputes a stored round's `market` block from its own `hosts` rows — chain verification proves bytes, not derivation | GCF-adjacent | Anchored | 1-2 |
| 32 | Self-exclusion, store-wide (reference (c)) | `population_known`, coverage, market aggregates, trajectory, fresh-set, wallet clusters all silently exclude our own door; zero public disclosures found by grep | SB+UD | Public + anchored | 0.5-1 (captions) |

**Minor residue** (all verified, none sold-critical): corpus
`honest_limits` false dichotomy on absent hosts (corpus.ts:130);
corpus landing points reproducers at the wrong instrument for the
battery ("the same one the free desk serves", corpus-landing.ts:95);
`pay_to` capture cap of 4/door unstated in wallet-facts cluster
counts (market.ts:166); `listCorpus` drops `truncated` (latent to
~2045, corpus.ts:194-201); "a body-only challenge fails every
standard client" — an every-client claim measured on zero clients,
contradicted by our own launch check's body fallback (preflight.ts:604
vs launch-check.ts:608,629); `bodyOverLimit` counts UTF-16 units and
says "stopped reading" when it read it all (preflight.ts:531-536);
"the party that signed" asserted on paths where the signature check
reads "not checked" (conformance.ts:688-689); watch HTML drops the
degraded/unreachable distinction its own JSON makes (watch.ts:45-79);
v2's folded checks get no `not_reached` vector row
(preflight.ts:922-927); the $5 audit's `checks` array still has the
welded-silence shape the tri-state vector was built to kill
(service-audit.ts:136-138); passport modules undated inside a dated
artifact (cite-module.ts:23-30); passport history %
without its "OUR coverage, not theirs" sentence (passport.ts:338-345);
self-passport's two disagreeing history URLs (passport.ts:206 vs
:406); market-page rot headline "listed" vs probed denominator
(market-page.ts:175); "one signed GET" claimed where signing is
conditional on key material (web-bot-auth.ts:273-278); stamp streaks
keyed to an unauthenticated name slug; service audit and launch check
carry no `stale_after` (a **ruled** gap — the expiry-label ruling
says v1 doesn't carry it — recorded because they are the two
most-quoted stored readings); `SettlementObservation` type omits
`stale_after` though both rails sign it (attestation.ts:129-148).

---

## 3. The top five, written out

### Finding 1 — The placement read is a habit, not an incident

The caught defect was one desk. The habit is the battery. Everything
downstream of `runChecks` — the free preflight, the $5 service audit,
the $5 conformance watch (which signs `no-signed-offers` into a
paying customer's daily record), the weekly census, the market desk,
and the Bitcoin-anchored corpus — asserts the absence of signed
offers after reading exactly one of the two placements our own till
emits, and the one it reads is the *secondary* placement
(offer-receipt.ts:19-26 names the body as where offers go; the header
splice at payment-gate.ts:184 exists because our till adds it). The
census headline — "34 of 35 hosts serve no signed offers **at all**"
— is the store's most quotable fact, printed on the two landing pages
that sell the conformance shelf, and "at all" is precisely the claim
the instrument cannot make. `signer_kids`, billed as "the ecosystem's
only key-rotation history" (ward-round.ts:168-177), inherits the same
blindness: a body-only issuer's signers are absent from the anchored
record forever. And per reference-half (c), every denominator
excludes the one door known to serve signed offers — ours — and no
caption says so.

**Wrongness:** a spec-following, body-placing seller is told — in
signed, sold, and in one case anchored bytes — that they ship
nothing. Whether any of the 34 actually serve body-placed offers is
unknown, which is the point: the instrument never looked.

**Proposed mechanism (no fix without the keeper's word):**
1. Thread the already-fetched body into `runChecks` and read
   `extensions` from header-then-body, the exact merge the launch
   check already does (launch-check.ts:598-608). This is a battery
   change: it lands as v3 (or a dated v2 changelog entry) under the
   frozen-series law, never as a silent edit to v1's meaning.
2. Recut the advisory to name the placement read ("read from the
   PAYMENT-REQUIRED header and the 402 body"; on frozen v1, "read
   from the header; body not read").
3. Add `signed_offers.basis` to the market aggregate the way rails
   carry `RAIL_BASIS` — old weeks keep the shape they were measured
   in, and the anchored history says which weeks were measured which
   way.
4. Caption sweep: census.ts "at all" → placement-scoped and dated;
   /registry offersLine and JSON-LD; both landing pages; one
   sentence stating the self-exclusion beside every denominator that
   has it.
5. A header+body-split door fixture, and a test that fails if the
   battery ever again asserts extension absence from fewer
   placements than the store's own till emits.
6. Corrections entry (draft CD1, §4) once the keeper confirms the
   wording.

### Finding 2 — The conformance desk's verifier can fetch outside every guard, and books our blindness as their nonconformance

The desk's promises are exact: `resolve_key:false` "refuse[s] did:web
resolution"; past the budget "nothing is denied … signature
unchecked"; resolution that does happen goes through `guardedFetch`
(redirect-refusing, sized, timed, self-resolution-shimmed). But
`checkConformance` calls `verifyArtifact` without a `fetch` option
(conformance.ts:565-569), and the verifier's own `resolveDidWeb`
defaults to `globalThis.fetch` (x402-verify.js:206,336-338) whenever
no key was established and the kid is did:web — which is exactly the
resolve_key:false path, the budget-exhausted path, and the
guarded-resolution-failed path. On those paths the desk makes a bare,
redirect-following, un-timed, un-sized request to a stranger's host
after promising none, outside the budget that exists to bound it.
Separately, the verdict chain (conformance.ts:760-766) reserves
`could_not_check` for `not_attempted` only: resolution that was
*attempted and failed* — the issuer's DID host slow from our vantage
for three seconds — produces `does_not_conform`. That is our outage
booked as the subject's defect, the failure class `observer_status`
was invented to end, on the flagship free instrument whose caption
says "a failure here is a fact about the document."

**Proposed mechanism:** pass a fetch into `verifyArtifact` on every
desk path — `guardedFetch` when resolution is permitted, a refusing
fetch (`() => { throw }` surfacing as `key-resolution: refused`) when
it is not; map attempted-and-failed resolution to `could_not_check`
with the reason in the detail; a test per `key_resolution` state
asserting zero unexpected egress (count fetch calls), which is the
test shape that would have caught this.

### Finding 3 — The paid shelf is shallower than the free instrument, and the copy points the other way

Three of the four $5 evidence products run a shallower battery than
the free door. The service audit cites v1 honestly in its signed
bytes but is sold as "the same published battery the free preflight
runs" — while the free v2 verdict folds payability and the audit
discards `l3b` and the rail read (service-audit.ts:135-139). The
Night Watch is sold as "a buyer could pay" — an L4 sentence on an
L3a instrument; a door with an ENS payTo or a decimal amount reads
`ready` in 168 signed rows while the store's own free v2 calls it
not ready "by any reading a buyer would accept." The conformance
watch is sold as "the full published preflight battery" and signs
passes that carry no battery citation at all — the one
D6-uncorrected artifact class, in the month the battery moved twice —
plus no observer accounting and a `passes_recorded` that counts
refused rows (the B11 inflation its sibling fixed). A buyer paying
$5 gets a shallower, less self-accounting verdict than a buyer
paying nothing, and only a version string says so. The lag is even
pinned by test (battery-inside-the-bytes.spec.ts:107-108) — the day
the audit should move, a test will argue for the lag.

**Proposed mechanism:** keeper's decision first (rule 30) — either
the paid artifacts fold v2 (criteria bump under the frozen-series
law) or they carry `also_under` the way the free report does, so the
two verdicts sit side by side in the signed bytes. Either way: the
three menu sentences change the same day (words follow facts, rule
45); the conformance watch appends `battery` to its canonical
preimage under the append-law standing-watch demonstrated twice; new
rows only, old signatures untouched.

### Finding 4 — The trust surfaces are self-blind exactly where they sell decay

The passport family's pitch is that verdicts decay and refusal is
structural: chips age, broken hosts go dark, "the newest observation
wins in BOTH directions." Three places break it. (i) The
self-passport hardcodes `verdict:"ready", freshness:"fresh",
failed:[]` (passport.ts:381-399) while its own modules can derive
`"conflict"` — the summary is captioned "DERIVED from the same
locals" and it is not derived, it is asserted; rule 46 names this
shape. (ii) Our own chip therefore cannot go dark
(badges.ts:46-73) and carries the sub-caption "observed inside one
census cadence" — a census that structurally never observes us. A
reader comparing our permanently-green, dated-today chip to a
competitor's expired one is comparing two instruments wearing one
face. (iii) The $19 trust profile ignores the $1 refresh entirely
(profiles.ts:34-55 reads census history only), so the copy's
"a host that breaks mid-term shows broken on its own page" is false
in the exact window it matters: a refresh that records `broken`
kills the passport and the chip while the paid standing page stays
ready-side for up to a week.

**Proposed mechanism:** derive the self-summary from the modules
(any `conflict` ⇒ not "ready", freshness "indeterminate", `failed`
names the conflicting module ids) with a forced-conflict fixture;
mark the self chip SELF on its face and let it go dark on conflict
like everyone else's; fold `readPassportRefresh` into `viewOf` with
the same newest-wins comparison the passport already uses, plus one
broken-refresh-mid-term test.

### Finding 5 — The observer-accounting and basis-marking fixes never propagated to the record that can't be rewritten

`observer_status` (B6) and basis marking (RAIL_BASIS) are the house's
own corrections — and the surfaces that matter most never adopted
them. The market block signs degraded-observer rows into the anchored
chain as ecosystem rot (market.ts:320-325, against the row contract
at ward-round.ts:188-196). The paid per-host history publishes our
blind weeks as the subject's verdict changes (subject-history.ts:227-239),
feeding spot_check, passports, and $19 profiles. The public diff
publishes the revisit cursor's motion and feed-coverage changes as
hosts appearing, vanishing, and transitioning (trajectory.ts:195-203)
while the private `wardDelta` filters both and its comments name this
exact failure. Trajectory compares verdicts across three battery
epochs with no basis field — rails got RAIL_BASIS; verdicts didn't.
And the test that was supposed to hold the census's battery citation
to account is a tautology: `censusFoldedCheckNames()` returns the
constant the test compares it to (ward-round.ts:46-48 vs
census-battery.spec.ts:44-55) — a guard that cannot fail, standing
inside a published correction's `what_changed`.

**Proposed mechanism:** filter/attribute `observer_status` in
`marketAggregates`, `subjectHistory`, and `deriveDiff` exactly as
`deriveTrajectory` and `wardDelta` already do; add a battery/basis
field to `WeekPoint` and refuse cross-epoch transitions (or mark
them); replace the tautology with three behavioral cases through
`probeHost` in ward-round-rail.spec's shape (unpayable payTo, decimal
amount, testnet network each turn a stubbed door `not_ready`); add a
CI step that recomputes the latest sealed round's `market` block from
its own `hosts` rows.

---

## 4. Corrections-entry drafts — awaiting the keeper's hand

Rule 30: the corrections record is written by a person. These are
drafts in the record's own shape, offered for the keeper's editing
and his decision on which belong at all. Nothing below has been added
to src/store/corrections.ts. Dates are left as the keeper's call —
the honest date is the day the correction ships, not the day this
audit found it.

**CD1 — the census signed-offers claim.**
- *what_was_wrong:* "The store's most-quoted fact — '34 of 35 hosts
  serve no signed offers at all' — and every signed-offers number
  downstream of the weekly census asserted an absence the instrument
  could not see. The probe read the offers extension only from the
  PAYMENT-REQUIRED header, while the offer-receipt convention places
  offers primarily in the 402 body — a placement our own till emits
  and our own battery never parsed. The denominator also silently
  excluded this store's own door, the one door known to serve signed
  offers, and no caption said so. Whether any of the 34 served
  body-placed offers is unknown, which is the defect: 'at all' was
  published where 'in the one placement we read' was the
  observation."
- *how_long:* "From the census of 2026-08-03 on every surface that
  quoted it, and in every weekly round's signed_offers aggregate
  since the market desk shipped."
- *found_by:* "The keeper, catching the market desk's '0% of ready
  doors serve signed offers' on 2026-08-27; the audit that followed
  found the same read in the battery every paid and free instrument
  shares."
- *what_changed (proposed):* "The battery reads both placements —
  header and body — as a dated battery change under the frozen-series
  law, and the advisory names the placements read. The market
  aggregate carries a basis field the way rails carry RAIL_BASIS, so
  post-fix weeks can never silently mix with header-only history in
  the anchored chain. A fixture door serving offers only in the body
  fails the build if the battery ever again asserts absence from
  fewer placements than the store's own till emits. Every caption
  that quotes the number states the placement scope and the
  self-exclusion."

**CD2 — the correction whose mechanism could not fire.**
- *what_was_wrong:* "The 2026-08-26 correction promised 'a test that
  holds the citation to account… so a row can never again name
  criteria the code does not apply.' The test compares the battery's
  check list to a function that returns that same list — a constant
  checked against itself. Deleting the folds from the probe would
  leave it green. The promise in the corrections record was not kept
  by the mechanism that shipped beside it."
- *how_long:* "Since the correction shipped, 2026-08-26."
- *found_by:* "This audit, reading the test the correction cites
  against the code it claims to hold."
- *what_changed (proposed):* "The citation is now held behaviorally:
  a stubbed door with an unpayable payTo, a decimal amount, and a
  testnet network must each score not_ready through the census's own
  probeHost — the same shape ward-round-rail.spec already uses for
  the rail fold. The tautology is retired. Rule 46 gets this entry as
  its fifth face: a guard comparing a constant to itself is a guard
  that argues for the lie."

**CD3 — the watch that promised payability.**
- *what_was_wrong:* "The Night Watch's shelf copy said the hourly
  probe checks that 'a buyer could pay.' It never did: the watch runs
  the v1 structural battery — 402, header, version, accepts — and no
  payability check at all. A door with a name for a payTo, a decimal
  amount, or a testnet network read ready in 168 signed rows while
  the store's own free v2 preflight called the same door not ready by
  any reading a buyer would accept."
- *how_long:* "Since the watch was listed with that sentence."
- *found_by:* "This audit, diffing the shelf copy against the battery
  the watch actually cites in its signed bytes (which was always
  honest: preflight-v1)."
- *what_changed (proposed):* "Either the watch folds the payability
  battery (a criteria change, named in the signed bytes) or the copy
  says what v1 checks. Words follow facts; the signed rows were
  honest and the shelf was not."

**CD4 — the standing page that ignored the refresh.**
- *what_was_wrong:* "The $1 passport refresh was sold with 'the
  newest observation wins in BOTH directions — a broken finding turns
  the chip off,' and the $19 profile page with 'a host that breaks
  mid-term shows broken on its own page.' The chip and passport kept
  that promise; the profile page and index never read the refresh at
  all. A door that broke mid-term, with the break recorded by a paid
  refresh, stayed ready-side on its paid standing page until the next
  weekly round."
- *how_long:* "Since profiles shipped."
- *found_by:* "This audit."
- *what_changed (proposed):* "The profile view derives from the same
  newest-wins fold the passport uses, and a test breaks a profiled
  host mid-term with a refresh and requires the page to say broken
  that hour."

**CD5 — the machine half kept the word the prose gave up.**
- *what_was_wrong:* "After the A2/H1 corrections re-worded /registry's
  prose — signed offers 'present and structurally valid,' never
  'verifiable'; 'answering a well-formed challenge,' never 'working' —
  the JSON-LD beside it kept publishing 'working doors serving
  verifiable signed offers (percent)' as a bare percentage. The
  code's own comment says the machine half matters more because
  indexers quote it verbatim; it was the half left uncorrected."
- *how_long:* "Since the prose corrections landed."
- *found_by:* "This audit."
- *what_changed (proposed):* "The JSON-LD PropertyValue names are
  derived from, or test-locked to, the same vocabulary the corrected
  prose uses, and percentages ship beside their counts. A test walks
  every machine-readable caption for the words the corrections
  retired — the same guard that keeps 'automatic refunds' dead."

---

## 5. Pass 2 — every instrument against the fixtures bar

The bar, established precisely: the conformance vectors are a
committed, deterministically regenerable artifact
(scripts/generate-conformance-vectors.mjs); CI re-verifies the
committed bytes with an independent implementation (raw noble
Ed25519, test/conformance-vectors.spec.ts) AND through the shipped
verifier (test/conformance-vectors-v2.spec.ts); a wall-clock tripwire
re-checks at every run that no known-good vector has expired — the v1
defect, returned as a test — plus a structural guard banning the rot
class (validUntil < ~2096 refused); the route serves the same bytes
the tests verified. The "refusal" is CI going red before deploy —
there is no runtime re-verification, and the served claim
"reproduces this file byte for byte" is itself never re-run in CI
(~1h to close).

| Instrument | Re-earns before publishing? | Test shape | Distance from bar |
|---|---|---|---|
| Conformance desk + vectors | At the bar: injected clock, is_stale derived at read, self-resolution byte-identity CI-asserted | Behavioral, negatives included | 0-1h (regeneration step) — but see table rows 4-5: the bar-setter has the fetch hole |
| Launch check | Strongest in house: seller's tx re-verified on chain, replay tri-state, `authorization_outstanding_until` in signed bytes | Behavioral, stage-by-stage, real signer | ~0h |
| Standing watch | By construction: hourly signed rows, gaps derived at read | Executes its own verify recipe; tamper-breaks tested | 0-1h |
| Settlement attestation | Fresh RPC read per purchase; `stale_after` in signed bytes | Behavior carried by sibling specs | 0-1h |
| Census / ward round | Fresh probes, verbatim challenge bytes signed, citation derived | **The tautology** (table row 14); rail fold held behaviorally, L3b trio held nowhere on the probe path | 1-2h |
| Corpus | Chain integrity re-verified at read, per request | Tamper tested as a stranger would | 0-1h |
| Market aggregates | Frozen at seal; derivation never recomputed in CI | Pure-function unit tests good | 1-2h |
| Passport (self) | Half at bar (self-row CI release blocker with a planted conflict), half asserted (hardcoded ready/fresh; join-failure refusal untested) | passport-summary.spec pins "fresh by construction" as expected | 2-4h |
| Free preflight | Battery-as-data digest-verified; door fixtures replayed offline | Dogfood proves v1 core only; **header-only placement pinned as correct by test** (preflight.spec.ts:86-91 + fixtures/doors/header-absent.json) with no external reference — the exact shape of both precedent defects | 2-4h |
| Service audit | Fresh probe per purchase | Behavioral — but battery-inside-the-bytes.spec:107-108 pins the v1 lag as expected | decision + 3-6h |
| Conformance watch | Signed rows carry no battery citation — the one D6-uncorrected class | Behavioral otherwise | 2-3h |

Tests that encode current behavior as spec (the offer-payload class,
where "the earlier tests passed because they required the
violation"): census-battery.spec.ts:44-55 (the tautology);
battery-inside-the-bytes.spec.ts:106-108 (audit-stays-v1 pinned);
preflight.spec.ts:86-91 with fixtures/doors/header-absent.json
(header-only placement asserted with no spec citation);
passport-summary.spec.ts:129 ("fresh by construction" as expected).

---

## 6. Pass 3 — depth against the market

Rung definitions are the evidence review's own (L0-L6). What each
instrument honestly climbs today: free v2 and the census reach
partial L3b plus one read-only receivability fact; the paid $5 trio
(audit, standing watch, conformance watch) reaches **L3a** — the
structural inversion in table rows 3/7/8. Launch check reaches L5/L6
for one door, on commission. The settlement attestation is tx-level
L5 evidence about a named transaction, not a door rung, and says so.

| Rung | What measuring takes | Cost per probe | Smallest honest version | Sells adjacent | Ruled or never asked |
|---|---|---|---|---|---|
| L3b residue (resourceUrl bait-and-switch, accepts-vs-accepts conflicts, amount grammar beyond ".", asset-canonical fold) | Pure functions over bytes every probe already holds; a dated battery change + fixtures | $0, zero extra requests, 4-8h | Fold into lib/value-checks (its consumers are wired) | service_audit ("same battery"), fresh-set rows | **Asked** (ledger B13/B14/B15), no roadmap row, no ruling — a scheduling gap |
| L3c authenticity, endpoint side (desk verifies artifacts; no probe instrument verifies a live door's offers — a forged offer reads `ready` everywhere) | Desk-verify the challenge bytes the ward already stores; `signer_kids` capture exists; one cached did:web GET per offer-serving host | $0 USDC, +1 cached GET/host/round, 8-16h | Verify stored bytes asynchronously, labeled verified/failed/issuer_unreachable/not_served | "**Conformance** Watch" — the name most likely to be read as L3c; the qualifier is one adjective | Asked (B4/B15), desk half built (2.4); endpoint side never scheduled, never declined |
| L3d cross-probe consistency (one GET, one identity, predictable `:30` phase — cloaking and phase-flapping invisible) | B5's intra-tick burst of 3, ~5s apart, reported as a distribution; jitter; optional second identity | $0, 3× fetch volume where applied, ~8h | Burst on PAID watches only — consent already in hand ("name your own door") | standing_watch: 168 probes/week reads as consistency evidence; no disclaimer says one identity, one phase | **Never asked** at roadmap level (B5/B7/B8 ledger-only) |
| L4 purchasability without spend | EVM USDC blacklist `eth_call` (sibling of the shipped Solana ATA read — nothing in base-rpc.ts does it); Solana `state` field already fetched and discarded (solana-rpc.ts:106); the in-house eip712-extra signability guard pointed outward; simulation without broadcast | $0 USDC, 1-2 public-state RPC reads per priced door, 8-12h per family | Blacklist read beside the ATA read with the same three-outcome honesty (fail/pass/our-gap) | standing_watch's "a buyer could pay" — the sharpest copy-vs-instrument gap in the catalog | **Never asked** (blacklist, frozen-state, outward eip712, simulation appear nowhere) |
| L5 purchased | The walkabout machinery exists ("one extraction away from a library"): FieldSigner, sanctions screen fail-closed, caps, signed verdicts; a 20-door weekly sample, aggregate-only, host told privately | ≤$0.05/probe (run zero averaged ~$0.0005/attempt); ≈≤$1/week; OFAC strict liability real, screen fails closed; **burns the subject's paid resource** | (1) self-only, already live and labeled; (2) consenting panel = launch_check, extend to Solana; (3) the sampled lane, hard-capped, aggregate-only | The prospective store-wide sentence "We buy from the doors we report on" (⚑, keeper-pen-gated) would gesture at census-scale L5 — keep it gated until NOW-6 resolves | **Asked and pending**: KEEPER_LIST NOW-6 (yes/no/conditions), WALKABOUT ⚑ unratified, Observatory §12.1 open. Nothing declines it; 23a/23b don't cover a bounded sampled purchase |
| L6 delivered | Rides L5 entirely; delivery-vs-offer content-type match inside the walk is ~2h and $0; a bounded 7-day delivery watch (~$0.35 COGS against a ~$10 SKU) fits the 23a carve-out shape | see L5 | Content-type match now; self-only L6 stays labeled; bounded delivery watch needs only a price (K3 ⚑) | The passport/chip/$19 family — E1's own words: the serve-402-never-deliver attack is "badged, not caught" (⚑-gated deliberately, roadmap 5.5) | E1 asked + gated; the delivery watch **never asked** (one mention, no spec) |
| Dispute / escrow / arbitration | — | — | The "dispute pack" (assembly of shipped signed pieces, no custody, no judgment) — specced in the landscape, needs only a price | Every attestation carries the disclaimer in its signed scope string | **Ruled out on record** — 23a/23b, verbatim, no action beyond the pack |

**The dead-letter instrument.** `pay_to` was captured 2026-08-20 with
the stated purpose "USDC inflows to a published payTo are the first
honest signal of whether anyone PAYS an ask" (market.ts:127-133).
Nothing reads those inflows: every consumer of `pay_to`/`pay_to_digest`
counts reuse, matches notes, or seals digests; not one calls the
transfer-readers the store already runs daily against its own
wallets and against $2-statement customers. This is a read-only,
no-payment, no-consent L4/L5 proxy whose entire plumbing is in-house,
whose publication tiers the G2 ruling already governs, and which the
landscape names as a competitor's "genuinely novel capability"
(PulseFeed payTo-drift; x402-list logged 1,069 rotations in 90d).
Cheapest unclimbed half-rung in the audit. **Never scheduled** —
G2 unblocked the tiers and nothing was filed after it.

**Competitor depth acknowledged in-repo and answered by neither
ruling nor roadmap:** x402-list's FORTE verifying listings with real
paid calls (a directory doing L5/L6 at scale while our standing lane
waits on NOW-6); PulseFeed's payTo-drift lane (above); Watchtower's
point-in-time list-state lookup (we hold the snapshots, don't sell
the query); Second Opinion's fourth rail. Cairn's try-to-pay finding
was answered (the ATA read); its residue — frozen-state, EVM
blacklist, simulation — was not.

---

## 7. Checked and found clean

Counted against ourselves, so the findings above are read at their
true weight — the majority of surfaces held. The standing watch JSON
artifact is the bar (observer_status, explicit denominators, latency
as a distribution, battery in the signed bytes,
nothing_claimed_between_probes). Also clean: the tri-state vector and
reached_level; the frozen v1 / dated-changelog discipline and
one-probe-two-verdicts `also_under`; the observation-vs-inference
splits (bazaar, input contract); RAIL_BASIS and legacy-week typing;
railsSentence's denominators; verifyCorpusChain re-deriving digests
per request; the corpus diff's refusal paths; population.ts
(carry-forward vs extinction, `what_this_cannot_see`);
subject-history's five named gap reasons and its refusal of the
reliability ratio under temptation; readDiscoveryList's coverage
self-diagnosis (the defect is /registry dropping it at publish, row
16); fresh-set's per-row battery and not_checked rungs; the
withheld rounds-ready/rounds-probed ratio, refused by name on both
machine and human surfaces; wallet-facts' "absence of the fact, not
a fact of absence"; attestation-spec's weakest-first trust models
and NOT_BUILT derived from live constants; the launch check's
unpaid_by_rule, redirect-refusal, truncation honesty, and the
37/37 → 1-in-88 correction appended with the original standing;
service-audit's refused-vs-unreachable ("we did not look, so we
report nothing"); trust-panel's population statements; certificates'
derived maker's mark; the buy-door gating ("Nothing charged" on
every refusal); /pulse's three-state conversion rate and
never-round-to-zero; /stats' identity-by-construction and "OUR BOOKS
NOT THE CHAIN"; stamps' write-once condition; the A2A card's honest
transport declaration; the corrections page's own account of what it
cannot show.

---

## 8. If the keeper says go — a sequencing suggestion

Nothing below moves without his word (rule 30). Ordered by
(sold-now × wrongness) ÷ hours:

1. **Same-day copy honesty (≈3h):** Night Watch "a buyer could pay";
   /registry JSON-LD vocabulary; census "at all" → placement-scoped;
   one self-exclusion sentence beside the public denominators;
   attestation nonce cause. (Rows 3, 15, 2, 32, 28.)
2. **The desk's fetch and verdict (≈5h):** guarded/refusing fetch
   into verifyArtifact; attempted-failed → could_not_check;
   per-state zero-egress tests. (Rows 4-5.)
3. **The battery's body read (≈8h + keeper's battery call):** thread
   the body, v3/dated-changelog, `signed_offers.basis`, the
   split-placement fixture; then re-run the census and let the new
   number be a new dated finding. (Rows 1-2, 9.)
4. **Observer accounting to the record (≈8h):** market rot,
   subject-history, public diff, WeekPoint basis field; replace the
   tautology with the behavioral trio; CI recompute of the sealed
   market block. (Rows 12-14, 17-18, 31.)
5. **Paid-shelf parity (keeper's decision + ≈6h):** also_under or
   fold v2 in audit/watches; battery into the conformance watch's
   preimage; profiles fold the refresh; self-passport derives or
   refuses. (Rows 6-8, 10-11.)
6. **Depth, cheapest first (each its own ask):** the pay_to inflow
   reader (G2-tiered); EVM blacklist + Solana frozen-state beside
   the ATA read; endpoint-side offer verification over stored bytes;
   burst on paid watches; NOW-6 stands as the keeper's open ruling
   and this audit adds nothing to it but the reminder that three
   cheaper rungs sit below it, unasked.

---

## 9. What shipped, same day — and what stays open

The keeper's word arrived 2026-08-28 and phases 1–5 of §8 shipped on
this branch, tests green at each step. Against the table:

**Fixed in code:** rows 1 (body read in `runChecks`, all five
instruments inherit; advisory names the placements read; changelog
dated on both batteries), 2 (census copy placement-scoped +
self-exclusion, README matched), 3 (Night Watch copy says shape, not
payability), 4 (refusing fetch into `verifyArtifact`; per-state
zero-egress spec), 5 (attempted-failed resolution → `could_not_check`;
kid-not-in-document stays the document's fact; offline-decidable
schema failures stop hiding behind our refusal), 6 (profiles fold the
paid refresh, newest-wins), 7 (`also_under` v2 in the signed audit
bytes with a DISAGREED sentence; menu copy names both), 8 (battery +
observer_status appended into the conformance watch's signed preimage
under the append-law; `passes_observed` beside `passes_recorded`),
9 (launch check reads both placements; battery bumped to
launch-check-v2 per its own rule), 10-11 (self-passport derives or
refuses — a planted-conflict spec proves the fields go dark; the self
chip wears SELF and refuses on conflict), 12 (degraded weeks book as
`instrument_degraded` gaps in the paid history), 13
(`observer_degraded` named and excluded in the market block), 14 (the
tautology retired for a behavioral trio through `probeHost`), 15
(JSON-LD vocabulary + counts beside the percent), 17 (diff filters
revisit and not_probed; `battery_changed` marks cross-epoch
transitions), 18 (`WeekPoint.battery`), 19 (Polygon USDC recognized
under `PRICE_BASIS`), 20 (rail identity names Polygon; storefront
ledger line carries it), 22 (OKF observer derived from the row's own
battery), 25 (pulse counts quotes, not heads), 27-adjacent
(fresh-set "probed" caption), 28 (attestation nonce cause + matched
echo), 30 (`hosts_probed` beside `hosts_observed`), 31 (CI recomputes
the sealed market block), 32 (self-exclusion stated on /registry,
/corpus, the census copy, and the admin market page).

**Also fixed:** row 26 — the launch-check purchase note and verify
step 3 now branch on `tx_hash_status`: "the settlement is on chain"
is said only when our own chain read confirmed it, and a claimed or
absent receipt is named as exactly that.

**Still open, deliberately:** row 16 (registry coverage fields
dropped at publish — needs a `RegistryWeekEntry` shape decision),
row 21 (fresh-set/OKF `observed_at` on long-walk weeks — needs
per-row timestamps through `LongWalkState`), row 24 (the CI dogfood
still proves v1 core only on our own door), the minor residue not
named above, the whole of §6's depth ladder (each rung its own ask; NOW-6
stays the keeper's open ruling), and every §4 corrections entry —
those wait for the keeper's hand, and their mechanisms now exist to
be cited.

*Filed 2026-08-28. Findings verified against the working tree at
HEAD 2114535; line numbers in §§1-7 are that commit's. Fixes landed
the same day under the keeper's word; §9 is the ledger of which. —
the instrument audit*

---

## 10. THREE FINDINGS FROM OUTSIDE, 2026-08-28 (the keeper's relay)

Same defect class as the signed-offer undercount, arriving from two
outside readers on the same afternoon. Recorded, not fixed: the
sharp one touches a PAID product's verdict and the fix is a
keeper-copy change, not a code tweak. None of these is a bug in
what we compute; all three are things we do not look at.

### 10.1 `accepts[].extra.assetTransferMethod` — unread

Public claim (@danbuildss, 2026-08-28) that a client blindly
defaulting to one facilitator makes "a healthy service return what
looks like a payment failure." Chased to the actual observable, and
the honest correction to that framing: the facilitator is generally
NOT named in the 402. Bankr/Capacitr's own reference documents it as
a server-side environment variable. What IS in the 402, and what
actually decides whether a buyer's signature is acceptable, is
`accepts[].extra.assetTransferMethod` — `eip3009`, `permit2`, or
`erc7710`. It tells a buyer WHAT TO SIGN.

We do not read it. `runChecks` reads `extra.name` and
`extra.version` (the EIP-712 domain, `missing-eip712-domain-extra`)
and nothing else in that object. Two consequences:

- **Preflight `ready` is silent on it.** A buyer who reads our
  verdict, signs EIP-3009 at a `permit2` door and gets refused has
  been failed by a door we called ready. This is the exact shape
  the ladder exists to name.
- **launch_check ($5, paid) has a false-negative path.** Its own
  disclaimer says the payment is presented "EIP-3009 authorization
  on Base," and it handles the v1/v2 HEADER-shape mismatch
  explicitly — "a seller serving only the v1 X-PAYMENT shape will
  refuse it, and this report says exactly that rather than
  guessing." It says nothing about transfer-method mismatch. A
  door advertising `permit2` or `erc7710` would refuse our envelope
  CORRECTLY, and the report would record a refusal without naming
  our own unsupported path as the cause.

  Stated precisely, because the distinction is the whole discipline:
  this is a false-negative path that EXISTS IN THE CODE. We have no
  evidence any launch check has met such a door, and the reports
  already issued are not being called wrong. The fix is to read the
  field before the paid knock and, on a method we cannot sign,
  refuse the walk with `unpaid_by_rule` — a statement about our
  rules, never about the seller, which is the escape hatch that
  product already has and already explains.

### 10.2 Idempotency, never turned outward (CV)

CV's note, same day: the ecosystem absorbed the double-charge lesson
at the SDK layer, and the remaining gap shape is hand-rolled header
paths — repos building their own authorization without `@x402/fetch`
that do not key dedup to a logical purchase end-to-end. His guidance
is to hunt those specifically rather than broad SDKs.

The part that lands here: a buyer's hand-rolled retry logic is not
visible from a 402 probe, but the SELLER-SIDE CORRELATE is, and we
never look. `idempotenc` appears nowhere in `preflight.ts` and
nowhere in the defect vocabulary. This store built the strongest
idempotency machinery it knows how to build for its own till and
made it a named differentiator — and never once asked whether
anybody else's door has any. A door with no idempotency support
turns every hand-rolled buyer retry into a double charge, which is
precisely the population CV says is left.

### 10.3 The generalization, which is the keeper's

His words on hearing 10.1: "isn't the fix also additional places to
check?" Yes, and that is the finding above both of them. The
signed-offer undercount was not "we read the wrong field," it was
"we read one place where the wire has two." 10.1 is one object we
half-read. 10.2 is a question we never asked. The pattern is a probe
that reads a narrow slice of a rich object and then publishes
confidence about the whole.

Pass 1 of §1 audited every published number against its caption.
This is the same audit pointed one layer down: every published
verdict against the FIELDS IT DID NOT READ. That is a real piece of
work and it is not this document's — recorded here so the next pass
starts with three known instances instead of a blank page.

**None of this is built. Nothing above changed a served surface.**
