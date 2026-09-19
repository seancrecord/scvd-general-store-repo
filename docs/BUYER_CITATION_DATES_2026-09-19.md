# Buyer evidence dates and the free history path — September 19

A retained buyer response named September 7 as the host observation date but
September 18 as `cite_json.observed_at`. The latter was snapshot publication.
The shared citation helper ignored a host row's separate observation timestamp.
That made the structured citation disagree with the history and its prose.

Host-row citations now use `observed_at` when supplied. The shared helper covers
host JSON, Markdown, HTML and reproduction citations. Reproduction comparisons
also retain the row's optional observation timestamp beside `taken_at`; callers
can see the two moments without inferring one from the other. Snapshot-only
citations and legacy host rows without a separate timestamp retain their
existing publication-date behavior. Signed snapshots are untouched.

The shared preflight ladder now carries a `free_signed_history` route beside
its fresh paid observation. It links the existing host lookup, issuer-key record
and guide, and keeps fresh probes behind spend authorization. Its paid-stage
scope no longer tells a zero-budget caller to stop with unsigned evidence.
Both preflight versions use the shared route.

The focused buyer skill also distinguishes free signed history from a fresh paid
observation. The history lookup is unsigned, but its cited signed snapshot and
the public issuer-key record are free. A zero payment budget does not prevent
checking them. This clarifies the earlier stop instruction after a buyer
mistook the payment boundary for the end of available signed evidence.

## Evidence and acceptance

The citation and comparison regressions failed before the source repair. They
use different observation and publication dates and cover host JSON, negotiated
Markdown, HTML and reproduction output. Compatibility checks preserve snapshot
and legacy behavior. The public corrections ledger records the date mismatch.

The separate September 19 capability failure was an agent-written OpenSSL
command passing hexadecimal text as signature bytes. An offline comparison
reproduced that failure, while decoded signatures matched the frozen vectors in
OpenSSL and Node. It is not a package-verifier defect and is not changed by this
repair. Its failed qualification and skipped buyer cells remain unchanged.

These changes do not alter experiment budgets, scores or acquisition records.
The routing clarification is an unproven usability hypothesis until a separately
frozen and qualified native run observes it. The active cohort retains its own
captured guide and dates; it cannot qualify this later guidance. Buyer acceptance
and the merchant/platform gates remain open on issue #803.

The citation/guidance-stage full local suite passed 793 files, with 15,145 tests
passed and one intentional skip. Both additional free-history regressions failed
against the old ladder before its repair. Final targeted checks and required PR
CI cover the subsequent routing change and integration with current main.

Final integration checks pass: 145 tests across 12 affected files, 236 buyer
harness tests, typecheck, both Worker bundles and the SDK bundle, documentation
and the generated corrections index. The [validation record](../research/buyer-date-routing-2026-09-19/validation.json)
distinguishes the full citation-stage run from final targeted validation and
retains log hashes. All required hosted CI checks still gate merge.

## Read-only verifier follow-through

The `/mcp/verifier` preflight projection removed the new `current_reading`
and `free_signed_history` fields along with its paid offers. The follow-through
preserves those two shared fields in both structured and text output. It still
removes purchase tools, purchase URLs and prices. OpenAPI also describes the
fields so generated clients can retain the unsigned-reading limits and free
historical route.

Before the fix, both not-ready and unreachable verifier responses omitted the
fields, and both OpenAPI field regressions failed. Historical evidence still
requires subject, signature and observation-age checks; this repair does not
establish a successful native buyer journey. After merge and public readback,
TR3 still needs a separately frozen, qualified cohort under its existing limits.

Follow-through validation: 48 tests across eight affected verifier, schema,
free-history and response-budget files pass, along with typecheck, both Worker
bundles, the SDK bundle and documentation checks. The new regression cases were
observed failing before the repair. All hosted CI shards remain merge gates.
