# PROBLEMS.md research annex — the vetted deep-research transcripts

(Moved from PROBLEMS.md on 2026-08-19. These are the 2026-08-02/03
research rounds, vetted and ruled at the time; the rulings they
produced live on in PROBLEMS.md and MONDAY-era records. Kept whole
here, dated, unedited.)

### DR4 round 1 (Perplexity), vetted 2026-08-02 — REFINES the A/B ordering above, does not just echo it.

Market stats consistent with DR3 (same trackers, cross-verified
there); the strategy findings:

- **The pricing bands, and the one that survives, decide how A is
  priced IF built.** Third-party attestation has three historical
  tiers: SOC 2 ($25k-70k, needs an accredited firm's liability and
  brand — structurally inaccessible to a solo pseudonymous
  operator); BBB ($400-1500/yr, reputationally WEAK because it is
  pay-to-play accreditation the buyer knows is bought not earned);
  and the Let's Encrypt commodity tier ($0-100, survived by being
  independently verifiable WITHOUT trusting the issuer's brand).
  Only the third fits us, and it fits exactly: A must price like a
  commodity check (single dollars, the quarter already planned),
  publish precisely what was tested and how, and lean entirely on
  the signed observation being cryptographically checkable — because
  institutional authority is the one thing a solo pseudonymous
  operator cannot buy or fake, and claiming it would break the
  honesty law. This is a design constraint on A, not just a price.

