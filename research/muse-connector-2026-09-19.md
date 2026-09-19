# Muse connector submission — September 19, 2026

**Status: submitted; review pending.** Keeper completed the final press and the browser confirmed receipt for SCVD x402 Verifier. [Current receipt](#submitted--keeper-completed-the-final-press); earlier sections retain the intake history.

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


## Submitted — keeper completed the final press

September 19: the keeper completed sign-in and reported submitting the prepared form. Browser readback independently confirmed **“Thank you for your submission!”** and **“We’ll review SCVD x402 Verifier and get in touch.”** No submission ID or public listing URL appeared. Review is pending; this is not admission or native Muse execution qualification.

The reviewed application used:

- Name: **SCVD x402 Verifier**; developer: **Record Creative Co. LLC**.
- Contact: Sean Record, **sean@recordcreativeco.com**.
- Connection type: **Existing MCP**, endpoint https://scvd.store/mcp/verifier; authentication: **None**.
- Payments: **My connector does not accept payments**. This is the free verification connector; paid UCP/x402/MPP checkout remains outside its scope.
- Website: https://scvd.store; support: https://scvd.store/what; privacy: https://scvd.store/privacy; terms: https://scvd.store/rights. All policy/support pages returned HTTP 200.
- Documentation: the public [verifier skill](https://github.com/seancrecord/scvd-general-store-repo/blob/main/registry/chatgpt/scvd-x402-verifier/SKILL.md), verified reachable.
- Icon: the existing public dinosaur SVG, with explicit 512×512 display dimensions required by the form; drawing unchanged.
- Example tasks: preflight an x402 endpoint, check a signed offer/receipt, read dated readiness observations, explain a defect code, verify an SCVD artifact.

A fresh free `tools/list` returned the five submitted tools: `preflight_x402_endpoint`, `verify_x402_receipt`, `lookup_endpoint_readiness`, `get_defect_definition`, `verify_scvd_artifact`. Application copy disclosed traffic statistics, the public hostname/ask-count queue for eligible unprobed hosts, and limits on signature/readiness evidence. No purchase tools, wallet or login required. Muse host execution remains for review/testing.

The final form required the Muse Connector Terms checkbox. Its linked https://muse.ai/platform/terms page returned “Sorry, this content isn't available right now” to the browser; the web-reader also failed. The agent stopped before agreement and the keeper submitted personally. No platform fee or paid plan was selected by the agent; the terms' fee provisions were not verified. The keeper's no-recurring-fee constraint remains in force, and the application notes requested participation without recurring platform/distribution fees.

Earlier sections preserve the intake sequence. This submitted receipt supersedes their pending-login and unknown-connection-format status.
