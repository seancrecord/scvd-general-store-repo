/**
 * THE STORE'S ERC-8004 AGENT, AS MINTED — identity as data.
 *
 * Moved out of services/agent-registration on 2026-09-15 so that a
 * document builder can name the agent without pulling a route tree
 * behind it. The registration file's module imports `@/routes/mcp`
 * for the protocol version, which reaches `cloudflare:workers`, which
 * is fine inside the Worker and fatal in a plain Node script — and
 * `npm run oasf:cut` is a plain Node script. The values are data
 * about who this store is, so they belong beside the rest of the
 * store's identity rather than inside the one document that happens
 * to have needed them first.
 *
 * The registry string is `{namespace}:{chainId}:{identityRegistry}`
 * per the ERC — the ERC-8004 Identity Registry on Base mainnet,
 * EIP-55 checksummed because a registry that string-compares a
 * lowercase address against its own checksummed one finds no match.
 *
 * Verifiable without asking us, and without a key or an account:
 * `ownerOf(86957)` against https://mainnet.base.org. The re-derivation,
 * and the `setAgentURI` transaction that bound the agent to this domain
 * on 2026-09-15, are in docs/ERC8004_AGENT_86957.md.
 */
export const SCVD_AGENT_ID = 86957;
export const SCVD_AGENT_REGISTRY =
  "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
