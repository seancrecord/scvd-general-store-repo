# Robin Saige, read in full — 2026-09-17

The keeper asked for three things about
https://robinsaige.com/s/store.scvd/general-store: what it is, where
it differs from this store, and what it does that this store should.
The host answered the sandbox this time, so this is a read of the
page, its JSON dossier, its per-server feed and its method page —
not a snippet. It closes the robinsaige half of the 2026-09-10 LOOK
on the desk; the Crosspeel half is still open.

## What it is

Robin Saige is an observatory of **MCP servers**, the way this store
is an observatory of **x402 doors**. Once a week it enumerates the
official MCP registry, sends every server with a remote endpoint a
real `initialize` and a `tools/list`, one pass, no retries, and
publishes a per-server record. It never calls a tool across the
census; it never bypasses auth; it identifies its prober. Its
population is 19,148 servers. Same operator as Trimtabist, disclosed
on the page.

The page under our registry name is its record **of us**. As of its
2026-09-13 census, in its words: verdict *allow — mid-fast-solo —
safe to depend on*, because it answers, its 20 tools are legible
(band A), and there was no confirmed drift in 7 probes since
2026-08-12. Latency 31 ms on the last probe (it was 826 ms on
08-30). Its tool census matches ours: the same twenty names the
full `/mcp` door serves. It classes 13 of them as retrieval-public,
6 as action, 1 as unclassified, and says plainly it has run zero
truth checks on us because no public primary is wired for this
server. A signed receipt (`rr_394ca4b14d8c707eeffb0a43`, key
`rs-rcpt-2026-08`, ed25519 over canonical JSON) covers the rating.

None of that is copied into a trust row as fact about us; the row
in `src/store/trust-signals.ts` says what the page is and where its
verdict lives. Its verdict is its instrument.

## Side by side

The two stores share a posture almost sentence for sentence — "a
dated observation with receipts, not a warranty" is their line and
could be ours — and differ in subject, method and what each has
built around the record.

| | Robin Saige | scvd.store |
|---|---|---|
| Subject | MCP servers in the official registry | x402 doors from discovery feeds and declared doors |
| Probe | `initialize` + `tools/list`, weekly, one pass | unpaid 402 battery, weekly ward round; paid launch checks that actually buy |
| Verdict | allow / warn / block with a because-clause | READY / NOT_READY / EXPIRED / INDETERMINATE, arithmetic over freshness |
| Derivation shown | ● observed · ◐ derived · ○ reported, per figure | derived-not-typed rule; `not_observed` and `does_not_prove` per module |
| Population framing | cluster and percentile within the 19,148-server cohort ("vs population: fast", "mid") | refused — never a ranking; counts travel with denominators, no percentile |
| Signature | ed25519 receipt, published key, canonical JSON | ed25519, declared-field-order + RFC 8785 JCS, key history Bitcoin-anchored |
| Expiry | "as of" date, no expiry rule | fresh / aging / expired with the rule on the artifact; refuse expired |
| Anchoring | none | weekly corpus hash-chained and OpenTimestamps-anchored |
| Per-subject page | `/s/{name}` | `/passport/{host}` and `/corpus/host/{host}` |
| Per-subject JSON | `/s/{name}.json` dossier "stable enough to gate CI on" | `/passport/{host}` (Accept: json) and `/corpus/host/{host}.json` |
| Per-subject feed | RSS `/s/{name}/feed.xml`: outcome changes and confirmed drift | **none until today** — four site-wide Atom feeds only |
| Badge | SVG verdict badge, updates with each census | passport chip (dark when broken) and colophon; never a verdict word on the face |
| Structured data | QAPage: "Should my agent depend on this server?" → verdict as accepted answer | WebPage on every room, Dataset on the history page; **no question node on the passport** |
| Operator recourse | "Operator of this server? … Dispute this record →" on every page | mailbox, corrections, notice desk, self-check — all existed, **none named on the passport page** |
| Corrections | 13, never deleted | 100+, never deleted, with the mechanism that changed |
| Disagreements | none published | `/disagreements`, both readings with derivations |
| Change history | inventory changelog (tools 10 → 13 → 15 → 20) and probe strip | verdict changes, pay-to set changes, weekly `corpus_changes` |
| Tool legibility | bands A–D on name, description, typed parameters | not measured — not this store's subject |
| Truth checks | Tier-2 re-derivation against public primaries, for retrieval tools | not applicable to a payment door; the launch check pays instead |
| One-call agent read | `should_i_use(name)` over MCP, `pip install robinsaige` | `check_before_you_pay`, `look_at_door`, `preflight_endpoint`; scvd-preflight on npm, PyPI, Go |
| Population size | 19,148 | a few thousand hosts enumerated, dozens walked a round — and the coverage gap is published per host |

## Where they are ahead, and what was taken

Three things on their page a depender would miss on ours. All three
sit on top of records this store already keeps; none needed a new
instrument, and none is a ranking.

1. **A change feed per subject.** "Depend on it? Subscribe to its
   change feed — outcome changes and confirmed drift, no account
   needed." An agent that relies on one door does not want the
   week's census. This store replays every verdict change and every
   pay-to change per host in `/corpus/host/{host}.json` and had no
   way to poll one host. Shipped: `/feeds/host/{host}.xml`, Atom,
   one entry per first probe, verdict change or receiving-address
   change, silent otherwise; advertised in the head of the passport
   page and the history page, as `feed_url` in both JSON twins, on
   `/feeds`, in the corpus llms area and on agents.md. A host the
   chain never met gets the history page's refusal, not an empty
   feed. Their feed is RSS 2.0 with day-precision dates; ours is
   Atom with the row's own timestamp, because that is what the four
   existing feeds are.

