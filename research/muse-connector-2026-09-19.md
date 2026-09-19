# Muse connector opportunity — September 19, 2026

Status: researched candidate, not submitted or accepted. No account created, terms accepted or payment commitment made.

## Primary-source read

The rendered [Muse Connector Platform](https://muse.ai/platform) says developers describe their product, submit a connector for functional/security/legal review and end-to-end testing, then appear in the directory once approved. Editors consider featured placement separately. The page mentions Stripe Link for payments.

Clicking Submit a connector shows a sign-in/account-creation screen asking for a work email. Requirements beyond that screen were not inspected. The public page does not establish developer fees, a review timeline, an SDK/manifest format, MCP compatibility, or x402/MPP/UCP payment support. Unstated fees are not proof of free participation. The web-reader could not fetch the platform page; the browser rendered the official page and sign-in gate successfully.

## SCVD fit — recommendation, not host qualification

Start with the existing verification-only scope: check an x402 endpoint before payment, verify signed offers/receipts, and explain the evidence limits. Existing service: https://scvd.store/mcp/verifier. Public site: https://scvd.store. Reuse the underlying API; determine Muse's connector contract before building an adapter or claiming that the published OpenAI plugin can be installed unchanged.

Proposed application description:

SCVD supplies independent evidence for agentic commerce. Its free verification tools inspect a payment-protected endpoint before spending and check signed offers or receipts afterward. Each result explains the checks performed, their limits, and what remains unverified. Muse users could ask it to check an endpoint or receipt and receive the evidence through their assistant.

The public intake does not state that UCP is a prerequisite. No existing checkout rail should be represented as compatible with Muse's Stripe Link flow without documentation and testing. Paid goods can remain a later integration question. Keeper constraint: exclude any route requiring recurring/monthly distribution fees. Fee eligibility remains unknown until the developer terms are available.

## Next gate

Inspect the developer intake after work-email sign-in, establish fees and connector/API requirements, then prepare the exact submission. Contact preference already supplied by keeper: sean@recordcreativeco.com. Existing priority remains ERC-8004 follow-through, then UCP after its release; this is a separate connector candidate.


## Keeper sequencing — September 19

Bundle Muse intake with the UCP-specific distribution round after UCP is live. Continue the existing ERC-8004 follow-ups first. No recurring-fee route and no early UCP support claim.


## Intake started after launch confirmation

September 19: keeper confirmed UCP live. Opened Submit a connector, entered the authorized business contact, and requested the email sign-in code. The screen confirms the code was sent; user verification is pending. No connector form reached, no terms accepted and no fee agreed. [UCP distribution receipts](ucp-distribution-2026-09-19/README.md).
