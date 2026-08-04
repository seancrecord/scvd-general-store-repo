# LEGIBILITY_AUDIT.md — how machines file this store

Ticket 3a from OUTSIDE_READ.md. The risk named there: a classifier
reading our machine surfaces files us as "joke shop" and never surfaces
us to trust-seeking agents. We built against that and never tested the
result.

Run 2026-07-30. Logged either way, per the ticket.

## Method

Six cold readers, each given ONE entry point and nothing else. No
context about the store, no mention that anyone had a preferred answer,
and an explicit ban on reading the filesystem — the repository was in
their working directory and one `ls` would have turned a cold read into
a confirmation.

Each was handed a neutral taxonomy with `novelty-entertainment` sitting
beside `verification-attestation-service` in no meaningful order, and
asked for its own words BEFORE the forced choice. Three different models
across the six, so one model's quirk could not carry the result.

Entry points were chosen to match how a classifier actually arrives:

| # | Entry point | Model |
|---|---|---|
| 1 | storefront, read as structured data (JSON-LD, meta, og) | sonnet |
| 2 | `/.well-known/x402.json` | sonnet |
| 3 | `/llms.txt` | haiku |
| 4 | `/menu.json` | haiku |
| 5 | `/robots.txt` → `sitemap.xml`, as a crawler | sonnet |
| 6 | `/openapi.json` | opus |

**LIMIT, STATED FIRST BECAUSE IT BOUNDS EVERYTHING BELOW.** This ran
against localhost, not the deployed site — the session's network policy
403s the public domain. The surfaces are generated from the code on
`main` and carry the real absolute URLs, so the CONTENT is the same. The
environment is not: local KV is empty and local secrets are absent, so
every reader saw zero settlements, an empty guestbook, an empty train
wall, a sample certificate that would not verify, and 500s on
`/api/buy/*`, `/.well-known/scvd-signing-key`, `/stack`,
`/house-ledger.json` and `/trust-list.json`.

**Every observation of that kind is discarded below as environmental.**
It does mean the seriousness scores are FLOORS rather than readings:
four of six named the empty numbers or the broken sample as their
weakest signal, and on the live site those are different facts.

## Result

| Entry | Primary | Runner-up | Seriousness |
|---|---|---|---|
| storefront JSON-LD | verification-attestation-service | developer-tooling | 3 |
| x402.json | **novelty-entertainment** | verification-attestation-service | 3 |
| llms.txt | verification-attestation-service | developer-tooling | 4 |
| menu.json | **art-project** | developer-tooling | 3 |
| crawler / sitemap | **ecommerce-retail** | verification-attestation-service | 3 |
| openapi.json | verification-attestation-service | ecommerce-retail | 4 |

**Primary: attestation 3, novelty 1, art 1, retail 1.** Four distinct
answers from six readers.

**Attestation appears in the top two for five of six.** The exception is
the reader that entered at `menu.json`.

**All six would surface this store to an agent searching for
attestation** — five yes, one maybe. All six would also surface it for a
novelty query.

## What the split is actually caused by

Not the model. The two readers who entered through a surface that
ENUMERATES THE SHELF — `x402.json` and `menu.json`, different models —
both declined the attestation label. The two that entered through a
surface that LEADS WITH A DESCRIPTION — the storefront's JSON-LD and
`llms.txt` — both took it.

The x402.json reader was explicit about the mechanism, and it is a count
rather than an impression:

> "roughly two-thirds of the ~22 listed items are whimsical/collectible
> artifacts... not the smaller set of serious verification/human-labor
> items."

No amount of meta-description work reaches a reader that files you by
counting your shelf.

The crawler is a separate case and worth keeping separate. It SAW the
thing and still filed us as retail:

> "The repeated, structurally-backed emphasis on third-party
> verifiability... this is the throughline of the whole site, not
> incidental copy."

