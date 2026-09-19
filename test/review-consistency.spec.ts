import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { MENU_ITEMS } from '@/store';
import { VERIFIER_TOOLS } from '@/routes/mcp-verifier';
import { acceptedNetworks } from '@/lib/payment-networks';
import { CLIENT_CAP_USD, readAgainstCap } from '@/lib/client-spend-cap';
import { priceTiersUsdc } from '@/lib/payments';
import type { Env } from '@/types';
import { webmcpTools } from '@/routes/webmcp';
import { compactItemContract } from '@/lib/buyer-contract';
import { COMPACT_ITEM_CONTRACT_BUDGET_BYTES } from '@/store/reader-limits';
import { productionShape } from './helpers/production-shape';

const BASE = 'https://scvd.store';
interface Tool { name: string; annotations: Record<string, unknown> }
async function listed(path: string): Promise<Tool[]> {
  const response = await SELF.fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const body = await response.json() as { result: { tools: Tool[] } };
  return body.result.tools;
}

describe('September review regressions', () => {
  it('serves identical behavioral annotations for every shared handler', async () => {
    const full = await listed('/mcp');
    const verifier = await listed('/mcp/verifier');
    for (const alias of VERIFIER_TOOLS.filter(entry => entry.base)) {
      const original = full.find(tool => tool.name === alias.base)!;
      const renamed = verifier.find(tool => tool.name === alias.name)!;
      const { title: baseTitle, ...baseEffects } = original.annotations;
      const { title: aliasTitle, ...aliasEffects } = renamed.annotations;
      expect(baseTitle).toBeTruthy();
      expect(aliasTitle).toBe(alias.title);
      expect(aliasEffects, alias.name).toEqual(baseEffects);
      expect(baseEffects).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
      // Hints describe effects, not whether this free instrument is available.
      expect(webmcpTools().map(tool => tool.name)).toContain(alias.base);
    }
  });

  it('shows every generated price on the browser pricing page as well as JSON', async () => {
    const html = await (await SELF.fetch(BASE + '/pricing', { headers: { Accept: 'text/html' } })).text();
    const payload = await (await SELF.fetch(BASE + '/pricing', { headers: { Accept: 'application/json' } })).json() as { items: { id: string; price_tiers_usdc: number[] }[] };
    const priced = MENU_ITEMS.filter(item => item.price_usdc > 0);
    expect(html).toContain('data-price-list');
    expect(payload.items.map(item => item.id).sort()).toEqual(priced.map(item => item.id).sort());
    for (const item of priced) {
      expect(html).toContain(`data-item="${item.id}"`);
      expect(html).toContain(`/menu/${item.id}`);
    }
  });
});

interface Checklist { networks: string[] | null; required_params: string[]; default_client: { compatible: boolean | null; ceiling_usdc: number; maxAmountPerPayment: string } }
it('publishes the same generated checklist on each compact contract and item page', async () => {
  for (const item of MENU_ITEMS) {
    const payload = await (await SELF.fetch(`${BASE}/menu/${item.id}?view=compact`)).json() as { purchase_checklist: Checklist; required_params: string[] };
    expect(payload.purchase_checklist, item.id).toBeDefined();
    expect(payload.purchase_checklist.networks).toEqual(acceptedNetworks(env as unknown as Env));
    expect(payload.purchase_checklist.required_params).toEqual(payload.required_params);
    const reading = readAgainstCap(priceTiersUsdc(item));
    expect(payload.purchase_checklist.default_client.compatible).toBe(reading ? !reading.blocked : null);
    expect(payload.purchase_checklist.default_client.ceiling_usdc).toBe(CLIENT_CAP_USD);
    const html = await (await SELF.fetch(`${BASE}/menu/${item.id}`, { headers: { Accept: 'text/html' } })).text();
    expect(html, item.id).toContain('data-purchase-checklist');
  }
});
it('puts four first actions ahead of the activity board', async () => {
  const html = await (await SELF.fetch(BASE, { headers: { Accept: 'text/html' } })).text();
  const actions = /<nav[^>]*data-first-actions[\s\S]*?<\/nav>/.exec(html)?.[0];
  expect(actions).toBeDefined();
  const cheapest = [...MENU_ITEMS].filter(item => item.price_usdc > 0).sort((a,b) => a.price_usdc - b.price_usdc)[0]!;
  for (const href of ['/menu', '/try', `/menu/${cheapest.id}`, '/mcp.md']) expect(actions).toContain(`href="${href}"`);
  for (const match of actions!.matchAll(/href="([^"]+)"/g)) {
    const response = await SELF.fetch(BASE + match[1]);
    expect(response.status, match[1]).toBe(200);
  }
  expect(html.indexOf('data-first-actions')).toBeLessThan(html.indexOf('class="gauges"'));
});

it('follows enabled checkout flags and retains optional tip ceilings', async () => {
  const { purchaseChecklist } = await import('@/lib/purchase-checklist');
  const off = { PAY_TO_ADDRESS: '0x1111111111111111111111111111111111111111' };
  const on = { ...off, POLYGON_PAY_TO: off.PAY_TO_ADDRESS, ARBITRUM_PAY_TO: off.PAY_TO_ADDRESS, WORLD_PAY_TO: off.PAY_TO_ADDRESS, SOLANA_PAY_TO: '11111111111111111111111111111111' };
  // The fourth shape is production's: every rail and the native lane, through the real bindings (2026-09-19).
  for (const config of [off, on, { ...on, ARBITRUM_PAY_TO: 'invalid', WORLD_PAY_TO: '' }, productionShape(env as unknown as Env)]) {
    for (const item of MENU_ITEMS) {
      const checklist = purchaseChecklist(item, config);
      expect(checklist.networks).toEqual(acceptedNetworks(config));
      expect(new TextEncoder().encode(JSON.stringify(compactItemContract(item, BASE, config))).length, item.id).toBeLessThan(COMPACT_ITEM_CONTRACT_BUDGET_BYTES);
      expect(checklist.price_tiers_usdc).toEqual(priceTiersUsdc(item));
      expect(checklist.default_client.tiers_above_ceiling).toBe(priceTiersUsdc(item).filter(tier => tier > CLIENT_CAP_USD).length);
    }
  }
});
