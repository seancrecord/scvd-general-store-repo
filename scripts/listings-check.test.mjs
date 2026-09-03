import assert from "node:assert/strict";
import test from "node:test";
import {
  classify,
  compare,
  currentProbe,
  sameAsFrom,
  sixtyWordsFrom,
  visibleText,
  walk,
} from "./lib/listings.mjs";

const SIXTY =
  "scvd.store is an evidence observatory for agentic commerce. Before an agent pays an x402 endpoint, we check that it can be paid. After it pays, we check the signed receipt.";

test("the current generation is the sixty words' second sentence, which truncating mirrors keep", () => {
  assert.equal(currentProbe(SIXTY), "before an agent pays an x402 endpoint, we check that it can be paid.");
  assert.equal(classify("Blah. Before an agent pays an x402 endpoint, we check that it can be paid. Blah", SIXTY), "current");
});

test("each older generation is recognised by its own nouns, newest marker winning", () => {
  assert.equal(classify("A quirky, human-run store selling signed hellos and a genuine phone call", SIXTY), "july");
  assert.equal(classify("The trust layer of the x402 economy — free conformance checking", SIXTY), "august");
  assert.equal(classify("An evidence observatory for agentic commerce", SIXTY), "september");
  assert.equal(classify("An evidence observatory; also luckies from the herd", SIXTY), "september");
  assert.equal(classify("A directory of MCP servers", SIXTY), "unknown");
  assert.equal(classify("", SIXTY), "unknown");
});

test("the homepage yields the sixty words and the sameAs list", () => {
  const html = `<meta property="og:description" content="${SIXTY.replace(/"/g, "&quot;")}">
    <script type="application/ld+json">{"@type":"WebSite","url":"https://scvd.store/"}</script>
    <script type="application/ld+json">{"@type":"Organization","sameAs":["https://a.example/x","https://b.example/y"]}</script>`;
  assert.equal(sixtyWordsFrom(html), SIXTY);
  assert.deepEqual(sameAsFrom(html), ["https://a.example/x", "https://b.example/y"]);
});

test("visible text drops scripts, styles and tags, and decodes entities exactly once", () => {
  assert.equal(visibleText("<style>x{}</style><p>Hello &amp; <b>there</b></p><script>1</script>"), " Hello & there ");
  // A sloppy end tag still ends the script; a double-encoded entity stays one level decoded.
  assert.equal(visibleText("<script type='x'>secret()</script ><p>a &amp;lt; b</p>"), " a &lt; b ");
  assert.equal(visibleText("<script>secret()</script\t\n bar><p>ok</p>"), " ok ");
});

test("a mirror that moved backwards is a regression; forwards is news; unreachable both times is silence", () => {
  const baseline = { mirrors: [
    { url: "https://a.example", generation: "current" },
    { url: "https://b.example", generation: "july" },
    { url: "https://c.example", generation: "unreachable" },
  ] };
  const fresh = { mirrors: [
    { url: "https://a.example", generation: "august" },
    { url: "https://b.example", generation: "september" },
    { url: "https://c.example", generation: "unreachable" },
    { url: "https://d.example", generation: "unknown" },
  ] };
  const result = compare(baseline, fresh);
  assert.deepEqual(result.regressions, [{ url: "https://a.example", was: "current", now: "august" }]);
  assert.deepEqual(result.advances, [{ url: "https://b.example", was: "july", now: "september" }]);
});

test("the walk reads every mirror once and never throws on a dead one", async () => {
  const pages = new Map([
    ["https://store.test/", `<meta property="og:description" content="${SIXTY}"><script type="application/ld+json">{"@type":"Organization","sameAs":["https://good.test/","https://old.test/","https://dead.test/"]}</script>`],
    ["https://good.test/", `<html><body>${SIXTY}</body></html>`],
    ["https://old.test/", "<html><body>The trust layer of the x402 economy</body></html>"],
  ]);
  const fetchImpl = async (url) => {
    if (url === "https://dead.test/") throw new Error("ECONNRESET");
    const body = pages.get(url);
    return new Response(body ?? "", { status: body ? 200 : 404 });
  };
  const observation = await walk("https://store.test", fetchImpl);
  assert.deepEqual(observation.mirrors.map((m) => [m.url, m.generation]), [
    ["https://good.test/", "current"],
    ["https://old.test/", "august"],
    ["https://dead.test/", "unreachable"],
  ]);
});

