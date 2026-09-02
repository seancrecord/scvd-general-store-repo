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
