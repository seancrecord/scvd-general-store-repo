# GitHub Agent Finder

Reconciled September 17, 2026. Continue
[github/agentfinder-catalog#34](https://github.com/github/agentfinder-catalog/pull/34).
It already contains both skills and MCP/plugin descriptors. The older instructions
to open a second PR or add missing skill entries are superseded by the
[admission reconciliation](../../research/distribution-admission-2026-09-16/README.md).
An open PR is not an indexed result.

| Local descriptor | Resource |
| --- | --- |
| `catalog/seancrecord/scvd-general-store.json` | Store skill |
| `catalog/seancrecord/x402-before-you-pay.json` | Pre-payment skill |
| `catalog/seancrecord/scvd-general-store-mcp.json` | Store's official MCP registry descriptor |
| `catalog/seancrecord/scvd-general-store-plugin.json` | Claude-compatible plugin descriptor |

`npm run listings:test` checks descriptor shape, source URLs and metadata parity.
The dated `PR_BODY.md` is retained as draft history, not an instruction to replace
the current PR body without reading it.

The [fresh official MCP registry read](../../research/distribution-2026-09-17/observations/mcp-registry-refresh.json)
now finds both store and tab at their source-manifest versions. Tab's former
version blocker is cleared. There is no tab entry in this drawer or proven in
PR #34; adding one remains distinct from observing its registry release.

After merge, read the generated catalog and search
[Agent Finder](https://agentfinder.github.com/api/v1/search) for SCVD before
recording admission. The service implements Agentic Resource Discovery; the
store's own [ARD document](https://scvd.store/.well-known/ard.json) does not prove
that somebody else's index ingested it.

Awesome Copilot [#3255](https://github.com/github/awesome-copilot/issues/3255) is
a separate plugin submission. It passed automated intake and awaits maintainer
review. [Current channel map](../../DISTRIBUTION.md).

Hugging Face has its own [drawer](../huggingface/README.md) and keeper item;
Agent Finder review does not publish the verifier Space.
