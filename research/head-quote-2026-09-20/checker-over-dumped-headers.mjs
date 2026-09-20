// Their whole pipeline, unmodified, over the headers the FIXED worker
// produced under test. Only the transport is stubbed: a request to the
// door is answered from the dump, everything else (their OpenAPI read)
// goes to the live origin untouched.
import { readFileSync } from "node:fs";
import { checkEndpointSchema, getWarningsForL3 } from "/root/.npm/_npx/8d201a0bcab21ca3/node_modules/@agentcash/discovery/dist/index.js";

const DOOR = "https://scvd.store/api/buy/hello";
const dump = JSON.parse(readFileSync(process.argv[2], "utf8"));
const real = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  if (url.split("?")[0] !== DOOR) return real(input, init);
  const row = dump[method];
  // Only GET and HEAD are in the dump; their probe also tries POST/PUT/…
  // and the store answers those 404/405, which their isUsableStatus
  // drops. Answering 405 here keeps that shape.
  if (!row) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (row.paymentRequired) headers.set("payment-required", row.paymentRequired);
  if (row.wwwAuthenticate) headers.set("www-authenticate", row.wwwAuthenticate);
  return new Response(method === "HEAD" ? null : "{}", { status: row.status, headers });
};

const result = await checkEndpointSchema({ url: DOOR, probe: true });
if (!result.found) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
console.log(JSON.stringify(result.advisories.map(({ method, ...l3 }) => ({
  method,
  authMode: l3.authMode,
  hasInputSchema: !!l3.inputSchema,
  paymentOptions: (l3.paymentOptions ?? []).length,
  warnings: getWarningsForL3(l3).map((w) => w.message ?? w.code ?? String(w)),
})), null, 2));
