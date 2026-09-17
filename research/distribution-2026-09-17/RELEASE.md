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
