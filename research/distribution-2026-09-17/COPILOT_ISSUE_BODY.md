<!-- external-plugin-submission -->

### Plugin name

scvd-general-store

### Short description

Evidence observatory for agentic commerce: x402 preflight, receipt checks, settlement attestations.

### GitHub repository

seancrecord/scvd-general-store-repo

### Plugin path inside the repository

_No response_

### Ref to review

_No response_

### Commit SHA to review

b4c0bbdbde412a435129b00f07f2b1eb401e98ab

### Version

0.2.3

### License identifier

MIT

### Author name

Record Creative Co. LLC

### Author URL

https://scvd.store

### Homepage URL

https://scvd.store

### Keywords

x402, signed-artifacts, verification, attestation, conformance, mcp, usdc, payments

### Additional notes for reviewers

Submitted on behalf of SCVD's maintainer; the submitter is affiliated with the service.

This root Agent Plugins 1.0 package combines remote MCP configuration with two skills: general-store use and x402 verification. It helps Copilot inspect an HTTP 402 challenge before authorizing a payment, verify signed artifacts, and explain what the evidence does and does not establish. The endpoint is https://scvd.store/mcp; documentation is https://scvd.store/llms.txt.

The free inspection and verification workflow requires no account or credentials. Optional paid operations require separately authorized payment. The skills preserve that decision and describe evidence limits; a valid signature is not a guarantee of delivery or merchant trust.

Static manifest checks pass and a current unsigned MCP initialize succeeds. A fresh Copilot installation was not completed in this pass; the intake installation smoke test and quality gates remain necessary. Please flag remote-MCP or skill-discovery incompatibilities.

This is the general-store coding-agent package. The repository also contains a separate five-tool verification-only OpenAI package. Existing Agent Finder catalog PR #34 is a different catalog submission.

### Submission checklist

- [x] The plugin lives in a public GitHub repository.
- [x] The ref and/or sha I provided is immutable (release tag and/or full 40-character commit SHA), not a branch.
- [x] This submission follows this repository's contribution, security, and responsible AI policies.
- [x] This plugin is not already listed in the Awesome Copilot marketplace.
