# Awesome Copilot external-plugin submission — submitted

Submitted as [#3255](https://github.com/github/awesome-copilot/issues/3255); automated intake, both skills and installation checks passed. Maintainer review pending. Exact posted body: [COPILOT_ISSUE_BODY.md](COPILOT_ISSUE_BODY.md). Original preparation fields follow. Use the [official issue form](https://github.com/github/awesome-copilot/issues/new?template=external-plugin.yml), not a manual external.json PR. These fields are derived from the existing public root plugin manifest at the exact commit below. This is not Agent Finder PR #34, which remains a separate existing request.

## Plugin name

scvd-general-store

## Short description

Evidence observatory for agentic commerce: x402 preflight, receipt checks, settlement attestations.

## GitHub repository

seancrecord/scvd-general-store-repo

## Plugin path inside the repository

Repository root (leave blank in the form).

## Ref to review

Leave blank; full commit SHA supplied below.

## Commit SHA to review

e7f6c068e8989b5930dca8e2dbe18baae8c8177e

## Version

0.2.4

## License identifier

MIT

## Author name

Record Creative Co. LLC

## Author URL

https://scvd.store

## Homepage URL

https://scvd.store

## Keywords

x402, signed-artifacts, verification, attestation, conformance, mcp, usdc, payments

## Additional notes for reviewers

The root Agent Plugins 1.0 package contains MCP configuration and the existing general-store and x402-verification skills. The remote endpoint is https://scvd.store/mcp. Unpaid checks need no credentials; paid operations require separately authorized payment. The repository also carries a dedicated five-tool verification-only OpenAI package; this submission is the existing general-store coding-agent package.

SCVD returns bounded evidence about x402 endpoints and signed artifacts. It does not guarantee providers or delivery. The skills preserve user decisions about payment and explain what checks did not establish.

Static manifest checks pass. A current unsigned MCP initialize succeeds. We have not completed a fresh Copilot installation in this submission pass; the marketplace's validation and installation smoke test remain required. Please flag any remote-MCP or skill-discovery incompatibility.

## Submission checklist — review before checking

- Public repository: confirmed through GitHub's API on September 17.
- Immutable locator: full public commit SHA above, not a branch.
- Contribution/security/responsible-AI policies: submitter must read and affirm the current policies in the form.
- No duplicate marketplace entry: September 17 issue search returned zero SCVD results; recheck the live marketplace and open requests immediately before sending.

The pending local Gemini context fix is not included in this SHA. It is independent of Copilot's root plugin/MCP/skills assets. If submitting after that fix is released, replace the SHA with that exact public commit and regenerate fields from its manifest.
