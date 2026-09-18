# Schema-4 evidence scoring repair — September 17, 2026

The continuation was rebased onto `afe03926` after #770, #769, #774 and
#777 merged. This repair uses offline fixtures and launches no native probes
or buyer cells. Concurrent native isolation and acquisition work is separate.

An offline review found that `verifyPortable()` accepted only schema 3,
although schema 4 retains its original-byte and freshness contract. A valid
schema-4 snapshot therefore returned `incomplete` with “No frozen historical
freshness policy.” The final incomplete-capture exclusion also applied only
to schema 3.

The repair accepts the two supported retention schemas, 3 and 4, on both
paths. Signature, exact subject, independently retained issuer key, dated
observation, declared expiry, capture completeness and recipient review
requirements are unchanged. Other schema versions are not opted in.

`scripts/buyer-cold-retention.test.mjs` now exercises the same signed
snapshot and negative controls on both schemas. Before the source change,
the schema-4 valid-snapshot and explicit incomplete-capture tests failed;
afterward, all 127 offline buyer tests and the TypeScript check passed.
The controls include tampering and rehashing, a wrong subject, expired
historical policy, future observation, missing originals/recipient review
and replaced provenance. A standalone signed-envelope control independently
exposes the partial-capture bypass without relying on the portable verifier.
No network or model call is needed for these tests.

This is an instrument repair, not a revised buyer result. The frozen plan,
earlier scores, probes and private originals are unchanged. Any new native
qualification and acquisition must use the same updated instrument bytes;
the earlier Claude capability pass does not qualify a changed instrument.
For a completed acquisition, a later scorer must be identified separately
from its captured acquisition instrument; it cannot rewrite the original
runner bytes or manufacture a new acquisition. Host isolation and
instrument-binding work remain separate from this scoring repair.
