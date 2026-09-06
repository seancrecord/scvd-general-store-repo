import type { Env } from '@/types';

/** Shared by the checkout and its descriptions; no SDK or request state here. */
export const BASE_NETWORK = 'eip155:8453';
export const POLYGON_NETWORK = 'eip155:137';
export const ARBITRUM_NETWORK = 'eip155:42161';
export const WORLD_NETWORK = 'eip155:480';
export const SOLANA_NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export type PaymentNetworkConfig = Pick<Env, 'PAY_TO_ADDRESS' | 'POLYGON_PAY_TO' | 'SOLANA_PAY_TO' | 'ARBITRUM_PAY_TO' | 'WORLD_PAY_TO'>;

export function polygonPayTo(env: PaymentNetworkConfig): string | null {
  const address = env.POLYGON_PAY_TO?.trim();
  return address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : null;
}

export function solanaPayTo(env: PaymentNetworkConfig): string | null {
  const address = env.SOLANA_PAY_TO?.trim();
  return address && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) ? address : null;
}

export function arbitrumPayTo(env: PaymentNetworkConfig): string | null {
  return evmAddress(env.ARBITRUM_PAY_TO);
}
export function worldPayTo(env: PaymentNetworkConfig): string | null {
  return evmAddress(env.WORLD_PAY_TO);
}
function evmAddress(raw?: string): string | null {
  const address = raw?.trim();
  return address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : null;
}

/** A bank walk must never borrow the receiving wallet of a different chain. */
export function evmCheckoutPayTo(env: PaymentNetworkConfig, key: string): string | null {
  if (key === 'base') return evmAddress(env.PAY_TO_ADDRESS);
  if (key === 'polygon') return polygonPayTo(env);
  if (key === 'arbitrum') return arbitrumPayTo(env);
  if (key === 'world') return worldPayTo(env);
  return null;
}

const NETWORKS = [
  { key: 'base', explorer: 'https://basescan.org', label: 'Base', network: BASE_NETWORK, enabled: (_env: PaymentNetworkConfig) => true },
  { key: 'polygon', explorer: 'https://polygonscan.com', label: 'Polygon', network: POLYGON_NETWORK, enabled: (env: PaymentNetworkConfig) => Boolean(polygonPayTo(env)) },
  { key: 'arbitrum', explorer: 'https://arbiscan.io', label: 'Arbitrum', network: ARBITRUM_NETWORK, enabled: (env: PaymentNetworkConfig) => Boolean(arbitrumPayTo(env)) },
  { key: 'world', explorer: 'https://worldscan.org', label: 'World', network: WORLD_NETWORK, enabled: (env: PaymentNetworkConfig) => Boolean(worldPayTo(env)) },
  { key: 'solana', explorer: 'https://solscan.io', label: 'Solana', network: SOLANA_NETWORK, enabled: (env: PaymentNetworkConfig) => Boolean(solanaPayTo(env)) },
] as const;

export function checkoutNetworks(env: PaymentNetworkConfig) {
  return NETWORKS.filter(network => network.enabled(env));
}

export function acceptedNetworks(env: PaymentNetworkConfig): string[] {
  return checkoutNetworks(env).map(network => network.network);
}

export function paymentNetworkNames(env: PaymentNetworkConfig): string {
  return checkoutNetworks(env).map(network => network.label).join(', ');
}

export function paymentMethod(env?: PaymentNetworkConfig): string {
  return env
    ? `USDC over x402 v2 on ${paymentNetworkNames(env)}`
    : 'USDC over x402 v2; choose a network offered in the current payment quote';
}

export function paymentNetworkGuide(env: PaymentNetworkConfig): string {
  return `Current checkout networks: ${checkoutNetworks(env).map(row => `${row.label} (${row.network})`).join(', ')}. The current PAYMENT-REQUIRED challenge determines which network, asset and amount to sign. A statement or audit's network input selects what to inspect, not how to pay.`;
}


/** Old certificates without a network predate the additional checkout rails. */
export function settlementExplorer(network: string | undefined, transaction: string): string | null {
  const row = NETWORKS.find(row => row.network === network || row.key === network || (!network && row.key === 'base'));
  return row ? `${row.explorer}/tx/${encodeURIComponent(transaction)}` : null;
}
