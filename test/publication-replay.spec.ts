import { SELF } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';
import { installFacilitatorMock } from './helpers/facilitator-mock';
import { buildPaymentSignature, decodePaymentRequired } from './helpers/payment';
const base = 'https://scvd.store';
let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => { facilitator = installFacilitatorMock(); });
it('replays the exact markdown and original settlement header after verified same-key retry', async () => {
 const index = await (await SELF.fetch(base+'/almanac')).json() as {entries:{url:string}[]};
 const url = index.entries[0]!.url;
 const quote = decodePaymentRequired(await SELF.fetch(url));
 const offer = quote.accepts.find(a=>a.network==='eip155:8453')!;
 const payment = buildPaymentSignature(offer), key=crypto.randomUUID();
 const first = await SELF.fetch(url, {headers:{'PAYMENT-SIGNATURE':payment,'Idempotency-Key':key}});
 expect(first.status).toBe(200);
 const markdown = await first.text(), receipt = first.headers.get('PAYMENT-RESPONSE');
 expect(receipt).toBeTruthy();
 const settles = facilitator.settleCalls;
 // A fresh authorization with the SAME key models the dangerous buyer retry loop.
 const again = await SELF.fetch(url,{headers:{'PAYMENT-SIGNATURE':buildPaymentSignature(offer),'Idempotency-Key':key}});
 expect(again.status).toBe(200);
 expect(again.headers.get('Idempotency-Replay')).toBe('true');
 expect(again.headers.get('Content-Type')).toContain('text/markdown');
 expect(again.headers.get('PAYMENT-RESPONSE')).toBe(receipt);
 expect(await again.text()).toBe(markdown);
 expect(facilitator.settleCalls).toBe(settles);
 // Unpaid requests cannot pick up cached goods by knowing the key.
 expect((await SELF.fetch(url,{headers:{'Idempotency-Key':key}})).status).toBe(402);
});
