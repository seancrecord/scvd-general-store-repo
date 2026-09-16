# MPP handoff — what is built, what the round now proves, and what PR 2 is (2026-09-14)

For the agent picking up roadmap V3. Read this, then the design note
(`docs/MPP_READ_ONLY_2026-09.md`), then the code. Everything below is
dated and derived; where a number appears it carries its denominator,
and where a fact came from one observation it says so.

Two things changed under the design note since it was written on
2026-09-03, and both change what PR 2 should be. They are in §3.

---

## 1. Where the work stands

**PR 1 is merged and live** (built 2026-09-04, in the merge of
pull request #452). It is the Tier 0 reader: the parser, the checks,
the fixtures, the practice door, `protocols_spoken`, the subject
family and the vocabulary classes. Nothing signs, pays or verifies an
MPP payment; the till is untouched.

**PR 2 and PR 3 are not started.** No code for them exists in the
tree. PR 2 is blocked in one place only (the passport copy, §4).

What is live, by file:

| File | What it holds |
| --- | --- |
| `src/lib/mpp-challenge.ts` | RFC 9110 auth-param parser (`parseWwwAuthenticate`), `paymentChallenges`, `requestIsCanonical`, `protocolsSpoken`, and the constants: `MPP_BATTERY = "mpp-v1"`, `MPP_SPEC_DRAFT = "draft-00"`, `MPP_METHODS` (ten), `MPP_INTENTS` (`charge`, `subscription`), `MPP_INTENTS_UNREGISTERED_BUT_SEEN` (`session`), `MPP_PROBLEM_TYPES` (seven), `MPP_METHODS_NEEDING_RECIPIENT`, `TEMPO_MAINNET_CHAIN_ID` 4217 / `TEMPO_TESTNET_CHAIN_ID` 42431 |
| `src/lib/jcs.ts` | RFC 8785 canonicalizer, used by `requestIsCanonical` |
| `src/services/mpp-battery.ts` | `MPP_CHECK_NAMES` (twelve), `MPP_ADVISORY_NAMES` (four), `runMppChecks`, `countMppMisreads`, `MPP_VERDICT_NOTE` |
| `src/services/preflight.ts` | `protocols_spoken` and the `mpp` block on the free report (so on the dry run and the look too) |
| `src/services/watch-evidence.ts` | `www-authenticate` on the curated capture list — added by PR 1, and the reason §3 can be measured at all |
| `src/routes/practice.ts` | `/api/practice/mpp-shape`, an MPP-shaped 402 with no payment path behind it |
| `src/routes/openapi.ts` | `protocols_spoken` declared on the report schema |
| `src/evidence/subject.ts` | the family row `{ id: "mpp", versions: ["draft-00"] }` |
| `src/store/defect-vocabulary.ts` | eleven `mpp-*` classes, one per check that can fail, `sourced_by` the draft's own MUSTs |
| `test/mpp-battery.spec.ts` | the parser, every recorded door failing exactly the checks it is bad in, the report's block, the practice door, the family row |
| `test/fixtures/mpp/*.json` | thirteen recorded challenges, also served at `/fixtures/mpp/{name}.json` with a sha256 on `/fixtures.json` |

The twelve checks: `mpp-challenge-present`, `mpp-challenge-id`,
`mpp-challenge-realm`, `mpp-method-registered`,
`mpp-intent-registered`, `mpp-request-decodes`,
`mpp-request-canonical`, `mpp-amount-shape`, `mpp-currency-named`,
`mpp-recipient-present`, `mpp-expires-rfc3339`, `mpp-tls-only`. The
four advisories: `mpp-testnet-default`, `mpp-intent-unregistered`,
`mpp-body-not-problem-json`, `x402-and-mpp`.

**One thing that has moved since PR 1 and will trip you:** the defect
vocabulary was at v11 when the `mpp-*` classes were registered and is
at **v15** today (`DEFECT_VOCABULARY_VERSION` in
`src/store/defect-vocabulary.ts`). The `scvd-defects` package's minor
version tracks it. Do not assume v11 anywhere; read the constant.

---

## 2. Read these, in this order

1. `docs/MPP_READ_ONLY_2026-09.md` — the design note. The whole
   argument, the wire facts with their `[spec]` / `[impl]` marks, the
   three tiers, the costs, the risks, the six decisions, the keeper's
   rulings of 2026-09-04, and the passport copy mockup at the end.
   §3 of this handoff falsifies one of its premises; nothing else in
   it has gone stale.
2. `KEEPER_LIST.md`, the entry **"MPP, 2026-09-04, your read of the
   design"** — his rulings in his words. Decision 3 is FIRM and not
   to be relitigated.
3. `ROADMAP.md`, the **V3** row — what PR 1 built and what PR 2 and
   PR 3 are, in one line each.
4. `PAYMENT_RAILS.md` Part B and Part E — the till side. Part B ruled
   MPP WAIT-AND-SEE on 2026-08-04 with two named reopening conditions;
   Part E re-poses the gate and carries the 2026-09-11 note about
   where a second protocol joins `x-payment-info.protocols`. The
   reader being open and the till being shut is the whole frame.
5. `src/services/mpp-battery.ts` then `src/lib/mpp-challenge.ts` —
   small, commented, and they say what they refuse to do.
6. `docs/PROTOCOL_EXPANSION_2026-08.md` §11 — the older
   wait-and-see reasoning, for the history of the decision.

---

## 3. What changed since the design note, and why it changes PR 2

### 3a. The market: 161 MPP doors of 2,767 probed, not "near zero"

The design note predicted the count of rows carrying an MPP challenge
would be "near zero", because the catalogs the census walks list x402
doors. That prediction is now wrong, and the evidence is in the
signed chain.

Measured over corpus snapshot **sequence 6, week 2026-W37, taken
2026-09-08T14:54:50.992Z, digest
`779d120a8b2267f0585b5899542ede6dc174d0d042ff122496af4bc1f4cb6f0c`**
(`/corpus/latest.json` at the time of writing):

- probed rows in the round: **2,767**
- rows whose capture kept a `www-authenticate` value: **195 of 2,767**
- rows carrying at least one parseable `Payment` challenge:
  **161 of 2,767**
- of those 161, rows also carrying `PAYMENT-REQUIRED`: **161 of 161**.
  Rows speaking MPP and not x402: **0 of 161**.

So the misread PR 1 was forward cover for — a working MPP door read as
a broken x402 door — has **not** happened yet in the signed record:
every MPP door the census has met also speaks x402, and was scored on
its x402 challenge. That is the honest finding, and it is also why
decision 2 (the passport for an MPP-only door) has no live subject
yet: there are zero MPP-only doors in the chain.

Running the live battery over those 161 rows, each row's expiry judged
at its own `observed_at`:

| Tier 0 check | Rows failing, of 161 |
| --- | --- |
| `mpp-request-canonical` | 9 |
| `mpp-method-registered` | 7 |
| `mpp-currency-named` | 6 |
| `mpp-amount-shape` | 5 |
| `mpp-request-decodes` | 4 |
| `mpp-challenge-id` | 3 |
| `mpp-intent-registered` | 3 |
| `mpp-recipient-present` | 1 |
| `mpp-expires-rfc3339` | 1 |
| `mpp-challenge-realm`, `mpp-tls-only`, `mpp-challenge-present` | 0 |

Rows failing at least one check: **14 of 161**. Advisories raised:
`x402-and-mpp` 161 of 161, `mpp-testnet-default` 3 of 161,
`mpp-intent-unregistered` 3 of 161.

Two numbers from that run are **not** reportable and must not be
copied forward: `mpp-body-not-problem-json` came back 161 of 161
because the capture keeps a body hash and not the body, so the check
had nothing to read; and an earlier pass showed
`mpp-expires-rfc3339` at 158 of 161 because it judged every row at the
snapshot's seal time rather than at the row's own probe time — the
census walks in hourly batches across the week, so the seal moment is
hours to days after most rows were taken. Judge expiry at
`observed_at` or not at all.

What the challenges themselves name (counting challenges, not rows;
some rows carry more than one):

- method: `evm` 118, `tempo` 43, `stripe` 7, `exact` 2, `x402` 2,
  `usdc` 1, `asterpay` 1, `solana` 1
- intent: `charge` 172, `session` 2, `payment` 1

`exact` and `x402` are x402 vocabulary appearing in the `method`
slot of a `Payment` challenge; `asterpay` is a vendor name. Draft-01's
identifier grammar is `1*LOWERALPHA`, so `x402` is malformed at the
grammar level, not merely unregistered — a distinction the battery
does not draw today and could.

Reproducing this is four steps and no new code:
`curl https://scvd.store/corpus/latest.json`, bundle
`src/services/mpp-battery.ts` and `src/lib/mpp-challenge.ts` with
esbuild (`--alias:@=src`), walk `snapshot.round.hosts`, and call
`runMppChecks` with `headers.get` reading
`host.evidence.headers`, `url` the row's url, `bodyText` null and
`now` the row's `observed_at`. The scratch script used for the table
above is not committed; it is twenty lines.

**What this does to PR 2.** The census column is no longer forward
cover for a hypothetical — 161 of 2,767 rows have a second wire in
them today, and the corpus cannot read it: the census row carries no
`protocols_spoken` field (0 of 2,767 rows have one). The bytes are
captured and signed; the reading is missing. That is the gap PR 2
closes, and it can now be argued from the chain rather than from a
prediction.

### 3b. The spec: the core draft moved from -00 to -01

`specs/core/draft-httpauth-payment-00.md` now **404s** in the spec
repository and `specs/core/draft-httpauth-payment-01.md` serves
(checked 2026-09-14). Our battery is pinned to `MPP_SPEC_DRAFT =
"draft-00"` and the subject family reads `versions: ["draft-00"]`.
The design note's own rule applies: *the battery is versioned by what
it read, and a change re-versions it, never edits it.*

What draft-01 carries that bears on the twelve checks (read from the
draft itself on 2026-09-14):

- **Challenge binding is new and normative.** Servers MUST bind the
  challenge `id` to `realm`, `method`, `intent`, `request` and to
  `expires`, `digest`, `opaque`, `header` when present; `description`
  is excluded. The mechanism is implementation-defined, with a
  RECOMMENDED HMAC-SHA256 construction over seven pipe-joined
  positional slots (eight when `header` is present). A free reader
  cannot verify a binding it has no secret for — so this is **not** a
  new Tier 0 check — but it explains the opaque `id` values in the
  wild and is worth one sentence wherever the battery explains what it
  cannot see.
- **`id` MUST be non-empty after quoted-string unescaping.** Our
  parser already unescapes; the check already matches.
- **`request` MUST be JCS-serialized**, and the draft now says why:
  the HMAC input includes the base64url request as it appears on the
  wire, so a non-canonical serialization breaks cross-implementation
  binding. `mpp-request-canonical` is therefore more load-bearing than
  it looked, not less.
- **`header` is spelled out further**: present means the credential
  goes in `Payment-Authorization`, absent means `Authorization`.
- **Method identifiers are `1*LOWERALPHA`** — lowercase letters only,
  no digits (see the `x402` specimens above).
- New sections that did not exist in the note's reading: **Client
  Payment Preferences**, **Versioning**, an explicit **Retry
  Behavior** section, and expanded security considerations.
- `expires` remains SHOULD, not MUST; `digest` remains optional.

**What this does to PR 2 (or to a PR 1.1 before it).** Someone has to
read draft-01 end to end against our twelve checks and decide: does
`mpp-v1` stay pinned to draft-00 with draft-01 arriving as a sibling
battery, or is the delta small enough that the family row grows to
`versions: ["draft-00", "draft-01"]` with the checks unchanged? That
is a battery-versioning decision of the same kind as the x402
`v1`/`v2` split, and the versioning rule says an existing battery's
meaning must not move under a reader's feet. My read, for what it is
worth: the twelve checks all still hold under draft-01 — none of them
is contradicted — so the cheapest honest move is to re-read, record
the diff in the design note, and widen the family's `versions` rather
than fork the battery. But it is a ruling, not a refactor.

---

## 4. What is blocked on the keeper, and what is not

**Blocked: decision 2, the passport for an MPP-only door.** He asked
for the copy before he rules, and the copy is written — it is the
section "The passport copy for an MPP-only door (decision 2, for his
eyes)" at the end of `docs/MPP_READ_ONLY_2026-09.md`. It needs a
yes / no / later from him and nothing else. Worth telling him when you
raise it: **0 of 161** MPP doors in the latest round are MPP-only, so
this ruling gates a passport shape that has no subject yet. The rest
of PR 2 does not depend on it.