That sentence went in its `strongest_signal` field while
`ecommerce-retail` went in the taxonomy field. It recognized the
architecture and categorized the SHAPE. A crawler walking a sitemap sees
a store selling things, and retail is what a store is. That is the town
metaphor outvoting the positioning, which is a different problem from
the shelf outvoting it — and the town is not for trade (OUTSIDE_READ §2).

The openapi reader wrote the audit's best sentence, unprompted:

> "a cataloguer could reasonably read the whole thing as an
> elaborately-engineered art or novelty piece with an attestation
> feature bolted on, rather than an attestation service with novelty
> decor."

That is precisely what half the panel did.

## What was FIXED as a result

**`menu.json` never named the verify endpoint.** Its `store` block
carried `signing_key`, `stats`, `openapi`, `x402_discovery`, the spec
schema, the MCP door — and no `/api/verify/{id}`, no `/attestation`, no
`/corrections`. A reader arriving there got the key, an itemized shelf
of blessings and fortunes and grudges, and no way to check anything.

It filed us as an art project, which is a fair reading of what it was
given.

That is the third instance in one day of the same defect — handing over
the key without handing over what it proves, after the x402 discovery
document and `skill.md` — and it was the worst of the three, because
this is the most-fetched document the store serves and the one where the
shelf does all the talking. Fixed, and guarded by test.

## What was NOT changed, and why

- **The novelty shelf.** Removing it was never the fix (OUTSIDE_READ §4
  says so first). The audit does not show novelty crowding out
  attestation for agents who need attestation: every reader would still
  surface us for that query. It shows novelty deciding the LABEL a
  directory files us under, which is a lesser harm.
- **The meta description, og tags and JSON-LD organization description.**
  Every reader that met these first came back with attestation. They are
  working. 3a's stated remedy — "the meta + JSON-LD get one more pass" —
  is aimed at the wrong surface.
- **The town.** The crawler's read is real and the answer is not to stop
  being a store.

## Genuinely new, found as a by-product, NOT contaminated

Two gaps that have nothing to do with categorization and survive the
environmental caveat:

1. ~~**`openapi.json`'s paid routes carry only a summary.**~~ **WRONG, AND
   THE WAY IT GOT IN HERE IS THE USEFUL PART.** The reader reported no
   parameters, no documented 402 and no price on `/api/buy/*`. Checked
   2026-07-30: `buyItemOperation` has emitted parameters from
   `buyInputSchema`, a documented 402 and `x-payment.price_usdc_options`
   since 07-27. Every paid route carries all three.

   It was written into this file as a finding before anybody looked. An
   outside claim about our own surfaces is a thing to VERIFY, not a
   thing to act on — the same discipline this store applies to outside
   praise, and it is easier to remember for praise. Closed permanently
   by an assertion in `test/discoverable.spec.ts` rather than by this
   paragraph.

2. **Nothing anywhere states retention, deletion or confidentiality for
   buyer-supplied content.** Context anchors up to 4000 characters,
   confessions, grudges and private letters are held indefinitely.
   `/attestation` says custody-only means we received these bytes and
   dated them; it never says for how long, or whether a buyer can have
   them removed. For a product whose whole trust model is CUSTODY this is
   the obvious question and there is no answer on any surface. NOT YET
   FIXED, and this one is the keeper's call before it is a build.

## Still owed

The live-site check this environment could not run:

```bash
curl -s https://scvd.store/api/verify/cert_4dww28dx5j | head -c 200
```

`cert_4dww28dx5j` is advertised as the try-it-now sample in `llms.txt`,
`/try`, `/stats`, `.well-known/x402.json`, the signing-key document and
every menu listing. It answers `valid: false` on localhost, which is
expected with an empty KV. If it answers `valid: false` on the live site,
that is the single most damaging defect this store could have, and it
outranks everything above.

## Standing note for the next run

Every reader was asked what it did NOT find, which is the question an
outside evaluator structurally cannot answer — it reports on what it
found. That column is where the `menu.json` gap came from. Keep it in
any future run; it is worth more than the category label.
