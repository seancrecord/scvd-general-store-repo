# Distribution follow-through — September 18, 2026

These are dated completion records. Pending submissions are not public listings.

| Channel | Completed | Remaining / evidence |
| --- | --- | --- |
| Kiro Powers | Native local Power loaded both skills and exposed both MCP servers; free preflight returned the expected not_ready / L1 for example.com. Application submitted with keeper-approved company contact and terms; receipt confirmed. | Review pending. [Sanitized receipt](kiro-qualification.json), [tracking](https://github.com/seancrecord/scvd-general-store-repo/pull/800#issuecomment-5733234892). IDE, paid and Tab operations untested. |
| Cline | CLI installed the verification skill and remote MCP configuration. Catalog validation/generation passed; separate MCP SDK check using that config completed a free preflight. | [Skill PR #122](https://github.com/cline/marketplace/pull/122), [MCP PR #123](https://github.com/cline/marketplace/pull/123), both open at readback. [Receipt](cline-qualification.json). Cline model execution untested. |
| Cursor Directory | Owner updated text, keywords, both skills and pinned Tab config; public readback confirmed. | [Receipt](cursor-directory-update.md), [public listing](https://cursor.directory/plugins/scvd-general-store-repo). Official marketplace application remains pending and native skill discovery unresolved. |
| Global A2A Registry | Keeper completed claim; public Verified label confirmed. | [Listing](https://www.a2a-registry.org/agent/store.scvd.scvd_evidence_agent), [record](https://github.com/seancrecord/scvd-general-store-repo/pull/800#issuecomment-5732404682). Ownership is not task conformance or an audit. |
| AIFI | Issue #12 automation could not create a PR because of repository token permissions; submitted its generated change through a fork PR. | [PR #13](https://github.com/0xBebis/aifi-directory/pull/13) open; Workers build passed. No listing claimed. |

## Other existing submissions, re-read September 18

[GitHub status receipt](submission-status.json).

- [Awesome Copilot #3255](https://github.com/github/awesome-copilot/issues/3255): open; automated intake passed; maintainer review pending.
- [Agent Finder #34](https://github.com/github/agentfinder-catalog/pull/34): open; no checks reported.
- [MPP #991](https://github.com/tempoxyz/mpp/pull/991): open; service/security checks passed, Vercel preview authorization failed, merge job skipped. The preview authorization URL is an upstream team gate; no deployment acceptance is claimed.
- [HOL #349](https://github.com/hashgraph-online/awesome-ai-plugins/pull/349): open; required contribution gate passed, advisory scanner still failed. [Existing triage](hol-scan-triage.json) remains the explanation, not a clean-scan claim.

No duplicate requests or unchanged-state nudges were sent. Source main also now
contains [MCP MPP support](../../docs/MPP_MCP_CHECKOUT_2026-09-18.md) from PR #804;
the older distribution sentence saying MCP remains x402-only is superseded.
This reconciliation did not perform a live paid MPP test.


## Additional host routes checked

- **Zed:** its [publishing prerequisites](https://zed.dev/docs/extensions/publishing/prerequisites) say MCP extensions are headed for replacement by the MCP registry, restrict each extension to one MCP server, and require a native test. Agent-server extension submissions are already deprecated in favor of ACP. Recommendation: qualify SCVD through its existing MCP identity before considering a separate wrapper. No Zed listing or host compatibility is claimed.
- **Windsurf:** the [extension marketplace](https://marketplace.windsurf.com/) is Open VSX, which distributes editor extensions. The [plugins documentation](https://docs.windsurf.com/plugins) describes installing Windsurf itself in other editors. Neither page establishes a submission route for our existing portable skill-plus-MCP package. A bounded docs search did not find an MCP Marketplace submission instruction; this is an unresolved route, not proof none exists.

- **OpenCode:** [skills documentation](https://opencode.ai/docs/skills) supports existing SKILL.md packages under native or agent-compatible directories; its [ecosystem page](https://dev.opencode.ai/docs/ecosystem/) accepts PRs for OpenCode-related projects. Its executable plugins are a different format. OpenCode CLI 1.18.31 discovered both unchanged SCVD skills and connected both MCP servers in an isolated native check; [receipt](opencode-qualification.json). A run with the host's listed free model was rejected by its provider (403 FreeTierError) before skill/tool execution, despite using the official CLI. The same error is already reported in [OpenCode #49678](https://github.com/anomalyco/opencode/issues/49678); no duplicate issue was opened. This is not evidence of a skill or MCP defect. Resolve native execution and prepare a reusable install document before an ecosystem submission.
- **VoltAgent awesome-agent-skills:** [contribution rules](https://github.com/VoltAgent/awesome-agent-skills/blob/main/CONTRIBUTING.md) require real community use and reject brand-new, unproven skills. Our controlled qualification runs and directory presence do not establish that adoption requirement. No submission or adoption claim made.