- **THE SEQUENCING REFINEMENT — B before A, and why it matters.**
  The A block above calls A "the strongest revenue idea on the
  board." DR4 does not contradict the DIRECTION (both research
  cycles confirm verification is where our edge and the demand
  converge) but corrects the ORDER: A is UNPROVEN — no evidence
  exists of anyone paying for x402 third-party attestation yet, a
  genuine gap, uncontradicted but unvalidated. B (the free verifier)
  is the de-risking funnel: cheap to build, ships inside the
  8-hr/week budget in a month, targets the same Stripe-test-mode
  fixture mechanism, AND its adoption IS the missing evidence for
  whether anyone values conformance checking at all. Building A
  before B is observed is building a paid product for an unconfirmed
  market. Revised sequence: (1) operate + polish vectors + run the
  description pass continuously; (2) ship B free; (3) attempt A only
  once B shows inbound; (4) C stays opportunistic (needs a willing
  peer — T4's territory). Logged as a correction to the A-first
  implication, per Rule 0's "a pivot has a date on it."

- **CORRECTION TO THE LINE ABOVE, 2026-08-02: "no evidence exists"
  is now too strong by one live example, and the conclusion survives
  it.** CV found x402station.io selling a $1 badge gated on ≥95%
  uptime over 7 days, re-verified on render. That is a real dollar
  for a BEHAVIOURAL claim rather than a syntax check, and — the part
  that matters for us — the buyer is the ENDPOINT OPERATOR buying
  proof of their own reliability to show prospective payers, which
  is exactly the re-aimed buyer T7 identified: the party bearing
  reputational risk, not the transacting agent. So A is no longer
  "uncontradicted but unvalidated"; it is validated at one point,
  small, by somebody else.
  WHAT IT DOES NOT VALIDATE, and the distinction is the whole
  question: liveness is not delivery-fidelity. Nobody found paying
  for "did you deliver what you promised," which is the harder and
  more valuable claim and the one A actually proposes. Uptime is
  observable by anyone with a cron; delivery-fidelity needs the
  buyer's side of a transaction. A precedent for the easy half is
  not a precedent for the hard half.
  THE SEQUENCE DOES NOT CHANGE. B-before-A rested on "no confirmed
  buyer," and one $1 badge sold by a third party to a different
  claim does not move it. Logged because a research verdict this
  file states as fact should be corrected the day it stops being
  fact, not the day it becomes inconvenient.
  NOT INDEPENDENTLY VERIFIED BY THIS REPO: x402station.io was
  fetched by CV and reported; outbound HTTPS from the build
  environment cannot reach it, so no agent here has seen the page.
  Treat as report-cited, one source, unreplicated.

- **THE UPSTREAM-OF-CHECKOUT REFRAME, 2026-08-02 (CV, from the
  Galaxy piece) — a positioning finding, not a build.** The report
  draws a hard line the store has never drawn for itself: x402's
  defensible near-term category is API/data micropayments UPSTREAM of
  checkout — evaluation, data-gathering, small non-reversible calls a
  task makes BEFORE a decision — while ACP/Stripe-style rails carry
  the committed purchase a human signs off on.
  WHY IT LANDS. We have been thinking "e-commerce for agents,"
  competing conceptually with a shelf. Look at what the shelf actually
  contains and it is two different games on one board: the free and
  cheap tier (/api/verify, /try, hello, small_blessing, and now
  /api/conformance) is literally pre-commitment evaluation
  infrastructure, and the human-labor items at the top (app review,
  phone call, the collab) are the opposite end — a person approves,
  fulfillment is trust-based, nothing is instant. Those are ACP's
  world, not x402's. We have had both ends on one shelf without ever
  naming that they play by different rules.
  WHAT IT IMPLIES: a copy pass on llms.txt, skill.md and the
  storefront that leans the LOW tier into "the cheap evaluation layer
  before your agent commits to anything bigger," which touches no
  payment logic and is only saying out loud what the store already
  structurally is. It also gives the conformance desk a throughline —
  "check before you commit" — instead of leaving it as an unrelated
  second feature.
  RULED 2026-08-02, and the ruling is narrower than the reframe:
  ADDITIONAL VALUE-ADD, NOT THE FULL VALUE PROPOSITION — "but it does
  need to be value facing as it's a critical early entry point."
  That distinction is the whole of it. The tempting move was to take
  an outside framework that fits well and let it become the store's
  description, which trades a general store for a category label and
  quietly retires the half of the shelf that carries the highest
  tickets. What shipped instead: the evaluation layer is named where
  an arriving agent reads first — llms.txt now opens the free checks
  as a thing to do BEFORE committing to anything bigger — and the same
  paragraph says out loud that this is a real part of what the store
  is for rather than a free sample, and that the shop is still a shop.
  A test holds BOTH halves, because copy that quietly renamed us "the
  cheap evaluation layer" would satisfy the entry-point half and fail
  the ruling.
  /api/conformance/v1 also gained a readable HTML twin, on the same
  reasoning /pulse carries: a surface only machines can read is the
  one place a person has to take our word, which is a half-claim from
  a desk whose whole pitch is "check it yourself rather than trust
  us." It doubles as the link a human can be handed in a chat window,
  which is what the CDP Discord conversation needs.
  STILL NOT DONE: the storefront and skill.md, which are the keeper's
  own voice under rule 7.
  NOT INDEPENDENTLY VERIFIED: the Galaxy piece was read by CV;
  outbound HTTPS is blocked from the build environment, so nothing
  here has seen it.

- **VOLUME IS DOWN ~96% ON THE TRAILING 30 DAYS** (Artemis dashboard,
  checked by CV 2026-08-02, report-cited and unreplicated here). Filed
  plainly rather than folded into the entry above, because it cuts the
  other way and should not be buried inside good news. It is
  CONSISTENT with the DR3/DR4 reading already on file — wash trading
  collapsed, real usage is smaller and realer — but consistency is not
  confirmation, and the honest summary is that composition may be
  improving while the tide goes out on raw volume. Anything that reads
  x402 adoption as a rising line should be checked against this first.

- **The falsifier that would flip B-before-A:** if B ships and gets
  zero external engagement in 8 weeks WHILE a paid-A request arrives
  anyway (a peer asking "check my offers/receipts and sign it"),
  that means demand is real but does not route through a free funnel
  — skip straight to minimal paid A at commodity price. The inverse
  (B adopted, nobody ever asks about paid) says A's payoff is
  reputational not commercial, and A deprioritizes further. Either
  way B is the instrument that tells us which world we're in.

- **Pinboard is the closest analog, and it VALIDATES what the store
  already does.** One person, anti-growth, paid from day one, ~$212-
  250k/yr on near-zero costs, no ads, sustained 15+ years — and
  Ceglowski credits three things: charge real money immediately
  (filters for committed users), radical minimalism, and — his
  words — "if I wasn't funny and if I couldn't tweet, I don't think
  I could make this work." The store already charges from day one
  and already has the voice. Reality-check kept honest: of ~1000
  scraped solo products, 80.9% make under $500 MRR and only 12 clear
  $10k — Pinboard-scale is the tail, not the median, so the honest
  baseline for this store is modest revenue on low costs, not a
  breakout. That is not a downgrade; it is the operating philosophy
  already in the wind-down doc, confirmed from outside.

- **The novelty shelf is a MOAT, with a sharp caveat that becomes a
  design rule.** Significant Objects (thrift trinkets, $128 → $3,612
  on invented backstories, measured +6258% from narrative alone) is
  real experimental evidence that voice raises value and
  memorability independent of utility; Pinboard corroborates at
  whole-business scale. BUT no evidence tests voice-moats on TRUST
  products specifically, and the defensible synthesis is a rule we
  keep: voice is TOP-OF-FUNNEL (makes the store rememberable and
  referred — luckies/dibs/graffiti do marketing without marketing),
  while the trust products must stay LEGIBLE AND SERIOUS at the
  point of technical evaluation. They do not compete for the same
  attention. The actionable constraint for when A/B ship: the
  conformance reports themselves stay boring and precise — never
  make the attestation cute. Cutting either layer weakens the
  business; conflating them would hurt conversion exactly where it
  matters.

### DR4 round 2 (Claude DR), vetted 2026-08-02 — RESOLVES the fork, and one competitive claim VERIFIED live.

- **THE FORK IS RESOLVED: both DR4 engines independently land on
  B-before-A.** Claude DR sequences it identically to Perplexity —
  Month 1 ship the free verifier (B) + operate honestly to age the
  track record; Month 2 distribution-as-being-the-example; Month 3
  soft-launch paid A to the qualified-lead list B surfaces. The
  A-first implication in the Opportunity block above is now
  superseded by two-engine agreement, not one. Build order settled.

- **The load-bearing risk, named cleanly: A is TRIGGER-dependent.**
  Every paid-attestation business that survived had an external
  trigger — a compliance MANDATE (SOC 2, sold by Vanta/Drata who
  sell the badge not the audit), a measurable CONVERSION LIFT the
  customer rewards (trust seals), or a counterparty DEMANDING
  validation (OV/EV certs for banks). x402 has NONE yet: no enterprise
  refuses to transact with a non-conformant x402 seller. The bet is
  that the store can be READY and REPUTABLE when the trigger arrives;
  if it never does, A stays a hobby line and B + honest operating IS
  the business. The CA cautionary tale sharpens it: Let's Encrypt
  annihilated paid DV certs (16:1 migration away from GeoTrust), and
  paid attestation survives only where it attaches to a mandate.

- **The competitive claim, VERIFIED by us against the live web
  (2026-08-02) because the whole A/B thesis rests on it:** Claude DR
  says the full-scope conformance-verification niche is empty. Search
  confirmed the adjacent players and their scope precisely —
  402audit.com does SERVICE QUALITY (proxy detection, pricing-markup,
  reliability scoring, public leaderboard); x402station.io does a $1
  badge gated on UPTIME (≥95% over 7 days), re-run on render; Vauban
  VPSF is a receipt FORMAT extension (IETF drafts), not an attester.
  NONE does the cryptographic full scope — 402 shape + Signed
  Offers/Receipts validation + did:web key-history resolution +
  settlement attestation, signed and published. And the x402
  Foundation launched 2026-07-14 with, by public admission, "no
  conformance suite, security profile, or validation procedure."
  The niche is genuinely empty of a full-scope competitor AND the
  standards body just publicly named the hole. That is the closest
  thing to a forming trigger in the whole cycle — it strengthens
  B-first (the free verifier fills exactly the admitted gap).

- **The pseudonymous-attester precedent, and it directly validates
  the keeper's model:** samczsun built crypto's most trusted security
  reputation while pseudonymous — reputation-first, badge-second,
  identity secondary to the receipts; hired by Paradigm, founded SEAL.
  Code4rena/Sherlock pay often-pseudonymous researchers by
  demonstrated public findings. The working model is EXACTLY the
  store's structural advantage: reputation earned through public,
  verifiable, track-recorded work. Caveat kept honest: a pseudonymous
  attester of OTHERS' compliance is a subtly different trust ask than
  a pseudonymous bug-finder, and the track record + radical-honesty
  layer must carry it — unproven at scale, but the precedent is real.

- **"The pain is real" datapoint, specific and checkable:** the
  academic tool x402scope (arXiv 2607.19545) found spec violations in
  ALL 15 major facilitators it tested, and Coinbase adopted
  mitigations. Real defects exist for a verifier to surface, so B is
  immediately useful, not theoretical.

- **Convergent with Perplexity DR4 on the rest:** novelty shelf is a
  moat, firewalled from attestation (the "never make the attestation
  cute" rule holds from both); the pay-to-be-rated trap (Trustpilot
  "Mafia" report, -32% in a day; BBB) makes our radical-honesty layer
  the exact antidote AND a design constraint — A must be architected
  so the attested party cannot buy a better result. Pinboard/Tarsnap
  the durable analogs; voice load-bearing not decorative.

- **The kill-metric, cleaner than round 1's:** ≥2 genuine unsolicited
  requests from DISTINCT parties to pay for a signed observation
  (not the free tool, not novelties — the paid attestation
  specifically) by end of month 2 → the trigger arrived early, pull
  A forward now. Zero paid demand while B gets usage → confirms
  "empty because early," let the record age while B compounds.
  Honest-law-compatible: measures revealed demand, manufactures
  nothing.

**BOTH RESEARCH CYCLES NOW CLOSED on the full-report side** (DR1+1b
conditional release; DR2 key continuity; DR3 demand; DR4 strategy —
three engines each, every load-bearing claim vetted, three of our
own claims corrected along the way, two real gaps fixed in code).
Remaining: the two Gemini red-team briefs (attack the demand plan;
pre-mortem the strategy) as the adversarial close. Build queue that
emerged, in agreed order: (1) tool-description boundary pass — hours,
triple-validated; (2) free verifier B — a week, both DR4s' month-1
move; (3) paid conformance A — gated on B's inbound + the kill-metric;
distribution and C stay human/opportunistic.

**DEMAND RED-TEAM (Gemini brief 3), vetted 2026-08-02 — no shipped
bug this round (unlike DR2's beacon), but two real strategic
refinements and three design constraints that bind the free verifier
BEFORE it is written:**

- **FM3 (free-rider commoditization) — the sharpest catch, and it
  hands us the anti-commodity design for B.** A purely offline
  stateless verifier gets forked, stripped of our identity, and
  bundled into rivals' packages — we carry the maintenance, capture
  zero flow. Gemini's fix is exactly right and we already hold the
  pieces: the verifier stays sticky only if it makes a DYNAMIC
  authority call only we can answer — a live key-liveness check (the
  liveness beacon we already ship) and a real-time registry/breach
  check (the OTS/Rekor-anchored key history from the DR2 plan). So B
  is designed as: offline crypto math anyone can run (honest, forkable
  by design — that IS the free public good) PLUS an optional live
  authority lookup against scvd.store that answers "is this key
  current, retired, or unknown, as of now, anchored externally." The
  fork is the funnel; the live lookup is the reason to come back. This
  converts two already-built/planned assets into B's moat.

- **FM2 (Layer-0 candidate exclusion) — FATAL tag, and a genuine
  qualifier on the triple-validated description finding.** Agent
  frameworks pre-filter tools DETERMINISTICALLY before semantic
  matching ever runs — latency caps (drop anything with a human
  fulfillment window), whitelist/registry gates, minimum-age/volume
  bars. If our human-labor shelf is dropped at Layer 0, its
  description is never read. This does NOT kill the description pass;
  it SCOPES it: the boundary-language work pays off for INSTANT,
  machine-verifiable items (verify, the conformance-check SKU, signed
  artifacts) and is largely wasted on human-queue items that get
  pre-filtered on latency. Sharpens the #1 build item — polish
  descriptions where Layer 0 lets them through. Early signal: high
  Bazaar indexing with zero manifest/mcp.json fetches from agent IPs.

- **FM1 (test-artifact arbitrage) — a hard design constraint on B/try,
  partly pre-mitigated.** A free /try that signs real JWS with a test
  key invites harvesting those receipts and passing them as paid work
  to naive third-party verifiers that check signature validity but not
  WHICH key. We already run the discipline for conformance vectors
  (published test key, distinct test kid did:web:scvd.store#conformance-
  test-key, a test asserting test≠live). The constraint for /try:
  inherit that exactly — a visibly distinct test kid, and our OWN
  verify surface must LOUDLY name a test-key artifact as proving
  nothing about a real purchase (verify.ts already names which key
  signed and flags no-known-key; extend it to flag the test key by
  name when /try ships). We cannot fix third parties' loose kid
  checks, but we can make the honest reading unmissable and never mint
  a test artifact that looks production. Early signal: production
  verify traffic for test-key signatures.

- **FM4 (unpriced CI load + reputational blast radius) — COST, and
  the RequestBin lesson again from another angle.** If frameworks
  hardcode /try into CI, every PR across dozens of repos hits our
  edge, and any schema change or key rotation breaks hundreds of
  builds globally — devs then flag us as an unstable dependency. Fix:
  a versioned, explicitly-stable fixture endpoint (/try/v1 frozen),
  a rate limit, and the free→paid bridge Claude DR4 already required.
  Stable-by-contract, not stable-by-luck. Early signal: identical
  top-of-hour POST spikes from CI runner IP ranges.

- **FM5 (the honesty trap) — existential, largely pre-mitigated,
  now named as explicit discipline.** The slow slide: zero organic
  volume → pressure → "uptime-monitor bots making real paid txns" →
  logging them as fulfillment → "impartial audits" that are
  cherry-picked marketing. The store's structural house-wallet
  exclusion already blocks the first step (monitoring wallets flag as
  house, excluded from every organic count). What this adds is the
  STATED rule and a periodic audit: no internal probing is ever
  counted as external demand, and the check is Gemini's own signal —
  do any public-fulfillment-log payer wallets trace to operator
  funding sources? Ever. That the store's whole edge is integrity
  makes this the one failure mode where the early-warning signal
  should be run deliberately, not just watched for. The kill-metric
  for pulling A forward (≥2 unsolicited paid requests) is honest-law
  clean precisely because it measures inbound the operator cannot
  manufacture.

*Net:* the demand plan survives with its order intact and three
constraints written onto B before a line of it exists (live-authority
lookup for stickiness; distinct+loudly-flagged test kid; versioned
stable fixture + rate limit), one scope refinement on the description
pass (instant items, not human-queue), and one discipline promoted to
an explicit rule (never count internal probing as demand). Gemini's
pre-mortem of the STRATEGY (brief 4) is the last adversarial pass;
after it, the build queue is final.

**STRATEGY PRE-MORTEM (Gemini brief 4), vetted 2026-08-02 — the
capstone, and the best adversarial work of the effort. Its six
causes-of-death share ONE hidden through-line, and naming it is the
finding:**

*THE THROUGH-LINE: every failure mode assumes an ENTERPRISE buyer
and an INFRASTRUCTURE-DEPENDENCY model — the two things the store
explicitly rejects.* Read that way, the pre-mortem is not a refutation
of the strategy; it is a proof that IF the store drifts toward selling
to enterprise compliance teams and toward being depended-upon
infrastructure, its constraints (no-infra, pseudonymity, voice) become
fatal. Which is an argument FOR staying in its lane, precisely stated.
The constraints Gemini attacks are the same ones that make the store's
ending clean and its bus-factor survivable. Held against that frame,
each cause resolves:

- **#1 Mercenaristic routing — the deepest cut, and it reframes WHO
  the customer is.** Buyer agents optimize for price/latency and won't
  pay for out-of-band trust badges; the transport layer already
  validates payment (sig/balance/nonce at the facilitator). PARTLY
  overstated — Gemini conflates PAYMENT validation (real, done by CDP)
  with CONFORMANCE/BEHAVIORAL verification (does the seller deliver,
  does its did:web resolve, does its receipt match spec — facilitators
  do NOT do this). But the core survives and it is important:
  verification demand comes from whoever bears the RISK, and that is
  NOT the transacting buyer-agent — it is the SELLER protecting its
  reputation, or an operator. This matches DR3's "demand is a function
  of transaction risk, not volume." The reframe: A's customer is the
  seller/operator, not the buyer-agent — which points at the hedge
  (inline validation middleware a seller embeds) and reconnects to
  opportunity A being sold to the /try audience (builders), not to
  passing agents. Logged as the sharpest correction to how A is aimed.

- **#3 Enclosure from above — refines the defensible niche, converges
  with DR1 #10.** The Foundation/CDP will bundle native SYNTAX
  conformance free (it already admits it has none), making an
  independent syntax-checker roadkill. The surviving niche is exactly
  what Gemini names and what PROBLEMS #10 (execution verification)
  already identified: cede "does your 402 conform" to the platform,
  own "did you actually DO what you said" — behavioral/execution
  assertions platforms disclaim. The store already holds those
  primitives (phantom_check = independent world-effect observation;
  settlement_attestation = chain-state observation). So B verifies
  syntax (free public good, commodity by design) while A's paid edge
  is the BEHAVIORAL layer no facilitator will touch. This is the
  single most valuable strategic refinement of the pre-mortem.

- **#5 Novelty/voice as enterprise liability — resolves the apparent
  contradiction with DR4 by buyer identity.** DR4 said voice is the
  MOAT (Pinboard, samczsun); Gemini says enterprise procurement reads
  it as risk. Both true, different buyers: voice wins the
  developer/community/operator buyer the store is actually built for;
  voice loses the enterprise-compliance buyer the store explicitly is
  NOT chasing. The domain-isolation hedge (a sterile
  x402-conformance.org) only becomes real IF A ever targets
  enterprise — logged as a conditional, not a to-do. The store's
  whole positioning is the samczsun model (reputation-through-public-
  work, community buyer), where voice is load-bearing.

- **#4 No-infra bottleneck — Gemini MISUNDERSTANDS the constraint.**
  It assumes no-infra blocks continuous observation, forcing a Rule 0
  bend. But the store ALREADY runs stateless serverless with crons
  (phantom_check is scheduled). The rule is "nobody's UPTIME depends
  on us," not "no compute" — a continuous-observation feed whose
  staleness fails safe does not violate it. So Gemini's own hedge
  (stateless serverless cron) is already available and needs no bend.
  Correction logged: the constraint is narrower than the critique
  assumes.

- **#2 Trigger horizon + #6 bus-factor — real, already in the ledger,
  self-consistently mitigated.** The multi-year mandate horizon is the
  trigger-dependency both DR4 rounds named; the hedge is not "freeze B
  as dead repo" (too pessimistic) but keep B cheap and let A wait on
  the kill-metric, which is the plan. Bus-factor is #11/#14 already;
  Gemini's "radical honesty makes the ending uglier" holds ONLY under
  the infrastructure-dependency premise — because the store is a shop
  whose artifacts stay verifiable forever without the keeper (published
  key, published bytes, the wind-down doc), a keeper departure strands
  nobody the way infra would. The clean ending is DESIGNED; the
  constraints Gemini attacks are what make it clean.

**THE DEEP-RESEARCH EFFORT IS NOW CLOSED.** Four questions
(conditional release, key continuity, demand, strategy), three
engines each plus one follow-up and two red-team passes, every
load-bearing claim vetted, several verified against primary sources,
three of the store's own claims corrected along the way, two real
code gaps fixed (offer-signing, beacon replay), and one demoted
engine proven useful in a narrowed adversarial lane. What survives as
the strategic picture:
- Verification is the store's edge, and the DEFENSIBLE half is
  BEHAVIORAL/execution observation (phantom_check/settlement lineage),
  not syntax conformance (which the platform will commoditize).
- A's real customer is the SELLER/operator bearing reputational risk,
  not the buyer-agent — aim it there.
- Order stands: description boundary pass (instant items) → free
  verifier B (syntax, forkable, with the live-authority lookup for
  stickiness) → paid A (behavioral, gated on B's inbound and the
  ≥2-unsolicited-request kill-metric) → C opportunistic.
- Every constraint the pre-mortem called fatal is fatal ONLY on a
  pivot to enterprise + infrastructure the store refuses; in the
  store's actual lane they are load-bearing, and Rule 0 bends them
  only behind a real case with a date, never behind pre-mortem fear.
The build queue is final. Nothing builds until the keeper's go;
the research's job — knowing exactly what we'd be building and why,
and what would kill it — is done.

---

## Recognition research, vetted 2026-08-03 — RULED, closes the "how do models come to know us" question until a training cycle turns

The report (parametric memory vs live retrieval, sources scored on
latency/half-life/observability) mostly confirmed standing
architecture, and the confirmations are worth one line each so nobody
re-derives them: the compounding-channel ranking maps 1:1 onto
AGENT_UX's four propagation mechanisms; "citation is earned, not
authored" is rule 30 restated; the two fast channels (registries,
Moltbook) are ones we already work, correctly sized as instruments
that answer live queries rather than assets that produce recognition.

THE FALSIFIER IS ACCEPTED AS THE RULING: no available source produces
parametric recognition inside a year with verifiable confidence, the
training clock (est. 6-18 months) is unobservable and unaccelerable
from outside, and any "% chance of entering the next training run"
number anywhere should be treated as fabricated. Therefore: NO effort
reallocates toward chasing parametric recognition. Operating well and
being cited stays the whole strategy, and the 60-day line in TASKS is
clarified to judge the market rather than the fossil record.

DECLINED WITH A REASON: the Moltbook 4-6h heartbeat presence. Ongoing
hands-cost to stay visible in a feed the report itself scores as
decaying in hours with no demonstrated parametric path. Event-driven
substantive presence (the causeclaw thread) is the earned kind, and
the report's own logic prefers earned to frequent.

THE ONE NEW LEVER, TAKEN: the GitHub-import channel — "code that
imports the service," ranked the most agent-native compounding
artifact on the list. verifier/ is now a publishable npm package
(x402-verify, name confirmed free, zero deps, five files, manifest
pinned by test/verifier-package.spec.ts). It stays inside the
"this stays a shop" ruling because it is distribution of an existing
MIT artifact that runs entirely offline — a published thing, not a
dependency anyone takes on our uptime. Publish is keeper hands per
rule 30; checklist at verifier/PUBLISH.md; the observable number is
npm weekly downloads, trend-real and absolute-soft, into the monthly
ledger review.

---

## Buyer's-journey research (failure moments), vetted 2026-08-03 — RULED, and the preflight is the outcome

The second report mapped eight x402 failure moments to their literal
surfaces and owners. Its narrowing is accepted: moments 2/3/6/7
dropped (raw JSON contracts, developer-process failures, gaps whose
real fix is an SDK contribution — a reference there is adjacency, not
cure); moments 1/8 occupied or weak. Two targets survived, and they
got different answers:

MOMENT 4 (CDP validate docs link) — ACCEPTED, gated on honesty: the
report oversold what the desk did (it checked artifacts; CDP's
validate checks endpoints), so the missing half was built the same
day rather than pitched around. /api/preflight/v1: free, one bounded
probe per call, checks derived from the same constants the till
enforces on itself, dogfooded in CI (the store's own 402 passes its
own preflight — the self-fetch refusal message cites that fact and
test/preflight.spec.ts is that fact). The CDP conversation (keeper
hands, already queued) is now scoped to exactly this: a linkable tool
that runs their preflight's checks, no "mention us" ask.

MOMENT 5 (badge inside the Bazaar UI) — DECLINED IN THAT FORM, kept
in the considered pile per the keeper's instruction that rules get
weighed, not obeyed blind. Operating a live scoring feed CDP renders
is uptime-critical infrastructure racing funded trust-layer startups
(ScoutScore, AgentTrust, Crest per the report) — the exact shape the
stays-a-shop ruling exists for, and its REASON (nobody's directory
should break when one keeper naps) survives re-examination. WHAT
SURVIVES INSTEAD is the seller-pays inversion: signed standing-watch
attestations a seller buys about THEIR OWN endpoint — same probes,
inverted consent, no defamation surface, degrades to one customer's
pause rather than an ecosystem's. That is phantom_check's grown-up
sibling and the customer matches the one this file already named
(the seller bearing reputational risk). PARKED behind the existing
kill-metric [OVERRIDDEN same day — see amendment below]: built when ≥2 unsolicited requests arrive, and the free
preflight is the funnel most likely to carry them here. Probe
infra cost measured and immaterial (~292k fetches/month to probe one
directory hourly, within plan); the binding cost is the freshness
obligation and keeper attention, which is why consent-first wins.

AEO/SEO, done where it counts: the preflight's GET doc and the npm
README both carry the LITERAL failure strings a stuck developer
pastes into a search box or an assistant (eip155:84532, "listed but
functionally absent", invalid_exact_evm_payload_signature, atomic
units) — the moment of failure is the only moment this tool is for,
so the document is written to be found at it. The breadcrumb rides
the preflight response like every other artifact: the report travels
into issues and CI logs, and it explains itself wherever it lands.


AMENDMENT, hours later, keeper's call: the standing watch is BUILT
and LISTED rather than parked. His reasoning accepted: the machinery
already existed (phantom's cron, the preflight's checks, the signing
path), the delist cost is one shelf edit, and the kill-metric guarded
against speculative COMPLEXITY, not against a cheap listing of an
inverted-consent product. Shipped as standing_watch ($5, fixed,
instant): hourly probes for 168 hours using the preflight's own
checks, each row individually signed, history free forever at
/api/watch/{id}, hours_unprobed derived at read time so the
watcher's own gaps cannot be edited out (rule 5b applied to
ourselves). Consent boundaries are structural: the buyer names their
own URL, our host is refused at purchase, no leaderboard, no
cross-customer surface, nothing said about anyone who didn't pay to
be watched. ⚑ Keeper's pen still owed on the item copy (flagged in
menu-utility.ts). If it becomes cumbersome: delist from the shelf,
leave the sweep running until the last sold watch completes its week
— sold watches are promises, delisting only stops new ones.
SECOND AMENDMENT, same evening — THE CENSUS, because a product nobody
can find is reliant on being found. scripts/x402-census.mjs (npm run
census, keeper's machine, same CDP keys as bazaar-check): probes
every host on the discovery list ONCE through the public preflight —
dogfooding, and it makes the whole census reproducible by any skeptic
with the same free endpoint. The consent line is drawn in the script
header before the first probe: a declared x402 resource invites
exactly one shape of GET; what publishes is AGGREGATE ONLY (counts,
failure modes, method line, dated); per-host rows land gitignored for
the keeper's eyes, because outreach to a failing operator is help and
publishing their name is a verdict nobody asked us for. This is the
demand bootstrap for preflight and standing_watch: our own
first-party version of the quoted "57% dead listings" number, with
our name and our reproduction path on it, plus a private list of
exactly the operators who need the products. Publishing the aggregate
writeup and any outreach: keeper hands, rule 30, always.

---

## L1-landscape research (Kite / Tempo / Skyfire), vetted 2026-08-03 — RULED

The strongest-verified report of the three, and both load-bearing
findings point at where we already stand: the only audited-quality
number in the sector is the x402 Foundation's ~75M payments/~$24M in
one month under the generic `exact` scheme, while Kite's headline
metrics are testnet-era and Tempo's self-reported $3B run-rate sits
beside independently measured ~2.5 TPS and a 77% new-wallet collapse.
Our stack — x402 exact, USDC, Base, CDP Bazaar — is on the verified
side of every ledger in the report. No repositioning.

RULINGS:
- Kite typeform (keeper's hand, submitted): correct and correctly
  sized — free listing, zero code; their ksearch filters x402_http +
  USDC, which we serve as-is. NO gokite-aa scheme support gets built:
  proprietary identifier, no verified mainnet volume, no buyer has
  asked. Reconsider only if their catalog sends a paying customer.
- Stripe account: parked deliberately; a free option, not a plan.
- MPP: RE-RULED same day on the keeper's correction, which stands
  and is the better lens: "no buyer has asked" was measured by an
  instrument structurally deaf to it — a buyer on a rail we don't
  support filters us out at the directory layer and never reaches
  the counter, so the decline desk records a zero that means CANNOT
  SEE, not IS NOT THERE (the Bazaar-referrer error class, again, in
  a strategy decision this time). In a nascent market the decision
  rule for a new rail is DOOR-COST VERSUS OPTION VALUE, not observed
  demand: a door that costs a day to a week with no ongoing
  obligation gets opened; only ongoing-obligation doors wait for
  data. What survives of the deferral is sizing, not demand-gating:
  CV's MPP writeup is the sizing input (what a second challenge
  flow, credential path and receipt semantics actually cost against
  our x402-shaped differentiators), and x402-exact-on-Solana should
  be sized in the same pass — likely a CHEAPER door serving the
  dual-rail pattern already visible across the census (Base+Solana
  is the commonest pairing in the seeds by far, more common than
  MPP). Doors get a cost inventory; cheap ones open.
- BUILT from the report, same day: the preflight's
  `nonstandard-scheme` advisory — an accepts scheme other than
  "exact" is named to the caller before payment, not after (advisory,
  never a failure; their own ecosystem's clients may be fine). The
  ward round records advisories weekly, so the store now collects its
  OWN time series on scheme fragmentation — the exact instrument the
  deferred MPP/Kite decisions should be read against, first-party,
  instead of anyone's press release.
- One skepticism filed against a widely-quoted number: AWS docs'
  "10,000+ paid MCP tools" on the Bazaar sits next to our own census
  finding 100 listed resources across 35 distinct active hosts. The
  10k figure likely counts tools/endpoints or is stale marketing;
  our first-party number is the one we cite.
- verifier/PUBLISH.md deleted post-publish (keeper's call): an
  internal key-handling process doc in a public repo serves no
  reader; the publish record and versioning policy live in TASKS.md.

---

## CV's ladder review, 2026-08-03 — three strategic rulings recorded

TRUST-SCORE RUNG: REFUSED, and CV argued the refusal before anyone
proposed the rung. An aggregate "has this endpoint passed N checks
over time" score is reputation, and the store's settled line is
attestation-not-reputation (2026-07-30: reputation compounds and
depreciates like credit; a signed observation just IS). Every rung
stays a discrete dated fact; third parties aggregate if they want.
Same discipline that kept made_by from becoming a trust score.

THE CENSUS AS A STANDING PUBLIC INSTRUMENT: accepted as the real
in-bounds expansion. The ward round already collects the data weekly;
publishing the TREND (discovery-vs-volume disconnect widening or
closing, scheme drift) monthly is the differentiated public good
nobody else is producing. Publishing cadence and venue: keeper's
hand, rule 30, always.

THE 85% HOST HAS A NAME: BlockRun (blockrun.ai) — already in the
seeds, census verdict ready, no signed offers. CV's read is right
that this is the single highest-leverage relationship in the census:
if the host carrying ~85% of ecosystem volume adopted signed offers,
the extension tips from "one store's practice" to "the standard the
volume leader uses." Outreach shape: same as causeclaw — diagnosis
and free tools, no pitch. Keeper's hands.
