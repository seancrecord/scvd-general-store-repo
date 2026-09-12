# Why the listing kept reading 31 doors of 32 (2026-09-12)

The keeper's question came in as a side-note: launch_check sometimes
hangs on a bare probe, and x402-list has been counting 31 endpoints
instead of 32 all day. Both turn out to be one thing, and it is the
thing the doors Worker was built to fix — reaching two doors it was
never pointed at.

## What their history says

x402-list probes all 32 doors at once, every fifteen minutes, and
records how long the check took and how many endpoints answered in
time. Seventy checks ran between 01:00 and 19:26 UTC on 2026-09-12,
after the probe-rule correction had deployed and while every door was
healthy. The two numbers separate completely:

| endpoints found | checks | median check | range |
| --- | --- | --- | --- |
| 32 | 57 | 130 ms | 83–403 ms |
| 31 | 12 | 485 ms | 430–672 ms |
| 30 | 1 | 826 ms | 826 ms |

There is no overlap. Every check that found all 32 came back in 403 ms
or less; every check that found fewer took 430 ms or more. A door was
never broken on any of them — the door was late, and late is missing.

## Which door

Their per-endpoint `last_seen_at` names it without guessing. On the
19:26:33 UTC check, which found 31, thirty-one endpoints carry that
timestamp and one carries the previous check's: `GET
/api/buy/opening_day`. Its neighbour `launch_check` is the only other
door of its kind.

## Why those two

Those are the only two doors the doors Worker hands to the store
before answering. `handOverFirst` (src/lib/doors-app.ts) sent them
across on EVERY knock, because their purchase check asks whether the
field wallet exists and only the store holds that key — a doors Worker
that answered would mistake a secret it never receives for a closed
shelf.

The premise was half right. The field wallet is consulted in
`checkPurchaseArgs`, which runs for a knock that SUPPLIED its target.
A bare probe — the shape every directory, indexer and stock client
sends first — is routed to `checkPurchaseInputSafety` instead, one
knock short of that question. So the hand-over bought nothing on a
probe and cost the store's 4.29 MB cold start, the exact cost the
09-05 split removed for the other thirty doors
(research/x402-list-latency-2026-09-05.md: 430 ms cold penalty, and
"every check that ran slow also found fewer than 31 doors").

Thirty doors answered from an 843 KB script; two woke a script five
times the size, in the same burst, every fifteen minutes.

## What changed

The hand-over predicate is now the one `a2a_repair_kit` already used
on the line beside it: hand over when `url` is present, which is
exactly when the store-only capability is reached. It errs toward
handing over — a blank url is a probe the store will answer anyway.

`test/doors-cold-path.spec.ts` is the guard, and it tests the thing
the parity spec structurally cannot. Parity runs both Workers against
ONE env, so a doors Worker that secretly needed a store secret passes
it. The new spec deletes `FIELD_WALLET_KEY` from the doors env — the
doors Worker's real condition — and requires the bare probe to be
answered anyway, with byte-identical terms, with the binding never
touched, while a knock carrying `url` still reaches the store.

## What this is not

Not a fix for their EIP-712 row. That was one wallet spelled two ways
and is corrected separately, in the same branch. Not a claim about
their checker's patience, which is theirs to set and is not published;
the observation is only that our own latency is what decides whether a
door is counted, and two doors were paying a cost the other thirty had
already been spared.
