import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '@/index';
import { checkoutNetworks } from '@/lib/payment-networks';
import { EVM_CHAINS } from '@/lib/base-rpc';
import { storeIdentity } from '@/lib/identity';
import { factBlockText } from '@/lib/listing-spec';
import { MENU_ITEMS } from '@/store';
import { TILL_SIGNATURE_WARNING } from '@/lib/till-shelf';
import { STACK_DEPENDENCIES } from '@/store/stack';
import { STANDARDS_POSTURE } from '@/store/standards';
import { PRACTICE_COUNTER_COPY } from '@/store/copy/practice-counter';
import { CHEAPEST_ON_THE_SHELF } from '@/store/copy/position';
import readme from '../README.md?raw';
import type { Env } from '@/types';

const base = 'https://scvd.store';
const recipient = '0x1111111111111111111111111111111111111111';

describe('secondary buyer surfaces follow the payment contract', () => {
  for (const enabled of [false, true]) {
    it(`browser wallet hints match enabled EVM quotes (${enabled})`, async () => {
      const bindings = { ...env, POLYGON_PAY_TO: enabled ? recipient : '',
        ARBITRUM_PAY_TO: enabled ? recipient : '', WORLD_PAY_TO: enabled ? recipient : '',
        SOLANA_PAY_TO: enabled ? '11111111111111111111111111111111' : '' } as Env;
      const expected = checkoutNetworks(bindings).filter(r => r.network.startsWith('eip155:'))
        .map(r => Number(r.network.split(':')[1]));
      for (const path of ['/try', '/menu/small_blessing']) {
        const response = await app.request(base + path, { headers: { Accept: 'text/html' } }, bindings);
        expect(response.status).toBe(200);
        const html = await response.text();
        const island = html.match(/id="scvd-till-shelf">([\s\S]*?)<\/script>/)?.[1];
        expect(island, path).toBeDefined();
        const shelf = JSON.parse(island!);
        expect(shelf.evm_chains, path).toEqual(expected);
        expect(shelf.wallet_limit).toContain('current quote');
        expect(shelf.standfirst).not.toContain('Base or Polygon');
      }
      const json = await (await app.request(base + '/try', {}, bindings)).json() as {
        browser_checkout: { wallet_limit: string };
      };
      expect(json.browser_checkout.wallet_limit).toContain('current quote');
    });
  }

  it('receipt and discovery copy select networks from the quote', () => {
    expect(storeIdentity(base).what).toContain('current payment quote');
    for (const item of MENU_ITEMS) {
      expect(factBlockText(item)).not.toContain('x402, Base');
      expect(factBlockText(item)).toContain('network from the current quote');
    }
  });

  it('browser signing advice compares with the quote rather than hardcoding a domain', () => {
    expect(TILL_SIGNATURE_WARNING).toContain('selected quote');
    expect(TILL_SIGNATURE_WARNING).not.toContain('domain reads "USD Coin"');
  });

  it('practice pricing and statements describe the current shelf', () => {
    expect(PRACTICE_COUNTER_COPY.why.join(' ')).toContain(CHEAPEST_ON_THE_SHELF);
    expect(PRACTICE_COUNTER_COPY.why.join(' ')).not.toContain('Half a cent is the cheapest');
    for (const id of ['the_statement', 'operator_statement']) {
      const item = MENU_ITEMS.find(item => item.id === id)!;
      expect(JSON.stringify(item)).not.toContain('six EVM chains');
      expect(JSON.stringify(item)).toContain('input contract');
    }
    const checkout = readme.split('Checkout integration supports ')[1]?.split(';')[0];
    const readers = readme.split('Statement readers support ')[1]?.split('. Individual')[0];
    const all = { ...env, POLYGON_PAY_TO: recipient, ARBITRUM_PAY_TO: recipient,
      WORLD_PAY_TO: recipient, SOLANA_PAY_TO: '11111111111111111111111111111111' } as Env;
    for (const network of checkoutNetworks(all)) expect(checkout).toContain(network.label);
    for (const chain of EVM_CHAINS) expect(readers).toContain(chain.label);
    expect(readers).toContain('Solana');
  });

  it('standards and dependency disclosures describe current settlement ordering and offer placement', () => {
    const standards = JSON.stringify(STANDARDS_POSTURE);
    expect(standards).not.toContain('settlement before goods move');
    expect(standards).toContain('402 JSON body');
    const dependencies = JSON.stringify(STACK_DEPENDENCIES);
    expect(dependencies).not.toContain('Base, Polygon, and Solana');
    expect(dependencies).toContain('outcome unknown');
    expect(dependencies).not.toContain('the one item that queries the chain');
  });
});
