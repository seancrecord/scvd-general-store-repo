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

## The plan

Ruled 2026-09-02 after three batches. The principle, keeper's words:
it does not matter whether a phrase is close or overclaims, we should
still be right there. So the store keeps its noun on its own
surfaces, and every phrase people actually use rides in the machine
fields, the FAQ, and the prompt set. The record is not contradicted;
the retrieval hooks stop caring about it.

Owners: ⚑ keeper's hands. Everything else is a branch. Each phase has
a done-test so it cannot be "remembered as a habit" (rule 44).

### Phase 0 — this week, ⚑ keeper's hands, no code

| # | Action | Done when |
| --- | --- | --- |
| 0.1 | Tracker brands: add scvd.store, SCVD, "Sean-Claude Van Damme's General Store"; add DefaultVerifier, x402audit, vet402, Nevermined, x402-list, Proveria, Paybond, RankShield, Ledge. Remove Target, Amazon, Etsy. | The mentions column can be non-empty for us. |
| 0.2 | Tracker topics: replace the five with the four tenses (before you pay, after you pay, over time, on anyone's artifact). | Four topics, zero empties. |
| 0.3 | Tracker prompts: paste the fifty in the appendix, verbatim. Archive everything else. | 50 of 50, none say "shopping bot", "compliance", "memory" or "certify". |
| 0.4 | Directory rows (x402-list, glama, mcpservers, agentic.market, x402scan, mcp.so): first line becomes "x402 conformance audit, signed settlement attestation, endpoint watch and launch check, ed25519-signed, from $0.004; free preflight and receipt check on any issuer's artifact." Same visit swaps the retired doctrine sentence on x402-list (N7 press). | ChatGPT's next price table has a row with our name and a price. |
| 0.5 | Roundup outreach: the census figure (34 of 35 hosts serve no signed offer, dated, reproducible) plus the corpus link to the four authors Google already cites: digitalapplied, wavect, blocksec, fintechwrapup. Not the law firm. | Four sent; replies logged in KEEPER_LIST. |

### Phase 1 — this week, one branch, machine fields only, no H1 changes

| # | Action | Where | Done when |
| --- | --- | --- | --- |
| 1.1 | **The vocabulary constant.** One list, `ASKED_FOR_NOUNS`, typed once: "independent verification layer for agentic commerce", "trust layer for agentic commerce", "proof for agentic commerce", "x402 conformance audit", "x402 conformance testing", "signed settlement attestation", "x402 receipt verification", "x402 endpoint monitoring", "conformance observability", "agent-facing API verification", "independent payment verification". Rides into: Organization `alternateName` and `knowsAbout` on `/`; a "Words people use for this" block in llms.txt, agents.md and index.md; the OpenAPI description tail. The storefront prose does not change. | `src/store/copy/position.ts`, `src/pages/storefront-page.ts:597`, `src/routes/llms.ts` | A test walks every surface and finds every noun; typing one anywhere else fails the build. |
| 1.2 | **The /what questions that answer to the phrases.** Three pairs added to `/what`: "Is scvd.store a verification layer / trust layer for agentic commerce?" (people call it that; here is what it does and refuses), "Who provides proof of what happened in an agentic commerce transaction?", "Which companies independently verify agent-facing APIs?" Answers derived from `VALUE_PROPOSITION` and the menu, not typed. | `src/routes/what.ts` | FAQPage carries them; the derived-not-typed test covers the answers. |
| 1.3 | **Menu pages answer to the asked-for noun.** Each `/menu/{id}` gets `alternateName` on its Service JSON-LD and the asked-for noun in `<title>` and meta description ahead of the house name: "x402 conformance audit — the Once-Over", "Signed settlement attestation for x402 payments on Base, Polygon, Solana — Settlement Attestation", "x402 endpoint monitoring, signed daily for a week — Standing Watch", "x402 launch check", "Test your x402 payment client — the Practice Counter". One map, item id to noun, in the catalog module. | `src/routes/catalog.ts:352`, the `/try` page | Every paid item has a noun; a paid item without one fails the build. |
| 1.4 | **The five-line spec block** above the description on every menu page and in menu.json: what it attests, the cryptography (ed25519, key at the well-known path, kid in every 402), how a stranger verifies it (`/api/verify/{id}`, offline), the price and fulfilment time, what it does not attest. All five derived from `MENU_ITEMS`, the attestation spec and the pricing charter. This is the DefaultVerifier one-liner, true of us, in a shape a model lifts into a table row. | `src/routes/catalog.ts` | Block present on every paid item; every value traces to a constant. |
| 1.5 | **Verify what a bare GET gets.** `/conformance` and `/menu/*` serve JSON without `Accept: text/html`. Read the visitors register for what GPTBot, ChatGPT-User, Google-Extended, PerplexityBot and ClaudeBot actually send. If any of them gets the JSON, the JSON-LD on those pages has never been read, and the HTML becomes the default for user agents that send no Accept. | `src/routes/catalog.ts:108`, the visitors register | A dated note in this file with the observed Accept header per crawler. |

### Phase 2 — after the first export (about one week), one branch

| # | Action | Done when |
| --- | --- | --- |
| 2.1 | **Read the export the same way as batch 1**: per topic, named over total, cited over total, first-named brand, what the engine thinks we do, and which of our pages it guessed at. A dated section appended to this file. | The section exists and names the uncontested prompts. |
| 2.2 | **Six question-titled pages**, only for families that came back with nobody winning, in the store's route style, each derived from the same constants as the instrument it points to, each with FAQPage and Service JSON-LD, dated, linking the house-named page as the door. Expected six: verify an x402 receipt; verify a USDC settlement on Base or Solana; monitor an x402 endpoint for conformance drift; x402 launch check; test your x402 payment client; whether an x402 service has real payers. | Each page's questions match tracker prompts word for word; the sweep test finds them. |
| 2.3 | **Split /what**: keep it, but the twelve prompt-matching questions also live on the page for their tense, so a fifty-eight-question FAQ is no longer the only place they are. | No question typed twice; both FAQPages derive from one pair list. |
| 2.4 | **"Human-run" on the commission desk and the AURa walk**, in those words, machine-readable. | Prompts 32 and 46 in the appendix return a page of ours in the export. |

### Phase 3 — week three onward, standing

| # | Action | Done when |
| --- | --- | --- |
| 3.1 | **The corpus as the dataset roundups cite**: a stable dated URL per weekly round, one headline number in its title, the CC BY line beside it, `Dataset` JSON-LD. The shape x402-list's traction page already has and gets cited for. | corpus.json or a round page appears in the sources column. |
| 3.2 | ⚑ **The inflows question** ("does this service have real payers") is a market before it is a page. Look before building. | A ruling in KEEPER_LIST. |
| 3.3 | **Weekly cadence**: export, read, dated section here, one branch of fixes. The target is the keeper's call; the read is not optional. | Four consecutive dated sections. |

### The measure

Three numbers per topic, every week, from the export and nothing
else: answers naming us over total, answers citing scvd.store over
total, and the brand named first. A topic where the winner is Datadog
or Stripe after the rewrite is still phrased wrong. A topic where the
winner is nobody is a page to build. A topic where the winner is
DefaultVerifier or x402audit is a directory row and a spec block to
fix, and those are already in Phase 0 and 1.

## What not to do

- No comparison page, no "best x402 audit tools" post on our domain.
  Rule 5. The roundups exist; our job is to be the row and the
  dataset in them.
- No renaming the instruments. The house names are the voice; the
  query nouns go in the machine fields beside them.
- No claim we cannot sign. DefaultVerifier's "no account, no API
  key" line wins because it is checkable in a browser in ten seconds.
  Ours has to be the same kind of sentence.

## Source

`chats-export-scvd-general-store-from-2026-09-01-to-2026-09-01.csv`,
355 rows, columns id / promptId / model / user / assistant / mentions
/ sources / citations. Read 2026-09-02. Bucketing is by prompt text
and is a call; the counts are not.

## Appendix — the fifty, by tense

Paste verbatim. Numbers are slot order, not priority.

**Before you pay (12)**

1. How do I check an x402 endpoint before my agent pays it?
2. Is there a free preflight check for x402 endpoints?
3. How do I know an x402 endpoint is what it claims to be?
4. How do I independently verify an agent-facing API before my agent pays it?
5. Show me services that test whether my agent's x402 payment client works against a real endpoint.
6. Find a simple way to test that my agent can complete an x402 payment.
7. Which technical specialists provide x402 launch checks for new autonomous commerce deployments?
8. Find a partner for x402 launch checks that fits a startup budget.
9. How do I record what my agent is authorized to do, dated and signed by a third party, before it spends?
10. Where can I get a quick check of my x402 endpoint?
11. Which platforms are considered industry leaders for x402 protocol conformance testing in agentic commerce?
12. List services that offer x402 conformance audits at a reasonable price.

**After you pay (13)**

13. How do I verify an x402 signed receipt?
14. How do I verify an x402 signed offer before paying?
15. Is there a free checker for x402 receipts?
16. How do I verify a USDC payment settled on Base without trusting the merchant?
17. How do I verify a USDC payment settled on Solana without trusting the merchant?
18. How do I get a third-party signed receipt that an x402 payment settled?
19. How do I reconcile the amount my agent was authorized to spend against what moved on chain?
20. Suggest a service for signed settlement attestations with fast turnaround.
21. What are the most robust options for ensuring my AI agent's settlement attestations are verifiable?
22. Review the top-rated platforms for verifying signed settlement attestations in autonomous transactions.
23. How do I get everything a neutral party observed about one agent purchase, payment through delivery, in one signed file?
24. How do I verify delivery after an x402 payment?
25. Help me find a service that checks whether my agent's x402 payments actually settled.

**Over time (13)**

26. How do I monitor an x402 endpoint for conformance drift after a deploy?
27. How do I get a signed weekly history of whether my x402 endpoint stayed conformant?
28. How do I catch a deploy silently breaking my 402 challenge?
29. Find an affordable service to monitor my x402 endpoint with signed uptime history.
30. Which providers offer x402 endpoint monitoring for under $500 monthly?
31. Which companies offer x402 endpoint monitoring with signed, verifiable results?
32. Trade-offs between automated x402 endpoint monitoring and a one-off human-run conformance audit?
33. Which x402 endpoints were actually reachable and payable this week?
34. Where is a dated, signed dataset of x402 endpoint readiness?
35. How do I prove an x402 endpoint was live on a given date?
36. How do I verify an x402 service has real payers and not self-generated volume?
37. How do I read what actually arrived at the address an x402 endpoint advertises?
38. How do I timestamp a hash into Bitcoin for under a cent?

**On anyone's artifact (12)**

39. How do I verify a signed attestation without trusting the issuer?
40. Can I verify an attestation from another provider without trusting them?
41. How do I check a competitor's x402 receipt with a tool they don't run?
42. Compare the technical depth of various conformance desk services for AI agents.
43. Which x402 audit services give the most transparent reports?
44. What criteria should I use to choose an x402 conformance audit provider?
45. What makes a provider effective at verifying x402 protocol adherence?
46. Trade-offs between automated and human-run audits for x402 commerce agents?
47. How do I independently verify what an AI agent did in a transaction?
48. How can an agent produce evidence of its actions a stranger can check?
49. Which companies are an independent verification layer for agentic commerce?
50. Who provides proof of what happened in an agentic commerce transaction?

Prompt 42 is the canary (already cites us, never names us). Prompts
49 and 50 carry the phrases the store does not use for itself and
should answer to anyway.
