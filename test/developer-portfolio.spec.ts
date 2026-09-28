import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { DISCOVERY_PROTOCOLS } from '@/store/discovery-protocols';

it('developer HTML and markdown expose SDKs and protocol scope as readable content', async () => {
  for (const accept of ['text/html', 'text/markdown']) {
    const body = await (await SELF.fetch('https://scvd.store/developers', { headers: { Accept: accept } })).text();
    // Check the page copy independently of structured data in script elements.
    const readable = accept === 'text/html'
      ? await new HTMLRewriter().on('script', { element(element) { element.remove(); } }).transform(new Response(body)).text()
      : body;
    const visible = readable.replace(/&#39;/g, "'");
    for (const name of ['scvd-preflight', 'x402-verify', 'x402-sign', 'scvd-corpus-client', 'scvd-defects', 'scvd-mcp-starter', 'Python', 'Go']) expect.soft(visible).toContain(name);
    for (const id of ['mpp','a2a','ucp']) expect.soft(visible).toContain(DISCOVERY_PROTOCOLS.find(p=>p.id===id)!.scope);
    expect.soft(visible).toContain('/corpus/brief');
    expect.soft(visible).not.toContain('This store ships none');
    expect.soft(visible).not.toContain('UCP, ACP, AP2 and MPP are not');
  }
});
