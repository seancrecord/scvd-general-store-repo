# S8 — Cross-surface consistency, as a battery fold

Design and research note, 2026-09-02. Roadmap S8. Nothing here is
built; this is the plan the build follows, with the decisions that
are the keeper's marked ⚑. Written after reading the battery, the
census, the fixtures and the outside sources named at the end.

## The question, stated so it can be answered

A door says things about itself in more than one place. The 402 says
a price. A catalog says a price. A `llms.txt` says a price. A
description says what the input is; a schema says what it is; an
example shows one. **Do they agree, and when they do not, which one
is the one a buyer is going to be charged by?**

The store was bitten by exactly this on 2026-08-31: the installed
ClawHub bundle priced `service_audit` at $0.10 against $5 on the
shelf, for weeks, and no check looked at a number beside a name
(`src/store/corrections-ledger/ (one file per entry; npm run corrections:index)`, the 2026-08-31 entry). Nobody on the
directory lists computes this for anybody else's door. The thread
that handed us the idea also named the one line worth keeping for the
desk: which pairs stay costly to fake once the check is public.

## What the store reads today, and the promise that shapes S8

The preflight battery makes **one outbound GET** and reads everything
from that one response (`src/services/preflight.ts`, the promise at
the top of the file). From that one response it already reads eight
surfaces of the door: the status, the `PAYMENT-REQUIRED` header, the
`accepts[]` entries, the 402 **body** as a second challenge
placement, `challenge.resource` against the probed host, the
`extensions.bazaar.info` discovery block and its `input`, and the
`extensions['offer-receipt']` signed offers. Two advisories already
compare surfaces inside that response: `conflicting-amounts` (two
entries, same network and asset, two amounts) and
`placement-mismatch` (header challenge and body challenge disagree).

The census (`src/services/ward-round.ts`) calls the same `runChecks`,
so a fold inside the battery reaches the free preflight, the paid
audit, the census and the watch at once. The census also pulls the
**whole CDP discovery index** every round for population, about
sixty pages, and keeps only the URLs to probe. The catalog's copy of
every door's `accepts[]` is therefore already in memory once a week
and thrown away.

Nothing today reads a remote `llms.txt`, `openapi.json`, MCP
`tools/list` or `/health`. Doing so is a second, third and fourth GET,
which the battery has promised not to make.

The outside spec settles the hierarchy, which matters because it
decides who is wrong when surfaces disagree. The x402 core spec, as of
its 2026-05-26 clarification, says: "The `PAYMENT-REQUIRED` header is
the canonical HTTP transport location for the `PaymentRequired`
object. A response body may duplicate the same information for humans
or backward compatibility, but clients and crawlers must not depend on
the body alone for x402 protocol data." The bazaar extension says
"Facilitators **must** validate `info` against `schema` before
cataloging," and a failed validation is reported `rejected`, which is
the route falling out of the catalog. And the open issue on the
foundation's tracker (April 2026, no maintainer reply) counts 1,480 of
1,938 v2 catalog entries with no marketplace metadata at all: the
catalog is a lossy copy of the 402, and a seller cannot edit the copy.

So there are three kinds of surface, and the design keeps them apart:

1. **The transaction surface.** The 402 header. What a client signs
   against. Canonical by spec.
2. **The door's own duplicates.** The 402 body, the bazaar block
   inside the 402, a signed offer inside the 402, and, at other paths
   on the same origin, `llms.txt`, an OpenAPI document, an MCP
   `tools/list`. The door wrote all of these; it can fix all of them.
3. **Third-party copies.** The CDP catalog entry. The door cannot edit
   it; drift there is the catalog's staleness, not the door's lie, and
   the report must say which.

## Three tiers, by how many requests the truth costs

### Tier A — the door disagreeing with itself in one response

Zero new reads. Everything is already in the bytes the battery holds.
These are folds in the existing sense (`BATTERY_ADDS`), and they are
the strongest findings because the door served both halves of the
contradiction in the same breath.

