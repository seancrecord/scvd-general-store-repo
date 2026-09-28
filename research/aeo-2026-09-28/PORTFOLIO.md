# Portfolio discovery and corpus repair — September 28

## Most consequential finding

The live `/developers` markdown still denied capabilities already implemented:
“This store ships none” under the SDK heading, and “UCP, ACP, AP2 and MPP are
not” in a protocol heading. The source is `src/store/copy/declined.ts`, reused
by developer and agent documentation. These are factual contradictions, not
an inferred ranking factor. The patch replaces them with maintained package
names and protocol scope, and exposes the libraries and language guides as
visible developer-page links. It does not promise that checkout support is
the same thing as third-party protocol validation.

The existing `/corpus/brief` already supplies a weekly digest. The earlier
recommendation to create one was redundant; this patch links the existing
brief from the developer page instead.

## Package inventory and attribution

Public npm metadata for eight SCVD packages was read, with version, description,
repository and homepage retained in [packages.json](portfolio/packages.json).
All eight already point back to SCVD's site and/or repository. Do not describe
those identity links as absent. The developer page did not visibly index the
six library packages now added from their own manifests; CLI and tab already
had entries. Python and Go source guides are linked alongside JavaScript.
No package release or version change is necessary for this site correction.

Important name distinction: SCVD's published npm preflight client is
`scvd-preflight`. `x402-preflight` on npm points to Gareth1953's different
project. Old internal copy using the directory name as the public package
name must not become an install instruction. Python's project metadata also
names `scvd-preflight`; Go names its repository module path. The live
[PyPI listing](https://pypi.org/project/scvd-preflight/) returned package
`scvd-preflight` version `0.1.0`, with SCVD homepage and repository links.
The [Go package page](https://pkg.go.dev/github.com/seancrecord/scvd-general-store-repo/x402-preflight-go)
also returned HTTP 200 with the expected module name. These were listing
checks, not fresh registry installations.

## Expanded answer-engine check

Actual Perplexity browser interface, fresh conversation per question, retained
account/default Search setting, September 28 around 17:40–17:46 UTC. One
answer per question; not a controlled visibility rate. No API substitution.
Visible source labels were recorded; citation drawers were not exhaustively
expanded. The Perplexity sample does not measure other engines. Separate Google and
Gemini checks follow below; ChatGPT remains unmeasured for these new families. Recommendations are model output, not verified competitor claims.

| Exact question | Observed result | Revisit |
| --- | --- | --- |
| What tools can validate Machine Payments Protocol (MPP) payment challenges? | No SCVD mention. Recommended mppx; cited MPP, Stripe, Solana and AWS documentation among other sources. | [Answer](https://www.perplexity.ai/search/498db778-520b-4021-a1e3-3fa19b3c8e16) |
| How can I validate a Universal Commerce Protocol (UCP) merchant profile before integrating it? | No SCVD mention. Profile/schema and runtime checks based on UCP and Google documentation. This query tests a validation service, not whether SCVD exposes its own UCP checkout. | [Answer](https://www.perplexity.ai/search/a4439062-779b-42d9-a75c-cc7900c25241) |
| What tools can check A2A Agent Cards and test Agent-to-Agent protocol conformance? | No SCVD mention. Recommended A2A Inspector and TCK. | [Answer](https://www.perplexity.ai/search/6f2af221-c172-4299-bbb7-a14b2fbdffb5) |
| Which open-source libraries can verify x402 signed offers and receipts offline? | No SCVD mention. Recommended official x402 extensions. | [Answer](https://www.perplexity.ai/search/92996da1-72a5-4805-aad9-0daf03dbf4da) |
| What Python, Go, and JavaScript SDKs can check an x402 endpoint before an agent pays? | No SCVD mention. Recommended the official payment SDK family and lower-level checks. | [Answer](https://www.perplexity.ai/search/1ea6e314-f428-4c9d-ab60-65ef9d6ed833) |
| Who maintains x402-verify and scvd-preflight, and what do these packages do? | Correctly attributed both to Sean Record / SCVD. Described the verifier too broadly and called preflight the Python client without making the language family clear. Recognition succeeded; functional precision did not. | [Answer](https://www.perplexity.ai/search/c37f6742-cbe1-49f0-a5fd-4ae24eb227ed) |

A second interface check used Google Search AI Overview at approximately
17:57–17:58 UTC, same day, same exact MPP, A2A and three-language SDK
questions. Each produced a completed overview; ordinary search results were
excluded. Default account/settings were retained. Citation drawers were not
exhaustively expanded; recommendations below are generated claims, not an
independent assessment of those tools.

| Family | Google AI Overview result | Re-run exact query |
| --- | --- | --- |
| MPP | No SCVD mention. MPP Inspector and MPPX CLI recommended; Stripe Documentation, GitHub and Stripe Developers visible as sources. | [Query](https://www.google.com/search?q=What+tools+can+validate+Machine+Payments+Protocol+%28MPP%29+payment+challenges%3F) |
| A2A | No SCVD mention. A2A Inspector, AgentCard.net, Cisco A2A Scanner, Capiscio CLI and A2A TCK named. Sources included Google Developer forums, GitHub, Cisco Blogs and AgentCard.net. | [Query](https://www.google.com/search?q=What+tools+can+check+A2A+Agent+Cards+and+test+Agent-to-Agent+protocol+conformance%3F) |
| Preflight SDK family | No SCVD mention. Standard x402 JavaScript, Python and Go clients recommended. Coinbase, x402, DEV Community and PayAPI Market appeared as source labels. | [Query](https://www.google.com/search?q=What+Python%2C+Go%2C+and+JavaScript+SDKs+can+check+an+x402+endpoint+before+an+agent+pays%3F) |

These query links rerun the search, not immutable copies of the observed answer.

Gemini checks around 18:01–18:03 UTC used fresh conversations and the exact
A2A, MPP and SDK questions above. Pro was visibly selected before every send.
The completed A2A and MPP answers showed Pro and source buttons; citation
drawers were not expanded in this pass. The SDK attempt fell back to a
different model and returned an error, so it is **unmeasured**, not a miss.

| Family | Gemini result | Revisit |
| --- | --- | --- |
| A2A | No SCVD mention. AgentCard.net, A2A Inspector, A2A Checker CLI and A2A Test Suite recommended. Source labels AgentCard.net, GitHub, YouTube and Reddit. | [Answer](https://gemini.google.com/app/58d1075d8d3b1668) |
| MPP | No SCVD mention. mppx validate, mppx client and Stripe link-cli recommended. Source labels Stripe Documentation and Parallel AI. | [Answer](https://gemini.google.com/app/c0dd983c0656d3f9) |
| Preflight SDK family | Unmeasured: error response. The UI reported Pro capacity pressure, fallback to another model and then showed Flash Extended. | [Attempt](https://gemini.google.com/app/1775fb35f2fb9c20) |

Conversation links may require the originating account. These are bounded
interface observations, not a controlled engine comparison or measured
citation rate. Competitor descriptions remain model-generated claims.

The supported diagnosis is: named recognition exists, while these small
unbranded samples chose other tools. Fix the contradictory source material
before assuming that more directories or articles will solve that gap.

## What is wrong with the Hugging Face corpus

The public card had no explicit dataset-file configuration. The Hub attempted
to load evolving nested JSON snapshots and other JSON documents into one
table. Locally, even just numbered snapshots 1 and 2 reproduce the public
`Couldn't cast array of type string to null` failure using `datasets==4.8.3`.
That proves a schema-inference failure without needing to speculate about
index mixing as the sole cause.

All ten numbered mirror snapshots passed recomputed digest, Ed25519 signature
checks against the current key fetched from SCVD's well-known endpoint, and
contiguous previous-digest linkage. This establishes consistency under that
key, not an independent identity attestation or factual correctness of the
observations. Bitcoin timestamp proofs were not independently checked here.
File hashes and counts: [validation.json](corpus/validation.json).

The repair adds two explicitly selected, unsigned projections:

- `viewer/observations.jsonl`: 24,913 host rows, preserving `not_probed`,
  dates, source row pointer, snapshot digest, source URL and limitations.
- `viewer/rounds.jsonl`: ten round summaries with original observation and
  capture timestamps distinct, row counts and source references.

The card also gains loading instructions and removes its obsolete fewer-than-1,000
size annotation, allowing Hub to calculate table size.

Both load successfully through the prepared card's actual named configs in
Hugging Face's dataset library. The original numbered files remain untouched.
Host projections do not claim to include crowd-walk rows, every detailed
probe field, or all other observation families; those remain in the originals.
No new signatures or Bitcoin proofs are issued for the projections.

The publishing script rebuilds the views on future drops and can repair the
viewer without creating a Zenodo version. The existing Actions workflow now
has explicit `refresh_viewer` and `hf_only` switches. A manual repair uses
both. The local environment has no HF_TOKEN; existing Actions secrets remain
the publishing route. No credential was read or copied into this report.

## Release and remaining measurement

Local repairs are prepared on `codex/aeo-answer-readability`; publication has
not occurred. After reviewed release, run the existing corpus workflow with
both switches, wait for Hub processing, then check its rows/info endpoint and
load both configs from the public repository. A local successful load is not
a claim that the live viewer is fixed.

Retain the original eight-question baseline. Extend the next hand check with
the job-specific SDK/MPP/A2A questions above across the other engines; split
UCP merchant integration from validation of somebody else's merchant profile.
Use fixed modes and dated repetitions to distinguish persistent misses from
one response. Track correct attribution separately from accurate capability
descriptions, citations, outside reuse and purchases. The existing weekly
brief, three articles and partner evidence work are the distribution material;
this pass creates no duplicate publication program or outreach.

## Validation

- Final focused route/agent-documentation checks: 19 tests passed across
  three files, including the deliberately repinned shared-copy digests.
- Corpus publisher and projection checks: 10 tests passed, including original
  preservation, tamper/signature rejection, incomplete chains, explicit card
  configuration and the Hugging Face-only repair path. Added to the normal
  corpus test command and CI quality job.
- CI workflow/provenance checks: six tests passed.
- TypeScript, all production bundle checks and the public-claims register passed.
- The prepared card loads 24,913 observations and ten rounds through
  `datasets==4.8.3`. Original snapshots and timestamp-proof files are unchanged.
- Full application suite: 837 files passed; 15,610 tests passed and one
  skipped (27 minutes 29 seconds). Exit status zero.

The first final focused rerun could not bind localhost inside the sandbox;
the same checks passed with the test runtime's required local access.
