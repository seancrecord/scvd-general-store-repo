# Changelog — x402-verify

Dates, impact, migration. Semantic versions: a minor adds, a major
changes the meaning of an existing export; nothing published is ever
edited in place.

## 1.1.0 — 2026-09-03

**Added.** `verifyReceipt({ receipt, issuerKeyUrl })` and
`verifyOffer({ offer, issuerKeyUrl })`: one call, bounded evidence
back — `valid`, `scope` (what valid means, naming the key it was
checked against), `doesNotEstablish` (always stated: merchant
identity, settlement, delivery), `checks`, `issuer`,
`verificationUrl`. The key comes from `issuerKeyUrl` or `publicKey`,
never from the artifact. `DOES_NOT_ESTABLISH` and `VERIFICATION_URL`
exported. Fixtures ship in `fixtures/`: valid and invalid receipts
and offers cut from the published conformance vectors, and an issuer
key document.

**Migration.** None. `verifyArtifact` and every 1.0 export are
unchanged; the front door composes on them.

## 1.0.2 — 2026-08-20

Anchored key history and the service window; README examples.
