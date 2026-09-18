/**
 * THE MPP SDK'S THREE MCP METADATA KEYS, SPELLED ONCE WITHOUT THE SDK.
 *
 * The SDK defines them (mppx `Mcp.credentialMetaKey`,
 * `Mcp.paymentRequiredMetaKey`, `Mcp.receiptMetaKey`); discovery
 * (lib/purchase-capabilities.ts) is shared with the doors Worker, which
 * carries no SDK, so the names live here as literals and
 * test/mpp-mcp-checkout.spec.ts holds them equal to the SDK's own.
 * The store's MCP lane (lib/mcp-mpp-payment.ts) reads the SDK's directly.
 */
export const MCP_CREDENTIAL_META_KEY = "org.paymentauth/credential";
export const MCP_PAYMENT_REQUIRED_META_KEY = "org.paymentauth/payment-required";
export const MCP_RECEIPT_META_KEY = "org.paymentauth/receipt";
