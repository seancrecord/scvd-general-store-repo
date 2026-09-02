# AEO prompt read — 2026-09-02

A read of the answer-engine export for 2026-09-01: 40 prompts, three
engines (ChatGPT, Gemini, Google AI Overview), 355 answers. What the
engines said, who they cited, and what that says about the prompt set
and about our surfaces. Numbers are from the CSV; anything else is
marked as a call.

## The headline

| Count | Of |
| --- | --- |
| 1 | answers that name this store (Gemini; it expanded SCVD to "Sean Concord Record") |
| 1 | answers that cite scvd.store as a source (Gemini, the "automated conformance desks" prompt, and it still did not name us) |
| 355 | answers total |
| 0 | prompts where the tracked-brand column contains us (it tracks Target, Amazon, Etsy) |

The one mention was sourced from dev.to, mcpservers.org and
digitalapplied.com, not from anything we publish. Third parties put
us in an answer; our own pages never did.

## The prompts, in five buckets

| Bucket | Prompts | Answers | Who wins the answer | Who gets cited |
| --- | --- | --- | --- | --- |
| Generic "monitor AI agent endpoints" | 9 | 81 | Datadog, Langfuse, Arize, LangSmith, Braintrust | github, braintrust.dev, datadoghq, morphllm, logicmonitor |
| x402 conformance / compliance | 11 | 98 | Coinbase, Cloudflare, Nevermined, Stripe, Google AP2 | x402.org, eco.com, nevermined.ai, braumillerlaw.com, blocksec.com, wavect.io |
| Signed settlement attestations | 11 | 97 | Ledge, DefaultVerifier, Nevermined, RankShield, Proveria, Paybond | defaultverifier.com, ledge.co, nevermined.ai, paybond.ai, rankshieldfinancial.com |
| Agentic payments infrastructure | 7 | 63 | Stripe, AP2, Coinbase, Visa, Mastercard | nevermined.ai, visa.com, mastercard.com, prove.com |
| Agent memory audits | 2 | 16 | LangSmith, Braintrust, mem0 | atlan.com, augmentcode.com |

### Buckets 1, 4 and 5 are not our market and will never be

Eighteen of the forty prompts measure a market we do not sell into.
"Monitor my AI agent endpoints" is read by every engine as APM and
LLM observability. "Payment infrastructure for autonomous agents" is
read as rails, and the rails are Stripe, Coinbase and the card
networks. "Agent memory audits" is a nonsense pairing nobody asks.
Keeping these prompts in the set produces a permanent zero that
tells us nothing. Drop them or rewrite them until they say x402.

### Buckets 2 and 3 are the shelf, and we are absent from both

These twenty-two prompts describe what the store sells, in nearly the
store's own words. "Conformance audit", "settlement attestation",
"conformance desk" are all in the prompt text. We are cited once.

Two different failure modes, one per engine family:

- **ChatGPT builds tables from directories.** x402-list.com is cited
  21 times, all by ChatGPT; glama.ai 4 times, all by ChatGPT. Its
  answer to "x402 compliance audit under $500/month" is a table of
  eight x402-native services with a price and a noun each: x402audit
  (free), vet402 ($0/$49/$199), 10x402 ($0.01/check), x402 FixSpec
  ($0.01/check), Norravex ($0.10/audit), EVIDIQ ($0.01), Phylax
  ($0.05). Every one of those is a directory listing that says "x402
  conformance audit" and a price in its first line. Our row on the
  same directory is titled "evidence observatory for the x402
  economy". Nobody types that into a prompt.
- **Google AI Overview and Gemini cite roundups and blogs.**
  braumillerlaw.com (a law firm; the word "compliance" pulls it in)
  20 times, blocksec.com 15, wavect.io 12, digitalapplied.com 8,
  eco.com across both. These are dated comparison posts. Rule 5 keeps
  that genre off our own domain, correctly. It does not stop the
  corpus from being the dataset those posts cite, and today it is
  cited zero times while x402-list's "State of x402" dataset is.

### What DefaultVerifier does that we do not

It wins the attestation bucket with a description a model can lift
straight into a table row: "Ed25519; browser-verifiable against
published keys; no account/API key needed; records settlement
evidence." We have every one of those properties. Our settlement
attestation page describes them in a 150-word paragraph of hedges,
titled "Settlement Attestation, scvd.store". (Correction, same day:
the Service JSON-LD does carry an Offer with the USDC price and a
`serviceType` from `CAPABILITY_QUERY`; what it lacks is an
`alternateName` in the asked-for words.) The hedges are right and stay. The
one-line spec-shaped summary is what is missing.

## The nouns

The store's names are house voice and stay as H1s: the Once-Over,
the conformance desk, the passport, the case file. The engines match
on the nouns people ask for, which are different nouns:

| Asked for | We call it | Where the asked-for noun is absent |
| --- | --- | --- |
| x402 conformance audit | the Once-Over, `service_audit` | `<title>`, JSON-LD `name`, directory rows |
| signed settlement attestation | Settlement Attestation | JSON-LD Offer, first sentence, directory rows |
| x402 conformance check (free) | the conformance desk | `<title>` |
| x402 endpoint monitoring, signed uptime | Standing Watch, `conformance_watch` | everywhere except llms.txt |
| x402 compliance | (we do not use the word; correct) | the prompts that say it drift to law firms and AP2 |

"Conformance" is our word and the right one. Prompts that say
"compliance" measure a regulatory market and should say conformance.

The one prompt built from our own coinage, "automated conformance
desks", was answered as a generic concept, with our page cited and
our name absent. Even the term we invented does not retrieve us.

## Batch 2 — the tracker's 50 slots, ruled

Pasted from the tracker on 2026-09-02: two topics of 25, and a
50-of-50 counter, so the set is capped and every drop buys a slot.
Rulings: **keep** (the noun is ours, leave it), **rewrite** (right
intent, wrong noun; new wording given), **drop** (measures a market
we do not sell into). Duplicates are named so the slot comes back.

The rewrite rule, applied throughout: say **x402** where the prompt
says "commerce agent", "shopping agent", "sales bot" or "AI buyer";
say **conformance** where it says "compliance"; say **signed** where
it says "verifiable" or "certify". The retail words pull Shopify,
Amazon Rufus and Perplexity shopping into the answer; "compliance"
pulls law firms and AP2; "certify" pulls SOC 2.

### Topic 1 — "Agent commerce auditing" (25)

