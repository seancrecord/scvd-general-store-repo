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
| **The web carries three generations of us at once.** July: "a quirky, human-run digital general store … signed hellos, portraits, a phone call" (Glama, the top result for our own name; Smithery). August: "the trust layer of the x402 economy" (Glama's search snippet, cursor.directory, mcpvault). September: "evidence observatory" (mcp.so, GitHub topics, AgentIndex). An entity resolver sees three stores. | Firecrawl and web search, 2026-09-02 | Highest |
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
| A3 | **x402.org ecosystem page.** Struck 2026-09-03 by the keeper: the ecosystem directory in the coinbase/x402 repository is stale and no longer used, a finding made once before. x402.org stays the most-cited domain for the conformance prompts, but there is no listing to take there. | Struck. |
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
5. Vouch: the keeper reads it.
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
| **Invalid value in priceCurrency / currency (merchant listings)**, confirmed by the keeper, 26+ pages | Every JSON-LD Offer, PriceSpecification and MonetaryAmount said "USDC" since the 2026-08-27 one-currency ruling. schema.org's docs accept tickers; Google's merchant-listing validator wants ISO 4217. | Done on the branch 2026-09-02: `JSONLD_PRICE_CURRENCY = "USD"` in `lib/jsonld.ts`, the asset in words in `acceptedPaymentMethod` on every priced Offer, nine sites switched, `test/jsonld-currency.spec.ts` walks the sitemap. menu.json, the 402 and STORE_METADATA still say USDC. (F23) |
| **Server error (5xx)** | None seen. | If GSC shows them, the dates matter: the suite has known timeout behaviour under load. |
| **Excluded by noindex** | None found. | None. |

Paste the actual rows and the counts and this table gets replaced by
the real one.

## Fixes register

Everything found that needs a change, collected here as found. Not a
PR until the execution plan is agreed. Owner: branch unless ⚑.

| # | Fix | Found | Plan ref |
| --- | --- | --- | --- |
| F1 | Every 402 leaves with `X-Robots-Tag: noindex`, set once in the app's middleware so no door can forget. Built 2026-09-02 (PR 1); `test/noindex-on-402.spec.ts` walks the shelf. | GSC pre-read | B |
| F2 | Trailing-slash GET or HEAD on a human path is one 301 to the canonical, query kept; `/api/` untouched so a machine caller gets its answer or its 410 where it asked. Built 2026-09-02 (PR 1); `test/one-url-per-page.spec.ts`. | GSC pre-read | B |
| F3 | Ruled 2026-09-03 and built (PR 5): `/gazette` (retired), `/porch` ("not really for humans") and `/zodiac` ("idc either way", so out) carry `in_sitemap: false` in `store/rooms.ts`; they leave the sitemap and get a noindex meta, and every other surface still lists them. The train, the neighbours, the visitors' register, the pulse, the bounty board, credit, becoming and wind-down stay. `test/discoverable.spec.ts` names the three. | GSC pre-read | B |
| F4 | ⚑ Confirm `www` 301s to apex in the Cloudflare zone. | GSC pre-read | A6 |
| F5 | Named crawlers get the page. Built 2026-09-02 (PR 1) as a narrower rule than first written: a User-Agent on the robots.txt list (now `lib/crawlers.ts`, one list for both readers) that states no Accept preference gets HTML; a crawler that asks for JSON or markdown still gets it; every other caller is unchanged, because an agent's `fetch(url)` sends the same bare wildcard and expects JSON, and the store's own CLI and the six-doors check depend on that. `Vary` gains `User-Agent` everywhere, merged in one place. `test/crawler-negotiation.spec.ts`. | crawler probe | B1 |
| F6 | /what opens with "What is scvd.store?" (the name spelled, the sixty words, who runs it) and the three paths. Built 2026-09-02 (PR 2). | live /what | B2 |
| F7 | `ASKED_FOR_NOUNS` in `store/copy/asked-for.ts`, typed once: Organization and WebSite `alternateName` (every name, then the phrases), `knowsAbout`, a "Words people use" section kept on the llms.txt index, agents.md and index.md, the OpenAPI description, the MCP handshake. Built 2026-09-02 (PR 2); `test/asked-for.spec.ts` sweeps every surface. | export read | B3 |
| F8 | Five pairs on /what: what SCVD is short for, verification layer or trust layer, who provides proof, which companies verify agent-facing APIs, is scvd.store legitimate. Built 2026-09-02 (PR 2). The error-shaped pairs already read the way people type them and were left alone. | bank review | B4 |
| F9 | Every capability item has an asked-for noun (`ITEM_ASKED_FOR`, one without fails the build): the title and meta lead with it, the Service node carries it as `alternateName`, and a five-line "At a glance" block (attests, cryptography, verify, price and fulfilment, does not attest) derives from the artifact class and the price helpers, on the page and as `at_a_glance` in menu.json. Built 2026-09-02 (PR 2). | export read | B5 |
| F10 | `buy_observation` opens with "signed settlement attestation … signed x402 conformance audit or endpoint watch"; `buy_signed_record` with "signed certificate"; `preflight_endpoint` with "x402 endpoint preflight"; `check_conformance` with "x402 receipt verification". Built 2026-09-02 (PR 2). | tools/list | B6 |
| F11 | README H1 is the domain (ruled), the sixty words follow as before; server.json and plugin.json descriptions name preflight, receipt checks and settlement attestations inside the registry's 100 characters. Built 2026-09-02 (PR 2). ⚑ GitHub About text and the ClawHub bundle republish are the keeper's (the bundle goes out through `npm run skill:publish`). | mirrors | B7 |
| F12 | Dataset already on /corpus, /corpus.json, /doors and /registry; added to /inflows. SoftwareApplication nodes on /developers for the MCP server, the CLI, x402-verify and x402-sign (/mcp.md is markdown and carries no JSON-LD). Built 2026-09-03 (PR 3). | standards check | B8 |
| F13 | IndexNow: the key served at `/{key}.txt` from `INDEXNOW_KEY` (moved to the root 2026-09-03 after the first live ping was refused: a key vouches only for its own directory and below, so `/indexnow/{key}.txt` vouched for nothing), and `npm run deploy` pings api.indexnow.org with the live sitemap's URLs afterwards (`scripts/indexnow-ping.mjs`; no key means skipped, exit 0). Built 2026-09-02 (PR 1). ⚑ The key goes in with `wrangler secret put INDEXNOW_KEY` (32 hex chars) and the same value in Bing Webmaster Tools. | Bing | B9 |
| F14 | `/corpus/host/{host}`: the same history as the JSON as a page, titled "x402 endpoint readiness: {host} — {tier line}", every round including the missed ones with their reasons, the payment-address fact, what it cannot see, the free preflight as the call to action, a Dataset node with `about` the host and `sameAs` the JSON. A host the chain never met is a 404. `store/delisted.ts` holds the keeper's delist decisions: the page comes down and says why and when, the record stands. Every observed host in the sitemap. Built 2026-09-03 (PR 3). | no evidence pages | C1 |
| F15 | `/corpus/round/{week}`: the weekly brief at a stable address, "x402 endpoint readiness, week W: n of m probed doors payable" in the title, Dataset node with temporalCoverage; JSON to a caller that asks for it; 404 for a week the chain does not hold. Every signed week in the sitemap. Built 2026-09-03 (PR 3). | no evidence pages | C2 |
| F16 | `/defects/{id}`: one page per class with the id in the title, asserts, costs, detectable, falsified by, how an operator clears it, and a DefinedTerm node in the vocabulary's DefinedTermSet. Every class in the sitemap. Built 2026-09-03 (PR 3). | no evidence pages | C3 |
| F17 | DigitalDocument node on every receipt page. Built 2026-09-03 (PR 3). | crawl | C4 |
| F18 | `npm run listings:check` (`scripts/listings-check.mjs`, `scripts/lib/listings.mjs`): reads the homepage's sameAs list, reads every mirror as a browser would, classifies each as current (the sixty words, read from the live og:description), september, august, july, unknown or unreachable; `--record` writes `docs/listings/observation.json`, later runs exit 1 on a mirror that moved backwards. `listings:test` is offline and in the gates. Built 2026-09-03 (PR 4). ⚑ First `--record` from the keeper's machine: from the build sandbox 31 of 35 mirrors are egress-blocked, so a baseline taken here would be a lie. | mirrors | E1 |
| F19 | Ruled 2026-09-03 ("agreed on all") and built (PR 5): the first sentence reads "…evidence observatory for agentic commerce: independent verification of x402 endpoints, payments and receipts." The tail of the proposed clause was trimmed because the sixth sentence already says it and the paragraph has a ceiling (raised 80 → 90 words in `test/first-screen.spec.ts`). README, every first screen, the guide digest (thirty-seventh) and the keeper's desk file followed. | the noun, answered | A1, B |
| F20 | `registry/awesome-x402-submission.md` recut 2026-09-03 (PR 4) with the new entry, the two live lists and the sections that fit; the July entry kept beneath for the record. The keeper submitted both PRs before 2026-09-03 and reports no movement ("too many prs for them"). Nothing to chase; the entry stands in the file for the day a maintainer merges. | awesome lists | A2 |
| F26 | The corpus DOI (Zenodo, the keeper's record 2026-09-03) on every corpus Dataset node as a DOI `identifier` and a doi.org `sameAs`, and a citation line on /corpus; the /corpus page's hand-typed third copy of the name and description replaced by the constants. The LinkedIn showcase in `KEEPER_SOCIAL`. Built 2026-09-03 (PR 6); `test/corpus-doi.spec.ts`. ⚑ Confirm the number is the concept DOI ("Cite all versions"), not the version DOI; one constant if it differs. | entity anchors | A |
| F22 | Built 2026-09-03 (PR 5): 23 sitemap pages carried no JSON-LD (the census is in the PR). `renderSimplePage` now derives a WebPage node from the title and description it already prints, at the end of the body so a room's own richer node stays first, hung off the WebSite (`@id` added) and the Organization. Every listed room carries one; `test/discoverable.spec.ts` holds each to naming its own URL. | crawl | B, with F3 |
| F25 | `subjectOf` on the Organization links the byline pieces, and the guides print them. Built 2026-09-02 (PR 2); the dev.to census piece added 2026-09-03 (PR 5) from the keeper's URL, title read from the slug for the keeper to correct. | rulings | B |
| F24 | One `@id` on the store's Organization node and every reference to it (32 nodes, two names before), under the display name; done on the branch with `test/organization-id.spec.ts`. | entity anchors | PR 1 |
| F23 | JSON-LD money fields say "USD" with the settlement asset in words; done on the branch, not yet a PR. The 2026-08-27 ruling stands everywhere a validator does not read. | GSC, keeper | PR 1 |

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
| A10 | The dated paragraph on the spec page relating our format to the two draft families. ⚑ CV's, from the prompt in docs/bylines; not in PR 3. | Present, dated. |

### PR 4 — the mirrors, watched

| Fix | Change | Test |
| --- | --- | --- |
| F18 | `npm run listings:check`: fetch every `sameAs` URL, classify the text it carries (July, August, September, or unknown) by matching the sixty words and the retired phrases, print a table, exit non-zero on a regression from a recorded baseline. | Unit test on the classifier with fixture pages. |
| F20 | `registry/awesome-x402-submission.md` recut to the new entry. | Docs only. |
| F3/F22 | Sitemap pruned to the rooms the keeper keeps; those get a description block. | Sitemap test lists the kept set. |

### Keeper's hands, in parallel

In this order, because the first gates the rest:

1. Rule on F19 (the category clause). Then the sixty words are final.
2. A1 the mirror sweep with the final words; mcpvault, cursor,
   mcp.so, Glama re-sync after PR 2 lands.
3. A2 the two awesome-list PRs.
4. A6 Search Console and Bing, the IndexNow key into the env for PR 1.
5. A5 read the Vouch row. A3 x402.org.
6. A7 the Cloudflare scan, once.
7. A8 the dev.to link, and the first monthly piece.
8. F3 which lore rooms stay in the sitemap.
9. The Zenodo DOI for the corpus, the LinkedIn company page and the
   Crunchbase profile (entity anchors, below).

### After

Question-titled pages (D) once a hand check shows which families
nobody wins. The listings check weekly. The hand check and the
Cloudflare scan monthly. One byline piece a month.

## Entity anchors: Wikipedia, Wikidata and what to do instead — 2026-09-02

The keeper asked whether a Wikipedia or Wikidata entry is reachable.
The claims register already holds a ruling ("a month-old company
fails notability; a sameAs to a missing page is a false claim in
machine form; revisit at real notability") and the second look
agrees with it. What changes is the list of anchors that ARE
reachable now.

| Anchor | Reachable now? | Why | Action |
| --- | --- | --- | --- |
| Wikipedia article | No, and not for a long time. | The general notability guideline wants significant coverage in several independent, reliable sources. Directory listings, self-authored posts and a HackerNoon byline do not count. An article written by the subject is a conflict of interest and gets deleted, which leaves a deletion log under the name. | None. Revisit only when two or more independent publications have written about the store unprompted. |
| Wikidata item | Not yet. | Wikidata's bar is lower (a clearly identifiable entity with at least one serious, public reference), but an item for one's own two-month-old company with only self-published references is routinely deleted as promotional, and a deleted item is worse than none. | Create it the week the first independent reference exists (a trade article, a paper citing the corpus, a standards document naming the store). Then `sameAs` points at it. |
| Zenodo DOI for the corpus | Yes, today. | Zenodo accepts any dataset, mints a DOI per version, and Google Dataset Search indexes it. A DOI is the citation form researchers use, and arxiv.org was cited 53 times in the export: papers are part of the engines' diet and papers cite DOIs, not URLs. The corpus is already CC BY 4.0 and already versioned weekly. | ⚑ One Zenodo record, "scvd.store x402 endpoint readiness corpus", a new version per weekly round, uploaded by the anchor cron. The DOI goes in the Dataset JSON-LD (PR 3) and on /corpus. |
| Google Dataset Search | Yes, after PR 3. | Reads Dataset JSON-LD from the sitemap. | Falls out of F12. |
| Hugging Face dataset | Yes, today. | Second dataset index researchers and agents actually search; the readiness rows as parquet or JSONL, README with the denominators. | ⚑ Optional; Zenodo first. |
| LinkedIn company page | Yes, today. | linkedin.com was cited 44 times in the export. The keeper's profile already mentions the store; a company page with the sixty words is an entity anchor engines read and one the keeper controls. | ⚑ Create; `sameAs` gains it. |
| Crunchbase profile | Yes, today. | A standard entity anchor for "is there a company"; diligence scans and entity resolvers both read it. Self-created profiles are the norm there. | ⚑ Create with the legal name, founding date and the sixty words; `sameAs` gains it. |
| GitHub organisation | Partly. | The repo sits under a personal account. An organisation named for the store is one more resolvable entity with the same name and URL. | ⚑ Low priority; only if the repo would move. |
| `@id` on the Organization node | Yes, in PR 2. | Gives every JSON-LD block on the site the same stable identifier (`https://scvd.store/#organization`) so the WebSite, Dataset and Service nodes all point at one entity instead of repeating its name. | Falls into F7. |

The honest summary: the encyclopaedic anchors are earned by
coverage the store does not have yet, and trying to take them early
costs more than waiting. The dataset anchors are earned by having a
dataset, which the store does have, and nobody in the x402 space has
a DOI. That is the one to take this week.

### How to take each anchor — 2026-09-02, keeper's questions answered

**Zenodo DOI for the corpus.** Zenodo is CERN's open repository; any
dataset, any size up to 50 GB, free, permanent, DOI per version.

1. Sign in at zenodo.org with the GitHub account (one click; no new
   password).
2. New upload. Type: Dataset. Title: "scvd.store x402 endpoint
   readiness corpus". Files: the latest `corpus.json` and the
   week's brief as markdown. Description: the sixty words plus one
   paragraph on what a row is, how it was observed, and the
   denominator rule. Licence: CC BY 4.0 (already the corpus licence).
   Creators: Record Creative Co. LLC, and the keeper by name.
   Keywords: x402, agentic commerce, endpoint readiness, HTTP 402.
   Related identifiers: `https://scvd.store/corpus` as "is
   supplemented by", the GitHub repo as "is source of".
3. Publish. Zenodo mints two DOIs: one for this version and a
   *concept DOI* that always resolves to the latest version. The
   concept DOI is the one to print on /corpus and in the Dataset
   JSON-LD (PR 3).
4. Each new weekly round: "New version" on the record, upload the
   new files, publish. Zenodo's REST API does this with a personal
   token, so the Sunday walk can do it unattended once the token is
   in the Worker's secrets. That is a small addition to PR 3, not a
   hand job forever.

**LinkedIn, when the existing page is Little Wheels.** Do not
re-frame that page; two products under one page confuses the
resolver more than it helps either. Two clean options:

- A *Showcase Page* under the existing company page, named
  "scvd.store". LinkedIn built showcase pages for exactly this: one
  brand of a company, its own followers and its own URL, listed
  under the parent. The sixty words as the description, the domain
  as the website, "Record Creative Co. LLC" as the parent.
- Or a separate company page named "scvd.store" if the two
  businesses are not meant to be read as siblings. Same fields.

Either way the page URL goes in `sameAs`. The showcase route keeps
one legal entity on LinkedIn, which matches the Organization block.

**Crunchbase, same situation.** Crunchbase profiles are one per
organisation and one organisation per legal entity is the norm.
Since Record Creative Co. LLC is the entity behind both, the honest
shape is one organisation profile for Record Creative Co. LLC with
scvd.store listed as a product (Crunchbase has a Products section)
and the website field pointing at whichever is primary. If the
existing profile is named "Little Wheels" rather than the LLC,
rename it to the LLC and list both products under it. A second
organisation profile for scvd.store alone would claim a company that
does not exist.

**Hugging Face dataset.** A second index researchers and agents
search, and one that agents read natively.

1. Create the dataset repo `scvd/x402-endpoint-readiness` (or under
   the keeper's account) at huggingface.co/new-dataset. Licence CC
   BY 4.0, public.
2. Upload the corpus rows as JSONL (one host observation per line)
   or parquet, one file per weekly round, named by ISO week. The
   README (the "dataset card") carries the sixty words, the row
   schema, the denominator rule, the concept DOI from Zenodo, and
   the corpus URL. The card's YAML header names the licence, the
   language and the task, so the Hub indexes it.
3. Each weekly round: push the new file with the `huggingface_hub`
   client and a token, from the same Sunday walk. Same shape as the
   Zenodo step; both can live in one script.

Order: Zenodo first (the DOI is what the Hugging Face card cites),
then Hugging Face, then the DOI onto /corpus in PR 3.

## Built — 2026-09-03, morning

The four build PRs of the execution plan merged into main overnight
(times are UTC; #426 is the plan PR that carried the currency and
`@id` fixes ahead of PR 1).

| PR | Merged | Shipped |
| --- | --- | --- |
| #426 | 2026-09-02 22:32 | This document; F23 (`JSONLD_PRICE_CURRENCY = "USD"`, `offerCurrencyFields()`, the settlement asset in words); F24 (one `@id` on the Organization, `organizationRef()` everywhere it is referenced). |
| #429 (PR 1) | 2026-09-03 00:50 | F5 (named crawlers with a bare Accept get HTML, `lib/crawlers.ts` is the one list, `Vary` gains `User-Agent`); F2 (trailing slash 301, `/api` and `/mcp` untouched); F1 (`X-Robots-Tag: noindex` on every 402); F13 (`/indexnow/{key}.txt`, `scripts/indexnow-ping.mjs` after `npm run deploy`). |
| #433 (PR 2) | 2026-09-03 02:05 | F7 (`store/copy/asked-for.ts`: names, phrases, `knowsAbout`, "Words people use" on llms.txt, agents.md, OpenAPI, MCP handshake); F6 and F8 (/what opens with "What is scvd.store?", the three paths, five asked-for pairs); F9 (noun-first titles, Service `alternateName`, "At a glance" block, `at_a_glance` in menu.json); F10 (tool descriptions); F11 (README H1, server.json, plugin.json); F25 (`subjectOf` links the HackerNoon piece). |
| #435 (PR 3) | 2026-09-03 02:30 | F14 (`/corpus/host/{host}` pages, `store/delisted.ts`); F15 (`/corpus/round/{week}`); F16 (`/defects/{id}` with DefinedTerm); F12 (Dataset on /inflows, SoftwareApplication graph on /developers); F17 (DigitalDocument on receipt pages); all three families in the sitemap. |
| #436 (PR 4) | 2026-09-03 02:59 | F18 (`npm run listings:check`, `--record`, offline `listings:test` in the gates); F20 (`registry/awesome-x402-submission.md` recut for xpaysh/awesome-x402 and Merit-Systems/awesome-agentic-commerce). |

New tests on main from these PRs: `jsonld-currency`, `organization-id`,
`crawler-negotiation`, `one-url-per-page`, `noindex-on-402`,
`asked-for`, `evidence-pages`, `scripts/listings-check.test.mjs`.
The guide digest in `test/llms-modular.spec.ts` was re-taken three
times (thirty-fourth to thirty-sixth) as the sections changed.

Not built, by design: F3 and F22 (sitemap pruning and blocks for the
lore rooms) wait on the keeper's room list; F19 (the category clause
in the sixty words) waits on the keeper's ruling; the question-titled
pages (D) wait on a hand check. The Solana PR text was removed on
2026-09-02 at the keeper's word.

### The keeper's list, as it stood (superseded the same afternoon; see below)

Nothing on the branch moves until one of these lands. In the order
the plan set, with what each unlocks:

1. **Rule on F19**, the category clause in the sixty words. Unlocks
   the mirror sweep (2) and closes the vocabulary. One line in
   `VALUE_PROPOSITION`; every surface inherits; the first-screen
   sweep and the guide digest re-take with it.
2. **Mirror sweep** with the final words: Glama, Cursor, mcp.so,
   mcpvault, the GitHub About text, `npm run skill:publish` for the
   ClawHub bundle. Then the first `npm run listings:check -- --record`
   from the keeper's machine (the sandbox cannot reach 31 of 35
   mirrors, so the baseline must be taken outside it).
3. **The two awesome-list PRs** from
   `registry/awesome-x402-submission.md`.
4. **IndexNow and the consoles**: `wrangler secret put INDEXNOW_KEY`
   with 32 hex characters, the same value in Bing Webmaster Tools,
   the sitemap resubmitted in Search Console. The next
   `npm run deploy` pings on its own after that.
5. **Entity anchors**: the Zenodo concept DOI for the corpus (then it
   goes onto /corpus in a one-line PR), the LinkedIn showcase page
   under Record Creative Co. LLC, the Crunchbase rename to the LLC
   with scvd.store as a product, the Hugging Face dataset after the
   DOI exists.
6. **Read the Vouch row**; the x402.org ecosystem listing; the
   Cloudflare Agent Readiness scan, once.
7. **The dev.to URL** for `WRITTEN_ABOUT`; the census byline
   (`docs/bylines/2026-09_census_draft.md`) posted; CV's IETF
   paragraph from `docs/bylines/CV_PROMPT_IETF_2026-09.md` onto the
   spec page.
8. **F3**: which lore rooms stay in the sitemap. Unlocks F22 and the
   sitemap prune.
9. **Real GSC rows** once the console has re-crawled, so the
   pre-read can be checked against what Google actually says.
10. **Delistings**, if a host asks: one row in `src/store/delisted.ts`
    with host, date and reason; the page comes down, the record
    stands.

## Rulings and the fifth build — 2026-09-03, afternoon

The keeper answered the nine in one message. What each answer was,
what it unblocked, and what is now in the keeper's hands with the
steps written out.

### The rulings

1. **The category clause: "agreed on all."** Built as F19 (above).
2. **Mirror sweep: "we will do this at very end so save it."** Saved.
   The final words are now on main; the sweep is the last item.
3. **Awesome lists: "already done, didn't move."** Both PRs are in
   the maintainers' queues. Nothing to do; the entry stays in
   `registry/awesome-x402-submission.md`.
4. **IndexNow: willing now; asked how to make the key.** Steps below.
5. **Entity anchors: asked for the download and the walk.** Below.
6. **Vouch, x402.org, Cloudflare: asked for the walk.** Below.
7. **dev.to URL sent.** Built into `WRITTEN_ABOUT` (F25).
8. **Rooms:** gazette out (retired), porch out (not for humans),
   train in, zodiac either way (taken as out), neighbours in,
   visitors in, pulse in, bounties in, credit in, becoming in,
   wind-down either way (taken as in: "if the lights go off" is a
   question buyers ask). Built as F3 and F22.
9. (blank)

### PR 5 — what shipped on the rulings

| Fix | Change |
| --- | --- |
| F19 | The first sentence of the sixty words carries the category clause; README, every first screen, the guide digest and `KEEPER_LIST.md` followed. |
| F3 | `Room.in_sitemap` in `store/rooms.ts`; `SITEMAP_ROOMS`, `UNLISTED_ROOMS`, `isUnlistedRoom()`. `HUMAN_SURFACES` derives from `SITEMAP_ROOMS`. The three unlisted rooms get `<meta name="robots" content="noindex">` from the renderer (the porch, a hand-built page, by hand). |
| F22 | `webPageJsonLd()` and `websiteId()` in `lib/jsonld.ts`; the renderer emits the node for every page with a canonical; the storefront's WebSite node carries `@id`. |
| F25 | The dev.to census piece beside the HackerNoon one. |

Tests: the first-screen pin moved to 2026-09-03 and the ceiling to
90 words; `test/capability-query.spec.ts` widens the first screen
from 1,400 to 1,500 characters because the opening grew by ninety;
`test/routes.spec.ts` expects the Gazette off the map;
`test/discoverable.spec.ts` gains the unlisted-rooms block and the
structured-data sweep; the guide digest is the thirty-seventh.

### 4. IndexNow, Bing and Search Console, step by step

The key is any 32 lowercase hex characters. Make one:

```
openssl rand -hex 16
```

Keep it; you paste it twice. First into the Worker:

```
wrangler secret put INDEXNOW_KEY
```

(paste the key at the prompt.) The route at
`https://scvd.store/{key}.txt` answers with the key as soon as the
secret exists; open it in a browser to confirm. That is the
whole protocol-side setup: IndexNow verifies ownership by fetching
that file, and no registration is needed with Bing for the pings to
count. Then, for the next deploy, put the same key in the shell that
runs `npm run deploy` (in `.env` or exported), because the ping
script runs on your machine after `wrangler deploy` and reads it from
there. Run it once now, by hand:

```
INDEXNOW_KEY=<the key> npm run indexnow
```

A 200 or 202 back means Bing accepted the sitemap's URLs.

The first live run (2026-09-03, 1,284 URLs) came back 422 and nothing
else. The sitemap was clean from outside and the key file answered,
and a one-URL ping by hand returned the reason: "One or more URLs are
not related to your site verified through the keyLocation parameter."
IndexNow scopes a key to the directory it is served from and below,
so a key under `/indexnow/` vouched for `/indexnow/*` and nothing
else. The route moved to the root the same hour. The script also now
fetches its own key file first, the way Bing does, and says which side
is wrong before it sends anything, and prints IndexNow's reply body on
any 4xx, so the next refusal explains itself.

Bing Webmaster Tools (bing.com/webmasters): sign in, "Add a site",
choose "Import from Google Search Console" (one click, no DNS record),
submit `https://scvd.store/sitemap.xml` under Sitemaps. Under
"IndexNow" in the left rail you will see submissions arriving after
the first ping. Bing's index is what ChatGPT search cites from.

Search Console: Sitemaps → resubmit `https://scvd.store/sitemap.xml`
so Google picks up the host, round and defect pages, and sees the
three rooms leave. On the count: 22 indexed of ~79 submitted before
PR 3 is low but not wrong for a domain this age. The three lore rooms
leaving, the WebPage nodes, and the new evidence pages (which are the
kind of page Google indexes: specific, dated, structured) should move
it. Paste the Pages report in two weeks and the pre-read table gets
replaced with what Google actually said.

Also in the Cloudflare zone, once: confirm `www.scvd.store` 301s to
the apex (F4). If it does not, a Redirect Rule "www → apex, 301,
preserve path" is one rule.

### 5. The entity anchors, step by step

**What to download.** The corpus is an index plus one file per
signed round. From any shell:

```
mkdir -p corpus && cd corpus
curl -sS https://scvd.store/corpus.json -o corpus.json
for u in $(jq -r '.distribution[].contentUrl' corpus.json | grep -E '/corpus/[0-9]+\.json$'); do
  curl -sS "$u" -o "$(basename "$u")"
done
curl -sS https://scvd.store/corpus/tiers.json -o tiers.json
```

That leaves `corpus.json` (the index with the chain check),
`1.json`, `2.json`, … (one per round, each signed) and `tiers.json`.
Those files are the dataset.

**Zenodo (first, because the DOI is what the others cite).**

1. zenodo.org → Log in with GitHub.
2. "New upload". Drag in every file from the folder above.
3. Resource type: Dataset. Title: `scvd.store x402 endpoint readiness
   corpus`. Publication date: today. Creators: Record Creative Co.
   LLC, and your name as a second creator if you want it cited.
4. Description: the sixty words (from main, with the clause), then
   one paragraph: weekly signed observations of every host in the
   x402 discovery document, hash-chained, ed25519-signed, digests
   anchored to Bitcoin through OpenTimestamps; one file per round;
   the row schema and the denominator rule are in `corpus.json`;
   never a ranking. Licence: Creative Commons Attribution 4.0.
   Related works: `https://scvd.store/corpus` (URL, "is identical
   to") and `https://scvd.store/corpus.json`.
5. Publish. Zenodo shows two DOIs: the version DOI and the concept
   DOI ("Cite all versions"). Send me the concept DOI; it goes onto
   /corpus and into the Dataset nodes, and the weekly upload script
   uses it.
6. Every later round: "New version" on the same record, add the new
   round's file, publish. (After the DOI lands I write the script
   that does this from the Sunday walk with a Zenodo token, so step
   6 happens by itself.)

**LinkedIn.** Do not reframe the Little Wheels page. On the Record
Creative Co. LLC company page (create it if the existing page is
Little Wheels' own: Work → Create a Company Page → Company, legal
name, website `https://scvd.store`, industry "Software Development"),
add a Showcase Page named `scvd.store` (Admin tools → Create a
Showcase Page). Tagline: "Independent verification for agentic
commerce." About: the sixty words. Website: `https://scvd.store`.
Send me the showcase URL for `sameAs`.

**Crunchbase.** Open the existing organisation profile → Edit. Rename
to `Record Creative Co. LLC`, legal name the same, website
`https://scvd.store` if the store is the primary product (or keep
Little Wheels' site and add the store under Products). Add both
products under "Products": `scvd.store` with the sixty words, and
Little Wheels. One profile per legal entity; a second one for the
store alone claims a company that does not exist. Send me the
profile URL.

**Hugging Face (after the DOI).** huggingface.co → New → Dataset,
name `x402-endpoint-readiness`, public, licence cc-by-4.0. Upload the
same files. The dataset card (README.md on the repo) needs a YAML
header:

```
---
license: cc-by-4.0
language: en
pretty_name: scvd.store x402 endpoint readiness corpus
tags: [x402, agentic-commerce, payments, verification]
---
```

then the sixty words, the row schema, the denominator rule, the
concept DOI, and `https://scvd.store/corpus`. Send me the dataset
URL. Weekly pushes join the same script as Zenodo.

### 6. Vouch, x402.org, Cloudflare, step by step

**Vouch Protocol.** The row the export surfaced lists
`scvd/general-store` at "C, 60". Search "Vouch Protocol Agent Trust
Index scvd" and open the row. Read three things: what the letter
grades (a scan of the MCP server? of the site?), what the 60 counts
(out of what), and whether there is a "claim this agent" or
"request a correction" control. Send me the URL and those three
answers. If the measure is something we can improve on our side (a
missing header, a manifest field) it is a fix; if it is wrong about
us it is a corrections entry; if it is neither, the doc records what
it measures and we leave it.

**x402.org ecosystem.** Struck 2026-09-03 (the keeper: "quite
certain the x402 ecosystem git you have on the list is stale … i
dont think its used anymore", and this had been found once before).
No PR to open. The domain's weight in the export is real, but it is
carried by the protocol docs and the facilitator, not by a directory
anyone maintains.

**Cloudflare, once.** In the dashboard, open the scvd.store zone.
"AI Crawl Control" (left rail; it was "AI Audit" until 2025) shows
which AI crawlers fetched the site in the last day, week and month,
by bot, with the paths and the status codes they got. Read the table
for the four that matter (GPTBot and OAI-SearchBot, ClaudeBot,
PerplexityBot, Google-Extended) and note whether each is fetching
HTML now (PR 1's job) and which paths. Screenshot or paste the table
and it goes in this file, dated, as the first crawl reading.
Separately, at radar.cloudflare.com/scan, scan `https://scvd.store`
and read the "AI readiness" or "agent readiness" section if your
account shows one; it checks robots.txt, llms.txt and the machine
links. Paste what it says.

### The keeper's list, as it stands now

1. IndexNow key into the Worker and the deploy shell; Bing Webmaster
   import; Search Console resubmit; www check. (Section 4.)
2. Zenodo record → send the concept DOI. Then LinkedIn showcase,
   Crunchbase rename, Hugging Face. Send each URL. (Section 5.)
3. Vouch row read (done, A 100/100); one Cloudflare crawl reading.
   x402.org struck. (Section 6.)
4. Correct the dev.to title in `WRITTEN_ABOUT` if the slug got it
   wrong.
5. CV's IETF paragraph from `docs/bylines/CV_PROMPT_IETF_2026-09.md`.
6. Search Console Pages report in two weeks.
7. Last of all, the mirror sweep with the final words, then the
   first `npm run listings:check -- --record` from your machine.

What the branch builds as each arrives: the DOI onto /corpus and the
Dataset nodes; each anchor URL into `sameAs`; the weekly Zenodo and
Hugging Face upload from the Sunday walk; the IETF paragraph onto the
spec page; the real GSC table; delist rows on request. The
question-titled pages (D) wait on a hand check I can run once the
crawler fixes have been live two weeks.

## Anchors landed and the Vouch reading — 2026-09-03, evening

- **Zenodo**: `10.5281/zenodo.22284888`, published by the keeper.
  Built into every corpus Dataset node and onto /corpus (F26, PR 6).
  ⚑ Concept versus version DOI still to be confirmed from the
  record's "Cite all versions" box; if it differs, `CORPUS_DATASET_DOI`
  is the one line.
- **LinkedIn**: `https://www.linkedin.com/showcase/scvd-general-store/`
  under Record Creative Co. LLC. The first attempt named the page
  "scvd.store" and LinkedIn wrapped it in its suspicious-link redirect,
  because it treats anything shaped like a domain as a link and did
  not know this one; renamed to "SCVD General Store" and the URL
  reissued. In `KEEPER_SOCIAL` (PR 6), so it rides sameAs.
- **IndexNow**: live. The key file moved to the root in PR 5 and the
  first accepted ping is the keeper's to run after `git pull`.
- **Vouch Protocol, read 2026-09-03**: the Agent Trust Index grades
  the did:web document. `scvd.store` grades **A, 100/100** today:
  identity `did:web:scvd.store`, key did:web Ed25519 (JWK). The
  "C, 60" in the search snippet the export surfaced was an older read
  under the `scvd/general-store` name; nothing to correct. Its two
  "to raise your grade" items are a post-quantum key (ML-DSA-44)
  beside the Ed25519 key with hybrid signing, and a service or
  revocation endpoint in the DID document. Both are signing-format
  and key-management decisions, the same class as the IETF drafts'
  canonical forms: recorded here, not built on the plan. The README
  badge is on (the keeper: "dont skip the badge add the badge"):
  `docs/badges/vouch-agent-trust.svg`, generated 2026-09-03 with
  `vouch grade scvd.store --badge` from `vouch-protocol` 2.1.0, which
  also printed A (100/100), post-quantum no, revocation no. Vouch
  serves no hosted badge URL, so the file is a dated snapshot and
  regenerating it is the same one command whenever the grade moves.

Still the keeper's: Crunchbase rename, Hugging Face (now unblocked by
the DOI), the Cloudflare crawl reading, Search Console
resubmit and the www check, the dev.to title check, CV's IETF
paragraph, the mirror sweep last.

## First crawl reading — Cloudflare AI Crawl Control, 2026-09-03

Pasted by the keeper from the zone's AI Crawl Control panel (the
panel's default window; the next reading should note the range). The
bots that moved bytes, in the panel's order:

| Crawler | Operator | Kind | Bytes | Allowed | Unsuccessful |
| --- | --- | --- | --- | --- | --- |
| ClaudeBot | Anthropic | AI crawler | 13.59 MB | 2,420 | 14 |
| Claude-User | Anthropic | AI crawler (on a user's behalf) | 6.54 MB | 252 | 0 |
| Meta-ExternalAgent | Meta | AI crawler | 648 kB | 144 | 28 |
| Googlebot | Google | search | 2.68 MB | 91 | 6 |
| Applebot | Apple | AI search | 684 kB | 51 | 4 |
| OAI-SearchBot | OpenAI | AI search | 1.32 MB | 54 | 0 |
| GPTBot | OpenAI | AI crawler | 292 kB | 13 | 4 |
| Amazonbot | Amazon | AI crawler | 158 kB | 13 | 2 |
| ChatGPT-User | OpenAI | AI assistant | 322 kB | 12 | 0 |
| PerplexityBot | Perplexity | AI search | 259 kB | 10 | 0 |
| BingBot | Microsoft | search | 34 kB | 3 | 0 |
| Baidu, Bytespider, Claude-SearchBot | | | ~13 kB each | 1 each | 0 |

Zero requests: CCBot (Common Crawl), DuckAssistBot, Perplexity-User,
Meta-ExternalFetcher, MistralAI-User, Google-CloudVertexBot, the
Cloudflare crawler, the archivers, and the rest of the panel's list.

Top paths by requests: `/mcp` (JSON, 250 requests, 6.5 MB), `/`
(HTML, 48), `/sitemap.xml` (21), `/webmcp.js` (14), `/till.js` (13),
`/menu/settlement_attestation` (JSON, 12), then the per-host corpus
pages, both faces: `/corpus/host/{host}` as HTML (8–10 requests each)
and `/corpus/host/{host}.json` (8–9 each). 911 distinct paths in the
window.

What it says:

- **The crawler fix is working.** The per-host pages from PR 3 are
  being fetched as HTML by the AI crawlers, eight to ten times each
  in the window, beside their JSON twins. Before PR 1 a crawler with
  a bare Accept got JSON everywhere.
- **The engines that matter are all here.** OAI-SearchBot (what
  ChatGPT search cites from, via Bing's index and its own fetches),
  PerplexityBot, Applebot, Googlebot, and ChatGPT-User (a person's
  ChatGPT session fetching a page it was going to cite). Every one
  with zero or near-zero failures.
- **Bing is the gap.** Three requests. Bing's own index is what
  ChatGPT search falls back on, and it has barely walked the site.
  IndexNow went live the same afternoon; the next reading should show
  BingBot moving.
- **ClaudeBot's 2,420 requests** are Anthropic's training crawl, and
  the volume is the sitemap's 1,280 URLs walked in both faces.
  Claude-User's 252 requests are almost all `/mcp`: an MCP client
  session fetching tools/list, most likely this very session's
  connector rather than a stranger. Discount it.
- **Meta-ExternalAgent's 28 failures** are the largest failure count
  on the panel. Not diagnosed: the panel's 4xx filter would say
  whether they are 402s on paid doors (correct, and now noindex) or
  404s on paths that should answer.

Follow-ups, in order:

1. ⚑ Keeper: click the panel's **4xx** filter and paste the paths.
   That tells us whether the 58 unsuccessful requests are the paid
   doors' 402s (fine) or dead paths (a fix).
2. Re-read the panel a week after the first IndexNow ping, for
   BingBot alone.
3. Monthly re-read, same table, so the doc carries a series.

Nothing to block. Nothing to build from this reading until the 4xx
list is in.
