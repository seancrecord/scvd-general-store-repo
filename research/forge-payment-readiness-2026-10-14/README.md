# Forge payment-reachability check — October 14, 2026

At 19:07 UTC, all 39 concrete GET paths declaring 402 in the live
https://scvd.store/openapi.json answered an unsigned, parameter-free request
with HTTP 402. This population matches the keeper's pasted Forge route list:
38 /api/buy paths and one concrete Almanac path. Three templated GET paths
also declare 402 but are outside this 39-route comparison.

Every response carried a base64 JSON PAYMENT-REQUIRED header with
x402Version 2, a resource URL, and a nonempty accepts array. Every offer had
scheme, network, amount, asset, payTo, and maxTimeoutSeconds fields.
These are basic structural checks, not cryptographic validation, independent
protocol certification, a settlement test or a delivery test. No payment,
wallet or signature was supplied. Headers and bodies were retained in
/tmp/scvd-forge-probe for this session; results.json retains the per-route
summary. The temporary OpenAPI snapshot is /tmp/scvd-forge-openapi.json.

The supplied Forge report says 23/25 reached 402 and lists 39 routes:
23 have a valid challenge, two have explicit 400s, and 14 have no status.
This is consistent with 25 attempted requests, but Forge's raw requests,
probe budget, timing and omitted-route reasons were not available. The
forgeglobal.io homepage could not be opened through the web reader.
Unverified is not evidence of an endpoint failure.

Both reported 400s reproduce when the live OpenAPI placeholder examples
are sent as inputs:

- /api/buy/a2a_repair_kit?url=https%3A%2F%2Fyour-agent.example%2F.well-known%2Fagent-card.json
  returns 400, code unsupported_version, charged false; setup incomplete.
- /api/buy/change_check?baseline_cert_id=cert_your_retained_spot_check&host=your-door.example
  returns 400, code baseline_unavailable, charged false; the placeholder
  does not identify a retained valid Spot Check for that host.

The same two paths without parameters return 402 and declare their required
inputs. Source corroboration: src/routes/door-checks.ts isProbe/argCheck
separates missing-input unsigned probes from supplied-input validation;
HOUSE_RULES.md rule 62 requires that separation. OpenAPI describes the A2A
setup requirement and the retained-baseline requirement.

Inference: Forge may populate OpenAPI examples and encounter legitimate
pre-payment input refusals. Its exact request URLs and response bodies would
confirm or falsify this explanation. No current bare-route payment discovery
failure was reproduced. No application code or deployed configuration changed.
