Adds four entries from [seancrecord/scvd-general-store-repo](https://github.com/seancrecord/scvd-general-store-repo), the repository behind [scvd.store](https://scvd.store): two skills, the hosted MCP server, and the plugin that bundles its MCP connection and skills.

| Entry | What it provides |
| --- | --- |
| `scvd-general-store.json` | Task guidance for endpoint inspection, signed evidence checks, host history and store purchases. |
| `x402-before-you-pay.json` | Read x402 terms and use the free pre-payment checks before deciding whether to pay. |
| `scvd-general-store-mcp.json` | The published `store.scvd/general-store` 0.2.4 descriptor, using Streamable HTTP at `https://scvd.store/mcp`. |
| `scvd-general-store-plugin.json` | The repository's current plugin manifest, with the hosted MCP connection and skills. |

Free inspection covers observed x402/MPP terms and reports its gaps; it is not proof of settlement or delivery. Signed-offer and receipt checks have their own evidence contract. Dated corpus observations retain their scope and missing coverage. Current prices and enabled checkout methods are published at [menu.json](https://scvd.store/menu.json).

Free tools and resource reads require no wallet. Purchases require a payment the visitor chooses to sign; none of these entries supplies a wallet or asks for credentials, keys or wallet secrets. The store's MCP server supports its enabled x402 and native MPP checkout lanes.

Validation: the four descriptors pass this catalog's validator. The MCP version and description match the published registry descriptor; the plugin description matches its source manifest. This is a refresh of the existing submission, not a new admission claim.