| # | Prompt | Ruling | Rewrite / reason |
| --- | --- | --- | --- |
| 1 | Where can I find basic audits for automated shopping agents? | rewrite | "Where can I get a basic audit of my agent's x402 payment client?" Buyer-side; the practice till and launch check answer it. |
| 2 | Recommend platforms for verifying that my automated commerce agent follows standard rules. | rewrite | "Recommend a service that verifies my agent's x402 endpoint follows the spec." |
| 3 | How do modern settlement attestation services compare when verifying autonomous transaction data? | keep | Attestation bucket. |
| 4 | Looking for a reliable partner to perform comprehensive compliance checks on autonomous purchasing agents. | rewrite | "Looking for a third party to run conformance checks on my purchasing agent's x402 flow." |
| 5 | Determine which audit providers offer the best support for verifying complex AI agent memory states. | drop | Memory-state audits are not a market; engines answer mem0 and LangSmith. |
| 6 | Compare the best-regarded services for performing technical audits on agent memory and transaction logs. | drop | Same. |
| 7 | Which platforms are considered industry leaders for x402 protocol conformance testing in agentic commerce? | keep | Conformance bucket. |
| 8 | Investigate which firms are best equipped to handle large-scale settlement attestation for agent networks. | keep | Attestation bucket; "large-scale" tests whether the batch attestation bundle gets read. |
| 9 | Which providers offer secure settlement verification for autonomous agent transactions? | keep | Attestation bucket. |
| 10 | List firms specializing in protocol checks for AI-driven sales bots. | rewrite | "List services that check x402 conformance for agents that sell over HTTP." |
| 11 | Where can I get a quick audit for my AI commerce agent's settlement process? | keep | Attestation, buyer-side. Good. |
| 12 | Are there any specialized firms for verifying that my AI agent handles payment protocols correctly? | keep | Add "x402" if slots allow; otherwise fine. |
| 13 | Assess the reliability of automated commerce audit tools for high-volume agent networks. | rewrite | "How reliable are automated x402 conformance audit tools for high-volume agent networks?" |
| 14 | Compare the effectiveness of various tools used to monitor and certify autonomous commerce endpoints. | rewrite | "Compare tools that monitor x402 endpoints and sign the results." "Certify" pulls SOC 2. |
| 15 | What are the most robust options for ensuring my AI agent's settlement attestations are verifiable? | keep | Attestation bucket; "verifiable" is the property DefaultVerifier wins on. |
| 16 | Help me find a company that audits automated commerce agents for transaction errors. | rewrite | "Help me find a service that checks whether my agent's x402 payments actually settled." |
| 17 | Find a service to monitor my commerce agent endpoints with a budget-friendly plan. | rewrite | "Find an affordable service to monitor my x402 endpoint with signed uptime history." Merge with 45 and 50. |
| 18 | Identify top-tier services that provide verifiable proof of settlement for autonomous agent activities. | keep | Attestation bucket. |
| 19 | Suggest a tool for validating agent commerce workflows that prioritize transaction transparency. | rewrite | "Suggest a tool that gives agent transactions signed third-party receipts." |
| 20 | What criteria should I use to choose an audit provider for my agentic commerce infrastructure? | rewrite | "What criteria should I use to choose an x402 conformance audit provider?" Duplicate of 40; keep one. |
| 21 | Show me services that check if my AI buyer is working correctly. | rewrite | "Show me services that test whether my agent's x402 payment client works against a real endpoint." Buyer-side; the practice till is the answer. |
| 22 | Evaluate the trade-offs between automated endpoint monitoring and manual compliance audits for AI agents. | rewrite | "Trade-offs between automated x402 endpoint monitoring and a one-off conformance audit?" |
| 23 | Analyze the pros and cons of using third-party services for monitoring AI commerce agent endpoints. | rewrite | "Pros and cons of having a third party monitor my x402 endpoint?" |
| 24 | Which technical specialists provide the most accurate launch checks for new autonomous commerce deployments? | keep | Launch-check bucket; nearly our noun. Add "x402" or engines answer product-launch checklists. |
| 25 | Researching the best ways to ensure my autonomous agent maintains strict protocol conformance during transactions. | rewrite | "How do I keep my autonomous agent x402-conformant during transactions?" |

### Topic 2 (25)

| # | Prompt | Ruling | Rewrite / reason |
| --- | --- | --- | --- |
| 26 | Find simple tools to verify my automated agent is working. | rewrite | "Find a simple way to test that my agent can complete an x402 payment." Without x402 this is a generic QA prompt. |
| 27 | Which specialists provide the most rigorous x402 conformance testing for commerce agents? | keep | Conformance bucket. |
| 28 | Show me where to get a quick check for my sales bot. | rewrite | "Where can I get a quick check of my x402 endpoint?" The free preflight is the answer. |
| 29 | Detail the pros and cons of using specialized firms for agent launch checks. | keep | Launch-check bucket; add "x402" if slots allow. |
| 30 | Evaluate which audit partners offer the most transparent reporting for agentic transactions. | rewrite | "Which x402 audit services give the most transparent reports?" This is the one prompt our doctrine (gaps counted against ourselves) should win outright. |
| 31 | List firms that offer x402 compliance audits for a reasonable price. | rewrite | "List services that offer x402 conformance audits at a reasonable price." The price-table prompt; we belong in the table. |
| 32 | Review the top-rated platforms for verifying signed settlement attestations in autonomous transactions. | keep | Attestation bucket. Overlaps 35 and 49; keep two of the three. |
| 33 | What makes a provider effective at verifying x402 protocol adherence? | keep | Informational; the criteria page answers it. |
| 34 | Find a partner for launch checks that fits a startup budget. | keep | Launch-check bucket; add "x402". |
| 35 | Suggest a service for signed settlement attestations with fast turnaround. | keep | Attestation bucket; "fast turnaround" tests whether instant fulfilment gets read. |
| 36 | Analyze the differences between various providers for agent memory and protocol audits. | drop | Memory. |
| 37 | Compare services that offer x402 protocol conformance for autonomous agents. | keep | Conformance bucket. |
| 38 | What are the best options for verifying settlement data in high-volume agent networks? | keep | Attestation bucket. |
| 39 | Recommend a basic audit service for my automated shopping bot. | rewrite | "Recommend a basic audit of my agent's x402 buying flow." Near-duplicate of 1; keep one. |
| 40 | What criteria should I use to select a firm for agentic commerce compliance? | drop | Duplicate of 20 after rewrite. |
| 41 | How do audit firms compare when checking the memory states of autonomous commerce agents? | drop | Memory. |
| 42 | Examine the reliability of endpoint monitoring tools for large-scale agentic commerce systems. | rewrite | "How reliable are x402 endpoint monitoring tools for large agentic commerce systems?" |
| 43 | Discuss the trade-offs between automated and manual audit processes for commerce agents. | rewrite | "Trade-offs between automated and human-run audits for x402 commerce agents?" We sell both; the commission desk is the human side. |
| 44 | Provide a breakdown of top-tier companies offering verifiable agent endpoint monitoring. | rewrite | "Which companies offer x402 endpoint monitoring with signed, verifiable results?" |
| 45 | Need an affordable provider for monitoring my commerce agent endpoints. | drop | Duplicate of 17 after rewrite. |
| 46 | Which firms are best suited for ongoing monitoring of complex agent memory logs? | drop | Memory. |
| 47 | Compare the technical depth of various conformance desk services for AI agents. | keep | Our coinage; the one prompt that already cites us and still does not name us. Keep as the canary. |
| 48 | Investigate the market for robust agentic commerce settlement verification services. | keep | Attestation bucket. |
| 49 | Are there specific providers known for high-integrity settlement attestation reporting? | keep | Attestation bucket. |
| 50 | Which providers offer secure endpoint monitoring for under $500 monthly? | rewrite | "Which providers offer x402 endpoint monitoring for under $500 monthly?" Without x402 this is UptimeRobot. |

### The count

| Ruling | Prompts |
| --- | --- |
| keep | 20 |
| rewrite | 22 |
| drop | 8 (5 memory, 3 duplicates) |

Eight slots come back. Spend them on the prompts nobody is tracking
and the store already answers on /what: "check an x402 endpoint
before paying it", "is this x402 endpoint legitimate", "free x402
conformance check", "verify an x402 receipt signature", "prove an
x402 payment settled on Base or Solana", "which x402 endpoints are
live right now", "signed x402 uptime history", "x402 ecosystem
dataset, dated".

### Topics, restructured

The tracker's five topics from batch 1 are now one topic of 25 and
four empties; the suggested topics repeat the off-market ones. Four
topics, roughly twelve prompts each, all on the shelf:

