// Their published checker, their register flow, our door — one path, both methods.
import { checkEndpointSchema, getWarningsForL3 } from "/root/.npm/_npx/8d201a0bcab21ca3/node_modules/@agentcash/discovery/dist/index.js";

const url = process.argv[2];
if (!url) { console.error("usage: node mppscan-check.mjs <url>"); process.exit(2); }

const result = await checkEndpointSchema({ url, probe: true });
if (!result.found) {
  console.log(JSON.stringify({ url, found: false, cause: result.cause, message: result.message }, null, 2));
  process.exit(0);
}
const rows = result.advisories.map((advisory) => {
  const { method, ...l3 } = advisory;
  return {
    method,
    authMode: l3.authMode,
    hasInputSchema: !!l3.inputSchema,
    paymentOptions: (l3.paymentOptions ?? []).length,
    warnings: getWarningsForL3(l3).map((w) => w.message ?? w.code ?? String(w)),
  };
});
console.log(JSON.stringify({ url, path: result.path, rows }, null, 2));
