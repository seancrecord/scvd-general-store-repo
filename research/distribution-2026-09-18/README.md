# Distribution readback — September 18, 2026

[Receipt](readback.json). This dated evidence updates the channel map; actions
remain on KEEPER_LIST and builds remain on ROADMAP.

- **Gemini gallery readback complete.** Search `scvd` and the [detail panel](https://geminicli.com/extensions/?name=seancrecordscvd-general-store-repo) show version 0.2.4 with MCP and Skills labels and the repository install command. Prior CLI installation is recorded separately. Model tool execution remains unverified; Google explicitly does not vet or endorse third-party gallery entries.
- **Global A2A Registry parser repair verified.** The maintainer [reported a fix](https://github.com/A2ARegistry/GlobalA2ARegistry/issues/7#issuecomment-5730786620). A fresh listing reload showed application/json for both modes, matching the retained card. [Confirmation sent](https://github.com/A2ARegistry/GlobalA2ARegistry/issues/7#issuecomment-5731122295). The initial Claim Ownership attempt returned `Unauthorized (No Token)`. Later September 18 the keeper completed the claim and the public Verified label was confirmed; see [follow-through](FOLLOW_THROUGH.md). No claim press remains.
- **Second A2A registry registration complete.** The no-hyphen a2aregistry.org search returned no SCVD record before submission. Its web intake accepted the canonical card and returned ID `3ec62f32-4e67-4382-8d15-2b6bf689f33a`; the [public API](https://a2aregistry.org/api/agents/3ec62f32-4e67-4382-8d15-2b6bf689f33a) confirms persistence ([response](a2aregistry-agent.json)). Its card conformance and endpoint health checks pass, but task verification reports `OTHER` / failed. The HTML detail route showed the register rather than an individual detail view, so the machine-readable record is the primary link. The [published smoke test](https://github.com/prassanna-ravishankar/a2a-registry/blob/19a44e5408a622ed8b61dde795bf3ff19b3b4cd9/backend/app/smoke_test.py) sends a fixed plain-text greeting regardless of declared input modes. Paired direct checks reproduced the [greeting rejection](a2a-text-probe.json) and a [completed JSON readiness task](a2a-data-probe.json). This establishes a probe-input mismatch, not the exact deployed SDK exception; [issue #184](https://github.com/prassanna-ravishankar/a2a-registry/issues/184) asks the operator to distinguish the cases. No paid calls or wallet actions were made, and the registry's task verdict remains failed.
- **Anro route corrected.** Its [directory FAQ](https://directory.anroagents.com/) directs externally hosted agents to publish a domain manifest for crawling. SCVD already serves [that manifest](https://scvd.store/.well-known/ai-catalog.json); [captured response](scvd-ai-catalog.json). The documented [publisher search](https://api.anroagents.com/ard/agents?filter=publisherId%20%3D%20%27scvd.store%27&pageSize=20) again returned zero; [response](anro-publisher-search.json). No direct external OASF upload route, crawl trigger or timetable was established. Hosted-agent [publication docs](https://anroagents.com/docs/agent-discovery/) describe paid plans, while the directory markets free listing. Do not buy a plan or migrate SCVD merely to resolve external ingestion eligibility. Neither a live manifest nor the ability to query Anro proves reciprocal indexing or AGNTCY routing publication.
- **AGNTCY request remains pending.** Its existing September 17 participation comment had no replies at this read. Current-byte signing, shared access, publication and independent consumer verification remain separate gates.

The September 17 receipts remain historical observations; this record supersedes
their current-state gallery, A2A display and second-registry submission gaps. Pending marketplace
applications have not been promoted into trust records.

[Antigravity preview preparation](../../registry/antigravity/README.md) covers
another skills-plus-MCP host using the existing assets. Its [package receipt](antigravity-package.json)
records the local archive digest and the limits: no native installation, model
execution or marketplace admission. It is not a new public trust record.

**HOL plugin catalog submitted:** [PR #349](https://github.com/hashgraph-online/awesome-ai-plugins/pull/349)
adds the existing public package under Tools & Integrations. [Contribution rules](https://github.com/hashgraph-online/awesome-ai-plugins/blob/main/CONTRIBUTING.md)
and duplicate search were checked; alphabetical and catalog-discovery validation
passed locally. Existing Claude Code and Gemini installation receipts support the
bounded host claims. Maintainer review and HOL indexing remain pending. No source
scanner workflow was added; the catalog describes it as optional/advisory.

HOL's required contribution gate subsequently passed. Its advisory scanner
reported 32 high and two medium findings; local reproduction with the same
scanner release matched the counts. [Sanitized location-level triage](hol-scan-triage.json)
identifies repeated fixture/public-value matches and the SLSA generator's
documented semver-tag requirement. [Context sent on the PR](https://github.com/hashgraph-online/awesome-ai-plugins/pull/349#issuecomment-5731442078).
No blanket suppressions were added. This is not a clean scan or general security
review, and the pending submission is not a trust signal.

HOL's separate agent-registry OpenAPI link returned 503 in this pass and
AgentRanking timed out again. No new ERC-8004 absence or listing claim follows.

**AgentERC gap reproduced:** the browser again showed Agent Not Found for
[Base 86957](https://agenterc.com/explore/base/86957). At 14:33 UTC the homepage's
Base identity/reputation/validation status showed block 51,242,575, last updated
September 13 at 00:41 local display time (five days old), while Ethereum showed
an update seconds earlier. This suggests an ingestion delay is worth checking;
it does not establish why this identity is missing. The [Odd Units project page](https://www.oddunits.dev/)
identifies AgentERC as its work and publishes hello@oddunits.dev. No email was
sent, no wallet connected and no duplicate identity minted.

[Local validation](validation.json) accounts for the full spec-file set, the four
passing reruns and the existing conditional skip. Full CI remains the merge gate.
