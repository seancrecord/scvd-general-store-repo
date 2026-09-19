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
          // 2026-09-18: the meta description no longer carries the rail
          // list (it has a ~160-character budget; test/use-when.spec.ts
          // holds it), so it can only fail this check by naming a rail
          // that is off. The positive claim moved to the WebSite JSON-LD
          // description on the same page, which has no budget.
          const meta = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
          expect(meta).toBeTruthy();
          if (!configuration.keys.includes('polygon')) expect(meta).not.toContain('Polygon');
          if (!configuration.keys.includes('solana')) expect(meta).not.toContain('Solana');
          const webSite = html.match(/"@type":"WebSite"[^<]*?"description":"([^"]+)"/)?.[1];
          expect(webSite, 'no WebSite JSON-LD description on the storefront').toBeTruthy();
          for (const label of configuration.labels) expect(webSite).toContain(label);
          if (!configuration.keys.includes('polygon')) expect(webSite).not.toContain('Polygon');
          if (!configuration.keys.includes('solana')) expect(webSite).not.toContain('Solana');
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

/**
 * THE SECOND LANE, NAMED WHERE THE FIRST ONE IS (2026-09-19, the MPP-P1
 * wording follow-up). Native MPP checkout opened on every HTTP door
 * (#790), the MCP door and the browser bridge, and every surface that
 * said how the till is paid kept saying x402 alone: true, and no longer
 * the whole truth, on the exact sentence an MPP client reads before
 * deciding whether to stay. The sentence is now derived from the same
 * predicate that mints the challenge, so this walks the surfaces twice —
 * lane offered, lane withheld — and asserts the clause follows the fact
 * in both directions. Asserting the x402 clause survives intact is the
 * half that guards the older readers.
 */
describe('the checkout sentence names the native lane exactly while it is offered', () => {
  const withLane = { MPP_CHECKOUT_ENABLED: 'true', MPP_CHALLENGE_KEY: 'fixture-native-checkout-hmac-key' };
  const withoutLane = { MPP_CHECKOUT_ENABLED: 'false', MPP_CHALLENGE_KEY: 'fixture-native-checkout-hmac-key' };

  async function sentences(patch: Record<string, string>): Promise<Record<string, string>> {
    const bindings = { ...env, POLYGON_PAY_TO: '', SOLANA_PAY_TO: '', ...patch } as Env;
    const get = (path: string, accept = 'application/json', init: RequestInit = {}) =>
      app.request(base + path, { ...init, headers: { Accept: accept, ...(init.headers ?? {}) } }, bindings);
    const storefront = await (await get('/', 'text/html')).text();
    const menuPage = await (await get('/menu/settlement_attestation', 'text/html')).text();
    const openapi = await (await get('/openapi.json')).json() as { info: { description: string } };
    const ucp = await (await get('/.well-known/ucp')).json() as Record<string, { how_to_actually_buy?: { payment_method: string; http: string } }>;
    const menuMd = await (await get('/menu.json', 'text/markdown')).text();
    const ucpBlock = Object.values(ucp).find(block => block && typeof block === 'object' && 'how_to_actually_buy' in block);
    const howItWorks = await (await get('/how-it-works.json')).json() as { how_money_works: { rails: string } };
    const what = await (await get('/what')).json() as { one_question_per_shelf: { answer: string }[] };
    const mcpMd = await (await get('/mcp.md', 'text/markdown')).text();
    const developers = await (await get('/developers', 'text/markdown')).text();
    const itemMd = await (await get('/menu/settlement_attestation', 'text/markdown')).text();
    const initialize = await (await get('/mcp', 'application/json, text/event-stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'copy-walk', version: '0' } } }),
    })).json() as { result: { instructions: string } };
    return {
      storefront_pay_rails: storefront.match(/<p class="pay-rails">([^<]+)</)?.[1] ?? '',
      storefront_website_jsonld: storefront.match(/"@type":"WebSite"[^<]*?"description":"([^"]+)"/)?.[1] ?? '',
      menu_page_offer: menuPage.match(/"acceptedPaymentMethod":"([^"]+)"/)?.[1] ?? '',
      menu_page_checklist: menuPage.match(/<strong>Checkout:<\/strong> ([^<]+)<\/p>/)?.[1] ?? '',
      openapi_info: openapi.info.description,
      ucp_payment_method: ucpBlock?.how_to_actually_buy?.payment_method ?? '',
      ucp_http_line: ucpBlock?.how_to_actually_buy?.http ?? '',
      menu_markdown_buying: menuMd.split('\n').find(line => line.startsWith('Buying:')) ?? '',
      how_it_works_rails: howItWorks.how_money_works.rails,
      what_long_tail: what.one_question_per_shelf.find(pair => pair.answer.includes('Buy: GET'))?.answer ?? '',
      mcp_md_paid_shelves: mcpMd.split('\n').find(line => line.includes('paid shelves')) ?? '',
      developers_lede: developers.split('\n\n').find(block => block.includes('paid ones take')) ?? '',
      item_markdown_buy: itemMd.split('\n').find(line => line.startsWith('- **buy:**')) ?? '',
      mcp_instructions: initialize.result.instructions,
    };
  }

  it('names MPP on every surface while the lane is offered, and on none while it is withheld', async () => {
    const offered = await sentences(withLane);
    const withheld = await sentences(withoutLane);
    for (const [surface, sentence] of Object.entries(offered)) {
      expect(sentence, `${surface} read nothing`).not.toBe('');
      expect(sentence, `${surface} with the lane offered`).toMatch(/over MPP|take MPP/);
      // The older reader's clause is untouched: the x402 lane is still named first, on its networks.
      expect(sentence, `${surface} still names x402`).toMatch(/x402/);
      expect(withheld[surface], `${surface} read nothing with the lane withheld`).not.toBe('');
      expect(withheld[surface], `${surface} with the lane withheld`).not.toMatch(/MPP/);
    }
    // The derivation is one function, so the words agree across the surfaces that quote it whole.
    expect(offered.ucp_payment_method).toBe(offered.menu_page_offer);
    expect(offered.ucp_payment_method).toContain('USDC over x402 v2 on Base, or USDC over MPP (evm/charge) on Base for every shelf item');
  });
});
