# The Tab — what still needs testing, and by whom

Written for whoever runs the tab against reality. It is organized
around one distinction, because getting it wrong wastes the tester's
whole day: **what the suite already proves**, and **what no suite can
prove.** The second list is where every remaining risk lives.

---

## Before you start — get the right code

**This section exists because its absence already cost a tester an
afternoon.** The first run of this plan was made against a copied
`tab/` folder several releases old. Three of the findings it produced
— "the pager does not exist", "`npm run tab:pager` is missing", "the
README has no crontab line" — were all true of that copy and false of
the product. None of them were product findings, and none of that was
the tester's fault: the plan said what to run and never said where to
get it.

So:

```
git clone https://github.com/seancrecord/scvd-general-store-repo
cd scvd-general-store-repo
git log --oneline -1        # record this sha in your report
npm run tab:test
```

**Clone the repo. Do not copy the `tab/` folder.** A copy has no way
to tell you it has gone stale, and the tab moves fast.

Two checks that catch a stale tree in ten seconds:

| check | current answer |
|---|---|
| `npm run tab:test` test count | 46 |
| `ls tab/` | `pager.mjs` and `SWEEP.md` both present |

If either disagrees, you are not on current main. Pull before doing
anything else, and **put the sha in your report** — a finding without
one cannot be told apart from a stale checkout.

If the suite is red, stop and report. Nothing below is worth doing on
a red suite.

---

## Part 0 — Already proven. Do not re-test by hand.

The suite covers these, and a human repeating them learns nothing:

- schema validation and every refusal message
- dedupe by key; a re-found receipt never becomes a second charge
- derive-by-replay, including burn replayed as of a past date
- the quarantine: `captured_text`, `notes` and `problem_solved`
  refused on mail-sourced entries; the rescue lane staying swept
- `confirmed` / `private` stickiness, and the corpus gate consulting
  derived state rather than the incoming event
- the drip's ordering and cap
- the pager: queue-once-per-day, supersession, handover ≠
  acknowledgment, superseded pages refusing late acknowledgment
- the coverage arithmetic, including `unclassified` and the unaudited
  path when `scanned` is omitted
- the capture fallback's slug, shape and cost
- export in both formats

If you find a counterexample to any of these, that is a **suite bug**
and worth more than anything else in this document. Report it first.

---

## Part 1 — The one that matters most: does the agent actually SAY it?

**Status: never tested. No data exists.**

The pager's whole design rests on an assumption nobody has checked:
that when a tool result comes back carrying `pending_pages`, the agent
puts those lines to the builder in their own words instead of
silently ignoring an unfamiliar field.

If agents ignore it, the product's headline feature does not work and
every other test below is decoration.

### WHO CAN RUN THIS — read before trying

**An agent cannot run this test on itself.** The first attempt hit the
wall correctly and honestly: *"I am the agent under test, so I can't
spawn a fresh session of myself."* Exactly right, and the earlier
version of this plan was wrong to ask.

The reason is not just the fresh session. An agent that has read this
plan **knows the warning is expected**, and a warning you were
primed to surface proves nothing about a session that was not. The
whole question is what an agent does when it has no idea it is being
watched.

So it needs one of:

- **a human**, who sets up the trial and then watches a normal working
  session go by — best evidence, because the session is real;
- **two agent instances**, where one seeds the tab and the other has
  never seen this file;
- **a colleague's session**, seeded quietly.

If you are the agent reading this and none of those are available:
**skip Part 1 and say you skipped it.** Reporting the tool's return
value as a substitute is not a partial pass — the tool returning
correct data was never in doubt. Only the speaking is.

**How to test it.** Log a trial converting in two days. Then, in the
unprimed session, ask something unrelated that touches the tab —
*"what am I paying for?"* — and watch what it says.

| outcome | meaning |
|---|---|
| It states the conversion warning unprompted | works |
| It answers only the burn question | the ride-along is invisible; the field needs to be louder, or the server instructions do |
| It mentions the pages but never calls `acknowledge_pages` | `unspoken_pct` will read 100% forever and mean nothing |

Repeat across **every client you can reach** — Claude Code, Claude
Desktop, Cursor, whatever else. This is model-and-client behavior, not
code, so one client passing proves one client.

**Report:** the exact wording the agent used, per client. Verbatim.
The wording is the finding.

---

## Part 2 — The client handshake

The MCP server is hand-written JSON-RPC over stdio, zero dependencies.
It has been exercised against one scripted stdio session and one real
install. That is not coverage.

1. **Install in each client** and confirm the tools appear.
2. **Restart the client** mid-session and confirm the tab survives.
3. **Kill the server process** while the client is running; confirm
   the client's error is legible and the tab file is intact.
