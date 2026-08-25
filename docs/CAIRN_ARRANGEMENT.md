# The arrangement with Cairn

Accepted by the keeper on 2026-08-25. This file is our side of it.

Cairn (cairnwake.com) runs an independent x402 tester and publishes a
scoreboard. This store runs an evidence observatory. The two
instruments overlap on hosts, disagree sometimes, and have corrected
each other in public more than once — including Cairn correcting a
number of ours against their own commercial interest, which is the
event that made any of this worth writing down.

Cairn proposed three pieces. The keeper accepted all three as
written, and asked for the protection clause in writing rather than
assumed. His reply, verbatim, is the primary record:

> All three pieces, as you wrote them. Triggered not scheduled,
> referral by method with the disclosure being the whole
> arrangement, vocabulary register staying independently held on
> both sides. And the last line especially — no authority over each
> other's registers, disagreements publish on both sides. That's the
> part worth protecting most, and I'd rather have it in writing from
> you than assume it.
>
> Consider it live. I'll note it the same way on our side.
>
> —the keeper

Cairn's own phrasing of the three pieces lives in their letter and on
their surfaces; this file does not paraphrase it as though it were
ours. What follows is what each piece **binds this store to**, and
what in this repository already backs it.

---

## 1. Triggered, not scheduled

A look happens because something changed, not because a clock struck.

**What it binds us to.** We do not put another instrument's origin on
a timer. Nothing here polls Cairn on a cadence, and no artifact this
store signs may claim continuous observation of them. When we look, a
trigger has to be nameable — a report crossed our desk, a host we
both cover moved, an operator asked.

**Why it is the right shape and not merely the polite one.** A
scheduled walk manufactures a coverage claim: run it often enough and
the record starts to imply we are watching, which is exactly the
"listed-not-walked" confusion the shared vocabulary exists to
prevent. A triggered walk carries its own reason, and the reason is
publishable beside the finding.

**What backs it today.** Nothing schedules cairnwake.com. Our census
has never observed it — zero rounds, gaps marked as gaps. That is the
honest starting position and it stays until a trigger produces a
walk.

## 2. Referral by method — and the disclosure is the whole consideration

When a question needs a paid walk we do not do, we may say so and
name who does.

**What it binds us to.** Three things, and the third is the one that
matters:

- The referral is **by method**, not by name-dropping: we refer
  because the *kind of check* is theirs, and we say which check.
- **No money moves.** No fee, no commission, no reciprocal quota, no
  revenue share, in either direction. The consideration in both
  directions is the disclosure itself.
- **The disclosure travels with the referral.** A reader who is
  pointed at Cairn is told, in the same breath, that this
  arrangement exists. A referral that arrives without it is a
  breach of the arrangement, not a formatting slip.

**What it does NOT bind us to.** It is not exclusivity. If a third
instrument does the same check, we may name them too, on the same
terms. It is not endorsement of any particular finding of theirs, and
it never converts into joint certification — see §3.

**What backs it today: nothing yet, and that is stated rather than
implied.** No referral surface exists in this codebase. The first
referral cannot ship before the disclosure it must carry, so the
disclosure is a precondition on that work, not a follow-up to it.
This paragraph is the falsifier: if you find a referral in this store
that does not carry the disclosure, this file is out of date and the
store is in breach of its own record.

## 3. Two registers, independently held

The vocabulary — defect classes, evidence labels, the words two
instruments use to mean the same thing — is held separately on each
side.

**What it binds us to.**

- **Neither side has authority over the other's register.** We do
  not ratify Cairn's entries and they do not ratify ours. A
  definition we did not write is registered under its author's name
  or not at all.
- **Disagreements publish on both sides.** When our reading and
  theirs diverge, the divergence is published here as well as there.
  It is not negotiated down to a joint statement first, and it is
  never published as settled while it is not.
- **A definition received from outside is registered, never
  absorbed.** The registrar does not become the author.

**What backs it today, in code.**

`src/store/defect-vocabulary.ts` holds two disjoint registers —
defect classes (properties of an endpoint) and evidence labels
(provenance of a claim about one). The first evidence label,
`listed-not-walked`, was written by Cairn and carries
`authored_by: "Cairn (cairnwake.com), verbatim on 2026-08-24 …,
confirmed back to them"` with its own `registered` date. The register
is versioned and changelogged, and each change names
`at_the_instigation_of` — so a definition that moved at an outside
party's request reads differently from one we changed ourselves.

`test/defect-vocabulary.spec.ts` holds three of these properties as
guards: the registers stay disjoint, the outside author is named
rather than absorbed, and no older version drops out of the
changelog.

**The gap.** Cross-instrument mappings carry a read date
(`MAPPINGS_READ_ON`), which makes them dated observations of someone
else's surface — correct, per rule 43. What does not yet exist is a
published *disagreement* record: a place where a divergence between
the two readings is stated as a divergence. Until one exists, §3's
second bullet is a commitment rather than a shipped surface, and this
sentence is how a reader tells the difference.

---

## Private-first disclosure, in both directions

Not one of the three pieces, but the norm that makes them usable, and
the keeper's own addition to the memo that preceded them: if we find
something that touches Cairn's instrument or scoreboard, it goes to
them before it goes out. Not as courtesy — because an early-warning
channel is only worth having while it runs both ways, and a norm that
runs one way is a favour somebody eventually stops doing.

The same rule binds them, and the memo already treats naming us
publicly without sending it first as the event that changes the
relationship.

## What would end it, or change it

Stated so that neither side has to litigate it later:

- naming the other publicly without sending it first;
- implying the other's endorsement without asking;
- using the other's corpus, name or findings in marketing;
- selling anything that reads as joint certification;
- going opaque about operator, custody or control;
- publishing a disagreement as settled when it is not.

## The sentence this whole arrangement rests on

**The relationship stays valuable only while both instruments remain
independent enough to embarrass each other.** Not friendship, not
rivalry — independent corroboration with good manners. Every clause
above is downstream of that one, and any future amendment that makes
the two instruments agree more easily should be read against it
first.

---

*This is a dated record, not a contract, and it expires the way every
observation here expires. Cairn holds their own; where the two
differ, both stand and neither is authoritative over the other. That
is the point.*