| Check name | The pair | Reads as |
| --- | --- | --- |
| `discovery-info-validates` | `extensions.bazaar.info` against `extensions.bazaar.schema` | The facilitator's own rule; a failing block is a door that has dropped out of the catalog without knowing. Conditional, like `bazaar-extension`. |
| `discovery-example-satisfies-schema` | the bazaar `info.input` example values against `schema.properties.input` | Our own `test/bazaar-example-satisfies-schema.spec.ts`, pointed outward. |
| `offer-amount-matches-accepts` | a signed offer's amount and payTo against the `accepts[]` entry for the same network and asset | A signed promise of one price beside a challenge for another. Conditional on `signed-offers`. |
| `body-amount-matches-header` | the body challenge's amounts against the header's | Today `placement-mismatch` says the two challenges differ, without saying in what. This names the amount, the payTo and the network separately, so the finding says which field moved. |
| `resource-description-present` | `resource.description` at the top level | Advisory only. The issue above shows the field is what the catalog indexes; its absence is why a v2 door lists bare. |

Verdict rule for Tier A: `discovery-info-validates` and
`offer-amount-matches-accepts` fold into the verdict under **v3**; a
door whose signed offer and challenge name different prices is not
ready by any reading a buyer would accept. The rest ship as advisories
first and fold only when the keeper has read a month of them, the
way L3b went into v2.

### Tier B — the door's other doors, on the same origin

Two to four more GETs, to well-known paths the door itself chose:
`/llms.txt`, `/openapi.json` or `/.well-known/openapi.json`, an MCP
endpoint named in the OpenAPI document or the bazaar block, and the
`resource.url` itself if it differs from the probed URL. This cannot
ride the census (one GET per host per week is a promise to the hosts,
not only to us) and cannot ride the free preflight (one outbound
request is its whole safety story). It lives in the **paid single-door
audit**, which already carries the EVM blacklist read for exactly this
reason: "the free preflight keeps its one-outbound-request promise and
the census cannot afford one eth_call per EVM door, so folding what
they cannot run would split the v2 citation" (the battery changelog,
2026-08-26).

So Tier B is a section on `service_audit` named `surfaces`, present
when the buyer asks with `surfaces=true` ⚑ (or always, at the same
price ⚑), and it prints one row per surface:

```
surface        state          price_named   agrees_with_402
402 header     read           0.05          —  (canonical)
402 body       read           0.05          yes
bazaar block   read           0.05          yes
llms.txt       read           0.10          NO
openapi        absent         —             —
mcp tools/list silent         —             —
```

Four states, never fewer: **read** (found and names the fact),
**silent** (found, names no price), **absent** (no such surface; a 404
is a fact, not a defect), **unreadable** (timed out or malformed, ours
to report against us). Only *read* rows can contradict. The summary
line is a fraction with its denominator: "3 surfaces name a price; 2
agree with the 402; llms.txt names $0.10 against $0.05."

Tier B never reads prose for a number. It reads machine fields only:
an OpenAPI `x-price` or `x-402` extension where present, a bazaar
block, a `llms.txt` line that follows the store's own convention of a
price in a code span beside an endpoint path ⚑ (the convention itself
is a small spec to publish, because a number in prose is what
`test/skill-prices.spec.ts` deliberately refused to read).

### Tier C — the catalog against the door, for every host, every week

Zero new reads. The census already holds the whole discovery index in
memory when it probes. For each probed host that has a catalog entry,
compare the catalog's `accepts[]` (amount, payTo, network, asset)
against the live 402's, and write one derived column on the signed
round:

```
catalog: agrees | differs (which field) | not_listed | not_comparable
```

`not_comparable` is the issue's 1,480: a v2 entry with no metadata to
compare. The round then derives the number nobody else publishes, with
its denominator: "of the N probed hosts the catalog lists with
comparable terms, K serve a different price than the catalog shows;
the catalog's `lastUpdated` for each is printed beside it." This is
attributed to the **catalog**, because the seller cannot edit the
copy; the door's own row on `/corpus/host/{host}.json` carries the
same fact so an operator can see they have gone stale in the index.

Our own doors are the first fixture: N5 already records whether each
of our doors is *present* in the index; Tier C adds whether the
index's copy of our terms *agrees*, and the alert that fires when the
missing set changes fires for the disagreeing set too.

## Accounting for the gaps: the legitimate differences, named

A check that cannot tell a lie from a legitimate difference produces
findings a maintainer argues with, and a guard that has to be argued
with stops being read. These are the differences the design names up
front so none of them ever prints as a contradiction:

1. **Pay-what-it-deserves.** A door may offer several accepts at
   several amounts; a menu prints the minimum. Rule: the compared
   number is the **minimum** amount across accepts for the same
   network and asset, and the report says "minimum of 3 offered."
2. **Per-rail amounts.** Base, Polygon and Solana amounts may differ
   by rounding or by fee policy. Rule: compare within a (network,
   asset) pair only, never across rails; a surface that names one
   price with no rail is compared against the rail the 402 lists
   first, and the report says so.
