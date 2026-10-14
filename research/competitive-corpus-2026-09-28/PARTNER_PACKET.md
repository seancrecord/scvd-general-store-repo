# Dated catalog evidence for a listing decision

Prepared September 28, 2026; not sent. This fills the existing
[evidence-reuse brief](../aeo-2026-09-28/PARTNER_REUSE.md) and
[Merit workstream](../../docs/PARTNER_EVIDENCE_PILOTS_2026-09.md).
No partner agreement, integration or adoption is established.

## The decision this helps

A listing can pass an x402 readiness check while advertising terms that differ
from an observed challenge. Give the listing reviewer the dated disagreement
and original evidence so they can decide whether to refresh a listing, ask an
operator, explain a support case, or take no action. The directory retains its
own acceptance rules; this is neither an override nor a trust score.

The [derived findings](FINDINGS.md) retain the comparable denominator and all
source rows. The [filled listing record](partner-listing-evidence.json) selects
one historical example, authenticated locally from its original snapshot:

- Endpoint and method: `POST https://stableupload.dev/api/upload`.
- Recorded result: x402 `ready`, with catalog state `differs`; the actual terms
  and dates are preserved in the JSON rather than copied into another catalog.
- Original: [snapshot 10](https://scvd.store/corpus/10.json),
  `/round/hosts/8` within its `snapshot` object.
- Observation: September 21, retained in a September 27 snapshot. Neither date
  establishes its state today. This is not a new probe of the seller.

The signed row records a comparison; it does not establish that a present-day
x402scan listing has the same terms, that Merit caused a problem, or which
party should change its data. It is separate from the nested-pricing parser
reproduction already sent in issue #1014. Do not present them as the same bug.

## What a partner can consume

Use [the local adapter](../../examples/corpus-listing-evidence.mjs), Node 22,
the numbered original JSON and a trusted copy of the public verification key:

```sh
node examples/corpus-listing-evidence.mjs 10.json scvd-signing-key.json https://stableupload.dev/api/upload POST
```

The filenames refer to locally saved public documents; no secret key is used.
The adapter makes no network request or payment. It checks the canonical
digest and Ed25519 signature, then requires a unique exact endpoint/method
match. Wrong method, missing/duplicate matches, altered claims, an invalid
signature or the wrong supplied public key fail. It does not authenticate the
key's identity, prove chain continuity or verify Bitcoin timestamps itself.
The [notebook](../../examples/corpus-recompute.ipynb) checks the whole chain.

| Preserve | Why |
| --- | --- |
| Exact endpoint and recorded method | A host-level result cannot stand in for a specific operation |
| `observed_at` and snapshot capture time separately | Carrying a reading forward must not refresh its apparent age |
| Snapshot URL, digest and row pointer | The recipient can retrieve and authenticate the original |
| Verdict, battery and catalog comparison separately | Readiness and advertised-term agreement answer different questions |
| Verification scope and gaps | The projection is unsigned; payment and delivery were not exercised |

Display a dated observation link only where the partner finds it useful. Keep
unknown dates unknown. Choose any freshness cutoff with the receiving workflow;
this packet invents neither an expiry policy nor a current-readiness badge.

## Ready correspondence, held for the existing relationship

The September 24 [Merit note](https://github.com/Merit-Systems/x402scan/issues/1014#issuecomment-5817308384)
already asks about the intended discovery contract. The fresh issue read still
ends with that note. Do not resend it or post this unrelated historical example
into that issue as if it were a fresh defect report.

Suggested follow-on once there is an appropriate recipient/context:

> We turned a public corpus observation into a small listing record: exact URL
> and method, when it was checked, the catalog/challenge comparison, and a link
> to the signed original. The example passes x402 readiness but records different
> advertised terms. It is historical, not a claim about your current listing.
> The adapter verifies the snapshot locally and keeps old readings dated. If
> this would help a listing or support decision, name one case and we can scope
> the next observation around it. Your eligibility rules remain yours.

Attach the filled JSON and source/adapter links after this branch is released,
or provide the files themselves. No link to an unmerged file should be presented
as available on the public default branch.

## Record actual use

In the existing pilot record, capture the reviewer's named decision, the selected
public endpoint, whether/how the evidence was used, the reuse URL if public,
and whether another observation was requested. A backlink or free acceptance
alone is not recurring use. No reply remains unmeasured.

The public dataset card states CC BY 4.0; retain source attribution and date.
Private client payloads, identities, credentials and buying histories are not
in this packet. Any later sharing of client behavior needs a separately agreed
scope. The useful first exchange is one decision and the evidence it needs.