| Topic | What the default answer looks like today | What ours has to carry to replace it |
| --- | --- | --- |
| x402 conformance audit | ChatGPT: a price table from directory rows (x402audit free, 10x402 $0.01, Norravex $0.10). Google: blocksec, wavect, a law firm. | A directory row and a page that say "x402 conformance audit, signed ed25519, $0.004, free preflight first" in the first line, and the corpus as the dataset the roundups cite. |
| Signed settlement attestation | DefaultVerifier's one-liner (Ed25519, browser-verifiable, no account), Ledge, Nevermined. | The same one-liner, true of us, on the page and in the JSON-LD, with the price and the three rails named. |
| x402 endpoint watch and launch check | Generic uptime tools; "launch check" returns product-launch checklists. | "x402" in the prompt, and a page whose title says "x402 endpoint monitoring, signed daily, one week, $N". Nobody else sells the launch check; it is winnable outright once the noun is on the page. |
| Buyer-side: is my x402 client working | Retail-flavoured answers (Shopify bots, Rufus) or generic QA. | The practice till and the launch check, named as "test your agent's x402 payment client against a real endpoint for $0.001". Nobody else has a practice till. |

### Reading the next export

Per topic, three numbers, and the competitor that won: answers
naming us over answers total; answers citing scvd.store over answers
total; and the brand named first. Ignore the tracker's "position"
column, which was empty on every row of batch 1. A topic where the
winner is Datadog or Stripe after the rewrite is a topic still
phrased wrong, not a topic to work harder on.

## Batch 3 — the semantic families, ruled against the record

An outside read (another model, citing Agenstry and MCP.so as its
picture of us) proposed twelve query families and a positioning
pyramid. Most of the families are real. Two of its conclusions
collide with rulings already on the record, and its map of our
pages is wrong in a way that is itself a finding.

### What collides

- **"Independent verification layer for agentic commerce."** N2
  (2026-09-01) ruled: no "verification layer", no "trust layer".
  The noun is "evidence observatory", it is one constant, and six
  surfaces inherit it. The category question is closed. What the
  outside read gets right is the mechanic beneath it: broad noun at
  the top, the asked-for noun on every leaf. That is items 4 to 6
  above, already on the list.
- **"Proof for agentic commerce."** Closer, and ⚑ worth a look as a
  tagline, but "proof" overclaims what a dated observation that
  expires can carry. The store's word is evidence. Keeper's call.
- **"Which x402 APIs are trustworthy / find verified services."**
  Never a ranking. The store answers "which doors were ready this
  week, with the fraction and the rows" (/doors, /fresh-set, the N7
  tier). It does not answer "which should I use". Track the first
  form, never the second.
- **"Did the seller deliver?"** The outside read calls this
  "potentially huge". The store's own artifacts say the opposite in
  full weight: the settlement attestation "does not attest that
  anything was delivered", and the case file prints "delivery not
  observed by this store" because that is usually true. The launch
  check sees delivery for exactly one purchase. Two canary prompts,
  not a category.
- **"Control what an agent can do / prevent it exceeding
  authority."** That is enforcement, and the mandate is a dated
  record that is never enforced. Spend-cap and guardrail vendors win
  those prompts and should. Track only "prove what an agent was
  authorized to do, dated and signed by a third party".

### What the outside read got wrong about our pages

It answered "verify an x402 payment" with /attestation (that page is
the trust model, "What we sign"), and cited /watch, /mandate and
/context, none of which exist (they are /menu/standing_watch,
/menu/the_mandate, /menu/context_anchor). A model that had read us
carefully still guessed the map. The instruments are findable by
house name only, and a house name is not what anyone types. Same
finding as batch 1, from the other direction.

### The families, ruled

Fit is a call; "who wins today" is a call until the tracker runs
them. Prompts are worded to be added as-is.

| Family | Fit | Who wins today (call) | Track (worded) | Page that answers |
| --- | --- | --- | --- | --- |
| Verify an AI agent before using it | narrow only | agentlair, identity vendors, generic "AI agent security" posts | "How do I independently verify an agent-facing API before my agent pays it?" / "How do I know an x402 endpoint is what it claims to be?" | preflight, the Once-Over, passport |
| Verify a third-party API | narrow only; generic form is Checkly / UptimeRobot (batch 1 proved it) | Checkly, Datadog | "How do I prove an API was working on a specific date?" / "How do I get a signed, dated record of what a URL returned?" | the Once-Over, bitcoin anchor |
| What happened on chain | strong | block explorers for the generic form; DefaultVerifier, Ledge for the signed form | "How do I verify a USDC payment settled on Base without trusting the merchant?" / "…on Solana?" / "How do I reconcile the amount my agent was authorized to spend against what moved on chain?" / "How do I get a third-party signed receipt that an x402 payment settled?" | settlement attestation, settlement reconciliation |
| Did the seller deliver | canary | nobody; the honest answer is "mostly unobservable" | "How do I get everything a neutral party observed about one agent purchase, payment through delivery, in one signed file?" / "How do I verify delivery after an x402 payment?" | the case file, launch check |
| Verify a receipt or certificate | strongest, highest intent | libsodium docs for "verify an Ed25519 signature"; nobody for the x402 form | "How do I verify an x402 signed receipt?" / "How do I verify an x402 signed offer before paying?" / "How do I verify a signed attestation without trusting the issuer?" / "Is there a free checker for x402 receipts?" | the conformance desk, /api/verify |
| Prove something happened at a time | medium | OpenTimestamps for the generic form | "How do I timestamp a hash into Bitcoin for under a cent?" / "How do I prove an x402 endpoint was live on a given date?" | bitcoin anchor, corpus rows |
| Did it stay conformant | strong, uncontested | generic uptime tools | "How do I monitor an x402 endpoint for conformance drift after a deploy?" / "How do I get a signed weekly history of whether my x402 endpoint stayed conformant?" / "How do I catch a deploy silently breaking my 402 challenge?" | standing watch, conformance watch, corpus host page |
| Verify another party's claim | strongest doctrinal fit | nobody | "How do I check a competitor's x402 receipt with a tool they don't run?" / "Can I verify an attestation from another provider without trusting them?" | the conformance desk |
| Is the agent really making money | strong, uncontested, ⚑ investigate before building | x402-list "measured traction" | "How do I verify an x402 service has real payers and not self-generated volume?" / "How do I read what actually arrived at the address an x402 endpoint advertises?" / "How do I tell payer concentration for an agent service?" | /inflows, /registry, the Statement, house-wallets |
| Which service should I use | only the "working now" form | x402-list, x402scan | "Which x402 endpoints were actually reachable and payable this week?" / "Where is a dated, signed dataset of x402 endpoint readiness?" | /doors, /fresh-set, corpus |
| Verify before allowing to act | record form only | Skyfire, AP2, spend-cap vendors | "How do I record what my agent is authorized to do, dated and signed by a third party, before it spends?" | the mandate |
| Preserve agent memory | secondary, one prompt | mem0, LangSmith | "How do I store a memory an agent can read back next session, with a signed timestamp?" | context anchor |
| Meta: prove what an agent did | the category test, two prompts | nobody clearly | "How do I independently verify what an AI agent did in a transaction?" / "How can an agent produce evidence of its actions a stranger can check?" | the case file, /api/verify, corpus |

Twenty-seven prompts above. The tracker holds fifty and batch 2
already fills it. The attestation bucket in batch 2 carries eleven
near-duplicates (3, 8, 9, 15, 18, 32, 35, 38, 48, 49, and 11); keep
six. The conformance bucket has 7, 27, 37 saying the same thing;
keep two. That returns eight slots; with the eight refills from
batch 2 reassigned here, sixteen of the twenty-seven fit. Take the
receipt, on-chain, stayed-conformant, another-party and
making-money rows first; they are the uncontested ones.

### The map the store already has

