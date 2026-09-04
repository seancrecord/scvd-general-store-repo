# The second wire, read only — an MPP battery for the preflight and the census (2026-09-03)

Roadmap V3, the third of five ordered under the keeper's lens of
2026-09-03: value or potential value if the market takes off, not ROI
now. This is the design; nothing is built until he rules on the
decisions at the end (the S8 shape: one document, rulings, then one
branch at a time).

## The question, stated so it can be answered

Every door the observatory can see speaks x402. A door that speaks
the Machine Payments Protocol — `WWW-Authenticate: Payment` on a 402,
`Authorization: Payment` back, `Payment-Receipt` on the goods — is
today invisible to the corpus, the passport and the paid audit, and
worse than invisible: probed by the free preflight it reads as a
BROKEN x402 door ("the 402 carries no PAYMENT-REQUIRED header"), which
is a verdict on our reader wearing a finding about their door.

The question is not "should the till accept MPP." PAYMENT_RAILS Part
B ruled that WAIT-AND-SEE on 2026-08-04 and the keeper re-affirmed it
on 2026-09-03; the intake rule wants a named counterparty and none has
asked. The question is narrower and entirely on the reader's side:

> What can this observatory say, signed, about a door that speaks MPP,
> from the same one unpaid GET it already makes — and what would it
> cost to say it?

## Sourcing note — read before quoting anything below

The spec hosts are egress-blocked from the environment this was
written in: `paymentauth.org`, `mpp.dev`, `datatracker.ietf.org`,
`developers.cloudflare.com` and `docs.rs` all refuse. What answers is
GitHub, and the specifications live there as Markdown:
`github.com/tempoxyz/mpp-specs`. Every wire fact below is read from
those files, at `main` on 2026-09-03, and marked `[spec]`. Facts from
implementers' docs found through search (xquik, Nevermined, Exa,
AWS AgentCore, Cloudflare's `llms-full.txt`) are marked `[impl]`.
Nothing here was observed against a live MPP door; that is the first
thing PR 1 does.

The repository's layout, which is also the protocol's shape:

| Path | What it fixes |
| --- | --- |
| `specs/core/draft-httpauth-payment-00.md` | The challenge, credential and receipt headers; the problem-details errors; the registries |
| `specs/intents/draft-payment-intent-charge-00.md`, `…-subscription-00.md` | What a `request` means: one-off, or recurring |
| `specs/methods/{card,evm,hedera,lightning,nearintents,solana,stellar,stripe,tempo,usdc}/` | The method-specific `methodDetails`, credential payloads and receipt fields |
| `specs/extensions/draft-payment-discovery-01.md` | Pre-request price advertisement in `/openapi.json` |
| `specs/extensions/transports/draft-payment-transport-mcp-00.md` | The same three objects over MCP |

Note what is absent: the `session` intent that implementers advertise
(Dune, QuickNode, xquik `[impl]`) has no draft under `specs/intents/`
at `main`. Nevermined's router refuses any intent but `charge` for
that reason `[impl]`. A reader must expect intents the registry does
not hold.

## What the wire looks like, from one unpaid GET

Everything a third party can observe without paying is in the 402
itself. `[spec]` unless marked.

**The challenge** rides one or more `WWW-Authenticate` field-values,
one per challenge, each `Payment` followed by auth-params:

```
HTTP/2 402
WWW-Authenticate: Payment id="…", realm="xquik.com", method="tempo", intent="charge", request="eyJhbW91bnQiOi…", expires="2026-…"
```