// ---------- the second half: the versions and the shelf ----------
import {
  compareListings,
  readAgenticMarket,
  readClawHub,
  readMcpRegistry,
  readNpm,
  readShelf,
  readX402List,
  walkVersions,
} from "./lib/listing-versions.mjs";

const REGISTRY = {
  servers: [
    { server: { name: "store.scvd/general-store", version: "0.2.1", description: "The trust layer of the x402 economy" }, _meta: { "io.modelcontextprotocol.registry/official": { isLatest: false, status: "active" } } },
    { server: { name: "store.scvd/general-store", version: "0.2.2", description: "Evidence observatory for agentic commerce: free x402 conformance checks, corpus, agent store." }, _meta: { "io.modelcontextprotocol.registry/official": { isLatest: true, status: "active" } } },
    { server: { name: "store.scvd/tab", version: "0.5.0", description: "Every tool a builder signs up for, on one tab." }, _meta: { "io.modelcontextprotocol.registry/official": { isLatest: true, status: "active" } } },
  ],
  metadata: { count: 3 },
};

test("the MCP registry reader takes the isLatest entry for one name, and says unknown for a name it has never seen", () => {
  const store = readMcpRegistry(REGISTRY, "store.scvd/general-store");
  assert.equal(store.state, "read");
  assert.equal(store.version, "0.2.2");
  assert.equal(store.versions_listed, 2);
  assert.equal(readMcpRegistry(REGISTRY, "store.scvd/nothing").state, "unknown");
  assert.equal(readMcpRegistry({ nope: true }, "x").state, "unknown");
});

test("the npm reader takes dist-tags.latest and that version's description", () => {
  const read = readNpm({ "dist-tags": { latest: "0.11.1" }, versions: { "0.11.1": { description: "the tab" } }, time: { "0.11.1": "2026-09-03T15:04:34.830Z" } });
  assert.deepEqual(read, { state: "read", version: "0.11.1", description: "the tab", published_at: "2026-09-03T15:04:34.830Z" });
  assert.equal(readNpm({}).state, "unknown");
});