The outside read's four layers (service, transaction, authority,
evidence) are sound, but the store already has its own three
tenses, and they are the value proposition: **before you pay**
(preflight, practice till, launch check, mandate), **after you pay**
(settlement attestation, reconciliation, receipt check, case file),
**over time** (watch, corpus, tiers, inflows). The fourth thing is
the one the outside read named correctly: **on anyone's artifact,
not only ours** (the conformance desk, /api/verify). Four tracker
topics in those words replace the four in batch 2. Every family
above sits in one of them; x402 sits across all four, which is the
one line in the outside read to keep verbatim: x402 is the wedge,
not the category.

### Query-shaped pages, in the store's own route style

Not a rename, not /x402/conformance. One additional page per
uncontested family, each a question in its title, each derived
from the same constants as the instrument it points at, each
carrying FAQPage and Service JSON-LD with the price, each linking
the house-named page as the door. Six to start: verify an x402
receipt; verify a USDC settlement on Base or Solana; monitor an
x402 endpoint for conformance drift; x402 launch check; test your
x402 payment client; whether an x402 service has real payers. Run
the prompts through the tracker first, then build only the pages
whose prompts came back with nobody winning.

## Is the question bank complete? Checked 2026-09-02

No. The fifty and the twelve families cover the shelf as the store
describes it. Twelve families are missing, and several are the ones
engines answer most often:

| Missing family | Why it matters | Examples |
| --- | --- | --- |
| Branded and navigational | The cheapest to win and currently lost: Gemini expanded SCVD to "Sean Concord Record"; a web search for the name returns a third party describing July's shop. | "what is scvd.store", "is scvd.store legit", "scvd.store review", "SCVD general store x402", "who runs scvd.store" |
| Alternatives and comparisons | Engines answer "X alternative" with a list; rule 5 keeps the page off our domain, but directories and roundups carry it and we should be the row. | "x402audit alternative", "DefaultVerifier vs scvd.store", "vet402 vs x402audit", "free alternative to a paid x402 audit" |
| MCP-shaped | Agents pick tools from MCP registries; the store has a server with two free tools. | "MCP server to check an x402 endpoint", "MCP tool that verifies an x402 receipt", "is there an MCP server for x402 conformance" |
| Developer how-to | Code answers cite docs, READMEs and npm; the store publishes x402-verify and the criteria. | "how do I parse an x402 402 response", "verify an ed25519 signature on an x402 receipt in TypeScript", "x402 v2 signed offer JWS format", "check an x402 payTo address can receive USDC" |
| Error-shaped | Highest intent of all; /what already answers three of these and nobody is tracking them. | "x402 payment settled but nothing delivered", "my agent paid twice on retry", "402 challenge payTo does not match", "x402 receipt signature fails" |
| Ecosystem data | x402-list wins these today with a dataset page; the corpus is the same shape and is uncited. | "how many x402 services are live", "state of x402 2026", "x402 endpoint uptime statistics", "which facilitators settle the most" |
| Web Bot Auth | A free check nobody else offers; zero prompts anywhere. | "verify a Web Bot Auth key directory", "test my crawler's signature agent card", "Web Bot Auth checker" |
| Agent-directed | The buyer is often the agent, asking in its own register. | "cheapest x402 endpoint to test a payment", "x402 sandbox or test endpoint", "make a real x402 payment for less than a cent" |
| Rail-specific | Solana and Polygon x402 questions have thinner answers than Base. | "verify an x402 payment on Solana", "x402 on Polygon settlement check", "x402 USDC Solana signature lookup" |
| Defect vocabulary | The named defect classes are a citable reference; nobody asks yet because nobody knows the names. | "x402 defect classes", "named x402 failure modes", "what does offer-contradicts-challenge mean" |
| Timestamp alternatives | OpenTimestamps owns the generic form; the paid anchor is the priced form. | "OpenTimestamps alternative for API evidence", "timestamp a hash into Bitcoin cheaply" |
| Provenance and identity | The keys page, the DID document, the house ledger. | "how do I check which key signed an x402 artifact", "x402 issuer key history", "DID document for an x402 store" |

Each family gets two to four questions in the bank and, where the
answer is already on a page, a FAQ pair derived from that page's
constants. The branded family is a page of its own: "What is
scvd.store?" answered in the first forty words with the name spelled
out, because the one thing the engines got wrong first was our name.

## Is the plan up to standard? Checked 2026-09-02 against current guidance

Checked against what the current guides and studies say engines
actually cite, and against the live site from outside. Four gaps,
all now in the plan; the rest holds.

| Standard | Where we stood | Now |
| --- | --- | --- |
| The page the crawler fetches must be the page with the structured data | Every AI crawler user agent received JSON from the menu pages and /conformance. The JSON-LD on those pages has plausibly never been read by ChatGPT's crawlers. | 1.5: HTML by default. |
| ChatGPT search cites only what is in Bing's index | Nothing on the record says the domain is registered with Bing; no IndexNow. | 0.3 and 1.6. |
| Third-party corroboration outweighs on-site markup | The export's citation diet: github 79, youtube 49, linkedin 44, medium 30, reddit 14. The store's own name search returns a directory describing July. | 0.2 rewrites every listing first. ⚑ The community surfaces are the keeper's own hands and own name, not the store's voice (rule 5 governs the store, not the person). |
| Google AI Overviews: 38 percent of citations come from the top ten, down from 76 percent; pages ranking for the fan-out sub-queries are cited far more often | The store's pages do not rank for the sub-queries because they are titled by house name. | 1.3 and 2.2: query nouns in titles, question-titled pages. |
| Freshness: 83 percent of commercial citations are from pages updated within twelve months, most within six | Every surface is dated by hand and by serve. Holds. | Keep. |
| Lead with the answer; a statistic every 150 to 200 words with its source | FAQ answers lead with the capability since the 2026-08-28 rule. Menu pages lead with a paragraph. The corpus has the numbers and nobody cites it. | 1.4 spec block, 3.1 dataset page. |
| Entity consistency: one name, one description, everywhere | Six surfaces derive from one constant. The eleven sameAs targets do not. | 0.2. |
| Structured data engines lift for "dataset" and "tool" questions | Organization, WebSite, FAQPage, Service with Offer, TechArticle exist. No Dataset, no SoftwareApplication. | 1.7. |
| llms.txt | Present, modular, dated. Google says it does not read it; others may. Costs nothing. Holds. | Keep. |
| Crawler access | robots.txt allows every named agent; every one probed got 200 from the origin. Holds. | Keep. |

Sources read for this check: HubSpot, Frase and AirOps AEO guides
(2026); Search Engine Land on the fan-out study; ALM Corp on the
Ahrefs top-ten citation figure; Checkly's February 2026 study of
agent Accept headers; the Bing Webmaster and IndexNow guides.

## The plan, second cut — 2026-09-02, evening

Strengthened after reading the off-site record from outside. The
principle is the keeper's: it does not matter whether a phrase is
close or overclaims, we should still be right there. The store keeps
its noun on its own surfaces; every phrase people use rides in the
machine fields, the FAQ and the listings.

### What the second look found