Required params: `id` (non-empty; "clients and parsers MUST reject
challenges whose `id` is missing or empty"), `realm`, `method`
(lowercase ASCII, registered), `intent` (registered), `request`
(base64url of JCS-canonical JSON). Optional: `expires` (RFC 3339),
`digest` (RFC 9530 content digest of the request body),
`description`, `opaque` (base64url flat string map), `header` (only
ever `"Payment-Authorization"`, selecting an alternate credential
field). Multiple challenges are separate header field-values, and
"the runtime challenge takes precedence" over anything advertised
elsewhere.

**The `request` object**, shared by the charge intent: `amount` (a
base-10 integer string in the smallest unit, no sign, no point),
`currency` (ISO 4217 lowercase for fiat, a token contract address
for chains, or method-defined), `recipient` (method-native format),
`description`, `externalId`, `methodDetails`. Per method, inside
`methodDetails`:

| Method | `methodDetails` a reader sees | What it tells the reader |
| --- | --- | --- |
| `evm` | `chainId` (EIP-155, required), `permit2Address`, `credentialTypes` (ordered: permit2 / authorization / transaction / hash), `decimals`, `splits` (≤ 10) | Which chain and token; whether the door takes EIP-3009 `authorization` — the same signature x402 exact uses |
| `tempo` | `chainId` (OPTIONAL, **default 42431 = Tempo Moderato, the testnet**), `feePayer`, `memo`, `splits`, `supportedModes` | A door that omits `chainId` is a testnet door by default — the exact shape of x402's #1 stuck point (`eip155:84532` where a buyer expects `8453`) |
| `stripe` | `networkId` (a Stripe Business Network Profile id, required), `paymentMethodTypes` (required), `metadata` | A card door, and which card types; the credential is a Shared Payment Token (`spt_…`) the reader never sees |

Chain facts from implementers `[impl]`: Tempo mainnet is chain
`4217`, Moderato `42431`; mainnet settles bridged `USDC.e` at
`0x20c000000000000000000000b9537d11c60e8b50`, the testnet in
`pathUSD` at `0x20c0000000000000000000000000000000000000`; both begin
`0x20c0` and are easy to misread.

**The body** is Problem Details (RFC 9457), `application/problem+json`,
with types under `https://paymentauth.org/problems/`:
`payment-required`, `payment-insufficient`, `payment-expired`,
`verification-failed`, `method-unsupported` (400),
`malformed-credential`, `invalid-challenge`. A reader can check the
type is one of these and that the body is problem+json at all.

**What the reader cannot see, and must say so.** The credential
(`Authorization: Payment` — base64url JSON `{challenge, source,
payload}`) and the receipt (`Payment-Receipt` — base64url JSON
`{status, method, timestamp, reference}` plus the method's
`chainId`/`challengeId`) exist only after money moves. "Receipts are
only issued on successful payment responses." A free battery
observes the challenge and nothing past it; whether the door
delivers, verifies, or issues a receipt is paid-detectable, exactly
as it is for x402.

**Discovery, the second surface.** The extension puts price
advertisement in `/openapi.json` as `x-payment-info` on each
operation: `intent`, `method`, `amount` (or `null` for dynamic),
`currency`, `description`; `x-service-info` for the service. Cached
five minutes by recommendation. "Discovery metadata is advisory. The
402 challenge is always authoritative." This is Tier B of S8 again —
a surface on the same origin naming a price beside a door that names
another — and the store already reads OpenAPI payment fields on the
paid audit.

**Over MCP.** A tool call that needs payment fails with JSON-RPC
error `-32042` carrying `error.data.challenges`; the credential rides
`params._meta["org.paymentauth/credential"]`, the receipt
`result._meta["org.paymentauth/receipt"]`; payment support is
advertised in `InitializeResult`, not on `tools/list`. A third-party
reader of `tools/list` sees no price. The walk's MCP reads would see
the `-32042` only by calling a tool, which is the paid walk's
territory.

## What the store reads today, and the misread that is already live

The census's probe and the free preflight make one GET, keep the
allowlisted response headers, the `PAYMENT-REQUIRED` value and a
body hash, and run the x402 checks. A door answering 402 with only
`WWW-Authenticate: Payment` fails `payment-required-header` and is
recorded `not_ready` — as a broken x402 door, when it is a working
MPP door. The capture's curated header list does NOT keep
`www-authenticate` (checked 2026-09-03, `watch-evidence.ts`:
payment-required, content-type, content-length, location and the
infrastructure headers), so no existing signed row can show the
misread; it is measurable only from the first round after PR 1 adds
the header to the list. That is a gap to record on PR 1's face, not
a correction — nothing was recorded wrongly that can be pointed at —
and the first round that finds such a door files the correction for
every earlier week it was probed, under rule 56.

The x402 catalogs the census walks (CDP discovery, the leaderboard)
list x402 doors, so the expected count of such rows is near zero.
Near zero is not zero, and a door that added MPP beside x402 this
summer — several of the 100-plus launch services also speak x402
`[impl]` — is exactly the row to look for: `PAYMENT-REQUIRED` present
and a `WWW-Authenticate: Payment` beside it, which today's reader
ignores.

## The battery, by what the truth costs

Three tiers, the S8 way: by how many requests the fact costs.

### Tier 0 — the same one GET, parsed twice

Zero extra contact. The probe already has the bytes. The MPP battery
reads the 402 for `WWW-Authenticate: Payment` challenges and runs
checks named the way the x402 checks are named:

| Check | Passes when | Named for the buyer as |
| --- | --- | --- |
| `mpp-challenge-present` | at least one `WWW-Authenticate` value with scheme `Payment` | the door speaks MPP at all |
| `mpp-challenge-id` | every challenge has a non-empty `id` | "clients and parsers MUST reject" — a stock client will |
| `mpp-challenge-realm` | `realm` present | RFC 9110 protection space |
| `mpp-method-registered` | `method` is one of the ten the spec repo holds | an unregistered method has no credential shape a client could build |
| `mpp-intent-registered` | `intent` ∈ {`charge`, `subscription`} | see `session` below |
| `mpp-request-decodes` | `request` is base64url of a JSON object | the unparseable-challenge failure |
| `mpp-request-canonical` | re-canonicalizing the decoded JSON by JCS (RFC 8785) reproduces the bytes exactly | the spec says MUST; a client that hashes the request for challenge binding gets a different hash from a non-canonical one |
| `mpp-amount-shape` | `amount` is a digit string, no sign, point or exponent | the field a buyer reads as a price |
| `mpp-currency-named` | `currency` present | |
| `mpp-recipient-present` | `recipient` present on `evm`, `tempo`, `solana` | the credential's `to` "MUST match challenge recipient"; no recipient, no payment |
| `mpp-expires-rfc3339` | `expires`, if present, parses and is in the future at the probe's moment | a challenge already expired at issue cannot be paid |
| `mpp-tls-only` | the door is `https` | "Servers MUST NOT issue Payment challenges over unencrypted HTTP" |

Advisories, never in the verdict:

- `mpp-testnet-default`: method `tempo` with `chainId` absent (default 42431) or any method naming a known testnet chain. The `eip155:84532` lesson, on the second wire.
- `mpp-intent-unregistered`: an intent (`session`) the spec repo has no draft for. Not a failure — half the market advertises it — but a buyer holding only the registry cannot pay it.
- `mpp-body-not-problem-json`: the 402 body is not `application/problem+json`, or its `type` is not one of the seven.
- `mpp-discovery-absent`: no `/openapi.json` — Tier 1, paid only, below.
- `x402-and-mpp`: the 402 carries both `PAYMENT-REQUIRED` and a `Payment` challenge. Informational, and the most useful single fact for a buyer choosing a client.

And one derived field on every probe, `protocols_spoken`: `["x402"]`,
`["mpp"]`, `["x402","mpp"]` or `[]`, derived from the headers, never
typed.

### Tier 1 — the discovery document, on the paid audit

One extra GET to `/openapi.json`. The free preflight promised one
probe and keeps the promise; this rides `service_audit`'s existing
surfaces section (S8 Tier B), which already fetches the OpenAPI
document and reads payment fields. Add: `x-payment-info` per
operation, compared with the challenge the audit read — `amount`,
`currency`, `method`, `intent` — and the same four states Tier B
uses (agrees, differs naming the field, absent, moving). Vocabulary:
`surface-contradicts-challenge` already exists and is
paid-detectable; MPP is a second reader of the same class, not a new
class.

### Tier 2 — the MCP transport, on the paid walk

`-32042` is observable only by calling a tool. The walkabout already
calls tools with money; when it meets `-32042` with
`error.data.challenges`, it records the challenges under the same
Tier 0 checks. No new door; one branch in the walk's error handling.
Not in the first three PRs.

## What is NOT built, said plainly

- **No credential, no receipt, no `mppx`.** Nothing here signs,
  pays, or verifies an MPP payment. The till is untouched; AT_SCALE
  rule 6 (a dependency on the money path is a supply-chain decision)
  is not invoked because there is no money path. The JCS canonicalizer
  is forty lines we write and test against the RFC's vectors, not a
  package.
- **No verdict on an MPP door's delivery.** The ladder stops at the
  challenge, as it does for x402 on the free preflight, and the report
  says so in the same words.
- **No "MPP-compliant" anywhere.** The standards-boundary law: the
  store reads MPP challenges; it does not speak MPP until a flow runs.
- **No population change without the keeper.** Where MPP doors are
  listed (`mpp.dev/services`, discovery documents, Agent Almanac) is
  intake, and intake is his (decision 1).

## The subject family, the vocabulary, the version

`src/evidence/subject.ts` says it already: "MPP, AP2/ACP-class land
here as new rows when their batteries are built — the row arriving
WITH the battery is the point." PR 1 adds the family
`{ id: "mpp", versions: ["draft-00"] }`, versioned by the spec drafts
it reads, and nothing cites it before the battery exists.

Vocabulary: the Tier 0 checks that fail are defect classes,
unpaid-detectable, registered in `defect-vocabulary.ts` as the next vocabulary version (v11 as of 2026-09-03; v10 was C1's buyer_hint) with
the registrar-not-author rule (the spec's own MUSTs are the
`sourced_by`). Names as in the table. `x402-and-mpp` and the testnet
default are advisories, not classes: a door speaking two protocols
is not defective.

Versioning: the x402 batteries (`v1`, `v2`) do not move — an
observatory that moves a battery under its old name destroys
comparability, and a `v2 ready` recorded in week 34 means in week 40
what it meant then. The MPP battery is its own constant,
`MPP_BATTERY = "mpp-v1"`, cited on every row that carries MPP checks.
The preflight report gains an additive `mpp` block and
`protocols_spoken`; the top-level `verdict` keeps meaning "x402 ready"
until the keeper rules otherwise (decision 3).

## Costs, honestly

| Piece | Size | Where |
| --- | --- | --- |
| RFC 9110 auth-param parser for `WWW-Authenticate` (quoted strings, commas inside them, multiple field-values joined by the platform) | small, fiddly, fully testable | `src/lib/mpp-challenge.ts` |
| JCS canonicalizer (RFC 8785) with the RFC's test vectors | small | `src/lib/jcs.ts` |
| Tier 0 checks + advisories + `protocols_spoken` | small | `src/services/mpp-battery.ts`, folded into `runChecks` |
| Fixtures: one challenge per method (`tempo`, `evm`, `stripe`), a two-challenge 402, an x402+MPP 402, a testnet default, a non-canonical request | small | `test/fixtures/mpp/` |
| Practice door serving an MPP-shaped 402 (no payment path behind it; it says so) | small | `/practice/mpp-shape` beside `two-surfaces` |
| Census column + corpus fields + brief count ("doors speaking MPP: n of m probed") | medium | ward-round, corpus, brief |
| Paid audit Tier 1 | small on top of S8 Tier B | surface-reads |
| MCP `-32042` in the walk | small, later | walkabout |

Runtime cost: zero extra requests on the free doors and the census;
one on the paid audit that it already makes. No RPC. No KV beyond the
fields on rows that already exist.

## Sequencing, one branch at a time

1. **PR 1 — the parser, the checks, the fixtures, the practice door,
   `protocols_spoken`, the family and the next vocabulary version.** First act:
   measure the misread — count existing signed rows whose captured
   headers carry a `Payment` challenge, and file the correction if
   the count is not zero. Free preflight and the look carry the `mpp`
   block from this PR.
2. **PR 2 — the census and the corpus.** The column on every probed
   row, the brief's count with its denominator, the passport ruling
   applied (decision 2).
3. **PR 3 — the paid audit's discovery read** (Tier 1).
4. **Later — MCP transport in the walk** (Tier 2), when the walk next
   meets a `-32042`.

Each PR re-takes the guide digest if it touches the guide; PR 1 does
(one paragraph: what the preflight now says about a door that speaks
the other wire).

## Risks, plainly

- **Header joining.** The Workers runtime exposes repeated
  `WWW-Authenticate` values joined with `", "`; a comma inside a
  quoted `description` is the trap. The parser follows RFC 9110's
  quoted-string grammar and the fixtures include the trap.
- **Spec drift.** `draft-00` in the repo versus the `-01` submitted to
  the IETF `[impl]`: the battery is versioned by what it read, and a
  change re-versions it, never edits it.
- **False "both".** A proxy that adds `WWW-Authenticate: Basic` beside
  a door's `PAYMENT-REQUIRED` is not MPP; the reader keys on the
  `Payment` scheme token only.
- **Population.** From this environment `mpp.dev` is unreachable; from
  the Worker it may not be. The census's sources do not change until
  he rules; PR 1 measures what is already in the rows.
- **Copy.** "Reads MPP" will be read as "takes MPP" by someone. Every
  surface that names it carries the sentence that the till does not.

## Decisions the keeper has to make (nobody else can)

1. **Population.** Do MPP-listing sources (`mpp.dev/services`, doors'
   own `/openapi.json` discovery, Agent Almanac) join the census's
   intake, and in what order? Press and intake are his (rule 30, the
   intake rule). Recommendation: none in PR 1; measure first.
2. **The passport for an MPP-only door.** Today a passport is issued
   from x402 rounds. Does a door that speaks only MPP get a passport
   at all, a passport line saying which protocol the tier rests on,
   or no passport until the store can pay it? Recommendation: a
   passport with the protocol named on its face, tier from the same
   ready/not-ready rows, since the tier is about the door answering
   correctly, never about the protocol.
3. **The verdict shape.** Does the top-level preflight `verdict` keep
   meaning "x402 ready" with `mpp` beside it, or become "ready on any
   protocol the door speaks"? Recommendation: keep it; an existing
   `ready` must not change meaning under anyone's feet. A reader who
   wants the union reads `protocols_spoken`.
4. **The names.** The twelve check names and the four advisory names
   above, or his edits. Copy, rule 7 — drafted here, inked in chat.
5. **The paid audit.** Tier 1 rides `service_audit` at the same price
   with no flag, as Tier B did (S8 decision 1), or as a separate line.
   Recommendation: same price, no flag.
6. **The one-liner.** Whether "reads MPP challenges" enters the
   store's description before or after PR 2. The standards-boundary
   law says a protocol is claimed after its flows run; a reader has no
   flow, so the law does not obviously apply. His call.

## Rulings, 2026-09-04

The keeper read the whole note and ruled (his words in KEEPER_LIST):

- **Decision 3 is firm, not recommended.** `verdict` keeps meaning
  x402-ready, permanently; `protocols_spoken` is the union field.
  Letting an existing ready/not_ready field change meaning would break
  every historical row's comparability — the exact failure the
  versioning section argues against for the battery names. Not to be
  relitigated. PR 1 carries this on the report itself
  (`mpp.the_x402_verdict_above`).
- **Decision 2 needs a mockup before a ruling.** The principle — a
  passport with the protocol named on its face — sounds right, but a
  reader skimming fast misreads things, which is this note's whole
  point. The copy is below; he rules on the copy, not the principle.
- **Approved as-is:** the framing (till settled, reader open), the
  sourcing discipline, zero added runtime cost, the versioning
  (batteries frozen, `mpp-v1` its own constant, advisories outside the
  verdict), the risk section.
- **"Get bolder on actual implementation."** PR 1 is built the same
  day (roadmap V3). The misread count PR 1 opens with reads zero over
  rows that could not show it; that is forward cover for the door that
  starts speaking both wires next month, not a fix for a pile of wrong
  verdicts, and the count says so with its denominators.

### The passport copy for an MPP-only door (decision 2, for his eyes)

What the passport page's tier line and the chip would say for a door
whose rounds are all MPP. Derived fields in braces; nothing else new.

Tier line, today (x402 door):

> `held` — 3 of 4, weeks 33–36 · the rule

Tier line, proposed (MPP-only door):

> `held` — 3 of 4, weeks 33–36, **on the MPP battery (mpp-v1)** · the rule
> · this door speaks MPP, not x402: the rounds counted are its Payment
> challenges read clean, and this store's till cannot pay it

Headline, proposed:

> {host} answered a well-formed MPP challenge on 3 of the 4 rounds
> since we first met it. It does not speak x402. Delivery, credentials
> and receipts were not observed: nothing here paid.

The chip (the pasted badge), proposed: the same tier and fraction it
carries today, with `MPP` where it says `x402` today, and the same
rule that it stops rendering when the door leaves the ready side.

JSON (`/passport/{host}`), proposed additive fields:

```json
"tier": { "tier": "held", "fraction": { "ready": 3, "rounds": 4, "weeks": "33-36" },
          "battery": "mpp-v1", "protocol": "mpp" },
"protocols_spoken": ["mpp"],
"what_this_is_not": "… a door that speaks MPP is not a door this store can pay; the tier is about the door answering correctly, never about which wire."
```

What would make it read dishonestly at a glance, and the answer to
each: a chip that says only `held` with no protocol (answered: the
protocol is on the chip's face); a tier line whose fraction mixes
x402 and MPP rounds (answered: one battery per tier, named; a door
speaking both gets the x402 tier and an MPP line beside it, never a
sum); a passport that implies the store paid the door (answered: the
headline says nothing here paid, on every MPP passport, not as a
footnote).

Yes / no / later on this copy is the ruling PR 2 waits on.

## Sources read for this note

| Source | Reached | How |
| --- | --- | --- |
| `github.com/tempoxyz/mpp-specs` — core, charge intent, evm, tempo, stripe, discovery, MCP transport drafts, at `main` 2026-09-03 | yes | raw Markdown |
| `paymentauth.org`, `mpp.dev` (protocol, quickstart, openapi.json), `datatracker.ietf.org` (draft-ryan-httpauth-payment-01) | **no** | egress-blocked |
| `developers.cloudflare.com/agents` (payments) | **no** (page); yes (`llms-full.txt` via search index) | secondhand |
| xquik MPP quickstart (raw HTTP flow), Nevermined "The MPP rail", Exa MPP guide, AWS AgentCore tutorial 08 and ProcessPayment docs, Dwellir x402-vs-MPP | yes, as indexed passages | `[impl]` |
| `docs.rs/mpp-br` (a Rust reader's `PaymentChallenge`) | **no** | egress-blocked |
| Our own: `PAYMENT_RAILS.md` Part B and E, `docs/PROTOCOL_EXPANSION_2026-08.md` §1, §2, §7.3, §7.8, §11, §12, `docs/S8_CROSS_SURFACE_2026-09.md`, `src/services/preflight.ts`, `src/services/ward-round.ts`, `src/evidence/subject.ts`, `src/store/defect-vocabulary.ts` | yes | read |
