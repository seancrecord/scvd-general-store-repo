# Reusable plugin submissions

Prepared September 17, 2026. This is submission material; current human actions
are in [KEEPER_LIST](../KEEPER_LIST.md), builds/qualification in
[ROADMAP TR-D](../ROADMAP.md), and channel status in [DISTRIBUTION](../DISTRIBUTION.md).
No Cursor, Claude or Kiro application was sent in this audit.

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
showed **Sign in to apply** in the browser on September 17. The existing
cursor.directory record is a community channel. The keeper subsequently clarified
that SCVD is already in Cursor marketplace. The repo records
https://cursor.directory/plugins/scvd-general-store-repo; preserve it and reconcile
any additional cursor.com listing URL before proposing a new application. This is
not a request for another MCP server or a duplicate listing.

Use the shared repository and metadata above. Test the package in Cursor first:
both skills discoverable, expected MCP servers present, free preflight succeeds,
and no payment or unrelated repository task starts on installation. Capture the
host version and result. The docs describe local plugin testing under
`~/.cursor/plugins/local/`; do not change the user's installed plugins merely to
make a static validation claim. Host installation has not been tested in this pass.

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

Before submitting, publish the corrected package and qualify a fresh Claude
installation: both skills available, only SCVD's HTTP server loaded, a free
preflight returns evidence, and unrelated browsing/build instructions do not run.
Run `claude plugin validate` on the plugin and retain its output. Version the
release consistently with the source manifests. No marketplace acceptance or
Cowork-specific runtime test is claimed.

## Kiro powers

[Kiro's form](https://kiro.dev/powers/submit/) now takes an Agent Plugins package.
No additional POWER.md wrapper is required by that route. Its
[creation guide](https://kiro.dev/docs/powers/create/) covers preparation/testing.
The form requires a working tested package, stable MCP services, and README
privacy/support links. Those links are added in this branch; publish them before
submission. Kiro host testing and the stability qualification remain outstanding.

Prepared form values:

| Field | Value |
| --- | --- |
| First / last name | Sean / Record |
| Organization | Read `author.name` in the root manifest |
| Email | Publisher contact to be confirmed; do not invent one |
| Use case | Verify agent commerce evidence |
| Public repository | https://github.com/seancrecord/scvd-general-store-repo |
| Domain/problem | Agents need to understand a payment challenge and the limits of signed evidence before deciding to spend. SCVD supplies preflight, receipt and observation tools with explicit gaps. |

The form links its publisher terms and privacy notice. Submission is not listing
approval. Record the returned receipt, then verify the public power page before
adding it to SCVD's trust records.

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
  No model tool call or gallery admission was tested. Release the correction
  on main, add the gallery topic, and verify the crawl.

## What to record after each host test

Record the exact public commit, host/version, discovered skills, loaded servers,
one free evidence call and its actual result, and whether anything unexpected
started. Keep a failed installation in the receipt. Never replace an unrun host
test with another host's passing schema or CI check. Add the external application
URL and outcome when a submission is actually made.