3. **Units.** `accepts[].amount` is atomic; a catalog or a doc names
   dollars. Rule: normalize by the asset's decimals from the 402's own
   `extra`/asset, and print both forms.
4. **Time.** A price can change between two reads. Rule: read the 402
   first and last (a bookend); if the two 402 reads differ, the state
   is **moving**, not contradiction, and nothing is charged against
   the door. Every surface row carries its own read time.
5. **Prose.** "About a nickel" is not a price claim. Rule: prose is
   never read; only machine fields and the one published code-span
   convention.
6. **Staleness by design.** A README, a tweet, a registry listing the
   seller submitted by hand are not live surfaces of the door. Out of
   scope; the catalog is the one third-party copy we compare, and it
   is labeled as the catalog's.
7. **Description vs schema.** A description that says "url" while the
   schema names `endpoint` is a naming gap, not a price gap. Reported
   as an advisory (`input-name-mismatch`), never folded.
8. **Silence is not disagreement.** A `llms.txt` that names no price
   is *silent*, and silent rows never count against the door. The
   denominator is "surfaces that name a price," printed.

## Which pairs stay costly to fake once the check is public

The keeper asked for this line and it decides which findings are
worth signing.

- **Header vs signed offer** (Tier A). To fake agreement the door has
  to sign the price it actually charges. That is the behavior we want;
  the check is un-gameable in the good direction.
- **Header vs catalog** (Tier C). The seller cannot edit the catalog;
  agreement can only be faked by serving the catalog's stale price,
  which is honest pricing by another name.
- **Header vs what a paying client is served** — cloaking. A door can
  serve one 402 to a known prober and another to a buyer. Only a real
  purchase sees the second one, and the launch check already makes
  one. The pair worth adding there: the amount the walk **settled**
  against the amount the preflight **read** the same hour. That is
  the cross-*instrument* row, and it is the one that is costly to fake
  because the evidence is a transaction.
- **Header vs `llms.txt`** (Tier B). Cheap to fake by editing text,
  which is fine: the check's job is to make the text match the till,
  and a door that edits its text to match has been fixed.

## Naming: defect classes and the vocabulary

New classes in `src/store/defect-vocabulary.ts` under a **v8** row in
`VOCABULARY_CHANGELOG`, dated, never editing an existing definition:

- `discovery-info-invalid` — the bazaar block fails its own schema;
  `our_signal: discovery-info-validates`; costs: the door is absent
  from the catalog buyers search; falsified by the block validating.
- `offer-contradicts-challenge` — a signed offer names a different
  amount or payTo than the challenge for the same rail;
  `our_signal: offer-amount-matches-accepts`.
- `surface-contradicts-challenge` — a machine-readable surface on the
  same origin names a different price than the 402; `our_signal:
  surfaces` (paid audit only, `detectable: "paid"`).
- `catalog-differs-from-door` — the catalog's copy of the terms
  differs from the live 402; attributed to the catalog on its face;
  `our_signal: catalog` column on the round.

`conflicting-amounts` and `placement-mismatch` stay as they are;
`body-amount-matches-header` sharpens the second without retiring it.

## Versioning, and what keeps its bytes

- Tier A's two folds begin **preflight v3**: `PREFLIGHT_VERSION_NEXT`
  moves to `"v3"`, `BATTERY_ADDS.v3` lists them, a dated
  `BATTERY_CHANGELOG` row says so, and v1 and v2 keep serving from the
  same probe as they do today.
- `AUDIT_CRITERIA_VERSION` and `CENSUS_BATTERY` move to v3 together on
  one day, with `AUDIT_BATTERY_CHANGED` and its note, so every paid
  headline and every census row cite the same battery
  (`test/battery-inside-the-bytes.spec.ts` holds that).
- `/criteria` gets a dated note in the shape of the N1 note: what
  folded, why, and that a v2 `ready` recorded before the date means
  what it meant.
- Nothing signed is resigned. Rows, audits and watches issued under v2
  keep their bytes; the per-host history shows the battery each row
  ran under, so a verdict change on the day v3 folds is attributable
  to the battery and is printed that way, not as the door changing.

## Sequencing, one branch at a time

1. **PR 1 — Tier A, advisories first.** The five checks land as
   advisories under v2, with recorded-bytes fixtures in
   `test/fixtures/doors/` (each fixture fails exactly its listed
   checks, the check-independence rule), the vocabulary v8 rows, and
   a seventh practice door at `/api/practice/two-surfaces` that serves
   one price in the header and another in the body. Our own 402 is the
   first fixture: CI aims `runChecks` at it as it does today.