**Firm, never to be relitigated: decision 3.** The top-level preflight
`verdict` keeps meaning x402-ready, permanently. `protocols_spoken` is
the union field. A reader wanting the union reads that field. PR 1
carries this on the report itself.

**Standing as recommended until he says otherwise:** decision 1
(population — no MPP-listing source joins the census intake; measure
first), decision 4 (the check and advisory names as built), decision 5
(Tier 1 rides `service_audit` at the same price, no flag), decision 6
(whether "reads MPP challenges" enters the store's one-liner).

Note for decision 1: the spec repo's README now names **mppscan** and
an MPP service directory at `mpp.dev` as live surfaces, and the
store's own `openapi.json` already declares
`x-payment-info.protocols` in the shape AgentCash, x402scan and
mppscan share. So an MPP population source exists and is reachable in
principle. It is still his intake call, and rule 30 means you do not
add one.

---

## 5. PR 2 — the census, the corpus and the brief

Scope, unchanged from the design note except that §3a now supplies the
evidence for it:

1. **The census row reads the second wire.** In
   `src/services/ward-round.ts`, where the row is built from the one
   GET the probe already made, add `protocols_spoken` and an `mpp`
   summary to each host row — derived from the captured
   `www-authenticate`, never a second request. The row type already
   has the precedent: `catalog` is declared optional with "Absent on
   rounds before …" and the same discipline applies here.
2. **The corpus carries it.** The snapshot freezes the round verbatim,
   so the field rides for free — but `src/store/datasets.ts` and the
   corpus document's `variableMeasured` should name the new field so a
   machine reader learns what it means.
3. **The brief counts it**, in `src/services/weekly-brief.ts`, with
   its denominator and no share: "doors speaking MPP: n of m probed".
4. **The passport ruling applied**, in `src/services/passport-tier.ts`
   — only after he rules (§4).

Hold to these while building it:

- Zero extra requests. Every fact comes from bytes the probe already
  holds. If a change would add a fetch to the census or the free
  preflight, it belongs in PR 3, not here.
- The x402 verdict does not move. Not for a door that also speaks MPP,
  not for one that speaks it badly.
- Counts with denominators, never a share, never a ranking.
- The battery constant `mpp-v1` is cited on every row that carries MPP
  checks, so a later battery cannot be confused with this one.
- A test that fails when the column silently disappears; the fixtures
  in `test/fixtures/mpp/` are the inputs, and `test/mpp-battery.spec.ts`
  is the pattern to follow.
- If the guide gains a paragraph, re-take `GUIDE_DIGEST_BEFORE_THE_SPLIT`
  in `test/llms-modular.spec.ts` in the same commit, with a numbered
  note saying what moved. This is the review moment that guard exists
  to force.

---

## 6. PR 3 — the paid audit's discovery read (Tier 1)

One extra GET to `/openapi.json`, on the paid single-door audit only,
riding the surfaces section S8 Tier B already built
(`src/services/surface-reads.ts`). Read `x-payment-info` per operation
— `intent`, `method`, `amount`, `currency` — and compare it with the
challenge the audit read, using Tier B's four states (agrees, differs
naming the field, absent, moving). The vocabulary class
`surface-contradicts-challenge` already exists and is
paid-detectable; MPP is a second reader of the same class, not a new
class. The spec's own words govern the direction of the comparison:
"Discovery metadata is advisory. The 402 challenge is always
authoritative."