2. **The question the page answers, as data.** Their page carries a
   schema.org QAPage: "Should my agent depend on the MCP server
   store.scvd/general-store?" with the verdict as the accepted
   answer. That is the shape an answer engine lifts a verdict from,
   and the passport page had a WebPage node and nothing that said it
   answers a question. Shipped: a QAPage node on `/passport/{host}`
   whose answer never carries the decision word alone — the status
   it derived from, the rule, the date, the expiry, the count of
   things not observed and the observer ride in the same sentence,
   all read off the signed summary.

3. **The operator's line.** Every one of their server pages ends
   with "Operator of this server? Everything we hold about it is on
   this page — free, no account, for anyone. Wrong attribution,
   stale probe, misclassification? Dispute this record." This store
   had every door that line needs — the free mailbox at
   `/api/letter`, `/corrections`, the free self-check, the notice
   desk — and the passport page named none of them where an operator
   reading their own record would look. Shipped: an "Operate this
   door?" block on the passport page, issued or refused, and a
   `contest` object in the JSON, one code path for both.

## What was not taken, and why

- **Percentiles and clusters against the population** ("vs
  population: fast", "mid-fast-solo", distinctiveness 0.742). It is
  the most legible thing on their page and it is a ranking with a
  denominator. House rule 51's amended sentence — never a ranking,
  never a verdict without its derivation and denominator beside it —
  permits the second half and refuses the first. The tier at
  `/criteria` is as far as this store goes: a fraction with its rule
  and rows, alphabetical, never ordered by tier.
- **Tool legibility bands and nature classification.** A grading of
  MCP tool catalogues. This store's subject is the door and the
  payment, not the tool text; the free preflight and the launch
  check are the checks that fit that subject. Their band A reading
  of our own twenty tools is theirs to publish and is not adopted.
- **Truth checks.** Re-deriving a retrieval tool's answer against a
  public primary source is the right check for their subject and has
  no analogue for a payment door. The launch check, which pays the
  door and records every stage, is this store's version of "did it
  actually work".
- ~~**The ● ◐ ○ legend per figure.**~~ Taken after all, in the
  second press the same day (below).
- **RSS rather than Atom.** Their choice; ours was made on
  2026-09-03 for the dated `updated` and stable `id` Atom requires.

## The second press, same day: the face

The keeper read the list above and said "go for it" on the five
items that are rendering over the signed passport and nothing else.
All five shipped in `src/pages/passport-card.ts`, one code path for
the passport page, the hosted profile and the history page:

1. **The because-line.** The decision never appears alone: "READY —
   because answered 402 and every check in the battery passed ●;
   rails eip155:8453 ○; asks 0.001 USDC ○; tier established — ready
   4 of 4 rounds, W34–W37 ◐; observed 10 days ago, aging until
   2026-09-23 ◐. Not observed: …; never delivery, never anything
   after payment." Every clause is read off `payload.summary`; the
   same text rides the JSON as `because`, outside the signature.
2. **The probe strip.** One tick per round on the chain, oldest
   first, on the passport page and the history page: filled for
   ready, hatched for not ready, hollow for unreachable, dotted for
   a week we did not walk, with the reason on the tick. Shape carries
   the outcome as well as colour, and the full table stays under it.
   The timeline rides out of the issuer beside the passport rather
   than being replayed twice.
3. **The glance.** Decision, tier, rail, ask and evidence age as
   cells above every paragraph, each wearing its basis mark.
4. **The basis column.** Every summary row says observed, derived or
   reported. ○ is narrower here than theirs: nothing on a passport
   is copied from a directory, so "reported" means the door's own
   402 declared it and the probe wrote it down.
5. **The per-host page stops re-explaining.** The decision rule is
   linked to the landing instead of pasted under every host's
   decision word, and the protocol rule is folded.

Rendered and looked at, desktop and phone width, before commit
(`test/passport-glance.spec.ts` pins the five). Not built, still:
percentiles, legibility bands, truth checks, the dispute ledger and
reply window (a RULE), movers on the front page (a ruling on the
names line), and the MCP ward question in the chat of 2026-09-17.

## What their record says about us that is worth a look

- Their probe strip shows our `/mcp` handshake at 826 ms on 08-30,
  663 on 08-23, 606 on 08-16, and 31 ms on 09-13. Seven probes from
  one vantage prove nothing about a trend, but the adoption-and-
  latency note of 2026-09 (`docs/ADOPTION_AND_LATENCY_2026-09.md`)
  is the place to compare against.
- Their operator path is `robinsaige.com/operators#submit` with kind
  `invite`, which is how a server enters their Tier-2 truth-check
  lane. Whether this store wants a third party re-deriving its
  retrieval tools against public primaries is a RULE for the keeper:
  the tools it would fit are the free readers (`read_store_guide`,
  `find_in_catalog`, `verify_artifact`), and the answer key for
  `verify_artifact` is our own published key, which is a primary
  source in their sense. Nothing sent.
- Their dispute route (`/disputes`) is open to us as an operator.
  Nothing on their record of us reads wrong as of 09-13; no dispute
  to raise.

## What this read cannot say

Whether their census counts us the same way next week; whether the
19,148 cohort is the registry's whole remote population or the
share that answered enumeration; what "confirmed drift" requires
beyond "changes appear here after human review". Their method page
answers the last one in outline and none of the three in numbers.
