# scvd-defects — changelog

The minor version tracks the vocabulary version; patches fix the
package, never a definition. Versions are immutable once published.

## 0.18.0 — 2026-09-16

Vocabulary v18 adds `mpp-core-observable-invalid` for failed named checks
in the separately versioned draft-01 observable-core reading. Unmeasured
registry, binding and payment behavior remain explicit gaps. Historical
MPP battery assertions, discovery comparison and v17's paid launch-check
signal keep their meaning. No registry publication is performed here.

## 0.17.0 — 2026-09-15

Vocabulary v17: `advertised-version-unpayable` becomes obtainable.

No definition changed. The class's assertion, falsifier, costs and
boundary are byte-identical to v15 — what moved is `our_signal`.

It named `walkabout ledger: advertised_version_unpayable`, a file in
the store's own research directory. A class marked `detectable: "paid"`
says the finding exists on the other side of money; pointing the buyer
at field notes tells them somebody saw it once. The signal now names a
stage of an instrument a buyer can commission, with the ledger kept
beside it because that reading is still real and still reproducible.

The comparator is unchanged and so is the rule that it never returns a
quiet clean: a refusal carrying no readable challenge reads `not
checked`, which is a different fact from `not present`.

## 0.16.0 — 2026-09-15

Vocabulary v16: `surface-contradicts-challenge` now includes
the paid audit's separate MPP discovery comparison. Each observed challenge
is compared with every advertised alternative on the exact GET operation.
A difference requires stable terms at both reads; dynamic or omitted fields,
unreadable metadata and changing terms remain explicit gaps. The x402
assertion and all previous vocabulary entries are retained.

## 0.15.0 — 2026-09-13

Vocabulary v15: adds `advertised-version-unpayable`.

A door that answers a correctly signed payment, presented in the
protocol version its own challenge advertises, with that same offer
re-served — so the buyer that followed the instructions is the one
that cannot pay, no money moves, and the door has no failed payment to
look at. Found by paying, on a walk of a real door during a protocol
migration; the operator confirmed it and found the same version-keyed
read on three more of his own surfaces.

The class is narrower than the finding, and the narrowing came from
that operator. The comparator reads five material terms (scheme,
network, payTo, asset, amount) rather than the whole offer, so a door
carrying a per-request nonce, expiry or rotating timeout is not scored
clean by accident. And the assertion does not reach the variant where
a door ACCEPTS the newer version, settles, delivers, and logs nothing
because its request log keys on the older header: nothing buyer-side
can observe that, so this class does not claim it — the repair hint
names it as a separate fault instead.

## 0.14.1 — 2026-09-13

Package fix, no definition changed: the shipped fixtures now carry the
provenance fields the tree's copies gained after 0.14.0 went out.

Every fixture under `fixtures/` declares `source` — one of
`simulated`, `observed`, `derived` — and `captured_at`, the date the
bytes were taken from a live door, or `null` for a constructed shape.
The vocabulary is the one agreed on x402-foundation/x402#3396, so a
fixture here reads beside a row from that corpus without translation.
`scvd.store/fixtures.json` serves the same fields, plus the freshness
half (`last_verified_at`) that only the deploy can know.

Why this is a patch and not a minor: vocabulary v14 is unchanged, and
no class moved. 0.14.0 was published two hours before the provenance
change merged, so its fixture copies were behind the tree at the same
version number. A new guard in the store's own suite
(`registry/npm-content.json`, cut by `npm run npm-content:cut`) now
refuses to record changed package content under an unchanged version,
so this particular drift cannot recur silently.

## 0.14.0 — 2026-09-12

Vocabulary v14: adds `re-challenges-spent-authorization` and amends
`replay-accepted`.

The new class is the receiver-side defect the x402 specification
thread measured in seven of ten money paths (x402-foundation/x402#3325,
#3437): a door that answers a byte-identical, already-settled payment
with a fresh payment challenge, so a buyer who lost the response is
asked to sign, and pay, again. Registered as source, not author.

`replay-accepted` no longer asserts that the replay "is refused". It
asserts the replay is not served as a new sale: refused, or answered
with the original purchase naming the settlement that paid for it.
The store's own till re-delivers rather than refuses, and by the old
letter the registrar exhibited its own class. The v13 text stays
readable in the vocabulary changelog.

New in the package, beside the vocabulary: `settlement-response.js`,
a zero-dependency reader for a SettleResponse (the PAYMENT-RESPONSE
header a buyer holds, or a facilitator's `/settle` body), and
`fixtures/settlement-responses/`, twelve shapes each naming the
checks it fails and the outcome a reader must reach. The pending
shapes are the negative control: a reader that maps `success:false`
to failed fails them. Battery `settlement-response-v1` reads the
merged v2 specification only; the draft status vocabulary on #3325 is
ignored until it merges.

## 0.13.0 — 2026-09-07

Vocabulary v13: `cleared-not-examined` keeps its assertion and loses
its falsifier. No class moved, no other definition changed.

v12 read `checks.assessed_for` as the check's published coverage set.
It is the check's subject — the principals whose exposure the statuses
describe, the payer rather than the sender on a relayed transfer. The
examined set is derived from that field, not equal to it: the
`assets_moved[].to` whose `.from` appears in `assessed_for`.

The v12 rule misfired on ordinary transfers, where the recipient was
screened but is absent from `assessed_for`, reporting unscreened about
an address the check had examined. The correction is 0200project's,
against the line in their own source, found by running the rule rather
than reasoning about it. The v12 text stays readable in the vocabulary
changelog, which is where withdrawn definitions live.

The derivation holds on relayed settlements. Non-relayed transactions
and any transaction carrying an approval are shapes it does not reach,
stated in the entry rather than noted beside it.

If you pinned 0.12.0 and built on that falsifier, this is the upgrade
that matters.

## 0.12.0 — 2026-09-06

Vocabulary v12: adds `cleared-not-examined`, the second evidence label
and the first since Cairn's. A claim carrying a check's passing status
about a subject that was never in the set that check examined — the
status is true of the check, and says nothing about the subject.

Sourced to 0200project (github.com/0200project), who found it in their
own product and disclosed it unprompted. The falsifier is theirs: read
the check's published coverage set and treat any subject absent from it
as unscreened, whatever the status says. Exact on plain, relayed and
batched settlements; over-fires on approvals, and that boundary is part
of the finding.

No class moved, and no existing definition changed.

## 0.11.0 — 2026-09-04

Vocabulary v11: eleven classes for the Machine Payments Protocol's
challenge, one per MPP battery check that can fail, each sourced to the
specification's own MUSTs (github.com/tempoxyz/mpp-specs, draft-00).
No x402 class moved.

## 0.10.0 — 2026-09-03

First publish, roadmap C5, carrying vocabulary v10 (seventeen classes,
one evidence label, both halves of the remediation on every class) and
the nine recorded door fixtures. `defectClass`, `defectsBySignal`,
`remediationFor`, `byDetectability`, `fetchLatest`, `isStale`.