2. **PR 2 — v3.** `discovery-info-validates` and
   `offer-amount-matches-accepts` fold. Version constants, changelog,
   `/criteria` note, the three producers moved together. A month of
   advisory rows on the corpus decides whether the other three fold
   later.
3. **PR 3 — Tier C on the census.** The `catalog` column on the round,
   derived from the index the census already holds; the per-host row;
   `our_doors` gains `agrees`; the weekly brief prints the fraction.
4. **PR 4 — Tier B on the paid audit.** The `surfaces` section, the
   `llms.txt` code-span convention published as a small spec, the four
   states, the bookend rule. Our own audit door is refused on our own
   hostname as every audit door is, so our own surfaces are held by
   the existing tests, which already pair menu.json, llms.txt, the
   skill, the bundle, OpenAPI and MCP (`test/derived-not-typed`,
   `test/skill-prices`, `test/discovery-coherence`,
   `test/mcp-door-quotes-the-same-terms`, `test/position-parity`).
5. **Later — the cross-instrument row.** Launch check settled amount
   against the same hour's preflight amount, on the launch check
   record. Small, and the only pair whose evidence is a transaction.

## Risks, plainly

- **False contradictions** are the whole risk, and the eight named
  differences above are the whole defense. Ship Tier A as advisories
  and read a month of them before any fold, as L3b did.
- **Our own doors first, and they will fail first.** The ClawHub
  bundle was wrong for weeks; assume something else is. The design
  treats that as the point rather than an embarrassment: the first
  correction row this check writes will be ours.
- **Catalog attribution.** Printing "catalog differs" on a door's
  passport reads, to a hurried reader, as the door's defect. The row
  says "the catalog's copy" in the field name and the sentence, and
  the doctrine sentence applies: the denominator and the derivation
  ride beside it.
- **Cost.** Tier B adds up to four GETs to one paid audit, well within
  the budget the EVM blacklist read already set. Tier A and Tier C add
  none.
- **Scope creep toward a score.** Four states and a fraction, never a
  percentage-agreement number. A door with one silent surface and one
  read surface that agrees is "1 of 1 agrees," not "100%."

## Decisions, ruled 2026-09-02 ("agreed on all")

1. Tier B rides `service_audit` always, at the same price, no flag.
2. The `llms.txt` price convention: a dollar amount in a code span
   beside an endpoint path, machine-read, never prose.
3. The practice door is `two-surfaces`.
4. Tier A's other three advisories fold only after a month of rows,
   by the keeper's hand.

## PR 1, shipped 2026-09-02: what landed and what the first run found

Three advisories under v2, in `ADVISORY_NAMES`, none folded:

- `discovery-info-fails-schema` — the bazaar info block against the
  schema beside it, over type, const, enum, required, properties,
  items and `additionalProperties: false`; formats, patterns, ranges
  and composition keywords are named as not checked. The table's two
  discovery rows above turned out to be one reading: in the bazaar
  extension the info block *is* the worked example, so validating it
  against the schema is the example check.
- `resource-description-absent` — a bazaar block with no top-level
  `resource.description`, the field the catalog indexes. Inference
  labelled as such.
- `offer-contradicts-challenge` — each decodable signed offer looked
  up in the accepts by rail; absent rail, or no entry on the rail
  carrying the offer's payTo and amount together, is named with what
  the challenge does offer.

`placement-mismatch` kept its name and now says which field moved on
which rail (header 1000, body 2000). The table's separate
`body-amount-matches-header` was not needed. Vocabulary v8 registers
`discovery-info-invalid` and `offer-contradicts-challenge`; the Tier B
and C classes wait for a signal to exist, because a class with no
signal is a word with nothing behind it. The practice door
`/api/practice/two-surfaces` serves the lesson live, and a recorded
fixture replays it offline.

**The first run found two things on our own doors, as the design said
it would.** First, the reference helper's schema requires
`input.method` while the raw declaration omits it; the SDK's server
extension fills the method in at request time, so the served 402
validates and the raw declaration does not. The test now reads the
served 402, which is the surface a buyer reads. Second, the offer
reader's first draft compared each signed offer against the first
accepts entry on its rail and flagged every pay-what-it-deserves door
here: three tiers per rail, one offer per tier. That is the first
named legitimate difference above, met on the first run, on our own
door, before the check reached anyone else's.

