# Pending ClawHub republish — prepared, not published

Rule 30 keeps publishing in keeper hands. The bundle is ready; the
command is yours.

**Published now:** v2.10.0, from commit `929d17d`, published by the
keeper on 2026-08-10. (This file first said 2.9.0 — written before that
run's record reached main, and corrected once it did.)

**Prepared:** the bundle in `registry/clawhub/SKILL.md` on this branch.
`SKILL_VERSION` in `src/store/spec.ts` is bumped to **3.0.0**, which is
what the publish script compares against.

**The timing is the point.** 2.10.0 went out on the morning of
2026-08-10, and the gate flipped that afternoon. So the bundle sitting
in ClawHub's catalogue right now was correct when it was published and
became false a few hours later. Nobody did anything wrong; this is just
what a static document in someone else's catalogue does.

## Changelog line

> The trust tier arrives in the bundle: audits, watches, settlement
> attestations and reconciliations, Bitcoin anchors, the free
> preflight battery, and the signed corpus with its per-subject query.
> The Tab (`scvd-tab`) is listed as a second MCP server. And the
> delivery ordering is CORRECTED — the store delivers first and
> settles after as of 2026-08-10; the published bundle says the
> opposite.

## Why this one is urgent rather than routine

The live bundle tells readers **"The store settles first, then hands
over the goods."** That stopped being true on 2026-08-10. It is not a
stale sentence — it tells a buyer that a failed delivery leaves them
owed a refund, when in fact they were never charged. It sends people
chasing money nobody took, in someone else's catalogue, where we
cannot correct it.

## What changed in the bundle

- **Delivery ordering corrected**, with the old rule quoted and dated
  rather than deleted, and a pointer to `/becoming`.
- **The verification tier**, which the published bundle does not
  mention at all: `service_audit`, `conformance_watch`,
  `settlement_attestation`, `attestation_bundle`,
  `settlement_reconciliation`, `bitcoin_anchor`, and the free
  `/api/preflight`.
- **The corpus and the per-subject query** —
  `/corpus/host/{host}.json`, the gap vocabulary, the published
  coverage ratio, and the deliberate refusal to compute a reliability
  score.
- **The Tab**, `scvd-tab`, a second MCP server that appears on no
  listing anywhere. Free, MIT, local; the pooled layer named as
  direction rather than stock.
- **The refund promise** now points at the order's own page, which
  says when a window was missed and what is owed — and still says
  plainly that nothing about the payment is automatic.
- **The description** leads with the practice counter (the keeper's
  2026-08-02 ruling, guarded by `skill-parity.spec.ts`), keeps the
  any-issuer conformance claim, and carries the trust-layer position
  in its second clause. Under the 60-word trigger-phrase ceiling.

## Also worth a republish elsewhere

`scvd-tab` reached npm on 2026-08-10 (v0.4.0; 0.4.1 carries the
README a stranger actually reads) — so "clone the repo" stopped being
the only door. It is still on **no** MCP directory: the store's own
`/mcp` is on Glama; the Tab is not. That is pure distribution at
near-zero cost and it is a separate keeper action from this one
(Glama and peers index by npm package name or GitHub URL — the
submission is a form, not a build).