## 7. Tier 2 — later

The MCP transport's `-32042` error with `error.data.challenges` is
observable only by calling a tool, which is the paid walk's territory.
One branch in the walkabout's error handling, when the walk next meets
one. Not before PR 2 and PR 3.

---

## 8. House rules you will trip on if you skip them

- **One PR at a time.** Check for an open pull request before opening
  another; when one merges, reset the working branch to `origin/main`
  before starting the next.
- **The keeper's presses are his.** npm publishes, registry listings,
  intake changes. Build them; do not fire them.
- **Never a ranking. Never a verdict without its derivation and
  denominator beside it.** This is the house sentence and it is
  enforced by tests (`test/derived-not-typed.spec.ts` among others).
- **Counts are derived, not typed.** A spelled-out number in front of a
  countable noun on a served surface fails the build.
- **`node scripts/claims.mjs`, `node scripts/audit.mjs`,
  `npm run docs:check`, `npm run typecheck`** before every push, then
  the suite.
- **No model identifier** in commit messages, pull request titles or
  bodies, or anything pushed to the repository.
- **The standards-boundary law.** The store *reads* MPP challenges. It
  does not *speak* MPP, and no surface may say or imply it takes MPP
  until a flow runs. Every surface naming MPP carries the sentence
  that the till cannot pay it.