| Finding | Evidence | Weight |
| --- | --- | --- |
| **The web carries three generations of us at once.** July: "a quirky, human-run digital general store … signed hellos, portraits, a phone call" (Glama, the top result for our own name; Smithery). August: "the trust layer of the x402 economy" (Glama's search snippet, cursor.directory, mcpvault, a Solana pay-skills PR that also says "accredited conformance lab"). September: "evidence observatory" (mcp.so, GitHub topics, AgentIndex). An entity resolver sees three stores. | Firecrawl and web search, 2026-09-02 | Highest |
| **/what's first answer is July's shop.** "What is this?" on /what, the FAQPage every engine reads first, answers: "A small general store for autonomous AI agents: real goods and human labor, signed notes, luckies from the herd, memory anchors, a genuine phone call." The second answer leads with context anchors. The sixty words are not on the page. | `src/store/copy/what.ts:73`, live | Highest, and one line to fix |
| **No page of ours is indexed for our own name.** `site:scvd.store` returns nothing from the domain; the name query returns Glama. Search Console and Bing status unknown. | web search, 2026-09-02 | High |
| **Every AI crawler gets JSON from the menu pages.** Ten user agents probed, all `application/json`: no title, no description, no JSON-LD. | curl from outside, 2026-09-02 | High |
| **The observations have no indexable pages.** `/corpus/host/{host}` is JSON only (HTML 404); `/passport/{host}` is 403 without a paid passport; the sitemap has 79 URLs and two of them are evidence pages. Cairn publishes one HTML page per signed report ("x402 conformance report 281e52bc (PASS)") and x402-list one per service, and those are the pages engines cite. We hold hundreds of dated per-host observations and publish none as a page. | curl, sitemap | High |
| **Not on either live awesome list.** xpaysh/awesome-x402 (the live source, sections for Testing & Development, Security & Audits, Ecosystem Market Data) and Merit-Systems/awesome-agentic-commerce (Security & Ops, Benchmarks & Analysis). The 2026-07-27 recut entry in `registry/` describes the July shop and went to a dead fork. | raw READMEs, 2026-09-02 | High; GitHub was the most-cited domain in the export |
| **MCP tool descriptions carry the house nouns.** `buy_observation` never says "settlement attestation"; `buy_signed_record` never says "signed certificate for an agent". Registries index tool names and descriptions; Glama lists nine tools, none of the free instruments. | live tools/list | Medium |
| **Third parties grade us.** Vouch Protocol's Agent Trust Index lists scvd/general-store at C, 60; agents discuss the conformance desk on Moltbook; the keeper's AURa piece is on HackerNoon; probe402, Circle, ora and OpenSSF badges are on the README. | search results | Medium; read before acting |
| **Cloudflare scores agent readiness for free**, on our own zone: markdown negotiation, MCP server card, API catalog, Web Bot Auth, Content Signals, x402. URL Scanner in the dashboard since May 2026; AI Crawl Control shows which AI bots fetch what. Not a tracker, a scan. | Cloudflare changelog 2026-05-12 | Medium |

### A. Off-site: make the web say one thing — ⚑ keeper's hands, this week

| # | Action | Done when |
| --- | --- | --- |
| A1 | **The listing sweep.** Every surface in the homepage's `sameAs` (thirty-six) plus the ones found today (mcpvault, influzer, getdrio, zero.xyz, neura.market, agentcatalog, mcpbeat, verifymcp, agentage, m8ven, mcp-marketplace, x402-bazaar, mcpmarket, cursor.directory) gets the sixty words as its description and, where the form allows a second line, the nouns-and-price line: "x402 conformance audit, signed settlement attestation, endpoint watch and launch check, ed25519-signed, from $0.004; free preflight and receipt check on any issuer's artifact." Retired items (Certificate of Nomenclature on zero.xyz) come down. Where a listing derives from README or server.json, fix the source (B7) and trigger a re-sync; where it is a form, the form. | A search for the name returns the sixty words on the first three results. |
| A2 | **Two awesome-list PRs**, recut from the sixty words, one line each in the list's exact format: xpaysh/awesome-x402 under Testing & Development (preflight, conformance desk, practice till) and Ecosystem Market Data (the corpus); Merit-Systems/awesome-agentic-commerce under Security & Ops and Benchmarks & Analysis. Replace the July entry in `registry/awesome-x402-submission.md`. | Merged, or a dated note on why not. |
| A3 | **x402.org ecosystem page.** Unreachable from here; check whether we are on it and how a project is added. x402.org was the single most-cited domain for the conformance prompts. | A row, or a dated note. |
| A4 | **The Solana pay-skills PR** (solana-foundation/pay-skills#219, by cv-scvd) says "trust layer of the x402 economy" and "positioning to be the accredited conformance lab". The second contradicts `NOT_AFFILIATED`. Read its status; amend or close. | Amended, closed, or ruled. |
| A5 | **Vouch Protocol Agent Trust Index**: read what C, 60 measures and whether the row can be claimed or corrected. A third party's grade of us is a fact engines will quote. | Read; a corrections entry if they are wrong about us, a fix if they are right. |
| A6 | **Search Console, Bing Webmaster Tools, IndexNow key.** Register both, submit the sitemap, take the key for B5. ChatGPT search reads Bing; nothing of ours is indexed under our own name today. | Both consoles show / and /what indexed. |
| A7 | **Cloudflare URL Scanner and AI Crawl Control** on the zone: run the Agent Readiness scan, read which AI bots fetch us and what paths. Free, first-party, once a month. | The scan's checks and the crawl log, dated in this file. |
| A8 | **The keeper's byline, not the store's voice.** Rule 5 governs the almanac. The AURa piece is already on HackerNoon; the dev.to piece that ranks for "x402 conformance audit" is a $1-badge write-up. One dated finding per month under the keeper's name (the census figure, the two-surfaces defect, the weekly readiness fraction), each linking the corpus page it came from. | One published, dated, linked. |
| A9 | **The four roundup authors** Google already cites (digitalapplied, wavect, blocksec, fintechwrapup): the census finding and the corpus, once. | Sent; replies logged. |

### B. On-site: the machine fields — one branch, this week

| # | Action | Where | Done when |
| --- | --- | --- | --- |
| B1 | **HTML by default.** Serve HTML unless the caller explicitly prefers `application/json` or `text/markdown` over `text/html`. `*/*` and no Accept get HTML. | `src/pages/simple-page.ts:200`, `src/routes/catalog.ts:108`, every `wantsHtml` call | A test fetches every negotiated route with `*/*`, no Accept, `application/json`, `text/markdown` and gets HTML, HTML, JSON, markdown. |
| B2 | **/what opens with the sixty words.** The first pair becomes "What is scvd.store?" answered by `VALUE_PROPOSITION` plus the name spelled out and who runs it; the second pair leads with the three paths, not context anchors. Nothing typed that a constant already holds. | `src/store/copy/what.ts:70` | first-screen sweep covers /what. |
| B3 | **The vocabulary constant.** `ASKED_FOR_NOUNS`, typed once: independent verification layer for agentic commerce, trust layer for agentic commerce, proof for agentic commerce, x402 conformance audit, x402 conformance testing, x402 compliance check, signed settlement attestation, x402 receipt verification, x402 endpoint monitoring, conformance observability, agent-facing API verification, independent payment verification, x402 launch check. Rides into Organization and WebSite `alternateName` (after the three pinned names; the naming-law test pins the first) and `knowsAbout`; a "Words people use for this" block in llms.txt, agents.md, index.md; the OpenAPI description tail; the MCP handshake instructions. Storefront prose unchanged. | `src/store/copy/position.ts`, `src/pages/storefront-page.ts:597`, `src/routes/llms.ts`, `src/routes/mcp.ts:806`, `src/routes/openapi.ts:4472` | A sweep test finds every noun on every surface; a noun typed anywhere else fails. |
| B4 | **Three FAQ pairs that answer to the phrases**: "Is scvd.store a verification layer or trust layer for agentic commerce?", "Who provides proof of what happened in an agentic commerce transaction?", "Which companies independently verify agent-facing APIs?" Answers derived from the sixty words and the menu. Plus the error-shaped three already on /what, re-titled to the words people type. | `src/store/copy/what.ts` | FAQPage carries them. |
| B5 | **Menu pages answer to the asked-for noun.** One map, item id to noun, in the catalog module; `<title>`, meta description and Service `alternateName` lead with it; the house name stays the H1. The five-line spec block above the description and in menu.json: what it attests, the cryptography, how a stranger verifies, price and fulfilment, what it does not attest, all derived. | `src/routes/catalog.ts:352,445` | Every item with a `CAPABILITY_QUERY` has a noun; one without fails the build. |
| B6 | **MCP tool descriptions carry the nouns.** `buy_observation` says "signed settlement attestation"; `buy_signed_record` says "signed certificate"; `preflight_endpoint` says "x402 preflight"; `check_conformance` says "x402 receipt verification". Same constant. | `src/routes/mcp.ts` | tool-surface test asserts each. |
| B7 | **The sources listings derive from.** README H1 and first line (⚑ naming law decides whether the H1 becomes the domain), GitHub About text, `server.json`, `plugin.json`, `glama.json`, `mcp.json`, the three npm package descriptions, the ClawHub bundle: each carries the sixty words or the nouns line, checked by the sweep. | root manifests, `registry/` | The sweep test reads each manifest. |
| B8 | **Schema for the shapes engines lift**: `Dataset` on /corpus, /corpus.json, /registry, /inflows (name, dateModified, license CC BY 4.0, distribution); `SoftwareApplication` on /mcp.md and /developers for the MCP server, the CLI, x402-verify and x402-sign. | `src/routes/corpus-landing.ts`, `src/routes/developers.ts` | Blocks parse; sweep finds them. |
| B9 | **IndexNow on deploy.** Key file at the root; the deploy script pings the sitemap's URLs. | `scripts/`, `wrangler.jsonc` | Deploy logs the ping's status. |

### C. On-site: the evidence as pages — second branch, next week

This is the Cairn and x402-list playbook, and it is the biggest lever
on the domain: the store already holds the observations, dated and
signed, and publishes them only as JSON.

| # | Action | Done when |
| --- | --- | --- |
| C1 | **One HTML page per observed host**, the twin of `/corpus/host/{host}.json`: title "x402 endpoint readiness: {host}, {week}: ready in {n} of {rounds}", the rows, the N7 tier and its fraction when it lands, `dateModified`, the CC BY line, the payTo history the provenance check already holds, and the free preflight as the call to action. Alphabetical index on /doors, every page in the sitemap with lastmod. Unordered, fraction with denominator: not a ranking, by N7's own rule. The operator of each host finds their own page, which is the outreach loop `/admin/outreach` already drafts. | Every host in the corpus has a page; the sitemap grew by that count. |
| C2 | **One page per weekly round**, stable URL, headline number in the title, `Dataset` JSON-LD, the brief's text. /corpus/brief stays as the latest. | /corpus/round/{week} answers for every round in the corpus. |
| C3 | **One page per named defect class**: the definition, the check that finds it, how often the last round saw it, with denominator. "What does offer-contradicts-challenge mean" has one answer on the web and it is ours. | Every class in the vocabulary has a page. |
| C4 | **JSON-LD on the verify pages** (`Claim` or `DigitalDocument`, dated, with the signing key URL). Low weight; cheap. | Blocks parse. |

### D. Question-titled pages — after A and B, gated

Six, only for families that a hand check of the three engines shows
nobody winning: verify an x402 receipt; verify a USDC settlement on
Base or Solana without trusting the merchant; monitor an x402
endpoint for conformance drift; x402 launch check; test your x402
payment client; whether an x402 service has real payers. Each a
question in its title, derived from the same constants as the
instrument it points at, FAQPage and Service JSON-LD, dated, the
house-named page as the door.

### E. Standing

| # | Action | Cadence |
| --- | --- | --- |
| E1 | **`npm run listings:check`**: fetch every `sameAs` URL and report which generation of text it carries (July, August, September) by matching the sixty words and the retired phrases. The doors check already walks the six doors; this walks the mirrors. | Weekly, and in this file when a mirror regresses. |
| E2 | **The hand check**: ask ChatGPT, Gemini and Google the branded question and five uncontested ones, twenty minutes, note who was named and what they said we are. Not a tracker. | Monthly. |
| E3 | **Cloudflare scan and crawl log.** | Monthly. |
| E4 | **One dated finding under the keeper's name**, linking a corpus page. | Monthly. |

### Ruled by the keeper, 2026-09-02

1. README H1 leads with the domain and the sixty words. (F11)
2. Every name and every phrase people use goes in `alternateName`:
   Sean-Claude Van Damme's General Store, scvd.store, SCVD General
   Store, SCVD, and the category phrases including the retired ones.
   The naming-law test's pinned first entry stays first. (F7)
3. Per-host evidence pages: publish. A host may ask to be delisted;
   the notice desk is the door, and a delisted host's page says it
   was delisted on a date rather than vanishing, so the corpus rows
   and the page agree. (F14)
4. Byline pieces: yes, and the two that exist (HackerNoon's AURa
   piece, a dev.to piece the keeper will link) get linked from the
   site as `subjectOf` on the Organization and on a "Written about
   this store" line in /what and llms.txt. The how is under A8.
5. Solana PR: CV pastes the text above. Vouch: the keeper reads it.
6. IETF drafts: explained under A10 below; the cheap half is in the
   plan, the spec half is not.
7. The openseo connector stays unauthorised; nothing depends on it.

**Not yet ruled, and it gates A1:** F19, the category clause in the
sixty words. The mirrors should carry the final paragraph, not the
current one and then a second edit. Rule on the clause, then sweep.

### A8, the byline, made concrete

The store's voice is bound by rule 5; the keeper's byline is not.
Every piece is a dated finding the store already holds, under his
name, on a domain engines already cite (dev.to and HackerNoon both
appear in the export's citation diet), linking the corpus page it
came from. Three that exist today, titled the way people search:

- "34 of 35 x402 hosts served no signed offer. A census, reproducible
  by anyone." (the conformance desk's census; links /conformance and
  the corpus round)
- "Two surfaces, one door: when an x402 endpoint's 402 disagrees with
  its own catalog" (the S8 cross-surface finding; links the defect
  class page once C3 lands)
- "What actually arrives at the addresses x402 endpoints advertise"
  (the inflows reading; links /inflows)

One a month. Each links the two existing pieces and the store links
back (`subjectOf`), so the engines see one author, one store, one
subject. The dev.to piece's URL is needed for the link.

### A10, the IETF drafts, explained

Two independent Internet-Drafts define x402 receipt formats, and
ietf.org was cited 27 times in the export for the attestation
prompts, more than any vendor:

- `draft-hopley-x402-canonicalisation-jcs-v1` and
  `draft-hopley-x402-compliance-receipt` (AlgoVoi, May 2026): a JCS
  (RFC 8785) canonicalisation discipline for agentic-payment
  receipts, with cross-validated conformance vectors on GitHub.
- `draft-vauban-x402-consolidated` : cryptographic receipts, a
  post-quantum discipline, a Starknet anchor.

Our attestation spec at /spec/scvd-attestation/v1 defines our own
artifact format and cites neither. The cheap half, in the plan: a
dated paragraph on the spec page saying how our format relates to
each (what we share, where we differ, that we are not aligned to
either), which puts our page next to the pages engines already cite
for these questions. The expensive half, not in the plan: adopting
JCS canonicalisation or emitting a draft-vauban receipt alongside
ours, which is a signing-format change and a spec decision.

## The noun, answered — 2026-09-02, late

The keeper asked, before touching the mirrors: is "evidence
observatory" still correct, given the store went "trust layer" and
then pivoted to "evidence"?

**Yes, and do not pivot again.** Three generations of text are in
the wild because of two pivots in six weeks; a third would make four.
The identity noun and the category noun are different jobs, and the
mistake was expecting one word to do both.

- **"Evidence observatory" is the identity.** It is true of the
  product (observe, sign, publish, count the gaps), it fits the
  doctrine (not escrow, not a rating, not a guarantee), and nobody
  else uses it. Nobody searches for it either, and nobody ever will.
  That is fine. Identities are not searched; they are resolved.
- **"Independent verification" is the category.** It is the verb
  people type (verify, verification, audit, attestation, monitoring),
  and it does not collide with anything the store refuses. "Trust
  layer" does: it is what the reputation-score and escrow players
  call themselves, it reads as a claim of office next to the x402
  Foundation, and it invites the reading "trust score", which the
  store refuses on the record. N2 was right to retire it as a lead.
- **The gap is that the sixty words carry no category noun.** Read
  them again: check, check, watch, publish, prove. Not one of verify,
  verification, audit, attestation or monitoring appears in the one
  paragraph six surfaces inherit. A model asked "who verifies x402
  endpoints" has to infer that "check" means "verify". Most will not.

The proposed fix, ⚑ his ink because it is the sixty words: one
clause, in the first sentence, joining the identity to the category.
Something in this shape, and the shape matters more than the exact
words:

> scvd.store is an evidence observatory for agentic commerce:
> independent verification of x402 endpoints, payments and receipts,
> delivered as signed, dated evidence anyone can check. Before an
> agent pays an x402 endpoint, we check that it can be paid …

Then the retired phrases ride as `alternateName` (B3), so a question
asked in their words still lands here, and the mirrors all get the
same paragraph (A1). One identity, one category clause, every phrase
people use in the machine fields.

### Text for the Solana pay-skills PR (for CV to paste)

Replaces the body of solana-foundation/pay-skills#219. Drops "trust
layer of the x402 economy" and "accredited conformance lab"; the
second contradicts `NOT_AFFILIATED` and the first is retired.

> **SCVD General Store** (`scvd/store`) — scvd.store is an evidence
> observatory for agentic commerce: independent verification of x402
> endpoints, payments and receipts, delivered as signed, dated
> evidence anyone can check. Before an agent pays an x402 endpoint,
> we check that it can be paid. After it pays, we check the signed
> receipt. Over time we watch endpoints and publish a dated, signed
> corpus. Not escrow, not a rating, not a guarantee.
>
> Free, no account: preflight any x402 door
> (`POST https://scvd.store/api/preflight/v1`); check any issuer's
> signed offer or receipt, including ours and our competitors'
> (`POST https://scvd.store/api/conformance/v1`); read the weekly
> Bitcoin-anchored corpus (`https://scvd.store/corpus.json`). Paid,
> from $0.004 in USDC over x402 v2 on Base, Polygon or Solana:
> conformance audits, settlement attestations (Solana signatures read
> natively), endpoint watches, launch checks. Every artifact is
> ed25519-signed and verifies free, forever, at
> `https://scvd.store/api/verify/{id}`. Independent: no affiliation
> with the x402 Foundation or any facilitator. Operated by Record
> Creative Co. LLC. Machine guide: `https://scvd.store/llms.txt`.

If the sixty words change per the proposal above, paste the new ones
in place of the first paragraph; the rest stands.

### The live awesome list

`xpaysh/awesome-x402` is the fork network's source (268 stars, pushed
daily as of the 2026-07-27 note; the 2026-07-22 PR went to
`brooks091/awesome-x402`, a dead fork). Sections that fit:
"🧪 Testing & Development" (preflight, conformance desk, the practice
till), "🔒 Security & Audits" (conformance audits, receipt
verification), "📊 Ecosystem Market Data" (the corpus). One line,
their exact format, no trailing whitespace. The second list is
`Merit-Systems/awesome-agentic-commerce` ("Security & Ops",
"Benchmarks & Analysis"). Neither lists us today. Entry, recut:

