# Paying x402 endpoints in this repository

Copy this file to `.github/copilot-instructions.md` (or append it to yours). It tells GitHub Copilot what to do before any code in this repository pays an x402 URL.

## Before you pay

Every x402 payment goes through `examples/shared/decide.mjs` (`beforeYouPayWalk`) or `examples/shared/decide.py` (`before_you_pay_walk`) first. The walk:

1. GETs the URL and decodes the `PAYMENT-REQUIRED` header, so the terms (network, asset, recipient, amount in atomic units) are the ones we were served;
2. POSTs once to `https://scvd.store/api/before-you-pay/v1`, whose answer says whether a stock x402 client would sign and carries the free preflight whole (`the_door`: verdict, every check and advisory named);
3. returns `{ decision, because, terms, defects, worth_knowing, does_not_establish }`.

Only `decision === "pay"` may proceed to the payment client. `do_not_pay` and `cannot_tell` stop, and the `because` lines go into the log or the error verbatim.

## When generating code

- Call the walk with the project's policy: `{ allowed_networks, allowed_recipients, max_amount_usd }`.
- Log `decision.because` and `decision.does_not_establish` beside any payment. A `pay` is a derivation from named checks, never a score, and never proof of delivery.
- Do not resolve a name in `payTo` and pay the result; do not sign against a body challenge that disagrees with the header; do not retry a payment with a fresh nonce without an idempotency key the door names.
- For receipts and signed offers, use the `x402-verify` package (`verifyReceipt`, `verifyOffer`) with the issuer's key URL, never a key taken from the artifact.

## Where the doors are

- Preflight (the door's shape): `POST https://scvd.store/api/preflight/v2` `{"url"}`
- Dry run (will my client pay it): `POST https://scvd.store/api/before-you-pay/v1` `{"url", "client_profile"?}`
- Conformance desk (any issuer's signed offer or receipt): `POST https://scvd.store/api/conformance/v1`
- Read-only MCP door, no paid tools: `https://scvd.store/mcp/verifier`
