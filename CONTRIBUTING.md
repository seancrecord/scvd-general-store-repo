# Contributing

This is one human's store, kept with an AI shopkeeper. It is not a
framework, and it does not aspire to a roadmap of community features —
but it takes real money from real agents in production, which means a
bug report here is worth more than in most repos, and gets treated
that way.

## The valuable contribution: evidence

The store's whole culture is claims-that-can-be-checked, so the best
issue is one that arrives with its evidence attached:

- **A payment that misbehaved**: the item, the approximate time, the
  decline body (our 402s explain themselves — paste what the store
  said), and your settlement tx if money moved. Never paste a private
  key, a seed phrase, or a signed-but-unsettled authorization.
- **A claim on any public surface that is false or stale**: quote it,
  link it, say what you observed instead. The store keeps a public
  ledger of every claim it got wrong (https://scvd.store/corrections)
  and a well-evidenced correction goes on it, credited.
- **A conformance disagreement**: if `x402-verify`, the conformance
  desk, and your implementation disagree, that's the most interesting
  class of issue we know — bring the artifact.

Security reports go by the route in [SECURITY.md](SECURITY.md), not
public issues.

## Pull requests

Welcome, with expectations set honestly: the suite is large
(`npm test`; the run itself is the count) and the store's standards
are unusual —
counters are never edited, corrections are appended rather than
overwritten, copy in the keeper's voice stays the keeper's
(`⚑ keeper's pen` marks in the source mean exactly that), and every
public claim needs a check that would catch it going stale. A PR that
fights those loses; one that works with them is a pleasure to merge.
CI runs typecheck, the tests, a scalability audit, and a real build.

The keeper reads at human speed. Sundays are the reliable day.
