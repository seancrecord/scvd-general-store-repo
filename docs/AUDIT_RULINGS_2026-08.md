# THE AUDIT'S RULINGS — drafted for the keeper's word, 2026-08-28

Seven asks, each one thing he can answer with a word. Written in the
NOW-entry shape so a ruling moves straight into KEEPER_LIST.md with
his own words quoted beside it; nothing here is canon until it does.

Where they came from: the instrument audit
(`docs/INSTRUMENT_AUDIT_2026-08.md`) and the fixes merged under it
(#311). The audit's own §6 priced every unclimbed rung; the depth
pass then climbed the ones that were free and needed no ruling. What
is left is what costs money, changes criteria, or speaks in his
voice — which is exactly the set that is not mine to decide.

**How to answer:** a word per item is enough. "1 yes T1, 2 yes, 3
yes, 4 hold, 5 conditions: …" and so on. Anything unanswered stays
unbuilt.

---

## 1. RULE: the payTo inflow reader, and which G2 tier it publishes at

**The ask.** We have captured every door's payTo since 2026-08-20,
under a comment that says why: "USDC inflows to a published payTo
are the first honest signal of whether anyone PAYS an ask, not just
quotes one." Nobody has ever read those inflows. The readers exist
and run daily — pointed at our own wallets and at $2-statement
customers, never at the addresses we file weekly.

**What it costs.** $0 USDC, no payment, no consent question — public
chain state, bounded getLogs windows on machinery already built.
~8–12h. Nothing is spent and nothing of the subject's is burned.

**What it buys.** The one question the whole registry cannot answer
today: does anyone actually pay these asks? It is also the lane the
landscape doc names as a competitor's "genuinely novel capability"
(PulseFeed's payTo drift; x402-list logged 1,069 rotations in 90d),
and the G2 ruling already governs how it may be published:

- **T1** — counts, no names ("N of the doors we walked received USDC
  at their published payTo this week"). Free, aggregate, nobody named.
- **T2** — a per-host fact on that host's own page, with the
  shared-wallet caveat that ruling already requires.
- **T3** — named evidence, which is the specced-but-unbuilt
  Provenance Check, a paid lane whose price is your K3 call.

**If no.** The capture continues and stays unread; the field keeps
its comment and the comment stays aspirational.

**My recommendation.** Build the reader, publish **T1 only**, hold
T2 and T3 until you have seen a few weeks of what it actually shows.
T1 is the honest floor and cannot defame anybody.

Yes / no / conditions — and which tier.

---

## 2. RULE: L3c, verifying offer signatures on the endpoint path

**The ask.** The conformance desk verifies signatures on artifacts
people paste in. No probe instrument verifies a live door's offers:
the battery checks that a signed offer PARSES and says so plainly
("Signatures NOT verified here"). So a forged signed offer served in
a live 402 reads `ready` from every probe we run, free or paid.

**What it costs.** $0 USDC. The ward round already stores the
challenge bytes and captured `signer_kids` since 3.1, so this can
run as a desk pass over stored bytes rather than a new probe —
+1 cached did:web GET per offer-serving host per round. ~8–16h.

**What it buys.** The rung our own product names are closest to
overclaiming: the "Conformance Watch" is the thing a buyer is most
likely to read as signature-checking, and its copy carries the
qualifier in one adjective.

**If no.** The gap stays honestly labeled and structurally open —
which is defensible, and is what we do today.

**My recommendation.** Yes, as an asynchronous desk-verify over
stored bytes, published as four labeled outcomes (verified / failed
/ issuer_unreachable / not_served) and folded into NO verdict yet —
the census cannot afford live resolution, and a fold the census
cannot run splits the v2 citation (the 2.5 defect).

Yes / no / conditions.

---

## 3. RULE: the L3d burst on paid watches

**The ask.** Every observation we take is one GET, from one vantage,
on a predictable cron phase, with one signed identity. A door that
flaps between probes, or that cloaks against a known prober, reads
100% ready all week. B5/B7/B8 have specced the fix for weeks with no
roadmap row and no ruling.

**What it costs.** $0 USDC; 3× fetch volume where applied (on a $5
watch, ~336 extra GETs across seven days). ~8h.

**What it buys.** The standing watch stops being 168 identical looks
and starts being a distribution — the difference between "answered"
and "answers reliably."

**If no.** Watches stay single-probe and say nothing about it; the
honest fix would be a line in the watch history admitting one
identity, one phase.

**My recommendation.** Yes, on **paid watches only** — consent is
already in hand there ("name your own door; that's a rule of the
house"). The census stays single-probe until the etiquette ceiling
(Observatory §12.3) is ruled: bursting 750 strangers' doors is a
different question from bursting a door somebody paid us to watch.

Yes / no / conditions.

---

## 4. RULE: does anything from the depth pass fold into a verdict?

**The ask.** The depth pass shipped five new readings, all
**advisory, outside every verdict**: EIP-712 domain-extra
signability, conflicting amounts on one rail, header-vs-body
placement mismatch, the resource-host mismatch (the bait-and-switch
shape), and USDC's blacklist on the EVM rails. Two existing v2 folds
were also deepened — the amount grammar and the frozen-token-account
read — and those DID change what v2 can fail a door on.

A fold is not a code change; it is a criteria change. It renames the
battery on every artifact issued under it and starts a new
comparable series. That is your call by the frozen-series law.

**What it costs.** Nothing to hold. A fold costs a version bump and
a changelog line, plus the census's ability to run whatever gets
folded (the EVM blacklist read cannot fold — the census's subrequest
budget and the free preflight's one-request promise both refuse it).

**My recommendation.** **Hold all five.** Let them ride as
advisories for a few rounds and see how often each fires on real
doors. `resource-host-mismatch` is the one most likely to deserve a
fold on the merits — a challenge naming another host is not a door a
buyer can safely pay — but folding a check we have never seen fire
in the wild is how you get a v3 that fails honest doors in week one.

Hold / fold one or more (say which) / conditions.

---

## 5. NOW-6 restated: what the depth pass changed underneath it

**Not a new ruling — a nudge on the one you have had open since
2026-08-18.** The settlement-attempt lane (real spends at strangers'
doors) is still yes/no/conditions, unchanged in cost: ≤$0.05 a probe,
about $1 a week for a 20-door sample, machinery built, OFAC screen
fails closed, aggregate-only publication, private notice to the host
on failure.

What changed is what sits BELOW it. The depth pass climbed three
cheaper rungs that were unbuilt when you opened NOW-6 — the frozen
account, the EVM blacklist, the amount grammar — and items 1–3 above
are three more that cost nothing to climb. Every one of them answers
a piece of "can this door actually take money" without spending any.

**My recommendation.** Rule items 1–3 first and let the sampled-
purchase lane wait for the evidence they produce. If the free rungs
show that most doors fail before money is even possible, the case
for spending changes shape — and if they show the opposite, that is
the argument FOR the lane, made with data instead of appetite.

No answer needed today; NOW-6 stays open and stays yours.

---

## 6. RULE: the registry's dropped coverage fields (rule 52)

**The ask.** The weekly round records its own coverage honestly —
`capped`, `coverage_suspect`, `coverage_drop`, and the population
layer's `coverage_pct`. `buildRegistryWeek` drops every one of them
at publish, so /registry says "knocks once on every door listed in
public x402 discovery" over a walk capped at 750, with no way for a
reader to know the reading was a floor. That is rule 52's shape on
the public page.

**Why it needs your word rather than my hand.** `RegistryWeekEntry`
is the stored shape of every published week. Adding fields is
additive and safe; the question is whether the published page should
start carrying coverage caveats at all, which changes what /registry
IS — a tally, or a tally with its own limits printed beside it.

**What it costs.** ~3–4h, additive fields only, no stored week
rewritten (old weeks simply lack them, which reads correctly as "not
recorded then").

**My recommendation.** Yes — carry the round's coverage fields
through to the entry and print the caveat under the tally when they
fire. The page already says what it cannot see in its method
section; this puts the number's own limit next to the number.

The other two open audit rows I intend to just do, unless you say
otherwise: per-row `observed_at` on long-walk weeks (the fresh set
currently stamps assembly time on rows probed up to six days
earlier), and extending the CI dogfood so our own door is proven
under v2, not only v1.

Yes / no / conditions.

---

## 7. YOUR PEN: two pieces of copy I wrote that are yours

Neither is a ruling; both are sentences I changed in your voice, and
rule 7 says drafted-not-canon until you touch them.

**a. The Night Watch line.** It said the hourly probe tries the
handle so that "a buyer could pay." It never checked that — the
watch runs v1 structural checks and no payability check at all. I
recut it to say shape, not payability, and to point payability at
the free v2 preflight by name. The shelf comment marks this line as
yours to amend. Read it and cut it however you like; the only thing
that must stay true is that it does not promise a check the battery
does not run.

**b. The seven corrections.** Filed on your confirmation, in
`src/store/corrections.ts`, each citing a mechanism that exists. But
I wrote the words, and that page is the one place in the store that
is supposed to sound like a person admitting something. Read them
once. Anything that reads like a machine apologising, rewrite — the
facts are checkable in the diff and the tests, so only the voice is
at stake.

---

*Drafted 2026-08-28 by the instrument audit, after #311 merged and
main went green. Nothing in this file is canon; it is a list of
questions with recommendations attached. On a ruling, the entry
moves to KEEPER_LIST.md with the keeper's own words, and this file
records that it was moved.*
