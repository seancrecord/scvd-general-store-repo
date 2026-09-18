#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

/** A partial or missing quote is a failure to observe, never agreement. */
export function compareQuote(item, detail, quote, networks, decimals) {
  const errors = [];
  if (detail?.price_usdc !== item.price_usdc) errors.push('item_price');
  if (quote.status !== 402) errors.push('quote_status');
  if (quote.body?.min_price_usdc !== item.price_usdc) errors.push('quote_price');
  const accepts = quote.challenge?.accepts;
  if (!Array.isArray(accepts) || !accepts.length || !networks?.length || !Number.isInteger(decimals)) return [...errors, 'terms_unobserved'];
  const expected = networks.flatMap(network => item.price_tiers_usdc.map(tier => `${network}:${Math.round(tier * 10 ** decimals)}`)).sort();
  const actual = accepts.map(a => `${a.network}:${a.amount ?? a.maxAmountRequired}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push('rail_amount_pairs');
  return errors;
}

export async function catalogSmoke(base = 'https://scvd.store', fetcher = fetch) {
  async function get(path, accept = 'application/json') {
    const response = await fetcher(new URL(path, base), { headers: { Accept: accept, 'User-Agent': 'scvd-catalog-review/1 (+https://scvd.store)' }, signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch { /* HTML and markdown are evidence too. */ }
    let challenge = body?.accepts ? body : undefined;
    const header = response.headers.get('payment-required');
    if (header) challenge = JSON.parse(Buffer.from(header, 'base64').toString());
    return { status: response.status, body, challenge, text };
  }
  const menu = (await get('/menu.json')).body;
  const compact = (await get('/menu.json?view=compact')).body;
  if (!menu?.items?.length || !compact?.checkout) throw new Error('Catalog or checkout contract unavailable');
  const rows = [];
  for (const item of menu.items) {
    const detail = await get(`/menu/${encodeURIComponent(item.id)}`);
    const quote = await get(`/api/buy/${encodeURIComponent(item.id)}`);
    rows.push({ id: item.id, catalog_price: item.price_usdc, detail_price: detail.body?.price_usdc,
      quote_status: quote.status, quote_price: quote.body?.min_price_usdc,
      terms: quote.challenge?.accepts?.map(a => ({ network: a.network, amount: a.amount ?? a.maxAmountRequired })),
      errors: compareQuote(item, detail.body, quote, menu.store.payment_networks, compact.checkout.asset_decimals) });
  }
  const pricing = await get('/pricing.md', 'text/markdown');
  const pricingRows = pricing.text.split('\n').filter(row => row.startsWith('| ['));
  const schema = await get('/openapi.json');
  const sitemap = await get('/sitemap.xml');
  const humanMenu = await get('/menu', 'text/html');
  const agentGuide = await get('/agents.md', 'text/markdown');
  const guideCounts = [...agentGuide.text.matchAll(/\b(\d+) priced doors/g)].map(match => Number(match[1]));
  const errors = [];
  if (agentGuide.status !== 200 || !guideCounts.length || guideCounts.some(count => count !== rows.length)) errors.push('agent_guide_count');
  if (compact.total !== menu.items.length) errors.push('compact_count');
  if (pricing.status !== 200 || pricingRows.length !== rows.length) errors.push('pricing_count');
  for (const item of menu.items) {
    const row = pricingRows.find(row => row.includes('`' + item.id + '`'));
    if (!row) errors.push(`pricing_missing:${item.id}`);
    const price = /\|\s*\$([0-9.]+)(?:–\$([0-9.]+))?/.exec(row ?? '');
    if (!price || Number(price[1]) !== Math.min(...item.price_tiers_usdc) || Number(price[2] ?? price[1]) !== Math.max(...item.price_tiers_usdc)) errors.push(`pricing_amount:${item.id}`);
    if (humanMenu.status !== 200 || !humanMenu.text.includes(`data-item="${item.id}"`)) errors.push(`menu_missing:${item.id}`);
    if (!schema.body?.paths?.[`/api/buy/${item.id}`]) errors.push(`openapi_missing:${item.id}`);
    if (!sitemap.text.includes(`/menu/${item.id}</loc>`)) errors.push(`sitemap_missing:${item.id}`);
  }
  // A rollout during the walk is not a stable contradiction.
  const after = (await get('/menu.json')).body;
  const terms = doc => JSON.stringify({ networks: doc?.store?.payment_networks, items: doc?.items?.map(i => [i.id, i.price_usdc, i.price_tiers_usdc]) });
  if (terms(menu) !== terms(after)) errors.push('catalog_changed_during_read');
  return { observed_at: new Date().toISOString(), base, scope: 'Active menu, bare unsigned quotes. No input eligibility, signing, settlement or fulfillment was exercised.',
    active_count: rows.length, agent_guide_counts: guideCounts, pricing_count: pricingRows.length, networks: menu.store.payment_networks,
    errors, rows, passed: !errors.length && rows.every(row => !row.errors.length) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await catalogSmoke(process.argv[2] ?? 'https://scvd.store');
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    console.error(`Catalog smoke could not complete: ${error.message}`);
    process.exitCode = 2;
  }
}
