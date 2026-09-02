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
titled "Settlement Attestation, scvd.store", with a Service JSON-LD
that carries no Offer price. The hedges are right and stay. The
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

## What to do, in order

Keeper's hands are marked ⚑. The rest is a branch.

1. ⚑ **Fix the tracker before trusting another export.** Tracked
   brands are Target, Amazon, Etsy. Add scvd.store, SCVD,
   "Sean-Claude Van Damme's General Store", and the competitors that
   actually appear: DefaultVerifier, x402audit, vet402, Nevermined,
   x402-list, Proveria, Paybond, RankShield, Ledge. Without this the
   export cannot show share of voice.
2. ⚑ **Cut the prompt set to the shelf.** Drop the 18 off-market
   prompts. Replace "compliance" with "conformance". Add prompts the
   store already answers on /what and that nobody is asking the
   tracker: "check an x402 endpoint before paying", "is this x402
   endpoint legit", "free x402 conformance check", "verify an x402
   receipt signature", "prove an x402 payment settled on Base /
   Solana", "which x402 endpoints are live right now", "signed
   x402 uptime history", "cheapest Bitcoin timestamp for a hash",
   "x402 ecosystem dataset". Twenty to twenty-five prompts, all in
   buckets 2 and 3.
3. ⚑ **Rewrite the directory rows** (x402-list, glama, mcpservers,
   agentic.market, x402scan). Lead with the nouns and the price:
   "x402 conformance audit and signed settlement attestation,
   ed25519, from $0.004 per check; free preflight and conformance
   check on any issuer's artifact." The x402-list row also still
   carries the retired doctrine sentence ("Nothing here is a score, a
   rating, or a ranking"), which N7 already has on the desk as a
   press. Same press, one visit.
4. **Put the asked-for noun in `<title>`, meta description, JSON-LD
   `name` / `alternateName`, and the first sentence** of
   /menu/settlement_attestation, /menu/service_audit,
   /menu/conformance_watch and /conformance. H1s keep the house name.
   Add an `Offer` with the USDC price to every menu Service JSON-LD;
   the price is the thing ChatGPT's table needs and the one fact it
   cannot get from the paragraph.
5. **One spec-shaped block per paid instrument**, in the pattern the
   attestation winners use: what it attests, the cryptography, how a
   stranger verifies it, the price, what it does not attest. Five
   lines, derived from `MENU_ITEMS` and the attestation spec so the
   line is never typed twice. Above the existing description, not
   replacing it.
6. **Split /what.** Fifty-eight FAQ questions on one page, half of
   them in-voice ("How can I be issued a charm from a herd the keeper
   wrote"), bury the twelve that match real prompts. Keep /what as
   it is. Add one question-shaped page per bucket, "x402 conformance
   audit" and "signed settlement attestation", each with its own
   FAQPage of six to eight questions phrased the way the prompts are,
   answers derived from the same constants, dated.
7. **Make the corpus the dataset the roundups cite.** /corpus/brief
   exists. Give each weekly round a stable, dated URL with one
   headline number in the title and the CC BY line beside it, the
   way x402-list's dataset page does. Then ⚑ send it to the four
   roundup authors that Google already cites (digitalapplied, wavect,
   blocksec, fintechwrapup). One dated finding, the census figure of
   34 of 35 hosts serving no signed offer, is exactly what those
   posts quote.
8. **Verify what a crawler with no Accept header gets.** /conformance
   and every /menu/* serve JSON to a bare GET; the HTML with the
   JSON-LD only arrives with `Accept: text/html`. Read the visitors
   register for what GPTBot, Google-Extended and PerplexityBot
   actually send before changing anything. If any of them get the
   JSON, the structured data on those pages has never been read.

9. ⚑ **Apply the batch-2 rulings in the tracker**: 20 keep, 22
   rewrite as worded above, 8 drop, 8 slots refilled from the
   /what list. Four topics, not five, none of them memory or rails.
10. **A launch-check page and a practice-till page written to the
    query.** These are the two buckets nobody else sells into; the
    only thing between us and the default answer is that the words
    "x402 launch check" and "test your x402 payment client" do not
    appear in a title anywhere on the domain.
11. **Say "human-run" somewhere a machine can read it.** Prompts 22,
    29 and 43 ask about automated versus manual audits. The
    commission desk and the AURa walk are the manual side; neither
    page says so in those words.

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
