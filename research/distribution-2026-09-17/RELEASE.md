# Distribution release follow-through — September 17, 2026

The keeper completed the OpenAI skill update and authorized commit, PR, merge and further submissions. The update task is closed; review approval and publication of the updated OpenAI version are not inferred.

Integrated origin/main at `afe03926`, preserving the incoming host-feed/passport work, RobinSaige observation and native-host qualification record. Plugin wrappers move to 0.2.4 for consumer-scope corrections; the unchanged MCP registry service remains at its own version.

## Validation

- Five affected Worker spec files: 55 tests passed after integration and the version change.
- Listings/manifest checks: 37 passed. Outreach checks: six passed.
- Typecheck and Worker/MPP SDK bundle checks passed.
- New protocol, Gemini context and Claude MCP-scope regressions were demonstrated failing before the fixes; earlier receipts remain in observations.
- The full local suite is in progress. It caught the removed Smithery README ownership backlink; the link was restored before release. Final results and CI must be recorded before merge.

## Host observations

Fresh isolated Chrome 152.0.7977.83 loaded the live site with default flags and returned the registered WebMCP tool names/descriptions. No tool was invoked, wallet opened or payment attempted. [Receipt](observations/webmcp-fresh-browser.json). This confirms registration in that browser, not execution of each tool.

Claude loaded both packaged skills and invoked the store skill, but the plugin-scoped MCP server was not exposed in the bounded run. Its separate account connector was not permitted as a substitute. [Sanitized receipt](observations/claude-host-qualification.json). Native package qualification remains incomplete. No global host configuration was changed.

Gemini CLI 0.60.0 installed the public immutable release PR commit, discovered both packaged skills and connected the SCVD HTTP MCP server in isolated temporary storage. A short SHA fetch failed first; the full SHA succeeded. No model task or tool call ran. [Receipt](observations/gemini-host-qualification.json).

External follow-through: Merit [PR #715](https://github.com/Merit-Systems/awesome-agentic-commerce/pull/715) submitted; existing WebMCP [PR #41](https://github.com/webmachinelearning/awesome-webmcp/pull/41#issuecomment-5719818436) received a current-scope correction; existing x402 [PR #1024](https://github.com/xpaysh/awesome-x402/pull/1024) updated. None is claimed as an accepted listing.

PR [#778](https://github.com/seancrecord/scvd-general-store-repo/pull/778) passed quality and Worker builds on its first head. CodeQL flagged URL substring assertions in the new test; they now use parsed exact hostnames. CI must pass on the final head before merge. Raw captured third-party responses retain original whitespace; authored files pass the whitespace check.

The new-pin Copilot intake passed for 0.2.4 (`e7f6c068`); maintainer review remains. [Receipt](observations/copilot-024-intake.json). trust8004 [issue #1](https://github.com/trust8004/requests-issues/issues/1) was submitted after reproducing the cached-field conflict in its rendered Metadata tab and re-reading SCVD's canonical registration. [Receipt](observations/trust8004-submitted.json).

Use [PR #778](https://github.com/seancrecord/scvd-general-store-repo/pull/778) for the final merge/deployment and repository-topic receipt; its final checks must all pass before merge. Subsequent external acceptance is not assumed from this release.
