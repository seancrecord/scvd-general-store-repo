# Reusable plugin submissions

Prepared September 17, 2026. This is submission material; current human actions
are in [KEEPER_LIST](../KEEPER_LIST.md), builds/qualification in
[ROADMAP TR-D](../ROADMAP.md), and channel status in [DISTRIBUTION](../DISTRIBUTION.md).
Cursor and Claude were submitted in the September 17 follow-up; both reviews are pending. Kiro was submitted September 18 after native CLI qualification; review is pending.

Plugin packaging has its own version in `plugin.json`; host wrappers are held to
it by tests. A packaging-only release does not require republishing the unchanged
MCP service identity in `server.json`.

## Shared assets and fields

- Repository: https://github.com/seancrecord/scvd-general-store-repo
- Website: https://scvd.store
- Privacy: https://scvd.store/privacy
- Support: https://github.com/seancrecord/scvd-general-store-repo/issues
- Documentation: https://scvd.store/developers
- Name, version, description, author, license and keywords: read directly from
  [`plugin.json`](../plugin.json) when submitting. Do not freeze another copy here.
- Portable MCP configuration: [`mcp.json`](../mcp.json). It includes the HTTP store
  and local Tab server. Disclose both; the package is broader than the ChatGPT verifier.
- Task guidance: [`skills/`](../skills/). Reuse these files across hosts.
- Public package pin now used by Copilot:
  `e7f6c068e8989b5930dca8e2dbe18baae8c8177e`, plugin 0.2.4. Updated automated
  intake passed. The earlier 0.2.3 pin remains only in historical receipts.

Suggested long description:

SCVD provides evidence tools for agentic commerce. The plugin helps an agent
inspect an x402 payment challenge before paying, interpret verification results,
and work with signed observations and receipts. It connects to SCVD's public MCP
service and packages task guidance for using it. The portable package also includes
the local Tab MCP server; payment needs the user's separately configured wallet
and explicit decision. A successful check reports what was observed and what was
not established; it does not guarantee delivery or make SCVD an escrow service.

## Cursor

