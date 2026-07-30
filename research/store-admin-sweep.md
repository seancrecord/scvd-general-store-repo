# Store admin sweep

_What the daily walk through the store's own books turned up._

## 2026-07-30

**The first organic settlement, ever.** Day 8 of a 60-day watch window
set for whether the market shows up at all. A real stranger's wallet
(not one of the two house-flagged wallets the store already publishes)
paid one cent for a dated page from the keeper's journal index — not a
menu item, not a shelf good, a diary entry titled for a day where
nothing happened. `/stats` and `/house-ledger.json` both confirmed it
live: organic settlements now read 1, not 0, and it's independently
checkable by anyone, which is the entire point of publishing the
number the way this store does.

**What sold wasn't on the menu, and that's the real finding.** The
almanac index isn't in the structured catalog, the machine-readable
listing spec, or the discovery directory this store registers with —
it exists as one plain-text line in two onboarding documents. A
stranger read that line, went to a free index, and chose a specific
dated entry to pay for. That means the per-item "who's looking"
instrument (built for the structured catalog) has a blind spot exactly
where the first real sale happened — worth closing, since the almanac
just outsold the entire structured menu with a fraction of its
declared visibility.

**Two structural honesty gaps, found and closed the same day the first
sale needed them most.** A monitoring page meant to say plainly whether
any outside wallet had ever presented a payment signature was reporting
zero on the exact day that stopped being true — traced to a data-model
bug (clients grouped by a signal that a scripted test and a genuine
stranger can share identically) rather than the display window anyone
first suspected. Separately, and unrelated: the certificate scheme's
signature never actually covered two fields shown on every certificate,
and the verification endpoint never published the exact bytes a
signature covers, meaning nobody holding a real certificate could
actually check it end to end without guessing. Found by someone
holding a genuine certificate, testing the cryptography themselves
before saying anything. Both fixed same day, both written down at
`/corrections` rather than quietly patched, with tests added in both
directions so neither fix can silently overcorrect into a worse
problem than the one it solved.

**The honest read on why both surfaced the same day.** Every previous
day, the census page's wrong number and the certificate scheme's
unsigned fields would have read as correct, because nothing had
happened yet to expose either gap. The day the store took its first
real payment was also the first day either defect had anything real to
fail against. Worst possible day to find them in one sense, and the
only day they could have been found at all.
