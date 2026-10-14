# Spot Check additions and the counter note — September 30, 2026

The keeper authorized building all proposed additions to discover demand,
including the human handoff. This is one product-family experiment. Local
implementation is not a release, a production sale or evidence of demand.

## The shelf

- **Change Check** (`change_check`): host and `baseline_cert_id`, pointing to
  an earlier Spot Check whose signed original was retained. Starting price
  $0.005. Both original readings travel inside a newly signed comparison.
  Certificate binding, stored projection and both signatures are checked before
  accepting a baseline. Missing, tampered or wrong-host originals refuse
  without charge. Older Spot Checks without retained originals are not
  reconstructed from today's history.
- **Batch Spot Check** (`batch_spot_check`): `hosts`, a JSON array of two to
  ten distinct bare hostnames. Starting fixed price $0.01, including smaller
  batches, derived from ten Spot Checks. One signed manifest binds every
  signed reading. Instrument failure fails the batch before settlement;
  unknown hosts remain honest, named absence readings.
- **Research Comparison** and **The Good Buyer** already exist. They are
  conditional follow-ups for research-provider selection and client payment
  selection respectively; this work does not create substitutes.

The source of prices and bounds is `src/lib/spot-check-terms.ts`; the menu,
quote and follow-up derive them. All are separate one-off purchases.
No new live-observation engine, payment signer or background watch is added.

## Evidence and custody

Existing Spot Checks now retain their original signed record beside the
certificate, as do the two additions. `/api/spot-checks/{cert_id}` serves the
original free as JSON or HTML after checking the signature, projection and
certificate binding. Its URL may be shared by the buyer; submitted sets
are not added to the public corpus. The certificate ID is not a private
access token; the artifact route is public to anyone who knows it.

The current comparison distinguishes no new observations, new observations
with the same compared findings, changed findings, and not comparable.
A changed finding requires actual observation timestamps, the same exact
endpoint and the same named battery. It compares the latest verdict and
mutually present failed-check/advisory lists. It does not infer exact price,
address, network or continuous-coverage changes. Publication or request
timestamps cannot substitute for observation dates. Missing historical rows
or changed projections are not treated as continuity. The full source
records remain beside this deliberately narrow comparison.

Checkout prepares and journals new signed observations through the existing
recovery mechanism. Original bytes and certificate bindings survive retries.
No changed-result reconstruction is used for a retained paid observation.

## The counter note

A short note states the recorded observation, actual observation dates (or
explicitly unknown, never a substituted publication date), gaps, artifact URL and
an unresolved decision. Change Checks include their comparison conclusion.
One conditional next task includes its price and
reason. A bookmark contains the certificate, subjects and free history URLs
for a later session. There is no schedule, auto-renewal or automatic message.

The machine response names actual MCP shelf tools and their arguments;
missing endpoint URLs or host sets stay explicitly missing. It never
constructs an endpoint from a hostname. Browser results expose the note
outside raw JSON, show free history and a first paid option, and collapse
other jobs. Menu links carry known inputs into editable fields. The buyer
still starts and approves a separate purchase. The artifact page and
verification receipt retain a way back. All suggestions and notes sit
outside signed evidence and can change without rewriting its bytes.

The Spot Check human receipt uses optional handoff language instead of the
older generic instruction to send via a messaging connector. The receipt
heading no longer implies observed co-purchase behavior: suggestions are
conditional capabilities, not what other customers necessarily bought.

## Reading demand

The supplied September 30 snapshot recorded 134 outside-wallet purchases,
including 30 Spot Checks across nine wallets. One wallet made 12 Spot Checks
across eleven dates. Wallets are not people; those figures alone do not
identify subjects, intentions or causal upsell conversions.

Use the existing books, buyer signals and decline desk:

1. Review new-product purchases, distinct wallets and returning dates;
   separate same-session bursts and the largest wallet's share.
2. Inspect available retained Spot Check subjects and volunteered purposes
   to distinguish same-host checking, provider selection and experimentation.
   Missing historical originals remain missing.
3. `follow_ups` counts responses containing options by source product,
   with house purchases excluded. It does not establish impressions or
   understanding. Interrupted response retention can count a retry again.
4. `spot_evidence_read` counts original retrieval requests, including machine
   reads; it does not prove human sharing or comprehension. Existing receipt
   verification counters remain separate.
5. Follow-up URLs carry `source=spot-follow-up`, handled by existing source
   reporting. This is caller-declared, can be lost, and is not proof that an
   offer caused a purchase. No cookie or fingerprint is introduced.
6. Inspect input failures, paid delivery and retained-original availability.
   Report the research sweeper separately from plausible buyer friction.

The cheap shelf remains an entry point; free facts, freshness checks and
verification remain reachable. The experiment earns expansion through
useful paid work, not requiring another purchase to finish the first one.

## Validation

Initial regression: all five new product/continuation tests failed against
the original implementation. The browser visibility test also failed against
the original checkout, then passed after restoring the implementation.
Verified locally:
- TypeScript check and both Worker dry-run bundles passed.
- The checkout suite passed all 71 tests; a real-browser local example also
  showed the note, free option, primary next task and expandable alternatives.
- The latest seven focused files passed 36 tests, including both products,
  tampering, JCS signature corruption, lost-publication recovery, instrument
  failure before settlement, human-note dates and conclusions, demand counters,
  retry counting, and the MCP catalog budget.
- Eight broader discovery/checkout files passed 660 tests, including catalog
  agreement, the self-row guard, HTTP and MCP inputs, and browser visibility.
- The catalog-wide fixture now prepares an actual retained baseline where a
  product requires it. The replay assertion counts one new certificate in
  addition to that baseline; all nine Change Check Solana retry cases passed.

The completed full local run found catalog drift, baseline fixture assumptions
and load-related failures. The release pass fixes the catalog/refusal tables,
keeps Batch Spot Check in the standard cent-denominated catalog, and shares an
unchanged conditional-read header definition to stay within the OpenAPI budget.
The affected regression pass passed 1,041 tests; its two fixture failures were
fixed and passed in the next discovery pass. That pass passed 183 checks,
leaving only the intentional guide fingerprints, whose original values were
reproduced on unchanged main before repinning. A separate product and standard
checkout pass passed 142 tests. Prior recovery timeouts passed on rerun.

Full CI remains the release gate. No live purchase or external message is
part of this release; deployment follows the protected pull-request path.
