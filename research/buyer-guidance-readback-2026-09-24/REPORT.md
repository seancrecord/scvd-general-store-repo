# Buyer guidance release readback — September 24, 2026

The date, signed-scope and retention guidance merged in [PR #904](https://github.com/seancrecord/scvd-general-store-repo/pull/904)
is live on all six checked surfaces. This closes its public release-readback gate;
it does not close TR3 or qualify a new buyer cohort.

## Recorded observations

The installable verification skill returned HTTP 200 and matches
`skills/scvd-x402-verification/SKILL.md` at source `553ede019f08574ae65edfe359ce86a5251bc0c2` byte for byte:
13,136 bytes, SHA-256 `983538db2f8c0dd975e3c51a157a7d1e2a458039f36641bb2dc7451da239dae7`.
Normal and stable host-history JSON, HTML, negotiated Markdown and the `.md`
path all returned HTTP 200 and the exact shared `HOST_HISTORY_SCOPE.description`.
The comparison reads the declaration from source rather than keeping a second
expected string. HTML entities are decoded before comparing rendered copy.

The served guidance preserves missing observation dates as unknown, requires a
separate verified original for each authenticated week, and puts optional
acquisition notes/results in a shared journal while preserving required originals.

[Readback records](readback.json) retain request URLs, Accept headers, timestamps,
statuses, byte counts and hashes. Each record links its exact response body and
headers. [Collector](readback.py) performs only these six public reads and exits
unsuccessfully if any response fails or differs. It refuses to overwrite an
existing capture; supply a new dated output directory for another reading.

## Buyer milestone and next boundary

The earlier [September 24 cohort](../tool-errors-buyer-2026-09-24/REPORT.md) remains
**2 complete journeys / 4, two interpretation failures, zero incomplete**.
Its frozen source preceded #904, so it does not measure comprehension of this
newer text. All four offline recipients passed; their corrections do not repair
the original buyers' explanations.

The existing skill already cautions against guessing whether the signature covers
a digest or JSON bytes and directs readers to the verifier's format handling.
This readback introduces no duplicate wording, new verifier behavior or changed
acceptance rule. Whether readers correctly describe the actual signed message
remains a native-buyer acceptance question.

Next: a separately frozen plan, freshly qualified buyer and recipient hosts,
then a bounded cohort on the updated guidance. Preserve existing budgets, zero
spend, exact-subject matching, observation-age limit and one attempt per cell.
Check candidate evidence at freeze time: the previous September 14 observation
leaves its fourteen-day window September 28 at 01:30:09.376 UTC. New publication
or this readback cannot refresh that date.

No native sessions, payment, production writes, outreach or directory submissions
occurred. Public byte agreement does not attest the complete deployed Worker
revision, validate an original signature, or demonstrate buyer reliability.

## Validation

The six recorded live comparisons, captured-body/header hashes, collector syntax,
existing-capture refusal, typecheck and documentation check pass. The refusal
left all six retained response-body hashes unchanged.

The initial full-suite attempt could not bind its fixture server in the sandbox.
A permitted two-worker run reported failures in six unrelated files, with some
individual elapsed test durations extending to several minutes. A separate
one-worker rerun passed all six files and all 965 tests, with unchanged assertions
and timeouts. That rerun used an idle-sleep guard while the full run was still
active; the exact cause of the earlier timing/failure cluster is not established.

The remaining full local run was interrupted after those rechecks; it is **not a
completed full-suite pass**. [Validation](validation.json) preserves both outcomes
and raw-log hashes. Current repository policy permits focused checks before
commit; every full hosted CI shard remains required before merge. No native
buyer was launched during validation.
