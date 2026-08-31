# KEEPER_LIST — the keeper's one desk file

Successor to MONDAY.md and TASKS.md (archived whole 2026-08-20 as
`docs/archive/MONDAY_2026-08-20.md` and
`docs/archive/TASKS_2026-08-20.md`) and to the old KEEPER_LIST.md,
which was rewritten in place — git history holds every version of
it. Three queues is
how a finished task got handed back twice; this is now the only
desk. The ritual is MONDAY's: carry only what is TRUE and OPEN,
strike closed items with their evidence, and when the sheet is
mostly history, archive it whole with its date and start again. A
desk file is not a diary.

Every item keeps the old list's taxonomy, because it prices keeper
time honestly: **LOOK** — open a page, read a number, five minutes.
**TEST** — exercise something that has never met reality. **RULE** —
only the keeper can decide; no work happens until he does.

**Last trued up: 2026-08-20.**

**PARTIAL TRUE-UP 2026-08-30**, and the partial is the honest word.
Sixty pull requests merged between those dates, so this file was ten
days behind when the keeper asked what was left. What this pass DID:
fixed a doubled `## NEXT` heading from a bad merge; re-read NOW-4's
version numbers off the source files (they were three minors stale);
verified NOW-8's rail line on the live storefront. What it did NOT
do: strike anything on the strength of a PR title. An item here is
struck when its evidence has been walked, and walking sixty is its
own sitting — the alternative is striking something still open,
which is the failure this desk exists to prevent.

NOW-1 (the bank walk), NOW-2, NOW-5, the favicon and the alerts
mailbox need the keeper's own eyes and cannot be trued from here.

---

## NOW

