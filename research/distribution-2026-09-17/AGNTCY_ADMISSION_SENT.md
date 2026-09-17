We would like to participate with SCVD's OASF record and get implementation/discoverability feedback.

- Canonical OASF 1.1.0 record: https://scvd.store/agents/general-store
- Domain key publication: https://scvd.store/.well-known/jwks.json
- Source and reproducible record generation: https://github.com/seancrecord/scvd-general-store-repo/tree/main/registry/agntcy
- MCP: https://scvd.store/mcp
- ERC-8004 identity and cross-links: https://scvd.store/.well-known/agent-registration.json

SCVD supplies payment-challenge inspection and independently verifiable signed observations for agentic commerce. Free inspection needs no wallet; optional paid goods use separately authorized x402 payments.

Our September 15 local push/sign/name-verification check succeeded, while shared-node publication returned PermissionDenied. The canonical bytes were corrected afterward, so that older local CID/signature is not evidence for the current record. We have not established Cisco/Anro publication or discovery from another peer.

Which route should we use for admission: an authorized shared-node push, operator import, or federation with a separate peer? We want to verify the exact record's domain/signature/scan results and taxonomy/MCP discovery from a second participant.

We would also appreciate feedback on whether the current skills/domains and representation of paid x402 services, remote HTTP MCP and the local stdio installation path are idiomatic. I maintain SCVD; happy to provide a smaller reproducible case if useful.