## PR 3, shipped 2026-09-02: the catalog column

`src/services/catalog-agreement.ts`. The discovery read now keeps each
row's terms (`accepts`, with the older `maxAmountRequired` spelling
read as `amount`, and `lastUpdated`) beside the URL; the one-shot
round hands them to `probeHost` with the live accepts still in scope,
and the long walk freezes them onto its roster because its probes
fire in later cron firings than its index read. Every probed row
carries `catalog` (agrees, differs with field and rail, not_listed,
not_comparable with the reason, and the catalog's own `lastUpdated`);
the round carries `catalog_agreement` (compared, agrees, differs,
not_listed, not_comparable); both ride the signed snapshot verbatim.
The per-host read and the weekly brief surface it, the brief without
naming a host. `our_doors` gains `catalog_differs`: our own doors
whose cheapest cataloged amount is not the shelf minimum, amount
only. The keeper is alerted once per change of the differing set,
with hosts named to him alone. Three of the named differences are
built into the comparison rather than bolted on: matched by rail, any
tier on the rail agrees, silence is not disagreement.

## PR 4, shipped 2026-09-02: the door's other surfaces, on the paid audit

`src/services/surface-reads.ts`, wired into `performServiceAudit`
after the battery and inside the signed core, on the ruling that Tier
B rides `service_audit` always at the same price. What is read, in
order, each GET guarded by the probe law, bounded to four seconds and
256 KiB: `/llms.txt`; `/openapi.json`, falling back to
`/.well-known/openapi.json` on a 404; the challenge's own `resource`
URL when it names one other than the door knocked on, read as a 402
and compared accepts against accepts, rail by rail; and the probed
402 again, the bookend. The four states hold as designed. The
convention is read exactly as ruled — a code span holding the path
with a dollar amount inside it or in parentheses right after it — and
prose is never read for a number; the OpenAPI read takes
`x-payment-info.price_usdc`, the smallest of
`x-payment.price_usdc_options`, or `x-price` / `x-price-usdc`. The
comparison is against the challenge's minimum on its first rail, in
atomic units only: a door whose amount is typed in dollars gets no
comparison and the reason on the row (`no_challenge_price`), because
guessing a decimal is what the battery refuses to do. The summary is
`named_a_price`, `agree`, `differ`, counts with their denominator;
when the bookend differs from the first read the section is `moving`
and both counts are zero. The section never moves the verdict, and
`AUDIT_SCOPE` says so. Two departures from the sketch above, on
purpose: the bazaar block is Tier A's already (inside the 402), so it
is not a Tier B row; and MCP `tools/list` is **not read** — there is
no standard place a door declares one — and `not_read` says so on the
artifact rather than printing a silent row that would read as
agreement. The specimen builds its section through the same
`surfacesSectionOf` over constructed reads. Vocabulary v9 adds
`surface-contradicts-challenge`, paid-detectable, pointing at this
section. And the first door the reader was pointed at is ours: the
guide now carries "Prices, by the convention", one derived line per
paid door in the code-span shape, and `test/surface-reads.spec.ts`
holds every line to the shelf's minimum.

What remains of S8 is PR 2, the v3 fold, on the SOON row: the keeper's
yes, no or later, on the advisory rows the census has read by then. No
calendar gate — the dated wait written here earlier was struck
2026-09-03 by the keeper.

## Sources read for this note

- `src/services/preflight.ts` (the battery, `BATTERY_ADDS`,
  `BATTERY_CHANGELOG`), `src/services/ward-round.ts` (the census and
  the discovery index), `src/store/defect-vocabulary.ts`,
  `src/store/corrections-ledger/ (one file per entry; npm run corrections:index)` (the 2026-08-31 bundle entry),
  `test/door-fixtures.spec.ts`, `src/routes/practice.ts`.
- x402 core spec, PR "docs(spec): clarify HTTP payment required
  header" (x402-foundation/x402#2320, merged 2026-05-26): the header
  is canonical; a body may duplicate.
- Bazaar extension specification (`docs/specs/extensions/bazaar.md`
  in x402-rs, mirroring docs.x402.org): facilitators must validate
  `info` against `schema`; a rejected block is reported `rejected`.
- x402-foundation/x402#1945 (2026-04-06, unanswered): 1,480 of 1,938
  v2 catalog entries carry no marketplace metadata; `@x402/core`
  strips `description` and `mimeType` from v2 `accepts[]`.
