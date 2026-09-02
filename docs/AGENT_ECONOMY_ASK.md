# The Agent Economy ask — two letters and a ruling

Drafted 2026-09-02, the day André at Agent Economy Report
(contact@agenteconomy.report) answered the keeper's question about
the 66%. Written so the keeper can send it (rule 30 — outward sends
are his hand). Nothing here changes code; the code half shipped the
same day (the ward round's `stale` reading, `test/ward-round.spec.ts`).

## What the number is

Their availability figure is not uptime. Once a day they read every
resource the x402 discovery catalogs announce under `scvd.store` and
ask whether it still answers 402. As of 2026-09-02 the catalogs list
33 resources. 22 answer 402. 11 answer 410: `a_secret`,
`app_gutcheck`, `dibs`, `grudge`, `human_witness`, `nomenclature`,
`phantom_check`, `phone_call`, `portrait`, `quick_judgment`,
`the_drawer` — the retired shelf (`src/store/retired.ts`), each
closed on purpose on 08-05 or 08-20. 21 or 22 of 33 is the 66%.

Eight of the eleven have been 410 for the whole 17 days they have
tracked us. The figure was the ceiling from their first day, not a
decline. The "outlook" arrow is a different signal (week-over-week
on-chain settlement and distinct payers to the payTo wallet) and
uptime does not move it.

Menu doors today: 31. Doors the catalog carries that are on the menu:
22. So 9 doors have never settled and are not in the catalog at all;
the ward round's `our_doors.missing` names them on the next round.

## Why "re-register without the retired items" is not a thing we can do

The CDP facilitator catalogs a resource the first time it settles a
payment for it (PAYMENT_RAILS.md, "How CDP discovery actually admits
an endpoint", verified 2026-08-04). There is no submission, edit, or
removal API. We never registered anything; sales did. Every door we
ever sold through the Bazaar is still there, and 13 days of 410 with
Deprecation, Sunset and a successor Link on every response has not
moved a row. The catalog does not honour the headers. Neither does
their prober. Hence the two letters.

---

## §1 — To André (methodology)

**Subject:** Re: scvd.store availability — a proposal on 410 + Sunset, and a question on the 33

Hi André,

Thanks for pulling the raw logs. Your reading is right: the 11 doors
answering 410 are products I retired on Aug 5 and Aug 20, and the
catalog still carries them. Nothing on our side is down.

One correction on the fix, and one proposal.

**The fix isn't on our side either.** We never submitted those
entries. The CDP facilitator catalogs a resource the first time it
settles a payment for it, and there is no submission, edit, or
removal API that I've been able to find. So "re-register without the
retired items" isn't a thing an operator can do. I'm writing to
Coinbase to ask them to drop the 11 URLs, but I have no signal they
will, or when. Could you send me the exact 33 resource URLs you're
probing and which catalogs you read them from? I'd like the letter to
Coinbase to name the same rows you see.

**The proposal.** Every retired door here answers 410 with the
retirement stated in standard headers, not just in our JSON body.
Here's one, verbatim, from this morning:

    HTTP/2 410
    deprecation: @1787184000
    sunset: Thu, 20 Aug 2026 00:00:00 GMT
    link: <https://scvd.store/api/buy/the_mandate>; rel="successor-version"

That's RFC 9745 Deprecation, RFC 8594 Sunset, and a successor Link. A
prober that honors any of the three can tell a deliberate retirement
from a dead endpoint without knowing anything about the store behind
it. My ask: score a 410 carrying a Sunset date as "retired" and drop
it from the availability denominator, rather than counting it as a
failed probe. Keep counting bare 410s, 404s, and 5xx as down, because
that's exactly what they are.

This isn't special pleading for our number. The catalog can't report
its own rot, operators can't edit it, and every store that ever
retires a product will hit the same wall. The headers are the only
channel an operator has to say "closed on purpose" in a dialect a
prober already speaks, and right now nobody's listening on it. If your
methodology honored them, you'd be the first directory that did, and
you'd also be publishing a cleaner signal: "dead" would mean dead.

If you'd rather see the full body of one of those 410s, or want to
reconcile against our own logs, happy to send whatever's useful.

Best,
Sean

---

## §2 — To Coinbase CDP support (the catalog itself)

**Subject:** x402 Bazaar: request to remove 11 retired resources under scvd.store

Hello,

I operate scvd.store, an x402 seller settling through the CDP
facilitator (payTo 0xdd35…9bd0 on Base; Solana rail as well). The
Bazaar discovery index currently lists 11 resources under my host
that I retired on 2026-08-05 and 2026-08-20. Each answers HTTP 410
with RFC 9745 Deprecation and RFC 8594 Sunset headers and, where one
exists, a successor Link:

    https://scvd.store/api/buy/a_secret
    https://scvd.store/api/buy/app_gutcheck
    https://scvd.store/api/buy/dibs
    https://scvd.store/api/buy/grudge
    https://scvd.store/api/buy/human_witness
    https://scvd.store/api/buy/nomenclature
    https://scvd.store/api/buy/phantom_check
    https://scvd.store/api/buy/phone_call
    https://scvd.store/api/buy/portrait
    https://scvd.store/api/buy/quick_judgment
    https://scvd.store/api/buy/the_drawer

I have not found a way for an operator to remove or edit a discovery
entry, and third-party directories that mirror the Bazaar are scoring
these rows as outages. Could you remove them, or tell me the supported
way to do so? If the index can honour a 410 with a Sunset header on
its own, that would settle this for every seller, not just me.

Thank you,
Sean Record
Record Creative Co. LLC

---

## §3 — The ruling on the 11 doors (keeper's)

Until a catalog drops them, four positions exist. The shopkeeper's
recommendation is the first.

1. **Leave them shut.** The 410s are right, the headers are right,
   and the ward round now records the stale set weekly so the corpus
   carries the fact. The 66% stands until §2 lands or André's
   methodology changes. Costs nothing and reverses nothing.
2. **Reopen them** the way `daily_fortune` came back on 09-02: same
   thing, same copy, same price, 402 again. Recovers the number in a
   day and reverses two rulings the demand data supported.
3. **Successor 402s** on the eight doors with a `folded_into`: the old
   URL quotes the successor's terms and delivers the successor's
   product. Honest to the buyer (they get what the Link already
   pointed at), recovers 8 of 11, but every settle re-announces the
   old URL, so the catalog would carry two doors for one product
   forever.
4. **Answer 402 and refuse at settle.** Never. A price quoted on a
   door that cannot sell is the defect this store sells checking for.

## What this does not fix

The other nine: menu doors the catalog has never learned, because
nothing has ever settled on them. Registration is one house buy each
(REGISTRATION_RUN.md); their adoption signals exclude captive
wallets, so the buys cannot flatter the grade, only widen what an
agent can find. That is a run on the desk, not a letter.
