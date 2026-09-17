# Choose a package only when the task needs one

| Task | Existing option |
| --- | --- |
| Application or offline verification of x402 signed offers/receipts | `x402-verify`; inspect its installed README, exports and support matrix |
| Issue signed offers/receipts as the merchant | `x402-sign`; issuer key handling remains with the user's own application |
| Command-line endpoint inspection | `scvd-cli`; check installed help for supported commands and output |
| Local account of tools, trials and renewals | `scvd-tab`; local MCP server, with explicit consent before sending a contribution |
| One-off check in a connected host | Existing read-only MCP/browser tool, or the free HTTPS desk; no package installation required |

Install only what the user's environment and task require. Follow the selected
version's documentation rather than guessing an export or translating a hosted
request body into a library call. No package is required just to browse history.

The PS1–PS3 `x402-verify` 1.4.0 work is an unpublished local preview at the date
of this draft. Do not claim its status fields are available from npm until a
published-version install verifies them. This skill introduces no support for
new signature algorithms and makes no browser/Node/Workers parity promise.

For store-issued evidence bundles, `x402-verify` includes the `scvd-evidence`
command. Use its installed help and trusted key input; preserve the distinction
between bundle integrity, certificate signature, observation freshness and
what the underlying observations did not establish. For new artifacts,
keep user-controlled signing keys inside the user's own signer, never in a
request to the store or a chat message.
