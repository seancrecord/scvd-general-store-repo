import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { listingSpec } from '@/lib/listing-spec';
import { MENU_ITEMS } from '@/store';
import { app } from '@/index';
import { acceptedNetworks } from '@/lib/payments';
import type { Env } from '@/types';

const base = 'https://scvd.store';
const recipient = '0x1111111111111111111111111111111111111111';
const configurations = [
  { name: 'Arbitrum and World enabled', patch: { POLYGON_PAY_TO: '', SOLANA_PAY_TO: '', ARBITRUM_PAY_TO: recipient, WORLD_PAY_TO: recipient }, labels: ['Base', 'Arbitrum', 'World'], keys: ['base', 'arbitrum', 'world'] },
  { name: 'Base only', patch: { POLYGON_PAY_TO: '', SOLANA_PAY_TO: '' }, labels: ['Base'], keys: ['base'] },
  { name: 'Base, Polygon and Solana', patch: { POLYGON_PAY_TO: recipient, SOLANA_PAY_TO: '11111111111111111111111111111111' }, labels: ['Base', 'Polygon', 'Solana'], keys: ['base', 'polygon', 'solana'] },
  { name: 'Invalid optional recipients', patch: { POLYGON_PAY_TO: 'bad', SOLANA_PAY_TO: 'bad' }, labels: ['Base'], keys: ['base'] },
  { name: 'Base and Polygon', patch: { POLYGON_PAY_TO: recipient, SOLANA_PAY_TO: '' }, labels: ['Base', 'Polygon'], keys: ['base', 'polygon'] },
];

describe('payment claims follow the enabled checkout configuration', () => {
  for (const configuration of configurations) {
    it(configuration.name, async () => {
      const bindings = { ...env, ...configuration.patch } as Env;
      const get = (path: string, html = false) => app.request(base + path, { headers: { Accept: html ? 'text/html' : 'application/json' } }, bindings);
      const catalog = await (await get('/menu.json')).json() as { store: { chains: string[]; payment_networks: string[] } };
      expect(catalog.store.chains).toEqual(configuration.keys);
      expect(catalog.store.payment_networks).toEqual(acceptedNetworks(bindings));
      for (const path of ['/try', '/menu/settlement_attestation', '/']) {
        const html = await (await get(path, true)).text();
        if (path === '/') {
          const meta = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
          for (const label of configuration.labels) expect(meta).toContain(label);
          if (!configuration.keys.includes('polygon')) expect(meta).not.toContain('Polygon');
          if (!configuration.keys.includes('solana')) expect(meta).not.toContain('Solana');
        }
        const paymentLines = [...html.matchAll(/"(?:acceptedPaymentMethod|name)":"(USDC over x402 v2 on [^"]+|A wallet holding USDC on [^"]+)"/g)].map(match => match[1]!);
        expect(paymentLines.length, path).toBeGreaterThan(0);
        for (const line of paymentLines) {
          for (const label of configuration.labels) expect(line, path).toContain(label);
          if (!configuration.keys.includes('polygon')) expect(line, path).not.toContain('Polygon');
          if (!configuration.keys.includes('solana')) expect(line, path).not.toContain('Solana');
        }
      }
      const practice = await (await get('/try')).json() as { protocol: { networks: string[] } };
      expect(practice.protocol.networks).toEqual(acceptedNetworks(bindings));
      const skill = await (await get('/skill.md')).text();
      const currency = skill.match(/^  currency: (.+)$/m)?.[1];
      for (const label of configuration.labels) expect(currency).toContain(label);
      if (!configuration.keys.includes('solana')) expect(currency).not.toContain('Solana');
      expect(skill).not.toContain('Solana entries after');
      const rails = await (await get('/rails')).json() as { rails_accepted: string[] };
      expect(rails.rails_accepted).toEqual(acceptedNetworks(bindings));
      for (const path of ['/agents.md', '/AGENTS.md', '/index.md']) {
        const manual = await (await get(path)).text();
        const networkLine = manual.split('\n').find(line => line.startsWith('Current checkout networks:'));
        expect(networkLine, path).toBeDefined();
        for (const label of configuration.labels) expect(networkLine).toContain(label);
        if (!configuration.keys.includes('polygon')) expect(networkLine).not.toContain('Polygon');
        if (!configuration.keys.includes('solana')) expect(networkLine).not.toContain('Solana');
      }
      const guide = await (await get('/llms-full.txt')).text();
      expect(guide).not.toContain('Se paga en USDC sobre Base o Solana');
      expect(guide).toContain('Current checkout networks:');
    });
  }
});


it('listing specifications defer payment network selection to the current quote', () => {
  for (const item of MENU_ITEMS) {
    expect(listingSpec(item, base).price.network).toContain('accepts[].network');
    expect(listingSpec(item, base).verification.certificate_binds_note).not.toContain('a Base explorer');
  }
});