- **Recorded material is neutralised.** Fixtures replace live payment
  terms with neutral values, and no signed row carries a verbatim
  payment address (the G2 ruling; rows carry `pay_to_digest`).

---

## 9. The MPP documentation, as it stands on 2026-09-14

Verified by fetch today. `raw.githubusercontent.com` answers from this
environment; `mpp.dev` and `paymentauth.org` do not (connection
refused, same as when the design note was written), and the GitHub
**API** is closed to this session by its repository scope, so the
spec repository's file tree could not be enumerated — the paths below
were each fetched individually and the status is what came back.

**The specification repository: `github.com/tempoxyz/mpp-specs`**
(CC0; co-authored by Tempo Labs and Stripe). Raw files read as
`https://raw.githubusercontent.com/tempoxyz/mpp-specs/main/<path>`.

| Path | Status today | Why it matters here |
| --- | --- | --- |
| `specs/core/draft-httpauth-payment-01.md` | **200 — current** | The challenge, credential and receipt headers, the problem-details errors, the registries, and the new challenge-binding section. 1,389 lines. This is the one to re-read against our twelve checks. |
| `specs/core/draft-httpauth-payment-00.md` | **404 — gone** | What the battery is pinned to. Our copy of its facts is the design note; the file itself is no longer served. |
| `specs/intents/draft-payment-intent-charge-00.md` | 200 | The `request` object our checks read: `amount`, `currency`, `recipient`, `description`, `externalId`, `methodDetails`. |
| `specs/intents/draft-payment-intent-subscription-00.md` | 200 | The second registered intent. |
| `specs/extensions/draft-payment-discovery-01.md` | 200 | `x-payment-info` in `/openapi.json` — PR 3's whole subject. |
| `specs/extensions/transports/draft-payment-transport-mcp-00.md` | 200 | The `-32042` error and the `_meta` keys — Tier 2. |
| `STYLE.md`, `CONTRIBUTING.md` | 200 | Drafting conventions; useful when reading the drafts' normative language. |
| `specs/methods/{card,evm,hedera,lightning,nearintents,solana,stellar,stripe,tempo,usdc}/` | directories exist; **filenames not enumerable from this session** | The per-method `methodDetails` our `MPP_METHODS` list and `mpp-recipient-present` depend on. Every filename guessed against the drafts' naming convention returned 404, so get the real names with GitHub access (`add_repo`, or any session that can list the tree) before quoting them. |

