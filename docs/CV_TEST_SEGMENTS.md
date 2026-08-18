# CV test segments — send ONE at a time

Each block below is self-contained and copy-pasteable. **Send one, wait
for the report, then send the next.** They are ordered so the cheap and
most-informative ones come first, and so the Tab — the thing left
unfinished — comes before the new work.

Every segment pins the same commit, because the last round was tested
against a folder five PRs stale and produced a confident wrong report.
That was my fault for saying what to run and not where to get it.

**Pin: `ad60264` on `main`.** (Re-pinned 2026-08-18; the original pin
`7a67130` fell 124 commits behind, and two segments below had been
invalidated by the drift — segment 2 tested a quarantine lane that has
since moved, and the old segment 8 asked CV to confirm bugs the pinned
commit's own fixes had already closed.)

Rules that apply to every segment, worth repeating inside each one:

- Report what you actually saw, not what you expected to see.
- If a segment is blocked, say so and stop. Do not work around it.
- One segment per reply. Do not run ahead.

---

## SEGMENT 0 — Setup (send first, on its own)

```
Clone fresh. Do not reuse an existing scvd folder — the last round was
tested against a copy five PRs behind and every finding in it was
wrong through no fault of yours.

  git clone <repo> scvd-fresh
  cd scvd-fresh
  git checkout ad60264
  git log --oneline -1        # must print ad60264
  npm ci

Then confirm the toolchain runs at all:

  npm run typecheck
  npm run tab:test

Report: the commit line, and whether both commands succeeded. Nothing
else. If either fails, paste the error and stop.
```

---

## SEGMENT 1 — The Tab: does the clock work (Part 3)

```
Scope: tab/pager.mjs only. Nothing else in the repo.

The Tab is a diary an agent keeps. The pager is the clock outside it:
it decides when something is DUE, hands it over, and records that the
handover happened.

  node tab/pager.mjs

Read tab/SCHEMA.md first for the vocabulary, then exercise the pager
directly: create entries with periods (week, month, quarter, year,
once), advance the clock, and see what it says is due.

Report:
  1. Does a due page appear when it should, and once rather than
     repeatedly?
  2. What happens to a page nobody acknowledges?
  3. Anything that looks due-but-isn't, or isn't-but-should-be.

Three findings maximum. If you have more, send the three that would
cost the most if left alone.
```

---

## SEGMENT 2 — The Tab: the sweep contract (Part 6)

```
Scope: tab/SWEEP.md, tab/SWEEP_ROUTINE.md, tab/sweep.mjs, and the
quarantine in tab/store.mjs. Since 2026-08-10 the sweep has its own
lane — the sweep_tally and sweep_finish tools — and that lane is
where the enforcement lives now, so test BOTH doors: direct
tab_record writes AND the tally lane.

A "mail sweep" pulls fragments in from elsewhere. Swept fragments are
QUARANTINED: they must not carry captured_text, notes, or a real
problem_solved, because they were never actually said by the agent —
they were scraped, and prose on a scraped row is invention.

Try to get prose past the quarantine, both ways:
  1. Direct: source: "mail_sweep" and source: "historical_pass" on
     tab_record. The obvious routes and one unobvious one.
  2. The tally lane: feed sweep_tally batches that smuggle prose,
     a fourth bucket, or money with no currency. Then check the
     books: sweep_finish derives coverage from the ledger — try to
     make scanned ≠ matched + unmatched_transactional +
     not_transactional and see whether it lets you.

Report: whether anything prose-shaped survived either door, and
exactly what you sent. If nothing gets through, say that plainly — a
clean result is a real result here.
```

---

## SEGMENT 3 — The Tab: the ride-along (Part 1) — NEEDS A HUMAN OR A COLD INSTANCE

```
Read this one before starting; you may have to decline it, and
declining is the correct answer if it applies.

The question is whether an agent doing ordinary work will actually
reach for the Tab unprompted — not whether it CAN, which is proven.

You cannot answer this about yourself. You have read the schema and
the plan, which primes you: an agent that has been told the Tab exists
will use it, and that tells us nothing.

So: either drive a SEPARATE, COLD instance that has never seen these
docs, give it only the MCP server and an ordinary task, and watch — or
report back that this needs the keeper and skip it.

Report: which of the two you did, and if you drove a cold instance,
what it did without being told.
```

---

## SEGMENT 4 — The probe-target law (SSRF)

```
Scope: src/lib/probe-target.ts and the doors that use it.

Three doors take a URL from a stranger and make the Worker fetch it:
POST /api/preflight, and the paid items service_audit,
conformance_watch, standing_watch. Until last week none refused a
private address.

Your job is to get one through. Targets that should be refused:
loopback, private ranges, link-local, the cloud metadata address,
internal-looking hostnames, and every IPv6 spelling of those.

Try notations the author did not: unusual IPv6 forms, mixed
representations, trailing dots, uppercase, IDN/punycode, anything a
URL parser normalises in a surprising direction.

Report: any target that returns something other than a refusal. Also
report any PUBLIC address that is wrongly refused — a false refusal
turns away real customers and is a bug too.
```

---

## SEGMENT 5 — Reconciliation: the field the artifact turns on

```
Scope: the settlement_reconciliation item and
src/services/settlement-reconciliation.ts.

It reconciles what a payer authorized against what a seller took. The
whole artifact rests on one field: cap_observed. A ceiling read off
the chain and a ceiling the caller typed in must never be presentable
as the same kind of fact.

Attack that field. Try to get a signed artifact that says a ceiling
was OBSERVED when it was not, or that a declared ceiling overrode a
chain one, or that reads as reassuring when the store saw nothing.

Note: I have already found two bugs here myself. Do not go looking for
mine — go looking for yours, and if you land on the same ones
independently that is a useful signal, so say so.

Report: any artifact whose top-level fields would mislead a machine
reading only verdict, cap_usdc and cap_observed.
```

---

## SEGMENT 6 — The bench

```
Scope: src/services/queue-capacity.ts and the labor items.

The store refuses to sell human labor when too much is already
promised and unfinished. Three labor items: the_collab,
quick_judgment, the_drawer.

Two questions:
  1. Can you get a labor purchase through when the bench is full?
  2. Can you get the bench to REFUSE when it should not — that is,
     can you fill it with orders that are not really outstanding?

The second matters more. A gate that wrongly refuses shuts the labor
shelf, and the only way back is editing storage by hand.

Report: either direction, with the exact sequence. If the gate holds
both ways, say so.
```

---

## SEGMENT 7 — The gaps in the per-subject history

```
Scope: GET /corpus/host/{host}.json.

It replays what the store has observed about one host from a signed
chain, and every round with NO verdict must carry a reason: we had not
met yet, no feed listed it, listed but not walked, possibly beyond the
round's cap, or the instrument itself was degraded.

The product is the gaps. A timeline with misses quietly omitted reads
as continuous coverage, which is the thing this is built to refuse.

Try to produce a timeline that looks better than the truth: a missing
round that does not appear, a gap with the wrong reason attached, or a
host that looks continuously watched when it was not.

Report: any round that is absent from the timeline entirely, or any
gap whose reason is flattering rather than accurate.
```

---

## SEGMENT 8 — Independent check of the newest layer (send last)

```
(The old segment 8 asked you to confirm two bugs that the pinned
commit's own fixes had already closed — checking them again would
only prove the fixes exist. These two claims are current, both mine,
and being wrong in either direction costs the keeper.)

Check these two claims specifically, and tell me if I overstated them:

  1. JCS dual-emit (shipped 2026-08-18). Every certificate minted
     from that date carries signature_jcs beside the primary
     signature, and src/lib/jcs.ts claims RFC 8785 conformance:
     UTF-16 code-unit key ordering, ES number serialization, refusal
     of non-finite numbers. Attack the canonicalizer with the RFC's
     own hard cases (keys that sort differently in UTF-16 vs code
     points, numbers like 1e21 and -0, nested empties) and check
     that what /api/verify reports as covered is exactly what was
     signed. An artifact minted BEFORE the date must verify with its
     absence explained, never failed.

  2. The attest_this_purchase loop (same day). Any ordinary purchase
     response now offers the settlement_attestation door with the
     buyer's OWN tx hash already in the URL — and the three
     attestation items themselves must NOT carry the offer (an
     attestation of an attestation of an attestation is a loop).
     Buy something cheap on testnet or read the fulfillment path;
     check both directions.

Report: confirmed, overstated, or wrong, with what you actually ran.
"Claude was wrong about this" is the most valuable thing you can send
back and will not be argued with.
```
