import { checkEndpointSchema } from '@agentcash/discovery';
const request = Buffer.from(JSON.stringify({
  amount: '1000000',
  currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  methodDetails: { chainId: 8453, decimals: 6, credentialTypes: ['authorization'] },
  recipient: '0xDD350976B8cfFc65938C0464d39A2C78BE079bd0',
})).toString('base64url');
const header = `Payment id="fixture", realm="example.com", method="evm", intent="charge", request="${request}"`;
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/anchor') && init?.method === 'GET') {
    return new Response('{}', { status: 402, headers: { 'WWW-Authenticate': header } });
  }
  return new Response(null, { status: 404 });
};
const result = await checkEndpointSchema({ url: 'https://example.com/anchor', probe: true });
console.log(JSON.stringify(result, null, 2));