**0. Rulings landed 2026-08-21 (the keeper's four-part note):**
- HOSTED TRUST PROFILES: APPROVED to build ("why not right? we can
  always remove them"). Monthly SKU, his $9–49 shape — exact price
  still ⚑ (a $19/mo draft will ship flagged unless he names one
  first). Queued as the next revenue build after the favicon swap.
- PASSPORT_REFRESH at $1: CONFIRMED "for now" — ⚑ struck in
  menu-utility.ts, copy still drafted-not-canon per rule 7.
- KEY SUCCESSION (F3): deferred by the keeper — "another day." The
  authority pack keeps naming the gap honestly meanwhile.
- FAVICON: the keeper put a preferred favicon in his Google Drive
  ("scvd.store" folder) to REPLACE the 08-21 house tyrannosaur; needs
  a Drive-tool approval click, then resize + swap. Small PR.
- ALERTS MAILBOX: keeper believes he fixed the alerts@ reply path
  (the pre-reply-to sends) but is unsure — verify by sending it a
  test mail from an outside account and watching it arrive.
- SPEC READS filed: docs/SPEC_READS.md — MPP (chargeback RULE now
  framed with a recommended `settlement_finality` field), Gateway
  (we likely already qualify — all three of our rails are Gateway
  chains; confirm criteria on the Haider call), x401 (watch, don't
  implement). Primary spec hosts egress-blocked; positions built on
  secondary coverage, byte-level claims deferred to build time.

**0a. THE OBSERVATORY OUTLINE (docs/OBSERVATORY.md, opened 08-21).**
The coverage/credibility brainstorm, outlined at the keeper's
direction — "outline it all before even considering building."
NOTHING IN IT IS BUILT and nothing is canon. Split STANDING /
PROPOSED / OPEN throughout so advice never blurs into shipped work.
Covers: the seven layers of "works", the observation record and its
un-backfillable fields, published methodology, the supply funnel and
its growth routines, rot as a product, the instrument ladder
(Sweep/Round/Beat/Watch), probe diversity (identity before geography)
and federation, the watch grammar, the canary, and panel+random
sampling. Six open rulings for the keeper sit in §12. He has more
material to add; §14 is the parking lot.

**0b. WEBMCP AND MCP APPS — brainstorm filed, THE GATING RULING
LANDED 08-27, THE SHAPE RULING STILL OPEN
(docs/WEBMCP_AND_MCP_APPS_2026-08.md, opened 08-27; §8 is the
ruling and supersedes several sections above it).**
**RULE 17 IS AMENDED** — the keeper's word, "this is why it's got to
go": the mechanism wording ("never asks a visiting agent to run
code; public endpoints only") is retired and preserved in place
beside its replacement, which is a property — *nothing the store
hands you can act without your decision, and the store never asks
for credentials, keys, or key material.* The credentials half stays
absolute. Shape stops being the test; capability becomes the test.
⚑ The wording awaits his own ink, and the rule now carries a DEBT
it names itself: the old sentence handed strangers a free one-line
impersonation check that worked because it was crude, and **no code
ships until its replacement is written and he has put his pen to
it** (rule 7). Nothing served changes today — the store still ships
no script, so the published sentence is still TRUE.
STILL OPEN: the P8 SHAPE (narrow / the third door / broad); whether
the refusal test — does this surface make it easier to refuse or
easier to accept? — becomes its own rule beside 43; the rule 4
check on publishing our own capability absence. AND ONE TEST GATES
ALL OF IT, before the shape ruling rather than after: build one
throwaway verify card and render it in all four hosts. If the gaps
and the expiry come out as small grey text under a big verdict, we
shipped a score and broke rule 43 while believing we honored it.
P7 UNBLOCKED FROM P2 on the keeper's read ("hands in many pots when
it's easy reduces my ability to bet the wrong horse") — the earlier
analysis priced an OPTION as an expected-value bet. Two arguments
found in that exchange: WebMCP declarations are themselves a thing
to observe, with no conformance infrastructure behind any of them;
and you cannot credibly run a conformance desk for a surface you
refuse to implement. Sequencing runs OPPOSITE to the brief: the
copy amendment is a fixed cost paid once, so the marginal cost of
the second item is near zero and the cheap play is BOTH OR NEITHER.
Build constraint corrected by the keeper — not "small enough to be
wrong about" but smart enough not to create risk or headache, which
measures as two questions with construction answers: can it act (no
— read-only verbs mirroring public endpoints, and a first CSP is
net risk DOWN) and can it drift (no, if the registration derives
from the same source as the HTTP route, as MENU_ITEMS and ROOMS
already do).
FIRST RENDER LANDED 08-27 and the keeper's read was "excellent" —
which opened §8.5a: the card is one of a FAMILY (conformance result on
a competitor's artifact, the shelf, the 402 approval card, a corpus
round with the misses published against us), and it carries a MAKER'S
MARK. The distinction that decides that last one, because the obvious
implementation is forbidden: a BADGE marks the subject ("this endpoint
is approved") and is a score rule 43 bans outright; a COLOPHON marks
the artifact ("we took this reading") and is a signature — a hallmark,
an assayer's stamp, a printer's mark. Drafted as a colophon. The
rotating line he asked for (the small-blessings treatment) is
DETERMINISTIC per rule 22, derived from the observation's own id, so
the same reading always carries the same line and the card stays
reproducible offline like everything else. **THREE RULINGS LANDED AND ONE BUILD SHIPPED, 08-27 evening:**
(1) ~~the P8 shape~~ RULED — THE THIRD DOOR plus narrow cards, never
broad, conditional on the four-host render test: if any host turns the
gaps into fine print, it drops to narrow-or-nothing automatically.
(2) ~~preflight/conformance as MCP tools~~ RULED AND BUILT the same
day: `preflight_endpoint` and `check_conformance` are in the catalog
(12 tools now), each calling the exact service function its HTTP door
calls, limiter included; the routing resource's printed gap came out
and its test flipped to guard the closed state. (3) ~~rule 4 on
publishing our capability absence~~ RULED AGAINST, with the line that
decides future cases: publish a gap where the person it protects will
trip over it, never where a critic will score it. AND THE SENTENCE:
the keeper picked draft B — "Nothing from this store can act without
your decision, and we never ask for credentials, keys, or wallet
secrets. Anything that does either is not us." — recorded in rule 17;
the swap onto live surfaces deliberately WAITS for the first rendered
surface, because the current sentence is stronger and still true
(rule 45). THE TEST KIT IS BUILT: scripts/render-test/ — a throwaway
zero-dependency server plus the card plus per-host steps written for
the keeper's hands; wire details read from the spec repo itself, not
coverage. ~~WAITING ON THE KEEPER: run the kit~~ — HE RAN IT, five
rounds, 08-27 evening. HOST ONE (Claude Desktop): **FULL PASS** — the
card renders at full height, size-changed honored, gaps and age at
full weight, colophon intact; rule 54's eye test passed, dark theme.
Three findings the rounds paid out: an MCP Apps page must itself
speak MCP (`ui/initialize` over postMessage) or the host shows
nothing while its own marker claims otherwise; that "widget rendered"
marker is an UNVERIFIABLE CLAIM, observed asserting a render nobody
saw — the artifact-without-verification shape, found in the render
pipeline of the flagship host; and THE FUNNEL WORKED END TO END — the
host model read the card, refused correctly ("anyone quoting this as
'verified' is quoting it past what it says"), and routed to
`preflight_endpoint`, the live free tool, unprompted. ⚑ ONE COPY FLAG
with two independent machine readers behind it: "expires in N days"
reads as a forward warranty; "stale after" / "current until" are the
candidates, the keeper's pen. Light + narrow confirmed 08-27 late — host one COMPLETE. VS CODE
PASSED the same night (chat sidebar = a natural narrow test; ladder
and colophon intact). **Two independent hosts at full weight — the
shape ruling's condition is MET and the third door stands.** ChatGPT
(tunnel) and Goose remain as record rows, not gates.

**PRODUCTION CARDS SHIPPED 08-27, same day the condition closed
(src/lib/mcp-apps.ts; design doc §11 is the ship record).** Two cards
on the live MCP door and only two: the preflight reading and the
signature check — both free tools, display only, populated over the
proven tool-result bridge, unclimbed rungs and the conflict of
interest at full weight, colophon with the inked line. NOTHING PAID
RENDERS: no buy_* tool carries ui metadata and test/mcp-apps.spec.ts
pins that as the payment-surface guard, beside pins on the handshake
(the load-bearing finding), textContent-only rendering, and
no-network self-containment. AND THE SENTENCE SWAP EXECUTED in the
same commit, per rule 17's own timing clause — this is the store's
first rendered surface, so draft B replaced the mechanism sentence
across every surface that carried it (402 body, skill.md + clawhub
bundle, llms.txt, agents.md, openapi, MCP instructions, /what, /try,
gazette founding note, registry submission), each in its own
register; the promise tests now assert both halves (property +
absolute) instead of the old string. ⚑ Still the keeper's: the expiry
label call ("stale after" / "current until") — deliberately ABSENT
from v1, both live cards are seconds-old readings ("one probe, one
moment"); it lands with the first corpus/stored-reading card.
~~⚑ NEW from the keeper, 08-27, unruled: label which tools are
agent-use vs human-use~~ — HE SAID BUILD IT, same evening, and it
shipped as drafts on the evidence-instrument / store-errand cut
(design doc §12.2); ⚑ the sentences await his re-ink. SAME EVENING,
THREE MORE AT HIS WORD: the scvd:// and ui:// resources are now
NAMED in llms.txt and agents.md instead of discoverable-only
(§12.3, his flag: "that's really important"); the production
connector test landed its row — Claude's custom-remote-connector
path runs the tools but withholds the render, a known host gap
(anthropics/claude-ai-mcp#471), stdio renders, our wire is correct,
recorded as a dated host observation in §8.5; and WEBMCP IS BUILT
(§12.1) — /webmcp.js registers the free read-only instruments on
document.modelContext, derived from the MCP catalog so it cannot
act and cannot drift (test-pinned), every fetch tagged ?src=webmcp
as its own channel, and the storefront's first CSP rides along.
~~⚑ Keeper's errand: origin-trial tokens~~ — REGISTERED AND LIVE
same night (Chrome token in the storefront head, test-pinned on
binding and expiry). THE EXPIRY LABEL IS RULED, same night: draft
A, "observed {date} · stale after {date}" — decay named, nothing
warranted forward. It lands with the first stored-reading card
(design doc §12.4).
SECOND BRAINSTORM RULED, 08-28 (design doc §13, the full record):
build list = check_this_store (renamed off "scam" at his word),
draft_purpose/cite_mandate, THE WEBMCP CONFORMANCE INSTRUMENT (his
strongest yes — "sellable to indexers and users alike"),
is_roger_out, ring_bell-from-the-porch (the co-presence ruling in
miniature: porch-class writes only — free, publish nothing, touch
no money; guestbook stays off because it publishes words). The
co-piloted till is PARKED on his frictionless argument, reasoning
kept in §13.2. HIS GRAFFITI WALL is BUILT (§13.3, 08-29) and SITED
OUT BACK on his own second read — the storefront slot was dropped
because no-URLs is not no-ads and money buying prominence on the
front page of an evidence observatory is a sentence a competitor
could write and be right. The head car rides /train: biggest
recorded bid of a day, marked in place with its date, its amount and
"paid, and saying so"; ties to whoever got there first; /train
publishes the standing bid and what it does NOT buy (nothing else on
this store). His approval still gates every car. The storefront is
untouched. THE POP-OFF CANDIDATE
(§13.4, scvd.store/check/{host} — the shareable endpoint report
page, the SSL-Labs wedge) is HELD SPECED: worth building on his
read, not sold on readiness — built on his word, not before.
SCOPED 08-30 against the code (§13.4): most of it EXISTS —
/passport/{host} is already a free, signed, dated per-host page for
any observed host, and preflightUrl already produces the whole
reading. Two versions: CHEAP (render census evidence for observed
hosts, never probe on demand — small, low risk) and EXPENSIVE (type
any host, probe live — a GET that fires an outbound request at a
caller-named host is a reflected-probe surface every link unfurler
will hit, and a permalink implies persistence we deliberately do not
keep). The trigger to watch for on the expensive one: somebody else
linking a scvd.store reading unprompted.

THE COLOPHON IS SETTLED as of 08-27: the mark reads SCVD / STORE (the
name and the address at once, so a card screenshotted out of its host
still tells a stranger where to go and check), it cites HOUSE RULE 43
on its own face — the keeper's idea and the best one in the stretch,
an instrument printing the standard it is held to — and it carries
THE KEEPER'S OWN LINE, inked 08-27 after two struck sets:
**"You know your own risk better than we do."** The only line of three
sets that does rule 54's work instead of narrating it: it hands the
decision back rather than describing our limits. ⚑ The rest of the
drawer is still draft (the mechanism rotates, so one line is a start
and not a drawer) — candidates in §8.5a, rule 7 stands.
The brainstorm below it stands as the reasoning trail, annotated
where superseded rather than rewritten, at his request.
ORIGINAL FILING, kept because the findings are what moved the rule:
NOTHING BUILT, nothing canon. The
outside audit's two agent-surface items, worked against the store as
it stands. Three findings that change the brief as posed: (1) the
audit's own item, WebMCP, is scored against `navigator.modelContext`,
which is DEPRECATED in Chrome 150 — the spec moved the surface to
`document.modelContext` and removed `provideContext()` in March, so
building to the audited name ships a deprecation on day one; (2)
BOTH items need the ruling, not just MCP Apps — a WebMCP
`registerTool` handler is our JavaScript executing in the visiting
agent's browser, and the store ships zero JavaScript today (verified:
no script tag outside `application/ld+json`, no form, no listener, no
CSP), so rule 17 and the impersonation sentence every served surface
carries are in play for P7 exactly as they are for P8; (3) there is a THIRD DOOR
on the MCP Apps ruling the brief does not list — a card at the
approval moment that RENDERS and CANNOT ACT, keeping the evidence in
front of the human and our button away from anybody's wallet. Also
argued: the strongest reason to build a card has nothing to do with
the audit — prose collapses "ready, nineteen days old, at L3, four
checks not observed" into "ready", and a card with a live expiry and
the gaps at equal weight does rule 43's work that a paragraph
structurally cannot; and if a card cannot be built to read as an
observation rather than a rating, it should not be built at all.
~~**RULE, and it governs both items:** does "never asks you to run
code" mean *we never ask you to execute anything*, or *the public
HTTPS surface is the entire relationship*?~~ **STRUCK 08-27 with its
evidence — ruled the first way, and the rule was rewritten as a
property rather than patched as a mechanism. HOUSE_RULES rule 17,
amended, wording awaiting his ink.** **LOOK, still open and now
cheaper than it was, since P7 no longer waits on P2:** how many
storefront-HTML requests come from agent-shaped clients that never
touch /mcp or llms.txt — rule 19's demand tag, and we keep the logs.
It no longer gates the build; it sizes it.

**0c. RULINGS LANDED 2026-08-28 (the instrument audit's sheet,
docs/AUDIT_RULINGS_2026-08.md):**
- L3d BURST ON PAID WATCHES: APPROVED — "yes paid." Three probes a
  tick on a watch somebody bought, published as a distribution
  rather than a single look. The census stays single-probe until the
  etiquette ceiling (Observatory 12.3) is ruled: bursting 750
  strangers is a different question from bursting a door its owner
  paid us to watch. Unbuilt; the sheet holds the design.
- THE DEPTH PASS ADVISORIES: HELD, WITH A REVISIT — "okay, but note
  we need to revisit and what we need to do when revisited." None of
  the five folds into a verdict yet.
  WHEN: after four weekly rounds carry them (about 2026-09-25), or
  sooner if any one of them fires on more than a tenth of probed
  doors.
  WHAT TO BRING: per advisory, the per-round count, and three doors
  it fired on checked BY HAND — the point is proving the finding is
  a real defect and not an artifact of how we read.
  THE TEST TO FOLD: it fires on true defects when hand-checked, AND
  every instrument citing the battery can actually run it. The EVM
  blacklist read fails that second half today — the census cannot
  afford an eth_call per door — so folding it needs a budget change
  or a battery the census does not cite, not just a ruling.
  LIKELIEST TO EARN IT: `resource-host-mismatch`. A challenge naming
  another host is not a door a buyer can safely pay.
- THE REGISTRY'S DROPPED COVERAGE FIELDS: APPROVED — "yes safer
  better." The round already records `capped`, `coverage_suspect`
  and `coverage_drop` honestly and the publish step throws them
  away; they carry through to the published week now and print
  beside the tally. Additive fields, no stored week rewritten.
- THE AUDIT'S COPY: CONFIRMED — "i think these are fine." The Night
  Watch line (shape, not payability) and the seven corrections filed
  2026-08-28 stand as written. Rule 7's drafted-not-canon flag is
  struck on both.
- THE payTo INFLOW READER: APPROVED, T1 ONLY — "agree with rest,"
  on the recommendation that inflows publish as counts with no names
  and never land on a named host's page in this market. NOTE THE
  CORRECTION THIS RULING CARRIES: the G2 tiers were ruled for
  ADVERTISEMENT history (which doors advertise which address), and
  an inflow is a different fact — what a party EARNED, which they
  did not publish about themselves. The tier SHAPES transfer; G2's
  authorization did not, so this is that fact's own first ruling.
  T1 is the whole of it: "N of the doors we walked received USDC at
  their advertised address this week," captioned as addresses that
  RECEIVED, never as doors that made sales — an inflow at an
  advertised address is not proof of a sale (treasury movement, a
  shared or facilitator wallet, an operator funding themselves).
  T2 and T3 stay unruled and unbuilt; the three reasons T2 was held
  are the damaging zero (rule 52 — the modal case in a market this
  young is the least reliable and most harmful number), shared
  wallets making inflows unattributable to the door whose page they
  would print on, and that "has been paid" as a published trust
  signal is bought for a few cents of self-payment.
- L3c ENDPOINT-SIDE SIGNATURE VERIFICATION: DEFERRED by the keeper —
  "maybe we just wait on the forgery piece and save it for later on
  down the road." Not declined; parked. The standing facts for
  whenever it comes back: no probe path verifies a signature (the
  battery passes a door on a JWS PARSE), so a forged live signature
  has never been observed and CANNOT be by anything we run — the
  count is zero either way. What we have seen is one door of 35
  attempting signed offers and serving ones that fail to parse.
  The exposure is insurance against our own success: the day signed
  offers become a signal buyers act on, faking one is free and our
  instrument is what gets faked past. Cheap when it comes back —
  $0, and it can run RETROACTIVELY over the challenge bytes the
  chain already stores.


**1. The bank walk — LOOK, first, because the records disagree.**
The TASKS archive (docs/archive/TASKS_2026-08-20.md, entry written
2026-08-13) says the walk stalled hourly from
08-12 13:30Z, cursor frozen at block 49,858,030, nineteen straight
failures shaped like a blown key quota, blocks going permanently
unreadable past ~2026-08-14 11:00Z — past that the hole is forever.
PROBLEMS.md #24 says the walk's backlog disease was FIXED 2026-08-11,
catch-up passes proven in tests. Both records stand with their dates;
neither is picked here. Open the dashboard and the admin: cursor past
49,858,030 means the stall record is stale and this closes; frozen
means follow the archived entry's steps — check/rotate the Alchemy key
(`BASE_RPC_URL_PRIMARY`), set the second-provider secret
(`BASE_RPC_URL_SECONDARY`) — and measure the hole honestly.

**2. The outreach recovery — TEST, two minutes** (08-19 batch).
`/admin/outreach`: "Clear ALL stamps (keeps contacts)" once, scout to
zero, then per card send the draft yourself, THEN mark sent. Nothing
on that page transmits; stamping without sending poisons next week's
list.

**3. Publish W34 to the public tally — LOOK + one press.**
`/admin/market` → Publish 2026-W34 to /registry (31% rot, the
signed-offers gap, the price map). Re-pressing replaces the row.

**4. ClawHub republish — TEST, five minutes, and it now matters more
than it did.** From a level main: `npm run skill:publish`. The
ClawHub copy lags the site; the number that is never stale is
`SKILL_VERSION` in `src/store/spec.ts` vs
`registry/clawhub/published.json`. Read 2026-08-31: **3.8.0 vs
3.6.0** — two minors wide now, not one.

WHY THE URGENCY CHANGED. The overhaul of 2026-08-31 found the
published bundle quoting `service_audit` at $0.10 against a $5 shelf
— wrong since that document's first commit — and `trust_profile` at
$19 after your 2026-08-29 repricing. A wrong price in the copy people
INSTALL fails silently and in the worst direction: an agent budgets a
tenth of what the 402 asks, declines the purchase it meant to make,
and concludes we are unaffordable. We never hear about it, and we
cannot edit a copy already installed. The tree is right and guarded
now (`test/skill-prices.spec.ts`, and the class is written up at
/corrections); the published copy stays wrong until you press this.

⚑ **The copy is drafted, not canon.** The overhaul rewrote roughly a
third of the bundle — a "six ways in" opener, a browser-door section,
the free desks as a table beside the paid twin each one is the
battery for, four shelf items and five corpus rooms that had never
been named anywhere in it. Every fact was walked against production
and every guard is green, but the VOICE is yours under rule 7 and no
test can hold that. Read it before you publish it; start with the two
new sections, `## Six ways in` and `## The browser door`.
(Every figure written into this line has been stale within days —
3.3.0, then 3.3.1, then 3.4.0, now this one. Per rule 45 the source
files are the count; the number above is a reading with a date on
it, not a fact this file keeps.)

**5. The directory PR sidecar — keeper follow-through** (08-19).
Regenerate `providers/scvd/store/openapi.json` from the live
/openapi.json and /menu.json now that the dual-rail build deployed;
the Solana directory's two Greptile blockers dissolve.

**6. RULED 2026-08-29 — the settlement-attempt lane: YES, the
sampled lane.** Open since 2026-08-18; the keeper's word is the
hard-capped sampled lane, aggregate-only publication, private notice
to the host when a purchase fails. 20 doors a week, at most $0.05 a
probe (the August run averaged $0.0005), under the standing wallet
law: $25/month funding discipline, ask-first above $1.

WHAT MADE THE CASE, and it was not appetite. The inflow census was
rebuilt four times across 2026-08-28/29 trying to answer "does
anyone actually PAY these asks" from chain data alone. It cannot,
and the reason is not that the data ran out: a transfer does not
carry intent. The instrument's own numbers established the ceiling —
a median of one distinct payer per receiving address, one address
holding 44% of every transfer seen, and a narrowest-possible figure
that one operator with two wallets would clear. `docs/
INSTRUMENT_AUDIT_2026-08.md` §§10-13 is the whole record.

WHAT THE KEEPER IS BUYING, stated plainly because it is the part
worth weighing: real money at strangers' doors, consuming a unit of
something they sell, without them asking us to. The same posture the
ward round already takes by knocking uninvited — but this one
spends, and a shop being bought from is a normal act only as long as
the caps and the notice hold.

STILL HIS HAND, NOT THE CLOCK (rule 30). The ruling authorises the
lane to EXIST. It does not authorise a cron to spend: the lane is
pressed, hard-capped, and refuses rather than overruns. Nothing in
this ruling lets money leave without a person.

Consenting-panel and self-only variants were both on the table and
were not chosen: a panel that agreed to be measured is a biased
sample and cannot speak for the market, which is the whole reason
the lane is worth having.

THE TWO PEOPLE-QUESTIONS, RULED 2026-08-29 the same day the scope
raised them, both toward the store's existing habits rather than
away from them:

  NOTICE — notify where a channel exists, record "no channel found"
  where it does not, and publish the aggregate either way. Holding a
  finding until its operator can be reached would silently drop the
  least-reachable operators out of every number, which is a coverage
  hole that has to be disclosed anyway. Count the gap in public; keep
  the finding.

  THE GOODS — keep the delivery's shape (status, size, content-type,
  sha256) and discard the body. The finding is whether goods arrived,
  never what they were. Holding strangers' paid products with no
  licence to is an exposure a named LLC does not need, and the hash
  still proves a specific thing was received if a walk is disputed.

**7. RULE: the ERC-8183 evaluator key.** The read is DONE and the
position RULED 2026-08-18 (`docs/ERC8183_EVALUATOR.md`, on /becoming)
— do not re-read it. One ruling remains and alone blocks the
testnet-run build: yes/no/which key for the no-custody evaluator
wallet.

**8. The shopfront rail line — LOOK, check don't act** (2026-08-13).
READ 2026-08-30: the live storefront serves "USDC on Base, Polygon,
Solana" and names all three rails consistently in its body copy. The
"8 on Base, 2 on Solana" split described below is NOT what the front
shows today, so either the split moved or this note outlived the
copy it was written about. The keeper's eyes decide which; the
reading is recorded so the next pass starts from a measurement.
After the next rail-split cron the front should read "8 on Base, 2 on
Solana," tail gone. If it persists, the unplaced sale is one of the
four Base hashes in the TASKS archive's NOW block;
`RAILS_ENTERED_BY_HAND` wants exactly one.

---

- ~~**Light the Polygon rail**~~ — DONE 2026-08-21. The keeper set
  POLYGON_PAY_TO; the rail went live at merge. Proven with real money
  the same day: CV's hand-rolled $0.50 settled on Polygon, cert
  `cert_s83s3dqvjf`, `network: eip155:137`, tx `0x1d78fdc7…`, both
  signatures verified. House-flagged (his wallet is listed), so it
  correctly does NOT appear in the organic split — the first ORGANIC
  Polygon dollar is still unclaimed.
- ~~**The three-rails copy pass**~~ — DONE 2026-08-21 (PR #186). The
  sweep found two AEO surfaces with ZERO Polygon mentions — agents.md
  and the OpenAPI contract had never been swept. Copy for machinery
  that was still Base-only was deliberately left alone and moved with
  its machinery instead, below.
- ~~LATER: the Polygon bank walk~~ — DONE 2026-08-21 (PR #186), and it
  came with the rest of EVM parity rather than alone, because the
  keeper's ruling was parity by parameterization: the RPC reader takes
  an EvmChain, the attestation reads BOTH EVM rails before signing
  NOT_FOUND (a Polygon settlement is 0x-hex too, and the old dispatch
  would have signed a false NOT_FOUND about real money one chain
  over), the Statement takes a `network`, and the board walks Polygon
  doors. Both walks share ONE read of the certificate drawer — the
  naive version bought a 2,000-key scan twice an hour for a
  chain-independent fact.
  STILL OPEN, small: `POLYGON_RPC_URL_PRIMARY` / `_SECONDARY` secrets
  (the Alchemy account covers Polygon). The walk runs on keyless
  public endpoints today and prefers the secrets the moment they
  exist; this is resilience, not function.

**THE SIX DOORS — 26 OF 26, and the interesting part is what it cost
(SIX_DOORS.md; `npm run doors:check`).** Read against production
2026-08-31 after four merges: raw API 5/5, MCP door 5/5, computer use
4/4, browser automation 4/4, WebMCP 5/5, the site assistant 3/3 and
deliberately not taken. Recorded, expires 2026-09-30, re-taken weekly
by `.github/workflows/doors-check.yml`.

~~BUTTON 1 — the registry republish~~ DONE by the keeper 2026-08-31.
0.2.2 is live and the listing finally repeats what we say we are.
Two things learned at the counter: a published version is immutable
exactly as npm's is, so a description edit without a version bump
changes nothing anywhere; and the workflow's read-back FAILED A
PUBLISH THAT HAD SUCCEEDED because it read once into the gap before
the registry marks isLatest. It polls ninety seconds now — a red build
for work that worked is the most expensive false finding there is,
because it teaches the person holding the button to disbelieve it.

~~BUTTON 2 — the Edge origin trial~~ DONE by the keeper 2026-08-31.
Both toggles correctly left off: no subdomain grant (nothing is served
off one), no third-party grant (we never inject our token into anybody
else's origin). **Edge expires 2026-10-15, thirty-two days BEFORE
Chrome's 2026-11-17** — so the diary date that matters is now October,
and the battery reports the soonest of the two rather than the first.

⚑ **STILL YOURS TO RULE: does the reading become a public room at
`/doors`?** The most on-brand thing imaginable — the observatory
publishing its own misses, counted against itself — against rule 44's
sweep and the risk that a public self-reading reads as the score rule
43 forbids. NOT BUILT without your word.

**~~LOOK~~ CHECKED 2026-08-31, AND IT IS THE SECOND THING: RULE.**
Cloudflare Web Analytics is BLOCKED on exactly the rooms that carry
our own script, which today is 29 of 71 including the front door and
the conformance desk — the two busiest pages on the store.

Verified rather than reasoned: production's exact beacon tag and our
exact `script-src 'self'` header, loaded in a real Chromium. With the
header the browser does not merely fail the request, **it never makes
it**; without the header it does. So the rooms with the CSP (`/`,
`/conformance`, every till page) report nothing, and the 42 rooms
without it report normally. The numbers in the Cloudflare dashboard
are real but partial, and partial in the least convenient direction.

This is decoration failing CLOSED and silently, which is the inverse
of AT_SCALE rule 7. Three ways out, and the choice is yours because
two of them are not ours to make from code:

  (a) ADD `static.cloudflareinsights.com` TO `script-src`. Ours to do,
      one constant. It widens the first-party fence to one named third
      party — and a fence with an exception is a fence that grows
      exceptions, which is why this is not the recommendation.
  (b) TURN CLOUDFLARE ANALYTICS OFF (your dashboard, not our code —
      the beacon is injected at the edge, so nothing in this repo can
      remove it). The store already runs its own counters at /visitors
      and /stats, which are the load-bearing ones. RECOMMENDED: the
      thing being blocked is redundant with what we already publish.
  (c) ACCEPT IT and write down that the dashboard undercounts by the
      busiest 29 rooms, so nobody reasons off it later believing it
      is complete.

**HYGIENE, no rush.** Two `v=MCPv1` TXT records sit on the apex; both
work, and the registry tries both. Delete the stale one only after a
publish has succeeded, so you never remove the key you are using.

**THE STANDING LESSON, worth more than the score.** Five of the
findings in this work were the CHECKER's fault, not the store's, and
three more were defects in the tests themselves. Every one was caught
by pointing the instrument at an answer already known before trusting
it. A confident reading from an unverified instrument is worse than no
reading: it spends the credibility that makes the next one worth
anything. That is the thing this store sells, and it now has its own
receipts.

## NEXT` heading from a bad merge; re-read NOW-4's
version numbers off the source files (they were three minors stale);
verified NOW-8's rail line on the live storefront. What it did NOT
do: strike anything on the strength of a PR title. An item here is
struck when its evidence has been walked, and walking sixty is its
own sitting — the alternative is striking something still open,
which is the failure this desk exists to prevent.

NOW-1 (the bank walk), NOW-2, NOW-5, the favicon and the alerts
mailbox need the keeper's own eyes and cannot be trued from here.

---

## NOW

**0. Rulings landed 2026-08-21 (the keeper's four-part note):**
- HOSTED TRUST PROFILES: APPROVED to build ("why not right? we can
  always remove them"). Monthly SKU, his $9–49 shape — exact price
  still ⚑ (a $19/mo draft will ship flagged unless he names one
  first). Queued as the next revenue build after the favicon swap.
- PASSPORT_REFRESH at $1: CONFIRMED "for now" — ⚑ struck in
  menu-utility.ts, copy still drafted-not-canon per rule 7.
- KEY SUCCESSION (F3): deferred by the keeper — "another day." The
  authority pack keeps naming the gap honestly meanwhile.
- FAVICON: the keeper put a preferred favicon in his Google Drive
  ("scvd.store" folder) to REPLACE the 08-21 house tyrannosaur; needs
  a Drive-tool approval click, then resize + swap. Small PR.
- ALERTS MAILBOX: keeper believes he fixed the alerts@ reply path
  (the pre-reply-to sends) but is unsure — verify by sending it a
  test mail from an outside account and watching it arrive.
- SPEC READS filed: docs/SPEC_READS.md — MPP (chargeback RULE now
  framed with a recommended `settlement_finality` field), Gateway
  (we likely already qualify — all three of our rails are Gateway
  chains; confirm criteria on the Haider call), x401 (watch, don't
  implement). Primary spec hosts egress-blocked; positions built on
  secondary coverage, byte-level claims deferred to build time.

**0a. THE OBSERVATORY OUTLINE (docs/OBSERVATORY.md, opened 08-21).**
The coverage/credibility brainstorm, outlined at the keeper's
direction — "outline it all before even considering building."
NOTHING IN IT IS BUILT and nothing is canon. Split STANDING /
PROPOSED / OPEN throughout so advice never blurs into shipped work.
Covers: the seven layers of "works", the observation record and its
un-backfillable fields, published methodology, the supply funnel and
its growth routines, rot as a product, the instrument ladder
(Sweep/Round/Beat/Watch), probe diversity (identity before geography)
and federation, the watch grammar, the canary, and panel+random
sampling. Six open rulings for the keeper sit in §12. He has more
material to add; §14 is the parking lot.

**0b. WEBMCP AND MCP APPS — brainstorm filed, THE GATING RULING
LANDED 08-27, THE SHAPE RULING STILL OPEN
(docs/WEBMCP_AND_MCP_APPS_2026-08.md, opened 08-27; §8 is the
ruling and supersedes several sections above it).**
**RULE 17 IS AMENDED** — the keeper's word, "this is why it's got to
go": the mechanism wording ("never asks a visiting agent to run
code; public endpoints only") is retired and preserved in place
beside its replacement, which is a property — *nothing the store
hands you can act without your decision, and the store never asks
for credentials, keys, or key material.* The credentials half stays
absolute. Shape stops being the test; capability becomes the test.
⚑ The wording awaits his own ink, and the rule now carries a DEBT
it names itself: the old sentence handed strangers a free one-line
impersonation check that worked because it was crude, and **no code
ships until its replacement is written and he has put his pen to
it** (rule 7). Nothing served changes today — the store still ships
no script, so the published sentence is still TRUE.
STILL OPEN: the P8 SHAPE (narrow / the third door / broad); whether
the refusal test — does this surface make it easier to refuse or
easier to accept? — becomes its own rule beside 43; the rule 4
check on publishing our own capability absence. AND ONE TEST GATES
ALL OF IT, before the shape ruling rather than after: build one
throwaway verify card and render it in all four hosts. If the gaps
and the expiry come out as small grey text under a big verdict, we
shipped a score and broke rule 43 while believing we honored it.
P7 UNBLOCKED FROM P2 on the keeper's read ("hands in many pots when
it's easy reduces my ability to bet the wrong horse") — the earlier
analysis priced an OPTION as an expected-value bet. Two arguments
found in that exchange: WebMCP declarations are themselves a thing
to observe, with no conformance infrastructure behind any of them;
and you cannot credibly run a conformance desk for a surface you
refuse to implement. Sequencing runs OPPOSITE to the brief: the
copy amendment is a fixed cost paid once, so the marginal cost of
the second item is near zero and the cheap play is BOTH OR NEITHER.
Build constraint corrected by the keeper — not "small enough to be
wrong about" but smart enough not to create risk or headache, which
measures as two questions with construction answers: can it act (no
— read-only verbs mirroring public endpoints, and a first CSP is
net risk DOWN) and can it drift (no, if the registration derives
from the same source as the HTTP route, as MENU_ITEMS and ROOMS
already do).
FIRST RENDER LANDED 08-27 and the keeper's read was "excellent" —
which opened §8.5a: the card is one of a FAMILY (conformance result on
a competitor's artifact, the shelf, the 402 approval card, a corpus
round with the misses published against us), and it carries a MAKER'S
MARK. The distinction that decides that last one, because the obvious
implementation is forbidden: a BADGE marks the subject ("this endpoint
is approved") and is a score rule 43 bans outright; a COLOPHON marks
the artifact ("we took this reading") and is a signature — a hallmark,
an assayer's stamp, a printer's mark. Drafted as a colophon. The
rotating line he asked for (the small-blessings treatment) is
DETERMINISTIC per rule 22, derived from the observation's own id, so
the same reading always carries the same line and the card stays
reproducible offline like everything else. **THREE RULINGS LANDED AND ONE BUILD SHIPPED, 08-27 evening:**
(1) ~~the P8 shape~~ RULED — THE THIRD DOOR plus narrow cards, never
broad, conditional on the four-host render test: if any host turns the
gaps into fine print, it drops to narrow-or-nothing automatically.
(2) ~~preflight/conformance as MCP tools~~ RULED AND BUILT the same
day: `preflight_endpoint` and `check_conformance` are in the catalog
(12 tools now), each calling the exact service function its HTTP door
calls, limiter included; the routing resource's printed gap came out
and its test flipped to guard the closed state. (3) ~~rule 4 on
publishing our capability absence~~ RULED AGAINST, with the line that
decides future cases: publish a gap where the person it protects will
trip over it, never where a critic will score it. AND THE SENTENCE:
the keeper picked draft B — "Nothing from this store can act without
your decision, and we never ask for credentials, keys, or wallet
secrets. Anything that does either is not us." — recorded in rule 17;
the swap onto live surfaces deliberately WAITS for the first rendered
surface, because the current sentence is stronger and still true
(rule 45). THE TEST KIT IS BUILT: scripts/render-test/ — a throwaway
zero-dependency server plus the card plus per-host steps written for
the keeper's hands; wire details read from the spec repo itself, not
coverage. ~~WAITING ON THE KEEPER: run the kit~~ — HE RAN IT, five
rounds, 08-27 evening. HOST ONE (Claude Desktop): **FULL PASS** — the
card renders at full height, size-changed honored, gaps and age at
full weight, colophon intact; rule 54's eye test passed, dark theme.
Three findings the rounds paid out: an MCP Apps page must itself
speak MCP (`ui/initialize` over postMessage) or the host shows
nothing while its own marker claims otherwise; that "widget rendered"
marker is an UNVERIFIABLE CLAIM, observed asserting a render nobody
saw — the artifact-without-verification shape, found in the render
pipeline of the flagship host; and THE FUNNEL WORKED END TO END — the
host model read the card, refused correctly ("anyone quoting this as
'verified' is quoting it past what it says"), and routed to
`preflight_endpoint`, the live free tool, unprompted. ⚑ ONE COPY FLAG
with two independent machine readers behind it: "expires in N days"
reads as a forward warranty; "stale after" / "current until" are the
candidates, the keeper's pen. Light + narrow confirmed 08-27 late — host one COMPLETE. VS CODE
PASSED the same night (chat sidebar = a natural narrow test; ladder
and colophon intact). **Two independent hosts at full weight — the
shape ruling's condition is MET and the third door stands.** ChatGPT
(tunnel) and Goose remain as record rows, not gates.

**PRODUCTION CARDS SHIPPED 08-27, same day the condition closed
(src/lib/mcp-apps.ts; design doc §11 is the ship record).** Two cards
on the live MCP door and only two: the preflight reading and the
signature check — both free tools, display only, populated over the
proven tool-result bridge, unclimbed rungs and the conflict of
interest at full weight, colophon with the inked line. NOTHING PAID
RENDERS: no buy_* tool carries ui metadata and test/mcp-apps.spec.ts
pins that as the payment-surface guard, beside pins on the handshake
(the load-bearing finding), textContent-only rendering, and
no-network self-containment. AND THE SENTENCE SWAP EXECUTED in the
same commit, per rule 17's own timing clause — this is the store's
first rendered surface, so draft B replaced the mechanism sentence
across every surface that carried it (402 body, skill.md + clawhub
bundle, llms.txt, agents.md, openapi, MCP instructions, /what, /try,
gazette founding note, registry submission), each in its own
register; the promise tests now assert both halves (property +
absolute) instead of the old string. ⚑ Still the keeper's: the expiry
label call ("stale after" / "current until") — deliberately ABSENT
from v1, both live cards are seconds-old readings ("one probe, one
moment"); it lands with the first corpus/stored-reading card.
~~⚑ NEW from the keeper, 08-27, unruled: label which tools are
agent-use vs human-use~~ — HE SAID BUILD IT, same evening, and it
shipped as drafts on the evidence-instrument / store-errand cut
(design doc §12.2); ⚑ the sentences await his re-ink. SAME EVENING,
THREE MORE AT HIS WORD: the scvd:// and ui:// resources are now
NAMED in llms.txt and agents.md instead of discoverable-only
(§12.3, his flag: "that's really important"); the production
connector test landed its row — Claude's custom-remote-connector
path runs the tools but withholds the render, a known host gap
(anthropics/claude-ai-mcp#471), stdio renders, our wire is correct,
recorded as a dated host observation in §8.5; and WEBMCP IS BUILT
(§12.1) — /webmcp.js registers the free read-only instruments on
document.modelContext, derived from the MCP catalog so it cannot
act and cannot drift (test-pinned), every fetch tagged ?src=webmcp
as its own channel, and the storefront's first CSP rides along.
~~⚑ Keeper's errand: origin-trial tokens~~ — REGISTERED AND LIVE
same night (Chrome token in the storefront head, test-pinned on
binding and expiry). THE EXPIRY LABEL IS RULED, same night: draft
A, "observed {date} · stale after {date}" — decay named, nothing
warranted forward. It lands with the first stored-reading card
(design doc §12.4).
SECOND BRAINSTORM RULED, 08-28 (design doc §13, the full record):
build list = check_this_store (renamed off "scam" at his word),
draft_purpose/cite_mandate, THE WEBMCP CONFORMANCE INSTRUMENT (his
strongest yes — "sellable to indexers and users alike"),
is_roger_out, ring_bell-from-the-porch (the co-presence ruling in
miniature: porch-class writes only — free, publish nothing, touch
no money; guestbook stays off because it publishes words). The
co-piloted till is PARKED on his frictionless argument, reasoning
kept in §13.2. HIS GRAFFITI WALL is BUILT (§13.3, 08-29) and SITED
OUT BACK on his own second read — the storefront slot was dropped
because no-URLs is not no-ads and money buying prominence on the
front page of an evidence observatory is a sentence a competitor
could write and be right. The head car rides /train: biggest
recorded bid of a day, marked in place with its date, its amount and
"paid, and saying so"; ties to whoever got there first; /train
publishes the standing bid and what it does NOT buy (nothing else on
this store). His approval still gates every car. The storefront is
untouched. THE POP-OFF CANDIDATE
(§13.4, scvd.store/check/{host} — the shareable endpoint report
page, the SSL-Labs wedge) is HELD SPECED: worth building on his
read, not sold on readiness — built on his word, not before.
SCOPED 08-30 against the code (§13.4): most of it EXISTS —
/passport/{host} is already a free, signed, dated per-host page for
any observed host, and preflightUrl already produces the whole
reading. Two versions: CHEAP (render census evidence for observed
hosts, never probe on demand — small, low risk) and EXPENSIVE (type
any host, probe live — a GET that fires an outbound request at a
caller-named host is a reflected-probe surface every link unfurler
will hit, and a permalink implies persistence we deliberately do not
keep). The trigger to watch for on the expensive one: somebody else
linking a scvd.store reading unprompted.

THE COLOPHON IS SETTLED as of 08-27: the mark reads SCVD / STORE (the
name and the address at once, so a card screenshotted out of its host
still tells a stranger where to go and check), it cites HOUSE RULE 43
on its own face — the keeper's idea and the best one in the stretch,
an instrument printing the standard it is held to — and it carries
THE KEEPER'S OWN LINE, inked 08-27 after two struck sets:
**"You know your own risk better than we do."** The only line of three
sets that does rule 54's work instead of narrating it: it hands the
decision back rather than describing our limits. ⚑ The rest of the
drawer is still draft (the mechanism rotates, so one line is a start
and not a drawer) — candidates in §8.5a, rule 7 stands.
The brainstorm below it stands as the reasoning trail, annotated
where superseded rather than rewritten, at his request.
ORIGINAL FILING, kept because the findings are what moved the rule:
NOTHING BUILT, nothing canon. The
outside audit's two agent-surface items, worked against the store as
it stands. Three findings that change the brief as posed: (1) the
audit's own item, WebMCP, is scored against `navigator.modelContext`,
which is DEPRECATED in Chrome 150 — the spec moved the surface to
`document.modelContext` and removed `provideContext()` in March, so
building to the audited name ships a deprecation on day one; (2)
BOTH items need the ruling, not just MCP Apps — a WebMCP
`registerTool` handler is our JavaScript executing in the visiting
agent's browser, and the store ships zero JavaScript today (verified:
no script tag outside `application/ld+json`, no form, no listener, no
CSP), so rule 17 and the impersonation sentence every served surface
carries are in play for P7 exactly as they are for P8; (3) there is a THIRD DOOR
on the MCP Apps ruling the brief does not list — a card at the
approval moment that RENDERS and CANNOT ACT, keeping the evidence in
front of the human and our button away from anybody's wallet. Also
argued: the strongest reason to build a card has nothing to do with
the audit — prose collapses "ready, nineteen days old, at L3, four
checks not observed" into "ready", and a card with a live expiry and
the gaps at equal weight does rule 43's work that a paragraph
structurally cannot; and if a card cannot be built to read as an
observation rather than a rating, it should not be built at all.
~~**RULE, and it governs both items:** does "never asks you to run
code" mean *we never ask you to execute anything*, or *the public
HTTPS surface is the entire relationship*?~~ **STRUCK 08-27 with its
evidence — ruled the first way, and the rule was rewritten as a
property rather than patched as a mechanism. HOUSE_RULES rule 17,
amended, wording awaiting his ink.** **LOOK, still open and now
cheaper than it was, since P7 no longer waits on P2:** how many
storefront-HTML requests come from agent-shaped clients that never
touch /mcp or llms.txt — rule 19's demand tag, and we keep the logs.
It no longer gates the build; it sizes it.

**0c. RULINGS LANDED 2026-08-28 (the instrument audit's sheet,
docs/AUDIT_RULINGS_2026-08.md):**
- L3d BURST ON PAID WATCHES: APPROVED — "yes paid." Three probes a
  tick on a watch somebody bought, published as a distribution
  rather than a single look. The census stays single-probe until the
  etiquette ceiling (Observatory 12.3) is ruled: bursting 750
  strangers is a different question from bursting a door its owner
  paid us to watch. Unbuilt; the sheet holds the design.
- THE DEPTH PASS ADVISORIES: HELD, WITH A REVISIT — "okay, but note
  we need to revisit and what we need to do when revisited." None of
  the five folds into a verdict yet.
  WHEN: after four weekly rounds carry them (about 2026-09-25), or
  sooner if any one of them fires on more than a tenth of probed
  doors.
  WHAT TO BRING: per advisory, the per-round count, and three doors
  it fired on checked BY HAND — the point is proving the finding is
  a real defect and not an artifact of how we read.
  THE TEST TO FOLD: it fires on true defects when hand-checked, AND
  every instrument citing the battery can actually run it. The EVM
  blacklist read fails that second half today — the census cannot
  afford an eth_call per door — so folding it needs a budget change
  or a battery the census does not cite, not just a ruling.
  LIKELIEST TO EARN IT: `resource-host-mismatch`. A challenge naming
  another host is not a door a buyer can safely pay.
- THE REGISTRY'S DROPPED COVERAGE FIELDS: APPROVED — "yes safer
  better." The round already records `capped`, `coverage_suspect`
  and `coverage_drop` honestly and the publish step throws them
  away; they carry through to the published week now and print
  beside the tally. Additive fields, no stored week rewritten.
- THE AUDIT'S COPY: CONFIRMED — "i think these are fine." The Night
  Watch line (shape, not payability) and the seven corrections filed
  2026-08-28 stand as written. Rule 7's drafted-not-canon flag is
  struck on both.
- THE payTo INFLOW READER: APPROVED, T1 ONLY — "agree with rest,"
  on the recommendation that inflows publish as counts with no names
  and never land on a named host's page in this market. NOTE THE
  CORRECTION THIS RULING CARRIES: the G2 tiers were ruled for
  ADVERTISEMENT history (which doors advertise which address), and
  an inflow is a different fact — what a party EARNED, which they
  did not publish about themselves. The tier SHAPES transfer; G2's
  authorization did not, so this is that fact's own first ruling.
  T1 is the whole of it: "N of the doors we walked received USDC at
  their advertised address this week," captioned as addresses that
  RECEIVED, never as doors that made sales — an inflow at an
  advertised address is not proof of a sale (treasury movement, a
  shared or facilitator wallet, an operator funding themselves).
  T2 and T3 stay unruled and unbuilt; the three reasons T2 was held
  are the damaging zero (rule 52 — the modal case in a market this
  young is the least reliable and most harmful number), shared
  wallets making inflows unattributable to the door whose page they
  would print on, and that "has been paid" as a published trust
  signal is bought for a few cents of self-payment.
- L3c ENDPOINT-SIDE SIGNATURE VERIFICATION: DEFERRED by the keeper —
  "maybe we just wait on the forgery piece and save it for later on
  down the road." Not declined; parked. The standing facts for
  whenever it comes back: no probe path verifies a signature (the
  battery passes a door on a JWS PARSE), so a forged live signature
  has never been observed and CANNOT be by anything we run — the
  count is zero either way. What we have seen is one door of 35
  attempting signed offers and serving ones that fail to parse.
  The exposure is insurance against our own success: the day signed
  offers become a signal buyers act on, faking one is free and our
  instrument is what gets faked past. Cheap when it comes back —
  $0, and it can run RETROACTIVELY over the challenge bytes the
  chain already stores.


**1. The bank walk — LOOK, first, because the records disagree.**
The TASKS archive (docs/archive/TASKS_2026-08-20.md, entry written
2026-08-13) says the walk stalled hourly from
08-12 13:30Z, cursor frozen at block 49,858,030, nineteen straight
failures shaped like a blown key quota, blocks going permanently
unreadable past ~2026-08-14 11:00Z — past that the hole is forever.
PROBLEMS.md #24 says the walk's backlog disease was FIXED 2026-08-11,
catch-up passes proven in tests. Both records stand with their dates;
neither is picked here. Open the dashboard and the admin: cursor past
49,858,030 means the stall record is stale and this closes; frozen
means follow the archived entry's steps — check/rotate the Alchemy key
(`BASE_RPC_URL_PRIMARY`), set the second-provider secret
(`BASE_RPC_URL_SECONDARY`) — and measure the hole honestly.

**2. The outreach recovery — TEST, two minutes** (08-19 batch).
`/admin/outreach`: "Clear ALL stamps (keeps contacts)" once, scout to
zero, then per card send the draft yourself, THEN mark sent. Nothing
on that page transmits; stamping without sending poisons next week's
list.

**3. Publish W34 to the public tally — LOOK + one press.**
`/admin/market` → Publish 2026-W34 to /registry (31% rot, the
signed-offers gap, the price map). Re-pressing replaces the row.

**4. ClawHub republish — TEST, five minutes.** From a level main:
`npm run skill:publish`. The ClawHub copy lags the site; the number
that is never stale is `SKILL_VERSION` in `src/store/spec.ts` vs
`registry/clawhub/published.json`. Read 2026-08-30: **3.7.0 vs
3.6.0** — the drift is real and one minor wide.
(Every figure written into this line has been stale within days —
3.3.0, then 3.3.1, then 3.4.0, now this one. Per rule 45 the source
files are the count; the number above is a reading with a date on
it, not a fact this file keeps.)

**5. The directory PR sidecar — keeper follow-through** (08-19).
Regenerate `providers/scvd/store/openapi.json` from the live
/openapi.json and /menu.json now that the dual-rail build deployed;
the Solana directory's two Greptile blockers dissolve.

**6. RULED 2026-08-29 — the settlement-attempt lane: YES, the
sampled lane.** Open since 2026-08-18; the keeper's word is the
hard-capped sampled lane, aggregate-only publication, private notice
to the host when a purchase fails. 20 doors a week, at most $0.05 a
probe (the August run averaged $0.0005), under the standing wallet
law: $25/month funding discipline, ask-first above $1.

WHAT MADE THE CASE, and it was not appetite. The inflow census was
rebuilt four times across 2026-08-28/29 trying to answer "does
anyone actually PAY these asks" from chain data alone. It cannot,
and the reason is not that the data ran out: a transfer does not
carry intent. The instrument's own numbers established the ceiling —
a median of one distinct payer per receiving address, one address
holding 44% of every transfer seen, and a narrowest-possible figure
that one operator with two wallets would clear. `docs/
INSTRUMENT_AUDIT_2026-08.md` §§10-13 is the whole record.

WHAT THE KEEPER IS BUYING, stated plainly because it is the part
worth weighing: real money at strangers' doors, consuming a unit of
something they sell, without them asking us to. The same posture the
ward round already takes by knocking uninvited — but this one
spends, and a shop being bought from is a normal act only as long as
the caps and the notice hold.

STILL HIS HAND, NOT THE CLOCK (rule 30). The ruling authorises the
lane to EXIST. It does not authorise a cron to spend: the lane is
pressed, hard-capped, and refuses rather than overruns. Nothing in
this ruling lets money leave without a person.

Consenting-panel and self-only variants were both on the table and
were not chosen: a panel that agreed to be measured is a biased
sample and cannot speak for the market, which is the whole reason
the lane is worth having.

THE TWO PEOPLE-QUESTIONS, RULED 2026-08-29 the same day the scope
raised them, both toward the store's existing habits rather than
away from them:

  NOTICE — notify where a channel exists, record "no channel found"
  where it does not, and publish the aggregate either way. Holding a
  finding until its operator can be reached would silently drop the
  least-reachable operators out of every number, which is a coverage
  hole that has to be disclosed anyway. Count the gap in public; keep
  the finding.

  THE GOODS — keep the delivery's shape (status, size, content-type,
  sha256) and discard the body. The finding is whether goods arrived,
  never what they were. Holding strangers' paid products with no
  licence to is an exposure a named LLC does not need, and the hash
  still proves a specific thing was received if a walk is disputed.

**7. RULE: the ERC-8183 evaluator key.** The read is DONE and the
position RULED 2026-08-18 (`docs/ERC8183_EVALUATOR.md`, on /becoming)
— do not re-read it. One ruling remains and alone blocks the
testnet-run build: yes/no/which key for the no-custody evaluator
wallet.

**8. The shopfront rail line — LOOK, check don't act** (2026-08-13).
READ 2026-08-30: the live storefront serves "USDC on Base, Polygon,
Solana" and names all three rails consistently in its body copy. The
"8 on Base, 2 on Solana" split described below is NOT what the front
shows today, so either the split moved or this note outlived the
copy it was written about. The keeper's eyes decide which; the
reading is recorded so the next pass starts from a measurement.
After the next rail-split cron the front should read "8 on Base, 2 on
Solana," tail gone. If it persists, the unplaced sale is one of the
four Base hashes in the TASKS archive's NOW block;
`RAILS_ENTERED_BY_HAND` wants exactly one.

---

- ~~**Light the Polygon rail**~~ — DONE 2026-08-21. The keeper set
  POLYGON_PAY_TO; the rail went live at merge. Proven with real money
  the same day: CV's hand-rolled $0.50 settled on Polygon, cert
  `cert_s83s3dqvjf`, `network: eip155:137`, tx `0x1d78fdc7…`, both
  signatures verified. House-flagged (his wallet is listed), so it
  correctly does NOT appear in the organic split — the first ORGANIC
  Polygon dollar is still unclaimed.
- ~~**The three-rails copy pass**~~ — DONE 2026-08-21 (PR #186). The
  sweep found two AEO surfaces with ZERO Polygon mentions — agents.md
  and the OpenAPI contract had never been swept. Copy for machinery
  that was still Base-only was deliberately left alone and moved with
  its machinery instead, below.
- ~~LATER: the Polygon bank walk~~ — DONE 2026-08-21 (PR #186), and it
  came with the rest of EVM parity rather than alone, because the
  keeper's ruling was parity by parameterization: the RPC reader takes
  an EvmChain, the attestation reads BOTH EVM rails before signing
  NOT_FOUND (a Polygon settlement is 0x-hex too, and the old dispatch
  would have signed a false NOT_FOUND about real money one chain
  over), the Statement takes a `network`, and the board walks Polygon
  doors. Both walks share ONE read of the certificate drawer — the
  naive version bought a 2,000-key scan twice an hour for a
  chain-independent fact.
  STILL OPEN, small: `POLYGON_RPC_URL_PRIMARY` / `_SECONDARY` secrets
  (the Alchemy account covers Polygon). The walk runs on keyless
  public endpoints today and prefers the secrets the moment they
  exist; this is resilience, not function.

**THE SIX DOORS — the instrument was wrong twice before it was right,
and two buttons are yours (SIX_DOORS.md; `npm run doors:check`).** The
lineup is the Chrome/Edge WebMCP framing, adopted because it is
somebody else's yardstick: raw API, backend MCP, computer use, browser
automation, WebMCP, the site's own assistant. 26 criteria read weekly
by a workflow against production, plus a 90-day human re-read of each
door's `watch` list.

**READ THIS PART FIRST.** The first reading published three findings
that were the checker's fault, not the store's, and they are withdrawn
by name in SIX_DOORS.md: the browser door is declared on **28 of 68**
rooms, not 1 (the sweep sent no `Accept` header and had been reading
markdown twins); the registry is **not** carrying the pre-reversal
description (the reader took the oldest search hit — you published
twice, and it worked); and the front-door hook finding stood, but only
after the criterion stopped passing on `data-cf-beacon`, an attribute
Cloudflare injects. All three have tests that were shown to fail
without their fix. **Production reads 23 of 26 met.**

- **BUTTON 1 — the registry republish, and a secret first.** The live
  listing (0.2.1) still says "trust layer of the x402 economy" because
  `server.json` was edited to the observatory sentence AFTER that
  publish, without a version bump — and a published version is
  immutable, exactly like npm's. Bumped to 0.2.2 in the tree. Steps:
  (1) the ed25519 private key behind the store.scvd TXT record →
  repo secret `MCP_REGISTRY_KEY`; (2) Actions → "Publish MCP registry
  listing" → dry_run checked, then unchecked. The workflow refuses a
  version already on the registry, and reads the listing back after to
  prove it landed. DISTRIBUTION.md §1.
- **BUTTON 2 — the Edge origin trial, which we never registered.** Our
  token is Chrome's. Edge 150 runs its own trial with its own
  registration (developer.microsoft.com/microsoft-edge/origin-trials),
  so an Edge visitor's agent does not have our browser door at all —
  and nothing on the page says so. ChatGPT Desktop needs no trial and
  already works. Five minutes at a portal, yours.
- **DIARY DATE: 2026-11-17.** The Chrome token expires. The API drops
  back to feature-detection, the script no-ops gracefully, the door
  shuts, and nothing anywhere announces it. Now a checked criterion
  that turns partial 30 days out.
- **SHIPPED, needs your eye on the copy (rule 7).** The conformance
  desk has a FORM — the first thing on this store a person in a
  browser can actually use, and the declarative WebMCP surface at the
  same time (`toolname` / `tooldescription` / `toolparamdescription`,
  attribute names read off the spec repo, not the write-up).
  **`toolautosubmit` is deliberately absent and that is the ruling in
  one missing attribute:** an agent may fill the form, a person
  presses the button. Rule 17, enforced by a test.
- **RULE — does the reading become a public room at `/doors`?** The
  most on-brand thing imaginable (the observatory publishing its own
  misses, counted against itself) against rule 44's sweep and the risk
  that a public self-reading reads as the score rule 43 forbids. NOT
  BUILT without your word.
- **SMALL BUILD, still open.** No first-party `data-*` or `id`
  anywhere on the front door — `<main>` carries no handle, so every
  hook an automation tool could hold is a style class a redesign
  moves. Derive them from ids the menu already has.
- **NOTED, not acted on.** Cloudflare injects `beacon.min.js` into the
  storefront from `static.cloudflareinsights.com`, under a
  `script-src 'self'` CSP we set ourselves. Either the fence is not
  doing what its comment says, or the beacon is being blocked in
  visitors' browsers and the analytics behind it are thinner than they
  look. Worth ten minutes with the browser console.

**FILED 2026-08-29 — the CLI shipped, the desk was rebuilt, and four
things stayed open.** (This whole stretch of work went unfiled until
the keeper said so out loud, which is the rule 29 failure, not a
footnote to it. Filed now with what is TRUE and OPEN only; the closed
work is in git.)

- **LOOK, in a few days, not today: who is actually knocking at the
  MCP door.** `/admin` → "Who knocked at the MCP door". 12,280
  handshakes and 11,803 tool listings in a month against no
  purchases, and until 08-29 the door threw away the one field that
  could tell a registry crawler from an agent bouncing off a price —
  every MCP client names itself in the handshake and we kept only a
  User-Agent most of them do not set. The census starts from its own
  deploy, so it is EMPTY on purpose right now and the page says so.
  Nothing about the MCP funnel should be asserted by anyone,
  including the agents, until that table has rows.

- **A number I gave the keeper was never a measurement, and it is
  written here so it does not get re-cited.** I said ~11,800 MCP
  clients "called nothing at all," citing 25 calls. `tools/call` was
  not recorded at all: five handlers logged themselves and the other
  eight — the whole buy_* shelf, `read_store_guide`,
  `verify_artifact` — were invisible either way. The right sentence
  was "we cannot tell." Not a published claim, so this is not a rule
  56 corrections-desk item; it is a desk note so the wrong figure
  does not walk into one.

- **The publish workflow's `version` input has no default, and that
  is why the "Run workflow" button greys out on a phone.** Deliberate
  when it was written — a typed version that must match
  `cli/package.json` cannot have a safe default, and the guard caught
  exactly that on run #1 (typed 2.1, package said 0.1.0). But the
  cost lands on the keeper's hand under rule 30, at the one moment
  the rule says the hand must be his. RULE: keep the friction, or
  default the field to the version already in `cli/package.json` and
  let the guard stay the thing that refuses a mismatch.

- **RULE 50 WAS BEING BROKEN AT THE MCP DOOR, AND HAD BEEN BEFORE I
  ADDED TO IT.** The 08-29 census shipped its per-tool counter
  AWAITED: one KV write sitting in front of the answer on every
  `tools/call`, the paid buy_* shelf included — the exact door the
  rule was written about after outside monitors clocked it at 977ms
  and 1424ms. Writing the guard for it then found five more already
  there, plus one on every JSON-RPC method: SIX awaited bookkeeping
  writes in front of the answer, none of them mine. All seven now go
  out beside the answer through one deferral, and
  `test/mcp-door-defers-its-bookkeeping.spec.ts` reads the source so
  the next counter cannot be written the old way. Nothing on the
  response path reads a porch surface back — checked before
  deferring, which is the proof rule 50 asks for.
  STILL OPEN, and it is the LOOK here: this door is fixed, the rest
  of the site is unmeasured. The same shape (an awaited courtesy
  write in front of a paid answer) is worth a sweep of the HTTP buy
  path, and rule 50's own closing line still stands — the honest
  latency value is `not_observed` until the preflight captures it on
  the doors it already walks.

- **RULE 50 ON THE PAID HTTP TILL: one write moved, three await your
  ruling, and I had one of them on the wrong side of the line.** I
  told the keeper the settle path had three deferrable courtesy
  writes in a queue. Reading it properly, only ONE was mine to move:
  `recordReferralFor(c, "settled", ...)`, whose own sibling on the 402
  path already rides a Promise.all wave — same function, same door,
  two treatments, and the difference was nobody looking. Done, with
  `test/mcp-door-defers-its-bookkeeping.spec.ts` holding it.

  WHAT I WITHDREW AND WHY. I had counted `recordSettlement` as a
  courtesy. It is the MONEY-IN LEDGER: dropping one undercounts real
  revenue, and `lib/metrics.ts` publishes a sentence about when it
  runs relative to the artifact handler that deferral would make
  imprecise. Recoverable via chain reconciliation is not the same as
  safe to lose. Rule 53 is explicit that rule 50 does not override
  money failing closed, so this is the keeper's call, not an agent's.

  STILL AWAITED, ON PURPOSE AND NOT UP FOR DEBATE: `recordSpentNonce`
  (defer it and the same authorization can spend twice) and
  `recordSettlementUnknown` (the only note that an ambiguous settle
  was ever in question).

  ⚑ THREE FOR THE KEEPER TO RULE:
  1. `recordSettlement` — trade a rare lost settle count for latency
     on the paid path? Chain reconciliation reads Base rather than our
     writes, so the loss is findable. Still money.
  2. `recordSolanaSettle` / `recordPolygonSettle` — these feed the
     unreconciled-cap meter that raises an alarm past a bound.
     Deferring a meter that gates a money alarm is a judgment about
     oversight, not about speed.
  3. The three `recordPaymentDecline` calls, awaited in front of a
     refused buyer. Money did not move, so they are diagnostics rather
     than ledger — but they are the record of WHY we said no, and I
     did not want to widen the change on my own.

- **64 of ~121 OpenAPI operations are still untyped, and the stopping
  point was evidence, not fatigue.** 57 are typed and bound by live
  probes. The remaining ones are per-artifact readers the keeper's
  own porch table shows almost nobody walks — and that table already
  corrected me once, when I recommended skipping the watch readers
  and it showed 262 and 111 organic reads, so the two watch histories
  were typed. Filed so the stop is a decision with a reason attached
  rather than a thing that quietly restarts.

## NEXT

**The frame:** the verification tier is still $0 outside — Assumption
0 unproven — while the economy under the position 10×'d. Everything
below serves the first outside dollar.

- ~~RULE: does a transfer-method reading belong in a VERDICT?~~
  **RULED 08-30 — YES, and built the same day.** v2 folds
  `transfer-method-signable`: a door naming an authorization standard
  no published client can build is unsignable in exactly the sense
  `amount-atomic` is, so it costs that door its v2 `ready`. The
  advisory `unrecognized-transfer-method` retired into it (one
  observation, one voice). v1 frozen and unmoved; rows sealed before
  08-30 stand as history; defect vocabulary v6 repoints
  `transfer-method-unrecognized` at the new signal. NOT folded, on
  purpose: `permit2` and `erc7710` still pass both batteries and draw
  only the advisory — real standards named where the spec says to name
  them, and scoring that would charge an operator for honesty.

- ⚑ **THE AGENT WAVE CHANGES THE WEIGHT ON P7 — LOOK, then RULE
  (docs/WEBMCP_AND_MCP_APPS_2026-08.md §10, opened 08-27 on the
  keeper's prompt about being "grok bot compatible").** Read off
  secondary coverage only — the assistant's training runs to May and
  every byte-level claim is deferred to build time, same discipline as
  SPEC_READS. Three findings that move things: (1) WebMCP's auth is NOT
  plugins, it is THE USER'S OWN BROWSER SESSION — no OAuth, no API
  keys, the agent acts as the logged-in human with every standing
  permission they hold; (2) the origin-trial adopters are transactional
  commerce, not experiments — Expedia, Booking, Shopify, Credit Karma,
  TurboTax, Redfin, Etsy, Instacart, Target; (3) Grok Build drives a
  LOCAL Chrome session using existing logins rather than APIs. Put
  together: maximum authority, maximum stakes, ZERO verification, and
  nobody anywhere checking whether a declared tool does what its schema
  says. **THE PROPOSAL: a WebMCP conformance desk** — same instrument,
  same signature, same expiring dated observation, pointed at a second
  protocol with no spec police behind it. "Cross-protocol by design"
  stops being positioning and becomes a roadmap. ⚑ Needs a demand tag
  (rule 19) before it needs enthusiasm. ALSO NOTED: our shape is
  accidentally well-suited to a session-authority world — no accounts,
  no logins, no OAuth, nothing to inherit or replay — and one new open
  question with no research behind it yet: if agent platforms gate
  listing behind an auth handshake, is having no auth a differentiator
  or an exclusion?

- ⚑ **THE KEEPER ASKED FOR THIS ONE, 2026-08-27: a short Twitter demo
  of the verdict card.** His words — "make a note for me to make a
  short demo of it to put on Twitter." The subject is the SIDE-BY-SIDE,
  not the card alone: Treatment A ("Ready", green tick, 4/4) against
  Treatment B ("Ready at L3a", four unclimbed rungs, 19 days old, "the
  correct amount of trust to place in this response is none") — same
  record, both factually true, and the whole point is that the first
  one is what an agent's summary hands a human today. The demo writes
  itself because the comparison IS the argument; nothing has to be
  claimed. Rule 5 applies hard here: if it wants a retweet it dies, so
  it is a demonstration, not a pitch. Rule 3: no primacy claim. The
  render lives in the keeper's artifacts gallery ("Does This Read As A
  Score?"). ~~NOT YET BUILT AND NOT SHIPPED~~ — **SHIPPED 2026-08-27
  and the keeper posted it the same day; Coinbase replied.** The
  unshipped-card caveat is spent.

  **THE FOLLOW-UP TWEETS ARE SCRAPPED, 2026-08-28, at his word** —
  filed here rather than deleted so nobody drafts them a third time.
  Four were queued and none will be posted: the /try practice-counter
  tweet (three drafts, his pick was A), the cards follow-up ("Update:
  endpoint evidence cards are live" — his own line, better than any
  of mine), the token-stance reply, and the Reddit reply to the
  fixtures post. The token-stance reply is the one worth keeping
  legible because the ANSWER outlived the tweet: no token, ever, and
  the reason is that a token turns every verdict we sign into a trade
  we are on one side of. That belongs in copy somewhere permanent —
  /credit already says "never a token, never transferable" — rather
  than in a reply nobody can find next month.

  What this leaves standing: the demo above was posted and is done.
  Anything new gets drafted when he asks, not kept warm on a list.

- ~~Swap the corpus denominator~~ — STRUCK 2026-08-20 at the
  re-review: the arXiv figure (13,760 / 420) is already what
  `src/services/population.ts` and docs/CORPUS_VELOCITY.md carry,
  and the old ~59,818 appears nowhere in the tree. Done before the
  merge; carried in error.
- **Promote undeclared_walkers to channel.ts — build, before
  trusting any denominator** (funnel finding 2026-08-18): the flat
  ~50–100 asks/day/item profile fingerprints catalog walkers still
  counted as organic.
- **x402-list — LOOK.** Acceptance waits on Finance → Verifiers
  (2026-08-18, correct filing). Once accepted: remove the token route
  (a nonce outliving its verification is litter), and recut the old
  imported "a lucky, $5–$25" description if it still stands (07-26
  item folds in here).
- **Bank CSV through `reconcile_card_statement` — TEST**, keeper
  hands (#33); drives variability under 2%.
- **Fund + hand-capture the two paid directories — TEST** (#36,
  402index.io and x402scan). The blocker dissolved with the wallet
  law; what remains is a funded wallet and one paid response each.
- ~~Paste draft-vauban into a session~~ DONE 08-20 (web search
  reached what direct fetch could not). Verdict: ALIGN by prior work
  — the family pins the same RFC 8785 discipline as hopley, which
  `signature_jcs` already speaks; our declared-order primary stays.
  The namespace spec now carries the vocabulary mapping
  (certificate ≈ SettlementReceipt, attests ≈ action_ref). No
  migration, nothing normative binds us; drafts watched, not chased.
- **Hand CV the re-pinned Tab segments — TEST** (#37).
  `docs/CV_TEST_SEGMENTS.md` pins `ad60264` (the old list's `7a67130`
  superseded 2026-08-18). Parts 2, 3, 4, 6 are CV's. **Part 1 is
  keeper-or-unprimed-instance only** — a primed agent proves nothing,
  and it is the only test of `unspoken_pct`, never yet produced.
- **The real-inbox sweep — TEST** (08-10). Contract and routine
  shipped; never run against a real inbox, even by hand.
- **Pen passes on the 08-19 builds' ⚑ copy — RULE:** launch_check
  (FIELD_WALLET_KEY reported set 08-19, so only the pen remains, plus
  WALKABOUT.md's ⚑), the_mandate, regulars' credit, the bounty board
  — where his hand also posts the first bounties.
- **Foundation membership tiers — LOOK, ten minutes** (08-18 scan).
  Join disclosed, or don't; nothing lost either way.
- **Key succession — RULE, then build** (F3, 08-10). Every signed
  artifact dies with the key if no successor is pre-announced; the
  single point of failure under the corpus.
- **The dropped-delivery clock — LOOK** (08-10: "the test is time").
  A week of organic sales with no new `undelivered_sale` on Base
  closes it. Riding along: a second load of `/admin/reconciliation`
  should mark no old rows [NEW].
- **Gates on the clock — LOOK on the date, decided in advance**
  (2026-08-12): ~08-25 on-page battery kill gate (zero free-desk
  callers → kill listing priority, keep code); ~08-27
  settlement_attestation kill criteria (near-zero calls → park);
  ~09-10 execution-contract gate; ~09-10 WBA directory demand gate
  (≥3 payers or ≥10 cards → build, else queue stays collapsed);
  ~09-20 the 60-day line — judges the MARKET, never the citation
  channels.

---

## BACKLOG

**Unstaffed hires** (docs/archive/EMPLOYEES.md; registrar's round on shift, these
proposed 2026-07-28 — each is one check on the rounds + a rule-32
job file):

- **Night watch** (07-28) — notice firsts: first non-house wallet,
  repeat buyer, item sold twice, new decline reason. Reports only.
- **Shelf inspector** (07-28) — catch the store contradicting
  itself: shutter closed with orders queued, lapsed presence window,
  stocked shelf at zero, listing failing spec at runtime.
- **Bookkeeper** (07-28) — weekly, before the Sunday digest:
  rows-vs-counters drift and crawler reclassification. Reads rows,
  never rewrites a counter.

**Queued builds, keeper-approved, not yet:**

- Context-anchor tier ladder (keeper's sketch 08-12) — real cost is
  a body-borne input door for 40K+ summaries; RULE range reads and
  digest-signing at build time.
- The Meter Check (08-19) — token-billing recount; gated on enough
  x402 inference endpoints. Count, never model.
- **The Circle-badge slate** (keeper 08-20, off the 100/100 scanner
  read: "i say we do it all at some point"), in build order:
  1. SIWX / wallet auth — CAIP-122 message format on the claims
     door's existing wallet-signature challenge. Small, doctrine-fit
     (no accounts, no keys), mine, near-term.
  2. MPP (Machine Payments Protocol, Stripe+Tempo) — second payment
     standard beside x402. Spec read first; RULE before build: card
     rails are reversible ~90 days and our certificates are signed
     forever — settle-before-mint needs a chargeback answer (exclude
     forever-artifacts from MPP, price the risk, or delay minting).
  3. Circle Gateway nanopayments — accept their unified USDC
     balance. Circle onboarding first (keeper hand, likely KYB);
     code after is modest. The Alliance Program thread (Haider
     Bhatti, 08-20) is probably the same front door.
  4. World ID / Proof of Human — requires the keeper PERSONALLY
     enrolling (Orb/app) before anything buildable; the store-shaped
     use is the inversion: our human_witness carries OUR proof of
     personhood, never a gate on buyers. Last, by his own "idk
     how... at some point".
- **THE OUTSIDE-READS LOG** (08-20: Circle scanner 100/100 + two Exa
  strategy runs). One dated ledger, split hard so advice never blurs
  into what already stands — the keeper's own rule: "structure so we
  have both and it's not confusing which we've worked hard on."

  ALREADY STANDING — do not rebuild, point outsiders here:
  audit+cert+badge+renewal = service_audit / launch_check / audit
  badges / conformance_watch · canonical receipt schema =
  scvd-attestation spec + JCS dual-emit · guided first purchase =
  buy_simple + /try + payload_template · recurring wedge =
  conformance_watch + recurring_patronage · evidence-first directory
  = /registry + /fresh-set (rows cite the signed corpus) ·
  own-store-as-the-demo = the 402→pay→verify walk on every door ·
  first ICP = endpoint operators (the funnel, the wire, the tally).

  NEWLY FILED, deduped across all three reads, rough build order:
  1. The Endpoint Passport — ONE canonical object bundling audit +
     badge + watch state + registry metadata: HTML for eyes, JSON
     for agents, signed digest, expiry/renewal, check history,
     non-guarantee language. The umbrella most items below feed.
     First passport: our own endpoint, public.
  2. Freshness states — evidence degrades VISIBLY: fresh / aging /
     expired / broken / indeterminate, so an agent can refuse stale
     evidence automatically. Sell the refresh, never the grade.
  3. The authority pack — why trust the observer: verification
     library + byte-testable vectors, sample-artifact gallery,
     incident policy, revocation story. Key succession (F3, RULE
     open) is the floor of this pack; third outside read to name it.
  4. Outcome-verification separation — paid / settled / executed /
     delivered / externally-observed / not-checked as distinct
     fields, never collapsed (partially standing in /api/verify's
     split verdicts; extend to receipt language).
  5. The obstacle course + signed failure diagnosis — deterministic
     named failure modes to practice against, and the paid signed
     "why an agent cannot buy from this endpoint" report (preflight's
     battery, signed and sold).
  6. One trust panel — aggregator page for key/history, corrections,
     books, uptime, fulfillment stats; feeds the passport.
  7. The assurance ladder, named — novelty / observation / monitored
     / audited / witnessed as explicit spec levels.
  8. The distribution pack — passport made outreach-ready:
     copy-ready profile, JSON twin, embeddable badge, registry
     submission checklist (the wire's notes get an artifact to
     offer, not just a defect to report).
  9. Standards-boundary language — "x402-native", "maps to",
     "references", with mapping tables and test vectors; never
     "AP2/MPP compliant" without implementing the flows. Rides the
     MPP/x401 read (#51/#52).
  10. ~~RULE (keeper): hosted trust profiles as a monthly SKU~~
      RULED 08-21: approved to build ("we can always remove them");
      the price alone still ⚑. See NOW item 0.
  11. Paid receipt-verification API (Exa residue, filed 08-20 late):
      /api/verify checks OUR artifacts free; this door takes ANYONE'S
      receipt by POST and returns a signed verdict — valid / invalid
      / insufficient-evidence / expired / indeterminate. Free by ID
      stays free forever; batch/third-party is the paid tier. The
      conformance desk pointed at receipts instead of offers.
  12. Compatibility mapping pack as a sellable (Exa residue): item
      9's standards-boundary language turned product — what your
      metadata has, what's missing, what claims to avoid, for
      operators wanting AP2/ACP/MPP-facing language. After the MPP
      read.

  BUILD ORDER RE-RULED 08-20 late (keeper: "prioritize on roi +
  doability"), replacing the list order above where they differ:
  P1 trust surfaces batch — trust panel (6) + sample gallery (from
     3) + assurance ladder (7): cheapest, lifts conversion of every
     EXISTING paid door, and is the substrate the passport needs.
  P2 the Endpoint Passport (1) + freshness states (2): the default
     paid offer, mostly assembly of shipped SKUs.
  P3 paid receipt-verification API (11): new in-lane revenue door on
     an existing battery.
  P4 SIWX (Circle slate 1): small, badge + claims friction cut.
  P5 obstacle course + failure diagnosis (5).
  P6 authority-pack residue (3) — test vectors, verification
     library, incident policy.
  Interleaved cheap: the spec reads (x401, MPP chargeback memo,
     Gateway). After passport + MPP read: distribution pack (8),
     mapping pack (12). Sunday-gated: the chain-inflow reader.
- ~~Single-rail residues~~ DONE 08-20: /zodiac and /api/claims read
  both rails.
- ~~The Statement~~ SHIPPED 08-20 on the shelf (`the_statement`, the
  3.4.0 turnover).
- ~~The Fresh Set~~ BUILT 08-20, the day the keeper hand-ran the
  first full walk: /fresh-set, names only on the ready side, free
  (ruled on the funnel's own evidence — keeper may re-rule to the
  half-cent door).
- Pass-holder multiplier — deliberately DEFERRED until patrons renew
  (08-19, the Costco note).
- town_papers (add /papers to the sitemap same build) and
  anniversary_artifact (RULE: one-line spec first). Both 07-22
  vintage.

**Waiting on reality, not on work:**

- Pager ride-along (B2, 08-10) — `unspoken_pct` null until a real
  week of pages. The watches (B4) — no endpoint ever watched a full
  week. Tiered/PWID arithmetic (B5) — never exercised by an outside
  buyer; one deliberate $1+ graffiti buy would close it AND walk the
  review queue by hand (07-28's unrun diagnostic).
- Tab Parts 5 and 7; pooled Tab reads — gated on the pool having
  anything to aggregate.
- Bazaar ingestion conflict, UNRESOLVED since 2026-08-02:
  "phantom_check appeared" vs "CDP validate rejects it" cannot both
  be true. Re-look before spending on the five still-shelved
  invisible items; the settle-and-valid-declaration rule is not
  established until this closes.
- KV→R2 graduation — arrives on its own; watch lines: snapshot
  >~128 KB, register/bank values near ~1 MB.

**Cheap distribution, still undone:**

- scvd-tab listed nowhere (08-10) — live on npm since 08-10,
  cold-install proven 08-20; Glama and the MCP directories.
- MCP server card — the "we run no MCP server" skip reason is false
  (08-10); remaining blocker is SEP-2127 being a moving draft.
- Gated: agentic.market (organic mcp + bazaar settles first), ACP
  (skip if token required), Farcaster/Base miniapp, Gazette
  auto-assembly (a week with 3+ organic events).
- Keeper-voiced outreach, not delegable (07-27): Show HN, two or
  three builder asks, presence without selling.

**Old rulings and passes still owed, none near-term:**

- Office overhaul (keeper's words, 08-03) — RULE first: his three
  walk-in questions, then lead every room with the answers.
- Naming-law leftovers (07-28) — one RULE covers openapi
  `info.title`, webmanifest `name`, MCP `serverInfo.title`; trust
  list `issuer` sits INSIDE the signed payload and waits.
- Ownership/rights as a second axis, not a second made_by value
  (07-31) — RULE; plus the co-ownership line on /what and llms.txt.
- "First store of its kind" vs rule 3 (07-26) — RULE; on record:
  keep "you're early," drop "first."
- C2 residue (08-10): one word on whether commission rungs and quote
  expiry take the spec defaults; nothing blocked either way.
- Approval-prompt screenshot (07-28) — the Part 5 blocker; one
  screenshot beats a week built on a wrong assumption.
- /api/verify still not loud on the storefront, /what, the skill
  (07-27) — "free, unlimited, forever" is the best claim we have.
  Plus the 33x audit of MCP tool descriptions.
- Almanac: Season Two before 2026-W44 (season one repeats after),
  and the first REAL entry — keeper dictates, machine structures.
- Breadcrumbs (canon §5) — BLOCKED on CHARACTER_CANON paste; Dimas
  is not the machine's to improvise.
- Data gaps on the keeper's nod (07-23): referrers, hour-of-day, MCP
  funnel depth, regulars aggregate, payer cohorts, Search
  Console/Bing, conversion latency.

---

## STANDING

- **The Sunday Grind:** the ward round mints the weekly corpus
  snapshot (hand-runs mint too); Gazette draft behind THE_NINETY;
  recount before the digest; a trip-wire glance (a trigger fires →
  build that ONE thing); the weekly llms.txt cold read as a stranger.
- **The weekly corpus drop is the metric, not a task** — corpus
  velocity binds the whole intelligence category (G2);
  `docs/CORPUS_VELOCITY.md` is the plan.
- **Monthly ledger review:** npm download trends (x402-verify /
  x402-sign), the census line, standing kill-criteria, the
  falsification set P0–P6, and asking an outside model "where can an
  agent buy a signed artifact" — the one measurement we cannot take
  ourselves.
- **Rule 44:** the AEO sweep is a stop after changes, never a chore
  for later.
- **Battery versioning:** a ratified Foundation change cuts a new
  battery version the same week, old versions serving forever.
- **Registry watch:** the day the Foundation blesses a registry, the
  ward reads it (ruling 6 — every public directory, uniformly).
- **Assumption 0 reorder rule:** a stranger paying for anything in
  the verification tier reorders this whole file behind that item.

---

## Struck at the merge, with evidence — so nobody does it twice

ERC-8183 read: RULED 08-18, only the key ruling survives (NOW).
Wallet-law blanks: RULED 08-18, funding discipline. Deliver-first
(B6, 08-18), replay-concurrency (B7, 08-20), cold-read of remaining
artifact classes (B8, 08-19, all passed). Refund-window detector +
`order_id` (both 08-10; the TASKS backlog copy was stale). Launch
check, mandate, regulars' credit, bounty board (BUILT 08-19, pen
passes remain — NEXT). Second retirement (08-20, 26 → 22). ClawHub
2.9.0 staleness (overtaken; republish in NOW is what is left). The
08-05 pagination collapse (SOLVED 08-19, offset, never a cursor).
MCP-abandonment (closed measured-cheap 08-11, twice). The rest of
what the three files marked done stays in `docs/archive/`.
