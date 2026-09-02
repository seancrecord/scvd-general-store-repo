# Byline draft — "34 of 35 x402 hosts served no signed offer"

Draft for the keeper's name, for dev.to (tag: x402, ai, webdev) or
HackerNoon. Dated finding, reproducible by anyone, links the corpus.
Every number in it must be re-read from the live surfaces the day it
posts; the ones below are from the 2026-08-03 census as the
conformance page states it. ⚑ His voice, his edits; this is the
shape.

---

**Title:** 34 of 35 x402 hosts served no signed offer. Here is how to
check yours in one request.

**Standfirst:** I run an x402 store where the customers are AI agents.
In August I pointed a free checker at every host on the public x402
discovery list. One of them tried to sign its offers. Its signatures
did not parse.

---

x402 is the HTTP 402 payment flow Coinbase and Cloudflare revived for
agents: request a resource, get a 402 with the price and the address,
pay, retry. It works. Thousands of settlements a day go through it.

What it does not do, by default, is commit the seller to anything
before the money moves. The 402 says "this costs $0.01, pay here."
Nobody signed that. If the price changes between the challenge and
the settlement, or the payTo address was swapped by whoever sits
between you and the origin, the buyer finds out after paying, if at
all.

The x402 spec has an extension for exactly this: signed offers and
signed receipts. A JWS over the offer, Ed25519, with a key the seller
publishes. A buyer holds a commitment it can check before paying,
against a key anyone can fetch, without asking the seller. It is the
cheapest trust signal a seller can ship.

**So I checked who ships it.**

On 2026-08-03 I sent one GET to every host on the public x402
discovery list, 35 hosts, and read the 402 each one returned. The
checker is free and public, so the whole thing is reproducible by
anyone with curl:

```
curl -X POST https://scvd.store/api/preflight/v1 \
  -H 'content-type: application/json' \
  -d '{"url":"https://your-endpoint.example/api/thing"}'
```

The result:

- 34 of 35 hosts served no signed offer in the challenge header that
  probe reads. (Offers placed only in the 402 body were beyond that
  instrument's read; the v2 probe reads both now.)
- The one host attempting signed offers served JWS that failed to
  parse before a verifier could read a single field.
- My own door was not in the 35. A census cannot probe its own host,
  and leaving that out flatters nobody but me, so I am saying it.

I am not going to name the 34. The point is not who; it is that in
August 2026, a buyer paying an x402 endpoint on the public list was
paying against terms nobody had committed to, essentially everywhere.

**What a signed offer costs to ship**

Almost nothing. Two packages exist for it, zero dependencies, any
issuer:

- `x402-sign` mints spec-conformant signed offers and receipts for
  your 402s and generates the did:web document your key lives at.
- `x402-verify` checks anyone's, including mine.

If you would rather not install anything, the conformance desk at
https://scvd.store/conformance takes a pasted offer or receipt from
any issuer and returns a structured verdict: parse, schema, signature
against the key its kid names, liveness. Free, no account, and it
checks a competitor's artifact exactly as readily as mine.

**What I will do next**

The census runs weekly now and the rows are published, signed, and
anchored into Bitcoin, at https://scvd.store/corpus. Every week's
round says how many hosts were reachable, how many were payable, and
how many served a signed offer, with the denominator beside every
number. If the 34 becomes 30 by October I will say so, and if it
becomes 35 I will say that too.

If you run an x402 endpoint: run the check above on your own door. It
takes one request. If it comes back with no signed offer, you are in
the 34, and the fix is an afternoon.

---

*Disclosure: the store in this piece is mine. It sells signed
observations to agents for fractions of a cent and publishes the
gaps in its own coverage on the same page as the findings. The
census, the checker and the corpus are free.*

---

## Notes for posting

- Link the earlier pieces at the end: the AURa piece on HackerNoon,
  and the dev.to piece (URL needed).
- The two numbers to re-read on the day: the host count on the
  discovery list, and the latest round's signed-offer count from
  /corpus/brief. If the latest round differs from 34 of 35, lead
  with the latest and cite August as the first reading.
- Canonical URL: if it posts to both sites, set dev.to's canonical to
  the HackerNoon URL or the reverse; two copies without a canonical
  split the citation.
