# SCVD Attestation pilot

Implementation prepared October 7, 2026, following the keeper's “lets do it then.”
Release authorized October 7: “make sure the ui is right but then merge push.”
Customer activation and invoicing remain separate from releasing the software.

## The offer

One public x402 endpoint, a 30-day observation term, scheduled daily checks,
a final signed JSON report, a readable report page and a human handoff.
$300 USD, invoiced after final delivery. No automatic renewal. The executable
terms live in `src/store/evidence-pilot.ts`; page, request email and commission
read them from there. The brand remains SCVD Attestation under scvd.store.

Buyer: an operator preparing a customer or internal review of its public payment
interface. This is a demand hypothesis, not evidence of purchases. The success
condition is a buyer using the delivered report in that review and requesting a
second period. Do not build retention tiers or subscription billing from traffic
or a complimentary pilot alone.

The first term deliberately narrows the initial AI-decision compliance proposal.
It does not ingest lending, hiring or triage decisions, evaluate legal compliance,
provide real-time alerts, or promise multi-year retention. There is no external
Bitcoin timestamp proof on this report. Existing public endpoint instruments are
reused; no claim is made that they observe an agent's internal decisions.

## Buyer path

1. `/evidence-pilot`: scope, price, limitations and a visible unsigned example.
2. “Request this pilot” opens an email draft to the existing store contact. It
   asks for the public URL, review question, intended recipient and deadline.
   It sends nothing automatically and does not charge or activate anything.
3. The keeper agrees the endpoint, price, start time and **public** publication of
   observations. Private URLs, query strings, fragments and customer credentials
   are refused. If the buyer needs private decision records, this offer does not
   fit; do not collect them to qualify the lead.
4. At the agreed start, use `/admin/evidence-pilot`. The existing admin gate and
   same-origin checks protect the form. Tick the agreement only after receiving
   it from the buyer. Keep the returned link in the customer correspondence.
5. The existing hourly sweep runs the daily conformance checks. No payment is
   sent to the endpoint. Existing probe guards and durable watch recovery apply.
6. At term end, download the final report using its `?download=1` link, verify it,
   retain a copy, hand it to the buyer and explain any gaps. Then send the agreed
   invoice using the keeper's normal invoicing process. Neither invoices nor
   customer emails are automated by this build.

A duplicate form submission retains its pilot id. The durable journal refuses
conflicting terms. On storage failure, retry that form; do not open another form
and create a second engagement. The activation page currently supports immediate
starts only, so press it at the agreed time.

The endpoint URL and observations are public, including the existing
`/api/conformance-watch/{watch_id}` history. The export is also public by id.
No buyer names, email addresses, invoice details or review notes enter it.

## What the report commits to

`/api/evidence-pilot/{watch_id}` returns a signed snapshot of the retained record;
HTML is a readable view and JSON is the verifiable export. Its `generated_at` is
when this export was assembled, not when the observations occurred. Subsequent
exports can have different signatures and generation times. Retain the delivered
file, not just its URL.

- The signed commission binds the endpoint, term, price and public-observation
  agreement asserted by the keeper. It is not a payment receipt or the buyer's
  cryptographic signature.
- Every observation retains its original signed bytes, signature, key and time.
- Coverage counts completed 24-hour slots from the agreed start. Multiple checks
  within one slot cannot cover another slot. Unreachable, refused and unresolved
  results do not count as successful conformance observation coverage.
- Findings distinguish changed checks from changed criteria. Changes do not
  establish legal violations; missing coverage never establishes compliance.
- The export signature covers all report rows and gaps. Editing or deleting a
  row invalidates that export. This is not an externally anchored append-only
  journal, and does not prove the issuer never omitted evidence before signing.
- Storage or signature verification failures produce an unavailable response,
  not an empty or favorable report.

Independent offline check, with a public key established separately from the file:

```sh
node scripts/verify-evidence-pilot.mjs report.json TRUSTED_PUBLIC_KEY_HEX
```

The verifier uses Node's built-in cryptography, not the store's serializer or
signing library. It checks the signature, digest and agreement between the signed
payload and displayed report. It does not establish the issuer's identity unless
the supplied public key was independently established, nor the truth/completeness
of the observations. The JSON export describes verification without this script.

## Signing repair included

The JCS regression reproduced invalid sparse-array output, native-object data loss
and acceptance of invalid Unicode. New tests were observed failing before the fix.
The canonicalizer now visits array holes, rejects native objects until callers
explicitly convert them to JSON data, rejects lone surrogates in keys and values,
and detects cycles. Valid existing JSON retains its canonical bytes. No stored
artifact is rewritten or resigned. Historical artifacts containing invalid
Unicode have not been inventoried; this change must not be described as proof
that every past JCS signature is interoperable.

Primary source read: RFC 8785 sections 3.1 and 3.2.2.2, October 6, 2026:
https://www.rfc-editor.org/rfc/rfc8785.html . JavaScript runtime types need explicit
adaptation to JSON; malformed Unicode must be rejected. Production incident
scope and affected issued artifacts remain unestablished.

## Release and operating limits

The build is isolated from unrelated work on `codex/scvd-attestation-pilot`.
The keeper authorized commit, push and merge after UI review. The protected PR
and its required CI shards gate release; production readback follows deployment. The first customer activation requires the
ordinary buyer agreement described above; this build does not assert demand.

The watch engine's existing sweep cap and scan behavior remain. Watch-gap alerts
are internal operating signals; the pilot does not sell customer alert delivery.
No guaranteed retention period is promised. Report delivery, invoicing and any
second engagement remain keeper work. Automatic renewals remain excluded under
house rule 23a; the bounded concierge pilot applies deliver-first billing from
rule 9 rather than introducing an ongoing payment relationship.

## Validation record, October 7

PR #996 initially caught missing response schemas, an over-budget agent index
and omitted porch counters. Concrete response schemas, a short index pointer
with the full offer in the counter guide, and bounded pilot read counters address
those failures. The existing schema, reading-budget and route-inventory guards
remain unchanged.

- The JCS input regression failed on the original canonicalizer (11 cases), then
  passed with the existing signing tests. The end-of-term watch check also failed
  before the inclusive stop-boundary repair. The new page acceptance check first
  returned 404, then passed after routing the feature.
- Final integrated focused run: 11 files and 150 tests passed, covering the pilot, JCS, watch
  recovery, coverage, discovery, guide content, OpenAPI size and collector boundary.
- The independent Node verifier tests passed. Typecheck and the production dry-run
  bundles passed. Desktop and 390px mobile layouts were inspected in the browser. The final UI
  review also covers fixture-based activation and report screens, readable coverage
  labels, an early download action and a full-width URL field.
- A broader local run was interrupted after prolonged timing failures in four
  purchase-recovery files. All 12 reported failed cases passed on isolated rerun.
  This is not a full-suite pass; the required CI shards remain a release gate.

The preview uses a temporary local adapter to give the production HTTPS redirect
an HTTPS request URL and render read-only fixture screens with a public test key. No production transport or authentication rule was
relaxed for previewing. No test initiated a real customer engagement or payment.