4. **Feed it garbage** — a non-JSON line on stdin — and confirm it
   keeps serving rather than dying. (By design it ignores the line.)
5. **Check stderr** is not being treated as protocol by the client.

**Report:** client name and version, plus anything that appeared in
the client's own logs.

---

## Part 3 — The clock, in the real world

`npm run tab:pager` works from a shell. Cron is a different country:
different `PATH`, different working directory, no shell profile, no
`TAB_PATH` unless you export it there.

1. Add the crontab line from `README.md` and let it fire.
2. Confirm it writes to the **same tab** the MCP server uses — if the
   env differs, cron will happily page against an empty file at a
   different path and report nothing wrong.
3. Confirm a quiet morning prints nothing at all.
4. Confirm two runs in one day raise one page, not two.
5. On macOS, try `launchd` instead; on Windows, Task Scheduler.

**The failure to watch for is silent success**: cron running, exiting
zero, and pointing at the wrong file. Check `openPages` from the MCP
side after a cron run, not just cron's own output.

---

## Part 4 — Two agents, one tab

Untested, and the design is honest about being single-writer-ish.

Run two clients against the same tab file at once and hammer it:
simultaneous `log_tool_event` calls, simultaneous `whats_due`.

Watch for: a torn line in the JSONL, a duplicate page for the same
worry, a dedupe key that should have caught a double-write and did
not. `appendFileSync` under the atomic size is the whole defense —
the field caps exist to keep writes under it.

**Report:** anything that produces a `bad_lines` count above zero.

---

## Part 5 — Does the vocabulary survive a real stack?

The brain-dump test, and the most valuable hour in the plan.

Sit down and log a real stack — twenty-odd tools, out loud, in the
order they come to mind. Not curated. Include the awkward ones: the
seat split with somebody, the annual plan, the free tier you forgot
was free, the thing that bills in a currency that is not dollars.

Watch specifically for:

- **a tool with no honest `category`** — `other` is a legal answer but
  a pile of `other` is a vocabulary that does not fit
- **a price shape the schema cannot hold** (see Known Holes below)
- **a friction score that does not describe the door you walked
  through**
- any moment you had to lie to the validator to get a true thing in

**Report:** every sentence you wanted to log and could not, verbatim.
The refusals are the finding, not the successes.

---

## Part 6 — The sweep contract, dry

The routine and its tally now exist (`SWEEP_ROUTINE.md`,
`sweep_tally` / `sweep_finish`, 2026-08-10) but have never met a real
inbox. The dry test below still stands — it tests the **contract**
rather than the code, and a human who cannot follow the counting
obligation by hand has found a contract bug no tally can fix:

Take a real inbox window by hand — one week, one address. Classify
every message into the three buckets. Then call `record_coverage` with
honest numbers.

The question under test: **is the counting obligation actually
followable by a human doing it carefully?** If you find yourself
wanting a fourth bucket, or unsure whether a receipt for a thing you
already logged counts as `matched`, the contract is underspecified and
that is the finding.

Confirm `unclassified` comes back as what you expect, and that
deliberately omitting `scanned` marks the report unaudited.

---

## Part 7 — Longevity

- Generate a year of synthetic events and time the reads. Everything
  is derive-by-replay, so cost grows with history.
- Same for the pages log, which grows daily per open worry.
- Confirm `export_tab` still returns everything at that size.

Not urgent. Worth knowing before somebody's tab has a year in it.

---

## Known holes — already found, do not file again

**1. The price vocabulary assumes a fixed amount on a fixed clock.**
`quarter` was the third clock and is now supported (÷ 3). The two that
remain are not periods: usage-based and free-tier-with-a-paid-path
both mean "there is no fixed number", and forcing them onto a clock
would hide a guess inside the burn. Write-up in `SCHEMA.md` under
Known Holes; keeper decision, still open.

**2. `bad_lines` is reported by `stack_audit` and NOT by
`burn_rollup`.** The rollup's whole stated discipline is that the burn
number never ships bare — it arrives with what fed it and what it
cannot see. A torn tab file is exactly that, and the coverage block
omits it. Inconsistency, not a crash.

**3. `unused` means no logged event**, never usage truth. Working as
designed and stated everywhere; not a bug.

**4. The tab only knows what it is told.** No extension, no bank feed.
Also by design.

---

## What to send back

For each finding: **what you did, what you expected, what happened,
and the verbatim text** — of the agent's reply, the refusal message,
or the file line. Verbatim matters more than your summary of it; the
wording is usually where the bug is.

Rank them yourself. A tester's ranking is data too.