[Current documentation](https://cursor.com/docs/plugins) accepts the root Agent
Plugins 1.0 format, so another `.cursor-plugin` copy is unnecessary for these
skills and MCP servers. [Publisher application](https://cursor.com/marketplace/publish)
was submitted September 17 after sign-in. The page confirmed **Thanks for applying**
and receipt of the submission. [Application receipt](../research/distribution-2026-09-17/observations/cursor-publisher-submission.json).
Official marketplace review is pending; cursor.directory is a separate community
listing. Reuse the existing repository rather than submit another MCP identity.

Cursor CLI `2026.09.15-d2fe57e`, in read-only Ask mode, loaded both SCVD MCP servers and completed one free
`preflight_endpoint` call against `https://example.com`: `not_ready`, L1, HTTP 200
instead of an x402 challenge. The model did not see the two bundled skills.
[Partial host qualification](../research/distribution-2026-09-17/observations/cursor-host-qualification.json)
records this limitation, the native app automation timeout and the fact that
user-level discovery was still visible despite temporary CLI config/data paths.
No purchase or wallet operation was performed. The application explicitly disclosed
these limits and optional paid services. A [normal Agent-mode recheck](../research/distribution-2026-09-17/observations/cursor-agent-mode-recheck.json)
also omitted both skills, through the documented local-plugin path and with other
host wrappers excluded. The cause remains unisolated; no published package change
was made on this evidence. Complete native desktop qualification before claiming
full compatibility; do not duplicate
the application while review is pending.

## Claude Code / Cowork plugin channel

[Submission documentation](https://code.claude.com/docs/en/plugins#submit-your-plugin-to-the-community-marketplace)
directs third-party applications to `claude-community`. The separately curated
`claude-plugins-official` collection has no application route. The
[Console form](https://platform.claude.com/plugins/submit) required sign-in when
inspected; the alternative claude.ai form requires organization privileges.

Our wrapper is [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json), with
HTTP MCP and the same skills. Strict manifest validation passed locally. That
check reported no content tests, so it is not an installed-plugin qualification.

The installed Claude binary's schema describes manifest `mcpServers` as additional
to the root `.mcp.json`. That root file previously included contributor Chrome
DevTools. The prepared fix moves that server to
[`scripts/chrome-devtools.mcp.json`](../scripts/chrome-devtools.mcp.json); the
customer root retains only SCVD. A regression failed before the move and passes
after it. No browser server was launched to perform this inspection.

A bounded September 17 CLI run loaded the corrected package and both skills,
but did not expose the plugin-scoped MCP server. The existing account connector
was separately visible and its attempted free call was denied by the test
allowlist. This is partial qualification, not a successful plugin MCP test.
[Sanitized receipt](../research/distribution-2026-09-17/observations/claude-host-qualification.json).

A subsequent Claude Code 2.1.274 run completed the plugin-scoped free preflight
against `https://example.com/` with the expected `not_ready` / L1 / HTTP 200 result.
Both packaged skills were visible. The test used a session-only setting to avoid
account-connector endpoint deduplication; no global configuration changed.
[Successful follow-up receipt](../research/distribution-2026-09-17/observations/claude-host-qualified-followup.json).
The failed first attempt above remains part of the record. The corrected package
is public through merged PR #778. The community marketplace application was subsequently submitted for Claude Code
with explicit keeper approval of contact sharing and directory terms. Anthropic
confirmed **Plugin submitted for review**. [Receipt](../research/distribution-2026-09-17/observations/claude-publisher-submission.json).
Review is pending at [View submissions](https://platform.claude.com/plugins/submissions).
Cowork was left unselected because it has not been tested. Marketplace installation, Cowork runtime and
paid tools were not qualified by this test.

## Kiro powers

[Kiro's form](https://kiro.dev/powers/submit/) now takes an Agent Plugins package.
No additional POWER.md wrapper is required by that route. Its
[creation guide](https://kiro.dev/docs/powers/create/) covers preparation/testing.
The form requires a working tested package, stable MCP services, and README
privacy/support links. The published package was installed as a local Power in
Kiro CLI 2.22.0 with its v3 engine (KAS 0.66.0): both skills loaded, both MCP
servers were exposed and the free preflight completed. IDE installation, paid
operations and Tab operations were not tested. The application was submitted
September 18 with the keeper-approved company contact and publisher terms.
Kiro confirmed receipt; review is pending. [Completion record](../research/distribution-2026-09-18/FOLLOW_THROUGH.md).

Submitted field reference (contact retained privately in the submission receipt):

| Field | Value |
| --- | --- |
| First / last name | Sean / Record |
| Organization | Read `author.name` in the root manifest |
| Email | Keeper-approved company contact; do not substitute the earlier personal address |
| Use case | x402 Preflight and Verification |
| Public repository | https://github.com/seancrecord/scvd-general-store-repo |
| Domain/problem | Agents need to understand a payment challenge and the limits of signed evidence before deciding to spend. SCVD supplies preflight, receipt and observation tools with explicit gaps. |

The form links its publisher terms and privacy notice. Submission is not listing
approval. Record the returned receipt, then verify the public power page before
adding it to SCVD's trust records.

## Cline catalog

The official [cline/marketplace](https://github.com/cline/marketplace) accepts
separate skill and MCP entries. [Skill PR #122](https://github.com/cline/marketplace/pull/122)
and [MCP PR #123](https://github.com/cline/marketplace/pull/123) are submitted and
awaiting review. Cline CLI 3.0.62 installed the skill and MCP configuration in
isolated storage; a separate MCP SDK call using the saved configuration returned
the expected free preflight result. A subsequent native Cline model run loaded
the verification skill and completed that free preflight after sign-in and
individual tool approvals; [receipt](../research/distribution-2026-09-18/cline-native-execution.json). Both catalog PR descriptions were updated and read back. This
route supersedes the older mcp-marketplace issue/icon preparation for this pass.

## Existing channels to finish

- **OpenAI — keeper update completed September 17:** the upload/update task is closed; review/publication remains unverified. Retained procedure for the [published verifier](openai-plugin-verifier-submission.md)
  using the existing [skill ZIP](chatgpt/scvd-x402-verifier.zip). Skills are uploaded
  snapshots: create the next version of the same plugin in
  [the portal](https://platform.openai.com/plugins), add the ZIP under Skills,
  scan/test the combined skill and MCP, submit for review and publish the approved
  update. See [OpenAI's submission guide](https://developers.openai.com/plugins/deploy/submission).
  Keep the verifier's focused MCP dependency; do not upload the broad store skill
  against its smaller tool set without adapting it.
- **Awesome Copilot:** [#3255](https://github.com/github/awesome-copilot/issues/3255)
  has passed automated intake; maintainer review pending. No duplicate submission.
- **Gemini:** CLI 0.60.0 installed public commit `2aba2639c0dc5e6954f6ce0180f6288f43af2702`
  in isolated temporary storage, discovered both skills and connected SCVD MCP.
  [Receipt](../research/distribution-2026-09-17/observations/gemini-host-qualification.json).
  The September 18 [gallery readback](https://geminicli.com/extensions/?name=seancrecordscvd-general-store-repo) confirms version 0.2.4 with MCP and Skills labels. The correction is released and crawler opt-in is set. Model tool execution remains unverified.

## What to record after each host test

**HOL community catalog:** [PR #349](https://github.com/hashgraph-online/awesome-ai-plugins/pull/349)
was submitted September 18 for the existing public package under Tools &
Integrations. Local alphabetical and contribution-discovery checks passed;
maintainer review and indexing remain pending. The catalog's optional scanner
workflow is not installed. This GitHub route avoids a duplicate web submission.
The required remote contribution gate passed; the advisory scanner reported
findings. [Reviewed context](https://github.com/hashgraph-online/awesome-ai-plugins/pull/349#issuecomment-5731442078)
and [local triage](../research/distribution-2026-09-18/hol-scan-triage.json) preserve
fixture/public-value matches and the SLSA tag requirement without suppressing
the scanner or claiming a clean review.

**Antigravity:** [A local preview and reproducible preparation](antigravity/README.md)
now cover Google's current plugin layout. This is a host adapter, not another
MCP service. Native installation, skill/tool discovery and a free call are still
required; a public third-party marketplace intake was not established.

Record the exact public commit, host/version, discovered skills, loaded servers,
one free evidence call and its actual result, and whether anything unexpected
started. Keep a failed installation in the receipt. Never replace an unrun host
test with another host's passing schema or CI check. Add the external application
URL and outcome when a submission is actually made.
