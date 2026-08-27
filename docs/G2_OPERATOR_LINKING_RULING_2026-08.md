# The G2 ruling: operator linking, wallets, and where linking stops

**Ruled by the keeper, 2026-08-27.** Recorded the same day. This is the
privacy/attribution ruling that roadmap 3.6 and the evidence-layer
ledger (G2, G-privacy) required before any operator-linking build.
Amendments are the keeper's alone; the spirit below governs any change
to the letter (house posture, 2026-08-27: rules are guidance and may
change — the spirit of what they convey is what goes into any decision
to change them).

## The question

Subject identity today is a host string. The corpus already captures
the two strongest evidence-based linking signals — the same `payTo`
address appearing across different hosts, and (once key capture lands)
the same signing key — and never joins them. Joining them is identity
resolution, not scoring, but it walks toward rule 43's line: an
accumulating record keyed to an actor. The keeper was asked to draw
where linking stops.

## The ruling

### 1. Facts, never the call

The store publishes observed payment-address facts. It never publishes
an `operator` field, never asserts that two doors share an operator,
and never builds a surface whose only reading is that assertion. "The
address this door advertises also receives at N other doors this week"
is a dated observation a stranger can re-derive; "same operator" is an
inference, and the inference belongs to the receiver — we provide the
wallet fact, and it is the receiver's call to make.

The one obligation that follows: the caveat rides the fact, inline, on
every surface that shows it. Custodial wallets, platform checkouts,
and facilitator-managed payTo addresses make strangers look like one
operator; a cross-host fact served without that sentence is a call
wearing a fact's clothes. Same discipline as the fresh set's "routing
data, never a ranking."

### 2. The tiers (staged, each stage reversible until published)

- **T0 — capture.** Record key identity (`kid`, key-first-seen) and
  payTo per host at probe time. New rows only, preimage law: legacy
  rows keep byte-identical preimages forever. Capture is free at probe
  time and uncollectable later; it publishes nothing by itself.
- **T1 — public counts, no names.** "N payment addresses receive for
  more than one door this week; largest cluster: M doors." Market
  structure with denominators, no addresses, no hosts. The same play
  as the replay census: a number nobody else has, publishable without
  naming anyone.
- **T2 — the per-host fact.** On a door's own corpus/passport surface
  only: "the payment address this door advertises also receives at N
  other doors this week," with the shared-wallet caveat. A fact about
  THAT host; no other door is named. Buyer-protective, dossier on
  nobody.
- **T3 — named evidence, by consent or by purchase.** The named join,
  with full evidence and snapshot digests, exists in exactly two
  forms: an operator's own self-declared cluster (consent — proven by
  wallet-key signature or a well-known file, and it strengthens their
  passport; the store's own /house-ledger.json is the precedent), or a
  signed, dated artifact a customer buys (the provenance check;
  pricing is a K3 keeper gate like all pricing). A paid artifact is a
  dated observation delivered to a buyer, not a public accumulating
  record.
- **T4 — a full public evidence graph over operators: not built.**

### 3. Chain hygiene

Going forward, new signed rows carry a salted digest of payTo;
verbatim addresses live only in the MUTABLE derived views. The digest
still proves reuse (anyone holding the address can verify it; nobody
can enumerate the list), and erasure stays possible without unsigning
anything. Existing chain rows stand as history — the keeper accepts
the standing rows and changes the practice forward, per this ruling.

### 4. Transparency is the proof

Every published fact names the snapshot digests it derives from: where
we gathered, how, and to a degree what it signals — and the "to a
degree" is stated, not smuggled. The answer to "prove it" is the same
answer the store gives everyone: here are the signed weeks, here is
what your door served verbatim, re-derive it with your own tools.
Proof without posting, where needed, uses the same machinery: salted
digests, hash commitments (publish the commitment, reveal only if
warranted), and signed private artifacts delivered to the party who
asked.

### 5. The standing-note lane (review, change, dispute — self-serve)

Anyone who proves control of a wallet (sign a challenge with its key)
or of a host (serve a well-known file) may attach a **standing note**:
a dated statement that rides beside the store's observation on every
surface that shows it — their words beside ours, never replacing the
observation. No keeper in the loop for the common case.

Disputes that a note cannot settle escalate to the keeper, with three
recorded outcomes: **correction** (we were wrong — corrections desk,
dated), **context** (right but incomplete — note added), or **stands**
(recorded either way). An erasure request can drop a verbatim address
from the mutable views; the chain keeps digests only.

### 6. The boundary, restated

Nothing public accumulates keyed to a named actor. No scores, ever
(rule 43). The strict rule guards the FREE PUBLIC surface; the paid,
consented, and private lanes flex without touching it — which is also
where the ruling serves the house rule about not making it hard to
get paid: the expensive scenario this ruling prevents is the
misattribution suit, not the modest sale.

## What this unblocks

- Roadmap 3.6 becomes buildable as: T0 capture (G3 kid + key-first-seen,
  payTo digest), the T1/T2 derived views in 3.5's derive-at-read style,
  and the standing-note lane. The T3 provenance check is specced
  separately and priced at the K3 gate.
- The `identity_binding` battery unblocks in its same-origin +
  declared-identity form; the cross-origin binding GRAPH stays inside
  this ruling's tiers.
- The horizon item "evidence graph over operators" is bounded by T4:
  not built.