**Everything else, and its state:**

| Source | Reachable | Note |
| --- | --- | --- |
| `datatracker.ietf.org/doc/draft-ryan-httpauth-payment/` | not from here | The IETF submission of the core spec. The README names it as the core specification's home; a session with wider egress should diff it against the repository's `-01`. |
| `paymentauth.org` | **no** (refused) | The full rendered spec, all methods and extensions. Also the host of the problem-details type URIs our `MPP_PROBLEM_TYPES` prefix quotes. |
| `mpp.dev` | **no** (refused) | The protocol site and the **service directory** — the population source decision 1 would draw on. `github.com/tempoxyz/mpp` holds its source. |
| SDKs: `wevm/mppx` (TypeScript), `tempoxyz/pympp` (Python), `tempoxyz/mpp-rs` (Rust), `tempoxyz/mpp-go` (Go), `stripe/mpp-rb` (Ruby) | listed in the README | Read-only interest: how implementers actually serialize challenges is evidence about what a reader will meet. We depend on none of them and should not. |
| mppscan, x402scan, AgentCash discovery spec | — | The indexers that read `x-payment-info.protocols`. See `PAYMENT_RAILS.md` Part E's 2026-09-11 and 2026-09-16 notes and `test/openapi-discovery-shape.spec.ts`, which pins our array to exactly `[{ x402: {} }]` and will fail the day a second protocol belongs in it. The 09-16 note is the one to read first: the shared validator picks its parser from `typeof x-payment-info.price`, so a flat price hint beside a correct `protocols` array makes the array unreadable. |

Our own record of the wire, which is still the fastest way in:
`docs/MPP_READ_ONLY_2026-09.md` §"What the wire looks like, from one
unpaid GET" — every fact marked `[spec]` or `[impl]`, read at `main`
on 2026-09-03. Treat it as accurate to draft-00 and re-verify anything
you are about to build on against draft-01.

---

## 10. The one-paragraph version

The reader is open and the till is shut, and that is deliberate. PR 1
shipped a twelve-check read-only battery for the second wire and put
`www-authenticate` on the capture list. One week later the signed
round shows 161 of 2,767 probed doors carrying an MPP challenge —
every one of them also speaking x402, so nothing has been misread yet —
and the census still has no field that reads them. Meanwhile the core
draft moved from -00 to -01 under a battery pinned to -00. PR 2 is the
census column, the corpus field and the brief's count, with the
passport line waiting on one ruling that has no live subject yet; a
re-read of draft-01 against the twelve checks should ride with it or
just before it. Nothing here pays anyone, and no surface may say it
does.