test("x402-list is read off its JSON-LD WebAPI node: description, offer count, and whether the doctrine sentence survived", () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify([
    { "@type": "WebPage" },
    { "@type": "WebAPI", description: "An observatory. Not escrow, not a rating, not a guarantee.", offers: { "@type": "AggregateOffer", offerCount: 31 } },
  ])}</script></html>`;
  const read = readX402List(html);
  assert.equal(read.state, "read");
  assert.equal(read.offer_count, 31);
  assert.equal(read.doctrine_present, false);
  assert.equal(readX402List("<html>no ld</html>").state, "unknown");
  const withDoctrine = readX402List(`<script type="application/ld+json">${JSON.stringify({ "@type": "WebAPI", description: "Never a ranking, and never a verdict without its derivation.", offers: { offerCount: "32" } })}</script>`);
  assert.equal(withDoctrine.doctrine_present, true);
  assert.equal(withDoctrine.offer_count, 32);
});

test("ClawHub and agentic.market readers say unknown rather than guess when the shape is not one they read", () => {
  assert.equal(readClawHub("<html>scvd-general-store v3.15.0</html>", "scvd-general-store").version, "3.15.0");
  assert.equal(readClawHub("<html>something else</html>", "scvd-general-store").state, "unknown");
  assert.equal(readAgenticMarket({ services: [{ name: "scvd", url: "https://scvd.store", endpoints: [1, 2, 3] }] }, "scvd.store").endpoint_count, 3);
  assert.equal(readAgenticMarket({ services: [{ name: "scvd", url: "https://scvd.store" }] }, "scvd.store").state, "unknown");
  assert.equal(readAgenticMarket({}, "scvd.store").state, "unknown");
  assert.equal(readShelf({ items: [{ id: "a", price_usdc: 0.001 }, { id: "b", price_usdc: 0 }] }).paid_count, 1);
});

test("the comparison names ours and theirs on every differing fact, and never marks an unread index as differing", () => {
  const local = {
    server: { name: "store.scvd/general-store", version: "0.2.3", description: "Evidence observatory for agentic commerce: x402 preflight, receipt checks, settlement attestations." },
    tabServer: { name: "store.scvd/tab", version: "0.11.1" },
    packages: [{ name: "scvd-tab", version: "0.11.1" }, { name: "scvd-cli", version: "0.1.1" }],
    clawhub: { name: "scvd-general-store", version: "3.15.0" },
    shelf: { state: "read", paid_count: 32, ids: [] },
  };
  const rows = compareListings(local, {
    mcp_registry_store: readMcpRegistry(REGISTRY, "store.scvd/general-store"),
    mcp_registry_tab: readMcpRegistry(REGISTRY, "store.scvd/tab"),
    npm: { "scvd-tab": { state: "read", version: "0.11.1" }, "scvd-cli": { state: "unreachable", error: "HTTP 503" } },
    clawhub: { state: "unknown", note: "no version string near the skill name" },
    x402_list: { state: "read", description: "…", offer_count: 31, doctrine_present: false },
    agentic_market: { state: "unreachable", error: "blocked" },
  });
  const by = (index, field) => rows.find((r) => r.index === index && r.field === field);
  assert.equal(by("mcp-registry", "general-store version").state, "differs");
  assert.equal(by("mcp-registry", "general-store version").ours, "0.2.3");
  assert.equal(by("mcp-registry", "general-store version").theirs, "0.2.2");
  assert.equal(by("mcp-registry", "general-store description").state, "differs");
  assert.equal(by("mcp-registry", "tab version").state, "differs");
  assert.equal(by("npm", "scvd-tab version").state, "agrees");
  assert.equal(by("npm", "scvd-cli version").state, "unreachable");
  assert.equal(by("clawhub", "skill version").state, "unknown");
  assert.equal(by("x402-list", "doctrine sentence present").state, "differs");
  assert.equal(by("x402-list", "doors listed").theirs, 31);
  assert.equal(by("agentic-market", "doors listed").state, "unreachable");
  for (const r of rows) assert.ok(["agrees", "differs", "unknown", "unreachable"].includes(r.state));
});

test("the versions walk reads every index once, never throws on a dead one, and carries the shelf", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (String(url).endsWith("/menu.json")) return new Response(JSON.stringify({ items: [{ id: "a", price_usdc: 1 }] }), { status: 200 });
    if (String(url).includes("registry.modelcontextprotocol.io")) return new Response(JSON.stringify(REGISTRY), { status: 200 });
    if (String(url).includes("registry.npmjs.org")) return new Response(JSON.stringify({ "dist-tags": { latest: "9.9.9" }, versions: { "9.9.9": {} } }), { status: 200 });
    throw new Error("ECONNREFUSED");
  };
  const local = {
    server: { name: "store.scvd/general-store", version: "0.2.2", description: "Evidence observatory for agentic commerce: free x402 conformance checks, corpus, agent store." },
    tabServer: { name: "store.scvd/tab", version: "0.5.0" },
    packages: [{ name: "scvd-tab", version: "9.9.9" }],
    clawhub: { name: "scvd-general-store", version: "3.15.0" },
  };
  const walked = await walkVersions("https://store.test", local, fetchImpl);
  assert.equal(walked.shelf.paid_count, 1);
  assert.equal(walked.rows.find((r) => r.field === "general-store version").state, "agrees");
  assert.equal(walked.rows.find((r) => r.field === "scvd-tab version").state, "agrees");
  assert.equal(walked.rows.find((r) => r.index === "clawhub").state, "unreachable");
  assert.equal(walked.rows.find((r) => r.index === "x402-list").state, "unreachable");
  assert.equal(seen.filter((u) => u.includes("registry.modelcontextprotocol.io")).length, 1);
});
