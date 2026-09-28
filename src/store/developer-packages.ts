import verifier from '../../verifier/package.json';
import signer from '../../signer/package.json';
import preflight from '../../x402-preflight/package.json';
import corpus from '../../corpus-client/package.json';
import defects from '../../defects/package.json';
import mcp from '../../mcp-starter/package.json';

// The public names and descriptions belong to the packages, not a second catalog.
export const DEVELOPER_PACKAGES = [verifier, signer, preflight, corpus, defects, mcp].map(p => ({
  href: `https://www.npmjs.com/package/${p.name}`,
  label: p.name,
  what: p.description,
}));
const source = preflight.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
export const PREFLIGHT_LANGUAGE_GUIDES = [
  { href: `${source}/tree/main/${preflight.repository.directory}`, label: 'JavaScript preflight SDK', what: preflight.description },
  { href: `${source}/tree/main/x402-preflight-py`, label: 'Python preflight SDK', what: 'SCVD preflight client and command. Installation and worked examples are in the package README.' },
  { href: `${source}/tree/main/x402-preflight-go`, label: 'Go preflight SDK', what: 'SCVD preflight client and command. Installation and worked examples are in the module README.' },
];
