# AEO_GEO.md — being findable by things that read, not things that browse

How this store gets surfaced by answer engines and by models
recommending tools to agents, what each surface is for, and the
cadence that keeps them from quietly going stale.

Audited and filed 2026-07-27. ⚑ marks the keeper's call.

## The distinction that decides everything below

**SEO** optimizes for a human who will click a link and then look at a
page. **AEO/GEO** optimizes for a machine that will read the page and
then answer on our behalf, to somebody who never sees us at all.

That difference is not cosmetic here, it is the business. The store
sells to agents. The buying agent may never render a page; it reads a
document, decides, and pays. And the model *recommending* us to that
agent is a third party we will never meet, working from whatever it
read months ago.

So the question is not "do we rank." It is: **when a model is asked
"where can an agent buy a signed artifact," is our answer already
inside it, and is that answer still true?**

## The surfaces, and who actually reads each one

| Surface | Read by | Carries |
|---|---|---|
| `/llms.txt` | agents, model crawlers | the whole store as prose, written to be quoted |
| `/menu.json` | agents, importers | the catalog with the listing spec on every item |
| `/.well-known/x402.json` | x402 indexers | resources, input schemas, service metadata |
| `/openapi.json` | spec readers, tool generators | the contract, with capability queries as summaries |
| `/what` | answer engines | FAQPage JSON-LD, question-shaped |
| `/` | crawlers, humans | Organization + Offer JSON-LD |
| `/directory` + `/directory/:slug` | crawlers, neighbors | dated Review JSON-LD, one page per neighbor |
| `/trust-list.json` | agents checking the map | signed observations, per origin |
| `/sitemap.xml`, `/robots.txt` | crawlers | every human surface, with `lastmod` |

**The asymmetry that makes this hard:** the surfaces that matter most
are the ones nobody visits. A broken storefront is obvious the moment
the keeper opens the door. A discovery document that went stale in
March is invisible until an agent acts on something that stopped being
true — and then the failure lands on the agent, not on us, which is
the worst possible place for it.

## What the 2026-07-27 audit found

**The good, already in place before the audit:** llms.txt exists and
is written to be quoted rather than skimmed. Every item carries a
`why_use` and a `CAPABILITY_QUERY`, so value is machine-computable
before payment. Organization, Offer and FAQPage JSON-LD are live.
robots.txt welcomes crawlers and points them at the better maps.
`security: []` marks the free endpoints. The listing spec is uniform
and schema-published.

**The finding: not one machine surface was dated.** No `lastmod` in
the sitemap, no `as_of` on llms.txt, menu.json or the well-known
document, no `dateModified` in any JSON-LD. To a crawler deciding
whether to re-read us, and to a model weighing whether its cached
answer is current, *undated reads as unchanged forever*.

That is the wrong omission for this store in particular. The entire
pitch is **somebody actually went and looked, on a date**. Publishing
that claim on undated pages is the same shape of error as the
auto-refund line: something we genuinely meant, published in a form
nobody could check.

**Fixed the same day.** `lib/freshness.ts` derives one date from the
dates the catalog already keeps — directory listings, trust-list
checks, almanac entries — and every machine surface now carries it.

Two fields, deliberately not one:

- `as_of` — the newest date anything was written or re-checked **by
  hand**.
- `checked_at` — when this response was served.

Serving a page is not the same as having verified what is on it.
Collapsing them into a single "updated" field would produce a number
that is always today and therefore always meaningless.

**The date is derived, never typed.** A date somebody has to remember
to update is a date that will eventually lie, and a stale date is
worse than no date: it is a false claim rather than a missing one. Add
a neighbor, re-check a trust entry, and the stamp moves on its own.

## The cadence

### Every tick — the shelf-reader's round (code, automatic)

In `services/health.ts` alongside the self-check and the SLA guard. It
**reports and nothing else**: if nothing in the catalog has been
written or re-checked by hand in `STALE_AFTER_DAYS` (30), it raises
`catalog_stale`, deduped so a quiet month nags once every six hours
rather than every half hour.

**It never edits a surface and never touches a date.** A cron that
bumped the freshness stamp to look current would be forging the exact
claim the stamp exists to make. This is EMPLOYEES.md's hard line —
code notices, counts, checks; the keeper judges.

### Weekly, Sundays, with the digest (keeper, by hand)

Five minutes, and only the parts that need a human:

1. **Read `/llms.txt` start to finish as if you were an agent that
   had never heard of us.** It is the document most likely to be
   quoted verbatim by a model. If a sentence has stopped being true,
   it is being repeated somewhere right now.
2. **Any claim that changed this week** — a price, a promise, a
   fulfillment window — gets chased to all four descriptions
   (`metadata.ts` names them and says where the other three live).
3. **The Town Directory**: anyone new worth a line; anyone listed
   who has gone dark. A directory nobody has revisited in a month has
   started describing the past.
4. **The trust list**: `last_checked` on anything still true, and
   removal for anything that is not. This is the one file where a
   stale date is an actual claim about someone else.

### Monthly (keeper, by hand)

- Re-read the store's **canonical one-liner**. It is the copy that
  travels furthest — importers paste it into their own catalogs and it
  is out of our hands until somebody notices it is wrong.
- **Ask a model that is not us**: "where can an autonomous agent buy a
  signed artifact?" and "what is scvd.store?" Whatever comes back is
  the actual state of our GEO, and it is the only measurement here we
  cannot take ourselves. It is also how the auto-refund error was
  finally caught: an outside model repeated a false claim back to us
  as fact.
- Re-read the **Bazaar / x402scan / agentic.market scorecards**, which
  are free audits by parties with no reason to flatter us.

### On every deploy (automatic)

The suite asserts the dates are present and that `as_of` and
`checked_at` stay distinct. A surface that quietly drops its date
fails the build rather than shipping.

## What we are deliberately not doing

- **No keyword stuffing, no doorway pages, no synonym farms.** Rule 22
  bans engagement mechanics and this is the same instinct: a page
  built for a ranking rather than a reader is a page that lies to
  whoever arrives.
- **No claims we cannot date.** "Trusted," "reliable," "leading" —
  none of these can be checked, which is why the trust list forbids
  them by test.
- **No writing for models we cannot see.** We write for a reader.
  Being quotable is a consequence of being clear and being dated, not
  a technique applied afterward.

## What would count as this working

Not traffic. The store already has thousands of 402s and zero
signatures — attention was never the constraint. The real signals, in
order of how much they would mean:

1. A model that has never crawled us **describes us correctly** from a
   third party's summary.
2. An agent arrives via a **referrer we did not submit to**.
3. Someone asks to be **added to the trust list** without being
   invited, which means the list is being read as a map.
4. The `?src=` venue markers show a channel we did not plant.

⚑ Open for the keeper: whether the monthly outside-model check should
have a fixed question set, written down and asked verbatim each time,
so the answers are comparable month to month rather than a vibe.
