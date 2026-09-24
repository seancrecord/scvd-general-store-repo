# Browserbase — buyer-path compatibility brief

Case B-001. Dated September 24, 2026. Stage: relevant public workflow;
SCVD request-body compatibility remains unqualified on current main. No Browserbase defect,
paid fulfillment result, partner participation, or recurring demand claimed.

## What the public contract says

[The payment gateway](https://x402.browserbase.com/) returned 200 in the
direct capture `browserbase-gateway-network`. It advertises session creation
through `POST /browser/session/create` with an `estimatedMinutes` body;
it also lists POST search/fetch and separate session status/termination paths.
The captured rate is 0.12 USD/hour. Five minutes at that rate is 0.01 USD
arithmetically, but this read did not establish a minimum accepted duration,
a current live quote, rounding, or successful payment. Do not repeat the
research report's five-minute purchase claim as a measured fact.

The page mentions `X-PAYMENT`; SCVD's Launch Check describes a v2
`PAYMENT-SIGNATURE` envelope. This is a documentation compatibility question,
not proof of Browserbase's current wire behavior.

## Correction before publication — September 24

The initial dossier read the older working checkout at `7059dc8a` and called
Launch Check GET-only. That is withdrawn as a description of current main.
Release review at `eedbcb56` found a bounded POST fallback on HTTP 405/501,
with `{}` as its body and the resolved method reused for payment and replay.
No new POST implementation is justified by this dossier. The gateway
documents `estimatedMinutes`; whether its current runtime accepts an empty
body or a default duration is unmeasured. The remaining gap is qualifying
inputs, current wire terms and usable session delivery.
[Release source record](release-source-index.json) preserves the newer basis;
the earlier source record remains as evidence of the mistake.

## Compatibility with current main

| Part | Status |
| --- | --- |
| Read public discovery and explain advertised product/price | Available as ordinary research; cold-agent runs still need their own controlled task |
| Retrieve SCVD held host context | Read completed, but it is an unsigned summary |
| Current Launch Check approach | Main starts GET and can fall back to POST with `{}` on 405/501; no caller-supplied `estimatedMinutes` body |
| Network/scheme | Local purchase path selects canonical Base USDC exact EIP-3009; matching live Browserbase terms not checked |
| Spending allowance | Existing field cap is derived from `src/services/launch-check-terms.ts`; no pilot payment made |
| Browser session connection and usable output | Not observed; a successful payment alone would not prove either |
| Full off-the-shelf Launch Check applicability | Not established; actual input defaults and wire compatibility require qualification |

## Historical evidence must stay narrower than the proposed study

`browserbase-held-history` is the exact saved response from
`/corpus/host/x402.browserbase.com.json`. Its `evidence_scope.signed` is false.
The timeline includes both `/browser/session/create` and `/fetch`, and records
GET-shaped observations. Its latest host-level state is not a current,
method-correct result for purchasing a browser session. It is not a baseline
for claiming a repair, an ongoing outage, or a signed endpoint verdict.

The summary also carries a generic citation line describing signing; that
does not override the explicit unsigned evidence scope. Fetch and verify
original exact-URL rows with an independently established key before making
a signed-history claim. Observation dates and snapshot-publication dates
must remain separate. This task has not performed that verification.

## Proposed study

One public product, one named reviewer, bounded to 30 days after agreement.
Start with two cold preparation runs: find the product and price, select the
documented method/body, describe expected delivery and stop before payment.
No model-run results exist yet. Use the shared pilot worksheet.

An actual paid session requires a qualified request and the existing spending,
screening, replay, and reconciliation controls. First check whether the current
instrument fits the actual contract; scope an extension only if it does not.
Do not label an improvised POST client as the unchanged Launch Check. Expected
fulfillment should include a usable session demonstrated only against a
partner-approved benign page, without testing unrelated websites or evasion.

Keep any returned connection handle private and out of public artifacts.
After review, retest a repair if one exists and ask whether the team would
use the observation after its next relevant release. A clean result may be
useful. No need to claim a known Browserbase problem to propose the study.

## Contact and falsifier

[Browserbase's partner page](https://www.browserbase.com/partner), saved as
`browserbase-partner-page`, publishes a support contact and an integration
form. The form asks for prepared integration material; this study is not yet
an implemented integration. A short support routing question to the relevant
x402/developer-experience owner is the smaller proposed first approach.
No form or message has been submitted.

If the company has no decision this observation improves, hold the proposal.
If current method-correct terms fit an existing authorized runner, update the
compatibility sheet with evidence instead of assuming new development.
