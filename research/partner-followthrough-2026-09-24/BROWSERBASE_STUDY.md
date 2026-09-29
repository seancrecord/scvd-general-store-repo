# Browserbase — prepared study, held behind seller qualification

September 24, 2026. Proposed scope only; no contact or experiment executed.
The [corrected dossier](../partner-evidence-2026-09-24/BROWSERBASE.md) is the
evidence basis. Current main supports a bounded POST fallback; this proposal
does not justify rebuilding that capability.

## Decision this could support

Can a new buyer prepare a correctly priced browser-session request from the
public gateway, understand the returned session and identify its recovery
route without custom instruction from Browserbase? A counterpart must name
the actual release/support decision before this becomes an active pilot.

## Small initial deliverable

One request-compatibility sheet and, after scope agreement, two cold preparation
runs. Both stop before signing, payment, session creation or account creation.
No third-party browsing, bot evasion or credentials belong in this scope.

Freeze the model/version, tool set, allowed documentation URLs, task, request
budget and time budget before starting. One reader begins at the gateway;
the other at a partner-confirmed machine document if one exists. Do not call
different entry points replicated trials. Record every initiated run, including
interruption and collection failures. The current task is not a cold reader.

## Compatibility sheet to complete

| Field | Current evidence | Needed before paid scope |
| --- | --- | --- |
| Product and method | Public gateway advertises POST `/browser/session/create` | Confirm current exact URL and contract |
| Input | Documentation shows `estimatedMinutes`; our fallback sends `{}` | Documented default/minimum/required fields or an agreed synthetic input |
| Quote | Published hourly rate is not a live purchase quote | Actual units, rounding, amount, scheme, network and token |
| Authorization | Documentation mentions `X-PAYMENT`; SCVD Launch Check uses v2 `PAYMENT-SIGNATURE` | Current runtime wire contract; no inferred incompatibility from old prose alone |
| Fulfillment | Session usefulness unmeasured | Partner-approved harmless page and concrete usable-output criterion |
| Cleanup and recovery | Not qualified by the current evidence | Session lifetime, close/retry behavior and ambiguous-payment handling |
| Evidence sharing | Public-document observations only so far | Named reviewer and handling of private session/connection data |

If the existing controlled instrument matches, use it. Otherwise hold the paid
step and scope the missing input or wire capability against the named need.
No raw session handle is published. A successful settlement and a useful
session are separate observations; neither proves ongoing service quality.

## Proposed routing note, not sent

Target: support contact published on Browserbase’s partner page; verify again
before use. Hold until this becomes the selected approach.

> We run scvd.store, an evidence observatory for agentic commerce. We’re preparing a small outside study of the x402 buyer path: finding the session product, preparing the right request and price, and understanding delivery and recovery.
>
> We can start with two preparation-only reads and share the reproducible observations and measurement gaps at no charge. We have not measured paid session fulfillment or identified a Browserbase defect. Any paid test would need a separately agreed scope.
>
> Who owns the x402 gateway’s developer experience, and would this answer a useful release or support question for them?

Success is a named decision supported and a request for another bounded check.
A clean result can help. A friendly reply alone is not recurring adoption.
