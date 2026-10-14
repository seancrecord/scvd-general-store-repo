// Bundle with esbuild (platform=node), then run the output with Node.
// Two loopback origins exercise the real middleware with fixture documents.
import { createServer } from "node:http";
import { Hono } from "hono";
import { discoveryCors } from "../../src/lib/cors";
import { conditionalGet } from "../../src/lib/conditional-get";
import type { HonoEnv } from "../../src/types";

const app = new Hono<HonoEnv>();
const requests: Array<{ method: string; path: string; status: number }> = [];
app.use("*", async (c, next) => {
  await next();
  requests.push({ method: c.req.method, path: c.req.path, status: c.res.status });
});
app.use("*", discoveryCors);
app.use("*", conditionalGet);
app.get("/document.md", (c) => c.text("# Public fixture\n", 200, {
  "Content-Type": "text/markdown", Link: '</catalog>; rel="api-catalog"',
}));
app.get("/room", (c) => c.html("<html><head><title>HTML fixture</title></head><body>Same origin</body></html>"));
app.get("/personal.json", (c) => c.json({ private: true }, 200, { "Cache-Control": "private, no-cache" }));

const api = createServer(async (req, res) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
  }
  const response = await app.request(`http://127.0.0.1${req.url}`, { method: req.method, headers });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
const address = api.address();
if (!address || typeof address === "string") throw new Error("No API port");
const origin = `http://127.0.0.1:${address.port}`;

const page = `<!doctype html><html><head><title>Discovery browser check</title></head><body>
<h1>Discovery browser check</h1><button id="run">Run local check</button><pre id="result">Ready</pre>
<script>
document.querySelector('#run').onclick = async () => {
 const result = document.querySelector('#result');
 result.textContent = 'Running';
 const base = ${JSON.stringify(origin)};
 const rows = [];
 try {
  const first = await fetch(base + '/document.md', { cache: 'no-store' });
  const tag = first.headers.get('ETag');
  rows.push({step:'public document', pass:first.status===200 && !!tag && !!first.headers.get('Link'), status:first.status});
  await first.text();
  const next = await fetch(base + '/document.md', {cache:'no-store', headers:{'If-None-Match':tag}});
  rows.push({step:'conditional recheck', pass:next.status===304 && !!next.headers.get('ETag') && !!next.headers.get('Link'), status:next.status});
  for (const path of ['/room','/personal.json']) {
   let blocked = false;
   try { await fetch(base + path, {cache:'no-store', headers:{'If-None-Match':'"old"'}}); } catch { blocked = true; }
   rows.push({step:path + ' remains blocked', pass:blocked});
  }
  let blocked = false;
  try { await fetch(base + '/document.md', {headers:{'If-None-Match':tag, Authorization:'test-only'}}); } catch {blocked=true;}
  rows.push({step:'authorization header remains blocked', pass:blocked});
  result.textContent=JSON.stringify({pass:rows.every(row=>row.pass),rows}, null, 2);
 } catch(error) { result.textContent=JSON.stringify({pass:false,error:String(error),rows},null,2); }
};
</script></body></html>`;
const reader = createServer((req, res) => {
  if (req.url === "/observed") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(requests, null, 2));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(page);
});
await new Promise<void>((resolve) => reader.listen(0, "127.0.0.1", resolve));
const readerAddress = reader.address();
if (!readerAddress || typeof readerAddress === "string") throw new Error("No reader port");
console.log(`Reader: http://127.0.0.1:${readerAddress.port}`);
console.log(`API: ${origin}`);