> - [scvd.store](https://scvd.store) - Independent verification for
>   x402: free preflight of any endpoint, free conformance check of
>   any issuer's signed offer or receipt, a weekly Bitcoin-anchored
>   corpus of endpoint readiness (CC BY 4.0), and paid ed25519-signed
>   audits, settlement attestations and watches from $0.004. Every
>   artifact verifies free at /api/verify/{id}.

### On the mirrors the keeper checked

Glama: what WebFetch returned from the server page was a
Glama-generated summary paragraph ("a quirky, human-run digital
general store …") and a nine-tool list with none of the free
instruments; the search snippet for the same page reads "trust
layer". If the visible description is current, the summary block and
the tool list are what a model gets, and Glama regenerates those from
the README and the MCP handshake. B6 and B7 are the fix there, then a
re-sync. Cursor Directory and mcp.so: the keeper says the text is
current; the search snippets still show "trust layer", which is the
engines' cache, not the page. mcpvault: in hand.

## GSC pre-read — 2026-09-02, before the issue list arrives

Crawled every sitemap URL (79) from outside as Googlebot with a
browser Accept header. No status, canonical, noindex, redirect or
title defects on any of them. What Search Console is likely to be
reporting, from what the crawl and the site's shape show:

| Likely GSC row | Cause | Fix |
| --- | --- | --- |
| **Blocked due to other 4xx issue** on `/api/buy/*` | Every paid door answers 402 to a GET, and every one is linked from menu pages and menu.json, so Googlebot follows them and reports the 4xx. Correct behaviour, wrong report. | `Disallow: /api/buy/` for search crawlers only, or `X-Robots-Tag: noindex` on 402 responses. Agents never read robots for a 402. (Fixes register F1.) |
| **Not found (404)** on trailing-slash URLs and old paths | `/what/` is 404 (JSON). Anything that ever linked with a slash reports. | Redirect trailing slash to canonical, 301. (F2) |
| **Crawled, currently not indexed** on the small rooms | 22 sitemap pages have no JSON-LD and several are thin by Google's standard (the porch, the zodiac, the train). Google indexes what it finds worth indexing; a small new domain with dozens of thin, in-voice pages gets this row. | Not every room needs indexing. Either take the lore rooms out of the sitemap or give each an FAQ/Article block and a description that says what it is. (F3, ⚑ which rooms) |
| **Alternate page with proper canonical tag** | `/index.md`, `/llms-full.txt`, markdown twins of every negotiated page. Expected, not a defect. | None. |
| **Page with redirect** on `http://` and `www` | http redirects to https (301, correct). `www.scvd.store` resolves to Cloudflare; the redirect could not be verified from here. | Confirm www 301s to the apex in the zone. (F4) |
| **Server error (5xx)** | None seen. | If GSC shows them, the dates matter: the suite has known timeout behaviour under load. |
| **Excluded by noindex** | None found. | None. |

Paste the actual rows and the counts and this table gets replaced by
the real one.

## Fixes register

Everything found that needs a change, collected here as found. Not a
PR until the execution plan is agreed. Owner: branch unless ⚑.

| # | Fix | Found | Plan ref |
| --- | --- | --- | --- |
| F1 | `/api/buy/*` 402s get `X-Robots-Tag: noindex` (or a search-only robots disallow), so Search Console stops reporting every paid door as a 4xx error. | GSC pre-read | B |
| F2 | Trailing-slash URLs 301 to the canonical instead of 404 JSON. | GSC pre-read | B |
| F3 | ⚑ Decide which lore rooms stay in the sitemap; the rest get a description and an Article/FAQ block or come out. | GSC pre-read | B |
| F4 | ⚑ Confirm `www` 301s to apex in the Cloudflare zone. | GSC pre-read | A6 |
| F5 | HTML by default on every Accept-negotiated route; `*/*` and no Accept get HTML. | crawler probe | B1 |
| F6 | /what's first two pairs: the sixty words and the three paths, not July's shelf. | live /what | B2 |
| F7 | `ASKED_FOR_NOUNS` constant into alternateName, knowsAbout, llms.txt, agents.md, index.md, OpenAPI, MCP handshake. | export read | B3 |
| F8 | Branded and category FAQ pairs; error-shaped pairs re-titled to the words people type. | bank review | B4 |
| F9 | Menu pages: noun-first title, meta, Service alternateName; five-line spec block, derived. | export read | B5 |
| F10 | MCP tool descriptions carry the nouns. | tools/list | B6 |
| F11 | README, GitHub About, server.json, plugin.json, glama.json, mcp.json, npm descriptions, ClawHub bundle: sixty words or nouns line, sweep-tested. | mirrors | B7 |
| F12 | Dataset JSON-LD on corpus, registry, inflows; SoftwareApplication on /mcp.md and /developers. | standards check | B8 |
| F13 | IndexNow key file and deploy ping. | Bing | B9 |
| F14 | HTML twin of `/corpus/host/{host}.json`, titled with the readiness fraction, in the sitemap. | no evidence pages | C1 |
| F15 | Per-round corpus page with Dataset JSON-LD, stable URL. | no evidence pages | C2 |
| F16 | Per-defect-class page. | no evidence pages | C3 |
| F17 | JSON-LD on verify pages. | crawl | C4 |
| F18 | `npm run listings:check`: walk every sameAs URL, report which generation of text it carries. | mirrors | E1 |
| F19 | ⚑ The sixty words gain a category clause (verification) in the first sentence; every surface inherits. | the noun, answered | A1, B |
| F20 | ⚑ `registry/awesome-x402-submission.md` recut to the entry above; two PRs. | awesome lists | A2 |
| F21 | ⚑ Solana pay-skills#219 body replaced with the text above. | mirrors | A4 |
| F22 | 22 sitemap pages carry no JSON-LD; the ones that stay indexed get a block. | crawl | B, with F3 |

## Execution plan — 2026-09-02

Four branches in order, each one PR, each with the tests it ships.
Keeper's hands run in parallel and are listed after. Nothing opens
as a PR until the keeper says go on this section.

### PR 1 — mechanics: what a crawler receives

Small, pure plumbing, no copy. Ships first because everything after
it is invisible until it lands.

| Fix | Change | Test |
| --- | --- | --- |
| F5 | HTML by default: `wantsHtml` becomes "unless the caller prefers `application/json` or `text/markdown` over `text/html`"; `*/*` and no Accept get HTML. Every negotiated route. | Fetch every negotiated route four ways (`*/*`, none, `application/json`, `text/markdown`); expect HTML, HTML, JSON, markdown. Walk the router the way `derived-not-typed` does, not a typed list. |
| F1 | `X-Robots-Tag: noindex` on every 402 response. | The paid-surface parity test asserts the header on every door's 402. |
| F2 | Trailing slash 301s to the canonical path. | `/what/` → 301 → `/what`; a route with a real trailing slash (none today) is not touched. |
| F13 | IndexNow key file at `/{key}.txt` from an env var; `scripts/indexnow-ping.mjs` reads the sitemap and pings after deploy. | The key route answers the key; the script dry-runs against the sitemap. |

### PR 2 — the words machines read

The vocabulary, the first screens, the menu fields, the tool
descriptions, the manifests. One constant, many surfaces, one sweep.

| Fix | Change | Test |
| --- | --- | --- |
| F7 | `ASKED_FOR_NOUNS` in `src/store/copy/asked-for.ts`, plus `ITEM_ASKED_FOR` (item id → noun). Organization and WebSite `alternateName` gain every name and phrase after the pinned first; `knowsAbout` lists the topics. "Words people use for this" block in llms.txt (filed under the trust area), agents.md, index.md; OpenAPI description tail; MCP handshake instructions. | `test/asked-for.spec.ts`: every noun found on every surface; every item with a `CAPABILITY_QUERY` has a noun; a noun typed outside the constant fails. |
| F6 | /what pair one: "What is scvd.store?" = the name spelled, the sixty words, who runs it. Pair two: the three paths. | first-screen sweep extended to /what. |
| F8 | FAQ pairs: the three category questions, the branded three, the error-shaped three re-titled. | FAQPage carries each question verbatim. |
| F9 | Menu pages: `<title>` and meta lead with the noun, H1 stays; Service `alternateName`; the five-line spec block on the page and as `at_a_glance` in menu.json, derived from `MENU_ITEMS`, the artifact class and the pricing charter. | Block present on every paid item; every value traces to a constant; item-limits test still passes. |
| F10 | MCP tool descriptions carry the nouns from the same constant. | tool-surface test asserts each. |
| F11 | README H1 → "scvd.store", then the sixty words (ruled). GitHub About text, `server.json`, `plugin.json`, `glama.json`, `mcp.json`, the three npm descriptions, the ClawHub bundle: sixty words or nouns line. | Naming-law test updated for the new tier of the H1; a manifest sweep reads each file. |
| F4/rulings 4 | `subjectOf` on the Organization for the two byline pieces; "Written about this store" line on /what and llms.txt. | Both URLs present on both surfaces. |
| F19 | If the keeper has inked the category clause by then, `VALUE_PROPOSITION` changes here and every surface follows; if not, PR 2 ships without it and the clause is its own one-line PR later. | first-screen sweep. |

### PR 3 — the evidence as pages

| Fix | Change | Test |
| --- | --- | --- |
| F14 | `/corpus/host/{host}` HTML twin: title with the readiness fraction and the week, rows, tier when N7 lands, payTo history, `dateModified`, CC BY line, free preflight as the call to action; delist state honoured (a delisted host's page says so and when). Alphabetical index on /doors; every host in the sitemap with lastmod. | Every host in the corpus answers HTML; a fixture host renders the fraction from its rows; delist fixture renders the notice; sitemap count equals host count plus the static list; no ordering field anywhere. |
| F15 | `/corpus/round/{week}` HTML, Dataset JSON-LD, stable; `/corpus/brief` stays the latest. | Every round in the corpus answers; the JSON-LD parses. |
| F16 | `/defects/{class}` one page each, derived from the vocabulary and the last round's counts with denominators. | Every class answers; adding a class without a page is impossible by construction. |
| F12 | Dataset JSON-LD on /corpus, /corpus.json, /registry, /inflows; SoftwareApplication on /mcp.md and /developers. | Blocks parse; sweep finds them. |
| F17 | JSON-LD on verify pages. | Parses. |
| A10 | The dated paragraph on the spec page relating our format to the two draft families. | Present, dated. |

### PR 4 — the mirrors, watched

| Fix | Change | Test |
| --- | --- | --- |
| F18 | `npm run listings:check`: fetch every `sameAs` URL, classify the text it carries (July, August, September, or unknown) by matching the sixty words and the retired phrases, print a table, exit non-zero on a regression from a recorded baseline. | Unit test on the classifier with fixture pages. |
| F20 | `registry/awesome-x402-submission.md` recut to the new entry; the Solana PR text filed beside it. | Docs only. |
| F3/F22 | Sitemap pruned to the rooms the keeper keeps; those get a description block. | Sitemap test lists the kept set. |

### Keeper's hands, in parallel

In this order, because the first gates the rest:

1. Rule on F19 (the category clause). Then the sixty words are final.
2. A1 the mirror sweep with the final words; mcpvault, cursor,
   mcp.so, Glama re-sync after PR 2 lands.
3. A4 hand CV the Solana PR text. A2 the two awesome-list PRs.
4. A6 Search Console and Bing, the IndexNow key into the env for PR 1.
5. A5 read the Vouch row. A3 x402.org.
6. A7 the Cloudflare scan, once.
7. A8 the dev.to link, and the first monthly piece.
8. F3 which lore rooms stay in the sitemap.

### After

Question-titled pages (D) once a hand check shows which families
nobody wins. The listings check weekly. The hand check and the
Cloudflare scan monthly. One byline piece a month.
