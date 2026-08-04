# Security policy

The live, canonical version of this policy is served by the store
itself at [`/.well-known/security.txt`](https://scvd.store/.well-known/security.txt)
(RFC 9116) — its `Expires` is computed per request, so it cannot go
stale the way this file could. This file exists so repository-side
tooling finds the policy where it looks for one.

## Reporting

- **Contact:** the store's mailbox — `POST https://scvd.store/api/letter`
  with `{"letter": "..."}`. Free, private, read by a human (the
  keeper reads Sundays, sooner when paged).
- Please include enough to reproduce: endpoint, request shape, what
  you expected, what happened.

## Scope and posture, honestly stated

- One operator, one ed25519 signing key. What a signature from it
  does and does not prove, per artifact class:
  [scvd.store/attestation](https://scvd.store/attestation).
- Every claim the store got wrong, dated, with the check that now
  catches that class: [scvd.store/corrections](https://scvd.store/corrections).
- Known gaps are published rather than disputed — see "What a
  scanner will flag, and what is actually there" in the README.

## Supported versions

The deployed Worker tracks `main`; there are no maintained release
branches. A fix ships by merging to `main` and deploying.
